const hub = require("./hub");
async function authenticate(token, companyId) { let user; try { user = require("../../security/jwt").verify(token); } catch { user = await require("../../security/supabaseAuth").authenticateSupabaseToken(token, companyId); } return require("../../security/authorizationState").validateAuthorization(user); }
async function routes(fastify) {
  fastify.get("/collaboration/live", { websocket: true }, (connection) => {
    const socket = connection.socket || connection; let user = null; const timeout = setTimeout(() => { if (!user) socket.close(4401, "Autenticación requerida"); }, 8_000);
    socket.on("message", async (raw) => { try { const value = JSON.parse(String(raw)); if (!user) { if (value.type !== "authenticate" || !value.token) return socket.close(4401, "Autenticación requerida"); user = await authenticate(String(value.token), String(value.company_id || "")); clearTimeout(timeout); hub.join(user.tenant_id, socket); socket.send(JSON.stringify({ type: "authenticated", company: user.tenant_id, sessions: hub.roomSize(user.tenant_id) })); return; } const message = hub.safeMessage(value, user); if (message) hub.broadcast(user.tenant_id, message, socket); } catch { if (!user) socket.close(4401, "Token inválido"); } });
    socket.on("close", () => { clearTimeout(timeout); if (user) hub.leave(user.tenant_id, socket); });
  });
}
module.exports = routes;
