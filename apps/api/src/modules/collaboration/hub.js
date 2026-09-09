const rooms = new Map();
function safeMessage(value, user) { if (!value || !["presence", "leave"].includes(value.type)) return null; return { type: value.type, tabId: String(value.tabId || "").slice(0, 80), user: String(user.name || user.email || "Usuario").slice(0, 120), company: String(user.tenant_id), path: String(value.path || "/dashboard").slice(0, 300), state: value.state === "editing" ? "editing" : "viewing", at: Date.now() }; }
function join(tenantId, socket) { if (!rooms.has(tenantId)) rooms.set(tenantId, new Set()); rooms.get(tenantId).add(socket); }
function leave(tenantId, socket) { const room = rooms.get(tenantId); if (!room) return; room.delete(socket); if (!room.size) rooms.delete(tenantId); }
function broadcast(tenantId, message, except) { const payload = JSON.stringify(message); for (const socket of rooms.get(tenantId) || []) if (socket !== except && socket.readyState === 1) socket.send(payload); }
function roomSize(tenantId) { return rooms.get(tenantId)?.size || 0; }
module.exports = { safeMessage, join, leave, broadcast, roomSize };
