// Certification-only guard. Environment must be supplied explicitly; never load .env here.
const assert = require('node:assert/strict');

const databaseName = process.env.CERT_DATABASE_NAME;
assert.ok(typeof databaseName === 'string' && databaseName === databaseName.trim() && /^apexos_cert_[A-Za-z0-9_]+$/.test(databaseName) && databaseName.length <= 63,
  'CERT_DATABASE_NAME must be a safe apexos_cert_ identifier (at most 63 characters)');

function databaseTarget(value, label) {
  const message = `${label} must target CERT_DATABASE_NAME on localhost or 127.0.0.1:55432`;
  assert.ok(typeof value === 'string' && !/[\s\\#]/.test(value), message);
  assert.ok(/^postgres(?:ql)?:\/\/(?:[^@/?#\s]+@)?(?:localhost|127\.0\.0\.1):55432\/[A-Za-z0-9_]+(?:\?[^#\s]*)?$/.test(value), message);
  let url;
  try { url = new URL(value); } catch { throw new Error(message); }
  assert.equal(url.pathname, '/' + databaseName, message);
  // Do not allow connection parameters to override the host, port or database.
  const allowed = new Set(['schema', 'sslmode', 'connection_limit', 'pool_timeout', 'connect_timeout', 'socket_timeout', 'pgbouncer']);
  for (const key of url.searchParams.keys()) assert.ok(allowed.has(key), `${label} has an unsupported connection parameter`);
  return { name: databaseName, host: url.hostname, port: 55432 };
}

function localOrigin(value, label) {
  const message = `${label} must be a plain loopback http origin with an explicit alternate port (not 3000, 3001 or 54320)`;
  assert.ok(typeof value === 'string' && !/\s/.test(value), message);
  const match = /^http:\/\/(localhost|127\.0\.0\.1):([1-9][0-9]{0,4})\/?$/.exec(value);
  assert.ok(match && Number(match[2]) <= 65535 && ![3000, 3001, 54320].includes(Number(match[2])), message);
  return new URL(value).origin;
}

const database = databaseTarget(process.env.DATABASE_URL, 'DATABASE_URL');
if (process.env.DIRECT_URL !== undefined) databaseTarget(process.env.DIRECT_URL, 'DIRECT_URL');
const apiBase = localOrigin(process.env.CERT_API_URL, 'CERT_API_URL');
const webBase = localOrigin(process.env.CERT_WEB_URL, 'CERT_WEB_URL');
const serviceTarget = origin => {
  const url = new URL(origin);
  return { origin, host: url.hostname, port: Number(url.port || 80) };
};
const target = { database, api: serviceTarget(apiBase), web: serviceTarget(webBase) };
// Pin both DB variables before application loaders or children can fill missing values from .env.
const certEnv = { ...process.env, DIRECT_URL: process.env.DIRECT_URL ?? process.env.DATABASE_URL };

// En `next dev` los chunks servidos desde la cache del navegador disparan `request` sin `response`,
// asi que networkidle2 nunca se cumple; se observa el trafico real de API en su lugar.
function createApiIdleWatcher(page, timeout = 30000) {
  const pending = new Set();
  const tracks = url => { try { return new URL(url).pathname.startsWith('/api/v1/'); } catch { return false; } }
  page.on('request', request => { if (tracks(request.url())) pending.add(request); });
  page.on('requestfinished', request => pending.delete(request));
  page.on('requestfailed', request => pending.delete(request));
  return {
    async wait() {
      const deadline = Date.now() + timeout;
      while (pending.size) {
        if (Date.now() > deadline) throw new Error(`${pending.size} peticiones de API nunca cerraron`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    },
    reset() { pending.clear(); },
  };
}

function probeLocalAppOrigin(origin) {
  return fetch(origin + '/', { redirect: 'manual', signal: AbortSignal.timeout(3000) })
    .then(response => response.status >= 200 && response.status < 500, () => false);
}

// `next dev` se autocierra al acercarse al umbral de memoria de la maquina y su proceso supervisor
// tarda unos segundos en volver a escuchar. Cualquier respuesta 2xx/3xx/4xx prueba que el servidor
// ya atiende; 5xx o un fallo de red prueban que sigue en arranque.
async function waitForLocalAppOrigin(origin, { probe = probeLocalAppOrigin, timeout = 90000, interval = 1000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await probe(origin)) return true;
    if (Date.now() + interval > deadline) return false;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

const watchers = new WeakMap();
// Bajo presion de memoria el servidor de desarrollo puede morir mas de una vez dentro de la misma
// navegacion; se admiten tres recuperaciones acotadas y cada una queda registrada en la bitacora.
const MAX_ORIGIN_RECOVERIES = 3;

async function gotoLocalAppPage(page, url, timeout = 120000, lifecycle = {}) {
  const wait = lifecycle.waitForLocalAppOrigin ?? waitForLocalAppOrigin;
  if (!watchers.has(page)) {
    // El service worker de la app hace skipWaiting y clients.claim, asi que toma el control a mitad de sesion
    // y aborta navegaciones de Puppeteer (ERR_ABORTED y contextos destruidos); el arnes lo deja fuera del camino.
    await page.setBypassServiceWorker(true);
    watchers.set(page, createApiIdleWatcher(page));
  }
  for (let attempt = 0, recoveries = 0; ; attempt++) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await watchers.get(page).wait();
      return response;
    } catch (error) {
      // La maquina local tiene 8 GB: bajo presion el renderer aborta la navegacion o la ruta recompila mas
      // lento que el presupuesto. Una navegacion no conserva estado, asi que se admite un unico reintento;
      // las aserciones del certificador van despues y el fallo funcional no se enmascara.
      // Si el origen dejo de escuchar, reintentar contra un puerto muerto solo devuelve el mismo
      // ERR_CONNECTION_REFUSED: primero se espera a que el servidor de desarrollo vuelva arriba.
      if (/ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ECONNREFUSED/.test(String(error.message)) && recoveries < MAX_ORIGIN_RECOVERIES) {
        const origin = new URL(url).origin;
        recoveries++;
        console.error(`[arnes] ${origin} perdio el puerto (${error.message}); recuperacion ${recoveries}/${MAX_ORIGIN_RECOVERIES} del servidor de desarrollo`);
        if (!await wait(origin, lifecycle)) throw new Error(`El servidor de ${origin} no volvio a escuchar despues de ${error.message}`);
        watchers.get(page).reset();
        continue;
      }
      if (attempt >= 1) throw error;
      watchers.get(page).reset();
    }
  }
}

module.exports = { apiBase, webBase, target, certEnv, localOrigin, createApiIdleWatcher, gotoLocalAppPage, waitForLocalAppOrigin, probeLocalAppOrigin };
