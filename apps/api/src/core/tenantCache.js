const Redis = require("ioredis");
const prisma = require("./prisma");

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 2,
  lazyConnect: true
});
const TTL = 300;

async function getTenantFromCache(tenantId) {
  const key = `tenant:${tenantId}`;
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
  try {
    await redis.del(`tenant:${tenantId}`);
  } catch {
    return undefined;
  }
}

module.exports = { getTenantFromCache, invalidateTenantCache };

