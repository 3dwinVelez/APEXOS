const clientsByTenant = new Map();

function addClient(tenantId, socket) {
  if (!clientsByTenant.has(tenantId)) clientsByTenant.set(tenantId, new Set());
  clientsByTenant.get(tenantId).add(socket);
}

function removeClient(tenantId, socket) {
  clientsByTenant.get(tenantId).delete(socket);
}

function broadcast(tenantId, payload) {
  const serialized = JSON.stringify(payload);
  for (const socket of clientsByTenant.get(tenantId) || []) {
    if (socket.readyState === 1) socket.send(serialized);
  }
}

module.exports = { addClient, removeClient, broadcast };

