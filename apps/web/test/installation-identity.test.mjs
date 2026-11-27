// Contrato de la marca del navegador (tarea #12 de la intervencion de marcaciones).
//
// Existe porque el buzon publico de telemetria guardaba la HORA de un intento de marcacion hecho sin
// sesion, pero no de que telefono salio: medido en Produccion el 2026-11-20 habia 5 intentos asi
// irrecuperables, y el 2026-11-23 el mismo grupo anonimo ya acumulaba 114 rechazos. La marca es lo
// unico que permite devolverle el dueno a esa fila cuando el operario vuelve a entrar con sesion.
//
// Lo que se prueba aqui no es que la funcion devuelva un string: es que la marca (a) es estable,
// (b) NO vive en ninguna de las claves que el cierre de sesion barre, (c) jamas se inventa debil y
// (d) nunca propaga una forma torcida. Si (b) se rompe, la marca muere justo en el caso que cubre.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { INSTALLATION_ID_PATTERN, INSTALLATION_STORAGE_KEY, readInstallationId } from "../lib/installationIdentity.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function fakeStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  return {
    data,
    writes,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); writes.push(["set", key]); },
    removeItem: (key) => { data.delete(key); writes.push(["remove", key]); }
  };
}

function withWindow(storage) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = { localStorage: storage, location: { pathname: "/dashboard/talento-humano/marcacion", href: "https://app/dashboard" } };
  return () => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  };
}

function withCrypto(stub) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  if (stub === null) delete globalThis.crypto;
  else Object.defineProperty(globalThis, "crypto", { value: stub, configurable: true, writable: true });
  return () => {
    delete globalThis.crypto;
    if (original) Object.defineProperty(globalThis, "crypto", original);
  };
}

test("la marca es un UUID canonico y la misma en dos lecturas seguidas", () => {
  const storage = fakeStore();
  const restore = withWindow(storage);
  try {
    const primera = readInstallationId();
    const segunda = readInstallationId();
    assert.match(primera, INSTALLATION_ID_PATTERN, "la marca debe tener forma de UUID canonico: el buzon publico rechaza cualquier otra");
    assert.equal(segunda, primera, "un mismo navegador no puede reportarse con dos marcas distintas");
    assert.deepEqual(storage.writes.filter((w) => w[1] === INSTALLATION_STORAGE_KEY), [["set", INSTALLATION_STORAGE_KEY]], "se escribe una sola vez");
  } finally {
    restore();
  }
});

test("sin randomUUID el respaldo arma un UUID v4 con el CSPRNG, no con Math.random", () => {
  const storage = fakeStore();
  const restoreWindow = withWindow(storage);
  let llamadas = 0;
  const restoreCrypto = withCrypto({
    getRandomValues: (bytes) => { llamadas += 1; for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7 + 3) % 256; return bytes; }
  });
  try {
    const id = readInstallationId();
    assert.ok(llamadas > 0, "el respaldo tiene que pedir entropia al navegador");
    assert.match(id, INSTALLATION_ID_PATTERN, `forma torcida en el respaldo: ${id}`);
    assert.equal(id[14], "4", "version 4");
    assert.match(id[19], /[89ab]/, "variante RFC 4122");
    assert.equal(id.replaceAll("-", "").length, 32, "32 digitos hexadecimales");
  } finally {
    restoreCrypto();
    restoreWindow();
  }
});

test("sin criptografia disponible no se inventa un id debil", () => {
  const storage = fakeStore();
  const restoreWindow = withWindow(storage);
  const restoreCrypto = withCrypto({});
  try {
    assert.equal(readInstallationId(), "", "un id predecible (Math.random) no puede servir para atribuir una jornada");
    assert.equal(storage.data.has(INSTALLATION_STORAGE_KEY), false, "nada se siembra");
  } finally {
    restoreCrypto();
    restoreWindow();
  }
});

test("una marca con forma invalida se renueva y no se propaga", () => {
  const storage = fakeStore({ [INSTALLATION_STORAGE_KEY]: "no-es-un-uuid" });
  const restore = withWindow(storage);
  try {
    const id = readInstallationId();
    assert.notEqual(id, "no-es-un-uuid");
    assert.match(id, INSTALLATION_ID_PATTERN);
    assert.ok(storage.writes.some((w) => w[0] === "remove" && w[1] === INSTALLATION_STORAGE_KEY), "el valor heredado se borra, no se reutiliza");
    assert.equal(storage.data.get(INSTALLATION_STORAGE_KEY), id);
  } finally {
    restore();
  }
});

test("el almacenamiento bloqueado (modo privado, cotas) no rompe el reporte: sale sin marca", () => {
  const storage = fakeStore();
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  storage.getItem = () => { throw new Error("SecurityError"); };
  const restore = withWindow(storage);
  try {
    assert.equal(readInstallationId(), "", "sin almacen el intento sigue viajando: la marca es un extra, nunca un requisito");
  } finally {
    restore();
  }
});

test("en servidor la lectura responde vacia y no toca ningun almacen", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  delete globalThis.window;
  try {
    assert.equal(readInstallationId(), "", "un render del lado del servidor no puede escribir en localStorage");
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
  }
});

test("LA CLAVE SOBREVIVE AL CIERRE DE SESION: no esta en la lista que clearSession barre", () => {
  const source = read("lib/sessionSecurity.ts");
  const cuerpo = source.slice(source.indexOf("export function clearSession"), source.indexOf("export function assertActiveSession"));
  const barridas = [...cuerpo.matchAll(/(?:window\.)?localStorage\.removeItem\((?:"([^"]+)"|([A-Z_]+))\)/g)]
    .map((m) => m[1] ?? (m[2] === "LAST_ACTIVITY_KEY" ? "apex_last_activity" : m[2] === "PASSWORD_CHANGE_REQUIRED_KEY" ? "apex_password_change_required" : m[2]));
  // Control de contraste: si el barrido no ve las claves que si se borran, el assert de abajo es verde
  // por ceguera y no afirma nada.
  assert.ok(barridas.length >= 10, `el barrido encontro ${barridas.length} claves, se esperan las de siempre: ${barridas.join(",")}`);
  assert.ok(barridas.includes("token") && barridas.includes("user_email"), `el barrido debe ver las claves de sesion: ${barridas.join(",")}`);
  assert.equal(barridas.includes(INSTALLATION_STORAGE_KEY), false, `${INSTALLATION_STORAGE_KEY} NO puede borrarse al cerrar sesion: el caso que cubre es un intento hecho SIN sesion`);
});

test("la marca tampoco vive en la base offline que se elimina al salir", () => {
  const storageAdapter = read("lib/offline/storageAdapter.ts");
  const logout = read("lib/offline/session.ts");
  assert.equal(storageAdapter.includes(INSTALLATION_STORAGE_KEY), false, "la cola offline se borra entera con clearOfflineDataOnLogout: alli la marca moriria");
  assert.match(logout, /clearOfflineDataOnLogout/, "contraste: el barrido lee el archivo que si borra datos");
  const modulo = read("lib/installationIdentity.ts");
  assert.match(modulo, /window\.localStorage\.getItem\(INSTALLATION_KEY\)/, "la marca vive en localStorage, no en IndexedDB");
});

test("el reportador usa esta marca y nunca la envia vacia", () => {
  const apiSource = read("lib/api.ts");
  assert.match(apiSource, /import \{ readInstallationId \} from "\.\/installationIdentity";/, "el reporte debe leer la marca durable");
  const reporte = apiSource.slice(apiSource.indexOf("function reportClientFailure"), apiSource.indexOf("function shouldPreferOperationalApi"));
  assert.match(reporte, /const deviceId = readInstallationId\(\);/, "una sola lectura por reporte");
  assert.match(reporte, /const identidadDispositivo = deviceId \? \{ device_id: deviceId \} : \{\};/, "sin marca no se manda la clave: el esquema publico solo admite UUID canonico");
  // Las dos vias llevan la marca: la anonima es la que hay que recuperar y la autenticada es la unica
  // fila con nombre que puede cruzarse contra ella.
  const anonima = reporte.slice(reporte.indexOf("const anonymousPayload"), reporte.indexOf("const post ="));
  const autenticada = reporte.slice(reporte.indexOf("const authenticatedPayload"), reporte.indexOf("post(CLIENT_LOG_ENDPOINT"));
  assert.match(anonima, /\.\.\.identidadDispositivo \}/, "el buzon publico debe recibir la marca: sin ella el intento sigue irrecuperable");
  assert.match(autenticada, /\.\.\.identidadDispositivo\s*\}/, "la fila autenticada debe recibir la misma marca: es el cruce que devuelve el dueno");
  assert.equal(/device_id:/.test(anonima + autenticada), false, "ninguna via escribe la marca en crudo: un device_id vacio rebotaria 400 y el reporte se perderia");
});
