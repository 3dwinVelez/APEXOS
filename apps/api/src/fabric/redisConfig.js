function isRedisDisabled() {
  const value = String(process.env.REDIS_DISABLED || process.env.DISABLE_REDIS || "").toLowerCase();
  return value === "true" || value === "1";
}

function getRedisUrl() {
  if (isRedisDisabled()) return null;
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required when Redis is enabled");
  }
  return process.env.REDIS_URL;
}

module.exports = { isRedisDisabled, getRedisUrl };
