"use strict";

// Emite la credencial de un ambiente y la deja donde vive la configuración de la
// torre: apps/control-tower/.env.local, archivo ignorado por git. Guarda el par
// completo (JWT de ocho horas + token de renovación de treinta días) para que el
// bombeo de lib/credential.js renueve solo y el panel no vuelva a quedarse ciego.
// La contraseña se lee del entorno, nunca de un argumento: la línea de comandos
// queda en el historial del shell.

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, ENV_KEYS } = require("../lib/config");
const { decodeExpiry } = require("../lib/credential");

const TIMEOUT_MS = 8000;

function parseArgs(argv) {
  const args = { environment: "local" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--environment" || token === "-e") args.environment = String(argv[index + 1] || "local");
    else if (token === "--help" || token === "-h") args.help = true;
    else if (token.startsWith("--environment=")) args.environment = token.split("=")[1];
  }
  return args;
}

function usage() {
  return [
    "Uso: npm run control:credential -- --environment <local|develop|main>",
    "",
    "Variables requeridas del entorno (no se escriben en ningún archivo):",
    "  TOWER_CREDENTIAL_EMAIL     correo del usuario que emite la credencial",
    "  TOWER_CREDENTIAL_PASSWORD  contraseña de ese usuario",
    "",
    "Opcional:",
    "  TOWER_CREDENTIAL_API_URL   base de la API del ambiente (por defecto, la configurada)",
    "",
    "Escribe ENV_<AMBIENTE>_APEX_TOKEN y ENV_<AMBIENTE>_APEX_REFRESH en",
    "apps/control-tower/.env.local. Después reinicia la torre: ella renueva sola."
  ].join("\n");
}

// Reescribir el archivo entero y dejar solo las dos claves seria borrar la
// configuración del dueño: se toca la línea existente y se agregan las faltantes.
function upsertEnvFile(file, updates) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const pending = new Map(Object.entries(updates));
  const next = lines.map((line) => {
    const separator = line.indexOf("=");
    if (separator < 0) return line;
    const key = line.slice(0, separator).trim();
    if (!pending.has(key)) return line;
    const replaced = `${key}=${pending.get(key)}`;
    pending.delete(key);
    return replaced;
  });
  for (const [key, value] of pending) next.push(`${key}=${value}`);
  const body = next.join("\n").replace(/\n*$/, "\n");
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, body, "utf8");
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
  return body.split(/\r?\n/).length;
}

async function postJson(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, ok: response.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const id = String(args.environment || "local").trim().toLowerCase();
  if (!ENV_KEYS.includes(id)) {
    console.error(`Ambiente desconocido: ${id}. Usa ${ENV_KEYS.join(", ")}.`);
    return 2;
  }

  const config = loadConfig();
  const environment = config.environments[id] || {};
  const apiBaseUrl = String(process.env.TOWER_CREDENTIAL_API_URL || environment.apiBaseUrl || "").replace(/\/+$/, "");
  const email = String(process.env.TOWER_CREDENTIAL_EMAIL || "").trim();
  const password = String(process.env.TOWER_CREDENTIAL_PASSWORD || "");

  if (!apiBaseUrl) {
    console.error(`El ambiente ${id} no tiene API configurada (ENV_${id.toUpperCase()}_API_URL).`);
    return 2;
  }
  if (!email || !password) {
    console.error("Faltan TOWER_CREDENTIAL_EMAIL y TOWER_CREDENTIAL_PASSWORD en el entorno.");
    console.error(usage());
    return 2;
  }

  const result = await postJson(`${apiBaseUrl}/api/v1/auth/login`, { email, password });
  const token = result.json && typeof result.json.token === "string" ? result.json.token : "";
  const refresh = result.json && typeof result.json.refresh === "string" ? result.json.refresh : "";
  if (!result.ok || !token || !refresh) {
    const code = result.json && result.json.code ? ` ${result.json.code}` : "";
    console.error(`La API de ${id} no devolvió el par de credenciales (HTTP ${result.status}${code}).`);
    console.error("Verifica el usuario, la política de contraseña y la URL del ambiente.");
    return 1;
  }

  const envFile = path.join(config.appDir, ".env.local");
  const upper = id.toUpperCase();
  upsertEnvFile(envFile, {
    [`ENV_${upper}_APEX_TOKEN`]: token,
    [`ENV_${upper}_APEX_REFRESH`]: refresh
  });

  const expiry = decodeExpiry(token);
  const refreshExpiry = decodeExpiry(refresh);
  console.log(`Credencial emitida para ${environment.label || id} desde ${apiBaseUrl}`);
  console.log(`  usuario: ${email}`);
  console.log(`  acceso  expira: ${expiry ? new Date(expiry).toISOString() : "sin claim legible"}`);
  console.log(`  renovación expira: ${refreshExpiry ? new Date(refreshExpiry).toISOString() : "sin claim legible"}`);
  console.log(`  escrita en: ${envFile}`);
  console.log("  Reinicia la torre: renueva la credencial sola antes de que venza.");
  return 0;
}

main().then((code) => process.exitCode = code).catch((error) => {
  console.error(`No se pudo emitir la credencial: ${String(error && error.message || error)}`);
  process.exitCode = 1;
});
