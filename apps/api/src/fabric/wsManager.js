const { getRedisUrl, isRedisDisabled } = require("./redisConfig");

const clientsByTenant = new Map();
const WS_CHANNEL_PREFIX = "ws:tenant:";
let redisSub = null;
let redisPub = null;

function getRedis() {
  if (redisPub) return { pub: redisPub, sub: redisSub };
  if (isRedisDisabled()) return null;
  try {
    const Redis = require("ioredis");
    redisPub = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null
    });
    redisSub = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null
    });
    redisSub.on("message", (channel, message) => {
      const tenantId = channel.replace(WS_CHANNEL_PREFIX, "");
      localBroadcast(tenantId, message);
    });
    redisSub.connect().catch(() => {
      console.warn("[wsManager] Redis subscribe connection failed — broadcasts are local only");
      redisSub = null;
      redisPub = null;
    });
    redisPub.connect().catch(() => {
      console.warn("[wsManager] Redis publish connection failed — broadcasts are local only");
      redisSub = null;
      redisPub = null;
    });
    return { pub: redisPub, sub: redisSub };
  } catch {
    return null;
  }
}

async function subscribeTenant(tenantId) {
  const r = getRedis();
  if (!r?.sub) return;
  try {
    await r.sub.subscribe(`${WS_CHANNEL_PREFIX}${tenantId}`);
  } catch {
    // Best-effort
  }
}

async function unsubscribeTenant(tenantId) {
  const r = getRedis();
  if (!r?.sub) return;
  try {
    await r.sub.unsubscribe(`${WS_CHANNEL_PREFIX}${tenantId}`);
  } catch {
    // Best-effort
  }
}

function localBroadcast(tenantId, serialized) {
  const sockets = clientsByTenant.get(tenantId);
  if (!sockets) return;
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      try {
        socket.send(serialized);
      } catch {
        // Slow client — skip
      }
    }
  }
}

async function broadcast(tenantId, payload) {
  const serialized = JSON.stringify(payload);
  localBroadcast(tenantId, serialized);
  const r = getRedis();
  if (r?.pub) {
    try {
      await r.pub.publish(`${WS_CHANNEL_PREFIX}${tenantId}`, serialized);
    } catch {
      // Best-effort remote broadcast
    }
  }
}

function addClient(tenantId, socket) {
  if (!clientsByTenant.has(tenantId)) {
    clientsByTenant.set(tenantId, new Set());
    subscribeTenant(tenantId);
  }
  clientsByTenant.get(tenantId).add(socket);
  socket.on("close", () => removeClient(tenantId, socket));
  socket.on("error", () => removeClient(tenantId, socket));
}

function removeClient(tenantId, socket) {
  const sockets = clientsByTenant.get(tenantId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) {
    clientsByTenant.delete(tenantId);
    unsubscribeTenant(tenantId);
  }
}

function cleanupStale() {
  for (const [tenantId, sockets] of clientsByTenant) {
    for (const socket of sockets) {
      if (socket.readyState !== 1) {
        sockets.delete(socket);
      }
    }
    if (sockets.size === 0) {
      clientsByTenant.delete(tenantId);
      unsubscribeTenant(tenantId);
    }
  }
}

// Cleanup cada 5 minutos
setInterval(cleanupStale, 300000).unref();

module.exports = { addClient, removeClient, broadcast };

