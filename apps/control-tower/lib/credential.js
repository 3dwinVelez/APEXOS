"use strict";

const { redact } = require("./security");

const REFRESH_PATH = "/api/v1/auth/refresh";
const STORE_NAME = "credential";
const STATUS_CODES = ["VIGENTE", "RENOVADA", "ESTATICO", "TOKEN_VENCIDO", "REVOCADA", "SIN_CONEXION", "SIN_CREDENCIAL"];

// Los modos que la torre puede sostener sola: con token de renovacion propio se
// renueva sin intervencion; el JWT fijo depende de que alguien vuelva a escribirlo.
const REASON_DETAIL = {
  VIGENTE: "La credencial del ambiente esta vigente: los puntos de medicion leen la API.",
  RENOVADA: "La torre renovo la credencial con el token de renovacion del ambiente.",
  ESTATICO: "Hay JWT fijo pero no token de renovacion: la torre no puede mantenerlo vivo.",
  TOKEN_VENCIDO: "El JWT fijo vencio y no hay token de renovacion: los puntos de medicion del ambiente estan ciegos.",
  REVOCADA: "La API rechazo el token de renovacion: hay que emitir la credencial de nuevo.",
  SIN_CONEXION: "La torre no alcanzo la API del ambiente para renovar la credencial.",
  SIN_CREDENCIAL: "El ambiente no tiene credencial propia: sus lecturas con permiso quedan en sin dato.",
  SIMULACION: "Simulacion activa: la torre no renueva credenciales."
};

// Leer el claim exp no valida la firma: solo programa cuando hay que renovar.
// La autoridad sobre si el token sirve sigue siendo de la API.
function decodeExpiry(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const exp = Number(payload && payload.exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function toIso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function fromIso(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readRecord(stored) {
  const source = stored && typeof stored === "object" ? stored : {};
  const attempts = Number(source.attempts);
  return {
    refreshToken: typeof source.refreshToken === "string" ? source.refreshToken : "",
    accessToken: typeof source.accessToken === "string" ? source.accessToken : "",
    expiresAt: toIso(fromIso(source.expiresAt)),
    lastRefreshAt: toIso(fromIso(source.lastRefreshAt)),
    nextRetryAt: toIso(fromIso(source.nextRetryAt)),
    attempts: Number.isFinite(attempts) && attempts > 0 ? Math.min(attempts, 99) : 0,
    status: STATUS_CODES.includes(source.status) ? source.status : "SIN_CREDENCIAL"
  };
}

function createCredentialPump({ config, store, fetchImpl = global.fetch, now = () => new Date() } = {}) {
  const settings = (config && config.credentials) || {};
  const marginMs = Number(settings.marginMs) || 300000;
  const retryMs = Number(settings.retryMs) || 60000;
  const deniedRetryMs = Number(settings.deniedRetryMs) || 300000;
  const timeoutMs = Number(settings.timeoutMs) || 4000;
  const persisted = (store && store.readAux(STORE_NAME, {})) || {};
  const records = new Map();
  let dirty = false;

  function recordFor(id, environment) {
    let record = records.get(id);
    if (!record) {
      record = readRecord(persisted[id]);
      records.set(id, record);
    }
    // La semilla es el token de renovacion del ambiente en .env.local. La torre no
    // reescribe el archivo del dueño; el par rotado se persiste en su propio dataDir.
    if (!record.refreshToken && environment && environment.apexRefresh) {
      record.refreshToken = String(environment.apexRefresh);
      dirty = true;
    }
    if (!record.accessToken && environment && environment.apexToken) {
      record.accessToken = String(environment.apexToken);
      // El JWT heredado de .env.local trae su propia expiracion: reaprovecharla evita
      // que cada arranque de la torre rote una sesion nueva en el puesto.
      if (record.expiresAt == null) record.expiresAt = toIso(decodeExpiry(record.accessToken));
    }
    return record;
  }

  async function postRefresh(apiBaseUrl, refreshToken) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(`${apiBaseUrl}${REFRESH_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ refresh: refreshToken }),
        signal: controller ? controller.signal : undefined
      });
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: response.status, ok: response.ok, json };
    } catch (error) {
      return { status: 0, ok: false, json: null, error: redact(String((error && error.message) || error)) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function ensureOne(id, environment, clock) {
    const record = recordFor(id, environment);
    const expiresAt = fromIso(record.expiresAt);
    const nextRetryAt = fromIso(record.nextRetryAt);

    if (!record.refreshToken) {
      if (!record.accessToken) {
        record.status = "SIN_CREDENCIAL";
        record.expiresAt = null;
        return;
      }
      const staticExpiry = decodeExpiry(record.accessToken);
      if (staticExpiry != null && staticExpiry - marginMs <= clock) {
        // Seguir enviando un JWT muerto produce 401 y un dictamen de permiso que no
        // es: se retira la credencial y el panel declara el punto como ciego.
        record.accessToken = "";
        record.expiresAt = null;
        record.status = "TOKEN_VENCIDO";
        environment.apexToken = "";
        dirty = true;
        return;
      }
      record.expiresAt = toIso(staticExpiry);
      record.status = staticExpiry == null ? "ESTATICO" : "VIGENTE";
      return;
    }

    if (record.accessToken && expiresAt != null && expiresAt - marginMs > clock) {
      record.status = "VIGENTE";
      environment.apexToken = record.accessToken;
      return;
    }
    if (nextRetryAt != null && nextRetryAt > clock) return;

    const result = await postRefresh(environment.apiBaseUrl, record.refreshToken);
    const token = result.json && typeof result.json.token === "string" ? result.json.token : "";

    if (result.ok && token) {
      if (typeof result.json.refresh === "string" && result.json.refresh) record.refreshToken = result.json.refresh;
      record.accessToken = token;
      const expiry = decodeExpiry(token);
      // Sin claim legible se reintenta en el ciclo corto: mejor una renovacion
      // duplicada que un panel que se queda ciego sin decir nada.
      record.expiresAt = toIso(expiry != null ? expiry : clock + retryMs);
      record.lastRefreshAt = toIso(clock);
      record.nextRetryAt = null;
      record.attempts = 0;
      record.status = "RENOVADA";
      environment.apexToken = token;
      dirty = true;
      return;
    }

    record.attempts = Math.min(record.attempts + 1, 99);
    if (result.status === 401 || result.status === 403) {
      // La API nego el refresh: reintentar cada sondeo solo castiga el puesto. Se
      // respalda un ciclo largo y la accion nombra la emision de la credencial.
      record.accessToken = "";
      record.expiresAt = null;
      record.nextRetryAt = toIso(clock + deniedRetryMs);
      record.status = "REVOCADA";
      environment.apexToken = "";
      dirty = true;
      return;
    }
    record.nextRetryAt = toIso(clock + retryMs);
    record.status = "SIN_CONEXION";
    dirty = true;
  }

  function persist() {
    if (!store || !dirty) return;
    try {
      const out = {};
      for (const [id, record] of records) out[id] = record;
      store.writeAux(STORE_NAME, out);
      dirty = false;
    } catch {
      // la persistencia es secundaria: nunca tumba el sondeo
    }
  }

  async function ensure() {
    const ids = Object.keys((config && config.environments) || {});
    if (config.simulation) {
      for (const id of ids) {
        const record = recordFor(id, config.environments[id]);
        record.status = "SIMULACION";
      }
      return status();
    }
    const clock = now().getTime();
    // Se abre registro de todos los ambientes, tambien del apagado: el panel debe
    // poder decir que ese punto no tiene credencial en lugar de no decir nada.
    const records = ids.map((id) => [id, recordFor(id, config.environments[id]), config.environments[id]])
      .filter(([, , environment]) => environment && environment.enabled !== false && environment.apiBaseUrl);
    await Promise.all(records.map(([id, , environment]) => ensureOne(id, environment, clock)));
    persist();
    return status();
  }

  function statusFor(id) {
    const record = records.get(id);
    if (!record) return null;
    // El estado que viaja al panel nunca lleva tokens: solo modo, dictamen y horas.
    return {
      environmentId: id,
      mode: record.refreshToken ? "renovacion" : record.accessToken ? "estatico" : "ninguna",
      status: record.status,
      reason: REASON_DETAIL[record.status] || null,
      expiresAt: record.expiresAt,
      lastRefreshAt: record.lastRefreshAt,
      nextRetryAt: record.nextRetryAt,
      attempts: record.attempts,
      refreshConfigured: Boolean(record.refreshToken),
      tokenConfigured: Boolean(record.accessToken)
    };
  }

  function status() {
    return Object.fromEntries([...records.keys()].map((id) => [id, statusFor(id)]));
  }

  return { ensure, status, statusFor, REASON_DETAIL };
}

module.exports = {
  createCredentialPump,
  decodeExpiry,
  REFRESH_PATH,
  REASON_DETAIL,
  STORE_NAME
};
