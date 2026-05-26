const prisma = require("./prisma");

const redisDisabled = ["1", "true"].includes(String(process.env.REDIS_DISABLED || process.env.DISABLE_REDIS || "").toLowerCase());
const redis = redisDisabled
  ? null
  : (() => {
      if (!process.env.REDIS_URL) {
        throw new Error("REDIS_URL is required when REDIS_DISABLED is not enabled");
      }
      const Redis = require("ioredis");
      return new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true
      });
    })();
const TTL = 300;

async function getTenantFromCache(tenantId) {
  const key = `tenant:${tenantId}`;
  try {
    if (!redis) throw new Error("Redis disabled");
    if (redis.status === "wait") await redis.connect();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis is an accelerator. The database remains the source of truth.
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (tenant) {
    try {
      if (!redis) return tenant;
      await redis.setex(key, TTL, JSON.stringify(tenant));
    } catch {
      return tenant;
    }
  }
  return tenant;
}

async function invalidateTenantCache(tenantId) {
  try {
    if (!redis) return undefined;
    await redis.del(`tenant:${tenantId}`);
  } catch {
    return undefined;
  }
}

module.exports = { getTenantFromCache, invalidateTenantCache };
