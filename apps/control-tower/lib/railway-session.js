"use strict";

// La torre no duplica el token de Railway: si el puesto ya tiene sesion del CLI,
// la lee al sondear. Copiarlo a .env.local crearia un segundo secreto que envejece
// cuando el CLI rota el suyo; leer la sesion hace que un `railway login` futuro
// alcance a la torre sin reescribir archivos. El valor nunca se publica, nunca se
// loguea y nunca sale de esta maquina salvo hacia la API de Railway.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function sessionFile(env = process.env, homeDir = os.homedir()) {
  const dir = String((env && env.RAILWAY_CONFIG_DIR) || "").trim();
  return dir
    ? path.join(dir, "config.json")
    : path.join(homeDir, ".railway", "config.json");
}

// El CLI guarda ademas un token corto de arranque y un id de usuario: solo
// `user.accessToken` autentica la API GraphQL. Un valor con espacios o vacio no
// es una credencial util, y devolver "" deja que la sonda diga "sin token".
function railwaySessionToken({ env = process.env, homeDir = os.homedir(), fsImpl = fs } = {}) {
  let raw;
  try {
    raw = fsImpl.readFileSync(sessionFile(env, homeDir), "utf8");
  } catch {
    return "";
  }
  try {
    const parsed = JSON.parse(raw);
    const user = parsed && typeof parsed.user === "object" ? parsed.user : {};
    const token = typeof user.accessToken === "string" ? user.accessToken.trim() : "";
    return token && !/\s/.test(token) ? token : "";
  } catch {
    return "";
  }
}

// Una sola regla para la sonda y para el reporte de credenciales: la variable del
// ambiente manda, la sesion del CLI es el respaldo, y ninguna de las dos existe
// cuando el puesto decidio apagarla.
function resolveRailwayToken(railway, options = {}) {
  const envToken = String((railway && railway.token) || "").trim();
  if (envToken) return { token: envToken, source: "variable RAILWAY_TOKEN" };
  if (!railway || railway.sessionEnabled !== true) return { token: "", source: "" };
  const session = railwaySessionToken(options);
  return session ? { token: session, source: "sesión del CLI de Railway" } : { token: "", source: "" };
}

module.exports = { railwaySessionToken, resolveRailwayToken, sessionFile };
