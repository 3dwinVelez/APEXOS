const fs = require("node:fs/promises");
const path = require("node:path");

// Cuentas personales de Outlook.com solo aceptan el endpoint "consumers":
// la autenticacion basica IMAP/SMTP fue retirada y Graph exige OAuth2.
const AUTHORITY = "https://login.microsoftonline.com/consumers";
const DEVICE_CODE_URL = `${AUTHORITY}/oauth2/v2.0/devicecode`;
const TOKEN_URL = `${AUTHORITY}/oauth2/v2.0/token`;
const GRAPH_SCOPE = "offline_access Mail.Read";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authError(message, code) {
  return Object.assign(new Error(message), { code });
}

async function readTokenCache(tokenFile) {
  try {
    const raw = await fs.readFile(tokenFile, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Escritura atomica con permisos de propietario: el refresh token nunca se
// versiona ni se expone en logs.
async function writeTokenCache(tokenFile, data) {
  await fs.mkdir(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  const temporary = `${tokenFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, tokenFile);
}

async function tokenRequest(body, fetchImpl) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw authError(payload.error_description || `El endpoint de token respondio ${response.status}.`, payload.error || "TOKEN_REQUEST_FAILED");
  }
  return payload;
}

async function refreshAccessToken({ clientId, tokenFile, fetchImpl = fetch }) {
  const cache = await readTokenCache(tokenFile);
  if (!cache?.refresh_token) {
    throw authError("El buzon no esta autorizado. Ejecuta: npm run mail:login", "MAILBOX_NOT_AUTHORIZED");
  }
  const payload = await tokenRequest({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: cache.refresh_token,
    scope: GRAPH_SCOPE
  }, fetchImpl);
  await writeTokenCache(tokenFile, {
    refresh_token: payload.refresh_token || cache.refresh_token,
    account: cache.account || null,
    client_id: clientId,
    updated_at: new Date().toISOString()
  });
  return payload.access_token;
}

async function startDeviceCode({ clientId, fetchImpl = fetch }) {
  const response = await fetchImpl(DEVICE_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scope: GRAPH_SCOPE }).toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw authError(payload.error_description || `El endpoint de dispositivo respondio ${response.status}.`, payload.error || "DEVICE_CODE_FAILED");
  }
  return payload;
}

async function deviceCodeLogin({ clientId, account, tokenFile, fetchImpl = fetch, sleep = delay, notify = console.log, now = Date.now }) {
  if (!clientId) throw authError("Falta el client ID de la aplicacion de Entra.", "MAILBOX_CONFIG_INVALID");
  const device = await startDeviceCode({ clientId, fetchImpl });
  notify(`Abre ${device.verification_uri} e introduce el codigo: ${device.user_code}`);
  const deadline = now() + Number(device.expires_in || 900) * 1000;
  let intervalMs = Number(device.interval || 5) * 1000;

  while (now() < deadline) {
    await sleep(intervalMs);
    try {
      const payload = await tokenRequest({
        client_id: clientId,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code
      }, fetchImpl);
      await writeTokenCache(tokenFile, {
        refresh_token: payload.refresh_token || null,
        account: account || null,
        client_id: clientId,
        updated_at: new Date().toISOString()
      });
      if (!payload.refresh_token) {
        throw authError("Microsoft no devolvio refresh token; verifica que el permiso offline_access este concedido.", "MAILBOX_NOT_AUTHORIZED");
      }
      return { account: account || null, scope: payload.scope || GRAPH_SCOPE };
    } catch (error) {
      if (error.code === "authorization_pending") continue;
      if (error.code === "slow_down") { intervalMs += 5000; continue; }
      throw error;
    }
  }
  throw authError("El codigo de dispositivo expiro. Vuelve a ejecutar el login.", "DEVICE_CODE_EXPIRED");
}

module.exports = { readTokenCache, writeTokenCache, refreshAccessToken, deviceCodeLogin, GRAPH_SCOPE, TOKEN_URL };
