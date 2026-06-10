const prisma = require("./prisma");
const { getRedisUrl, isRedisDisabled } = require("../fabric/redisConfig");

const TTL = 300;
const memoryCache = new Map();

const redis = isRedisDisabled()
  ? null
  : (() => {
      const Redis = require("ioredis");
      return new Redis(getRedisUrl(), {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true
      });
    })();

async function getTenantFromMemory(tenantId) {
  const key = `tenant:${tenantId}`;
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) memoryCache.delete(key);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (tenant) memoryCache.set(key, { value: tenant, expiresAt: Date.now() + TTL * 1000 });
  return tenant;
}

async function getTenantFromCache(tenantId) {
  const key = `tenant:${tenantId}`;
  if (!redis) return getTenantFromMemory(tenantId);

  try {
    if (redis.status === "wait") await redis.connect();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis is an accelerator. The database remains the source of truth.
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (tenant) {
    try {
      await redis.setex(key, TTL, JSON.stringify(tenant));
    } catch {
      return tenant;
    }
  }
  return tenant;
}

async function invalidateTenantCache(tenantId) {
  memoryCache.delete(`tenant:${tenantId}`);
  try {
    if (!redis) return undefined;
    await redis.del(`tenant:${tenantId}`);
  } catch {
    return undefined;
  }
}

module.exports = { getTenantFromCache, invalidateTenantCache };
