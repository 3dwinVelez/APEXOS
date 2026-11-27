// Identidad del navegador, no de la persona.
//
// Existe porque el reporte de telemetria que manda un dispositivo sin sesion llegaba con `user_id`
// nulo y sin ninguna clave estable: la hora del intento se guardaba, quien oprimio no. Medido en
// Produccion el 2026-11-20: 18 rechazos sin usuario, 5 de ellos intentos de marcacion, y el 2026-11-23
// el mismo grupo anonimo ya llevada 114.
//
// No se apoya en el `installationId` de IndexedDB: esa base esta particionada por usuario
// (`apps/web/lib/offline/context.ts:56-66`) y `clearOfflineDataOnLogout()` la borra entera
// (`apps/web/lib/offline/session.ts:69-97`), o sea desaparece justo en el caso que hay que cubrir.
// Tampoco puede vivir en ninguna de las claves que `clearSession()` limpia
// (`apps/web/lib/sessionSecurity.ts:34-53`): esa es la lista que el cierre de sesion barre.
//
// Limite honesto: un id de navegador amarra un intento a un telefono. La persona llega despues, por
// la primera fila autenticada que comparta el mismo id; y se pierde si se borran los datos del sitio.
const INSTALLATION_KEY = "apexos_installation_id";
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function hex(n: number): string {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function nuevoId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Safari anterior a 15.4 y ciertos WebViews no traen randomUUID. Se arma un UUID v4 canonico con
  // el CSPRNG de todos modos: un id debil (Math.random) no puede servir para atribuir una jornada.
  if (!globalThis.crypto?.getRandomValues) return "";
  const uuid = [
    hex(4),
    hex(2),
    `4${hex(2).slice(0, 3)}`,
    `8${hex(2).slice(0, 3)}`,
    hex(6)
  ].join("-");
  return UUID_CANONICO.test(uuid) ? uuid : "";
}

export function readInstallationId(): string {
  if (typeof window === "undefined") return "";
  try {
    const guardado = window.localStorage.getItem(INSTALLATION_KEY);
    if (guardado && UUID_CANONICO.test(guardado)) return guardado;
    // Forma invalida (registros de otras versiones, datos manipulados): se renueva, no se propaga.
    if (guardado) window.localStorage.removeItem(INSTALLATION_KEY);
    const id = nuevoId();
    if (!id) return "";
    window.localStorage.setItem(INSTALLATION_KEY, id);
    return id;
  } catch {
    // Modo privado, cotas llenas o localStorage bloqueado: el reporte sigue viajando sin id.
    return "";
  }
}

export const INSTALLATION_STORAGE_KEY = INSTALLATION_KEY;
export const INSTALLATION_ID_PATTERN = UUID_CANONICO;
