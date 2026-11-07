/* Provisions el bucket de Storage que el modulo Comercio necesita en la nube.
 *
 * `apps/api/src/modules/comercio/storage.js` NO crea el bucket contra Supabase: solo contra
 * el MinIO del puesto de desarrollo (isLocalEndpoint). En la nube el operario tiene que
 * crear `comercio-assets` con lectura anonima, porque la vitrina publica del cliente pide el
 * banner sin sesion. Este script hace exactamente eso, idempotente, y es lo unico que
 * habilita la subida de banners en QA/produccion.
 *
 * Uso (nunca imprime la clave):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CONFIRM_COMERCIO_BUCKET=true \
 *     node scripts/ensure-comercio-assets-bucket.js [--env=qa|prod]
 *
 * La confirmacion explicita existe a proposito: un bucket PUBLICO es una decision de
 * exposicion de datos, no un detalle de despliegue.
 */
const loadEnv = require("../apps/api/src/core/loadEnv");

loadEnv();

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "");
const CONFIRMED = String(process.env.CONFIRM_COMERCIO_BUCKET || "").toLowerCase() === "true";
const BUCKET = "comercio-assets";
// Los mismos topes que aplica el modulo al validar el archivo (storage.js).
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.");
}
if (!CONFIRMED) {
  throw new Error("Set CONFIRM_COMERCIO_BUCKET=true: el bucket de la vitrina se publica con lectura anonima.");
}

const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const targetEnvironment = String(process.argv.find((a) => a.startsWith("--env="))?.split("=")[1] || "qa").toLowerCase();
const acciones = [];

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text.slice(0, 160) }; }
  return { status: response.status, payload };
}

async function main() {
  const cuerpo = {
    id: BUCKET,
    name: BUCKET,
    public: true,
    file_size_limit: MAX_BYTES,
    allowed_mime_types: ALLOWED_MIME_TYPES
  };
  const actual = await request(`/storage/v1/bucket/${BUCKET}`);
  if (actual.status === 404) {
    const creado = await request("/storage/v1/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    });
    if (creado.status !== 200 && creado.status !== 201) {
      throw new Error(`No se pudo crear el bucket (${creado.status}): ${String(creado.payload?.message || "").slice(0, 160)}`);
    }
    acciones.push("created");
  } else if (actual.status !== 200) {
    throw new Error(`GET bucket -> ${actual.status}`);
  } else {
    const publicado = actual.payload?.public === true;
    if (!publicado) {
      const actualizado = await request(`/storage/v1/bucket/${BUCKET}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo)
      });
      if (!actualizado.status || actualizado.status >= 300) {
        throw new Error(`No se pudo publicar el bucket (${actualizado.status})`);
      }
      acciones.push("publicado");
    } else {
      acciones.push("ya-publico");
    }
  }

  // Se reverifica leyendo el bucket otra vez: lo que importa es el estado final, no la
  // respuesta del write. La lectura anonima de un objeto se comprueba aparte, con
  // `verify`, porque sin objeto subido no hay URL publica que pedir.
  const despues = await request(`/storage/v1/bucket/${BUCKET}`);
  if (despues.payload?.public !== true) throw new Error("El bucket sigue sin lectura anonima despues de escribirlo.");
  if (Number(despues.payload?.file_size_limit) !== MAX_BYTES) {
    throw new Error(`file_size_limit del bucket es ${despues.payload?.file_size_limit}, se esperan ${MAX_BYTES} bytes.`);
  }
  const mimes = JSON.stringify(despues.payload?.allowed_mime_types || []);
  if (mimes !== JSON.stringify(ALLOWED_MIME_TYPES)) {
    throw new Error(`allowed_mime_types del bucket es ${mimes}, se esperan ${JSON.stringify(ALLOWED_MIME_TYPES)}.`);
  }

  // --verify=<ruta/relativa/dentro-del-bucket>: comprueba que un objeto ya subido se lee sin
  // apikey. Es el mismo camino que sigue el navegador de un cliente anonimo.
  const verifyPath = String(process.argv.find((a) => a.startsWith("--verify="))?.split("=").slice(1).join("=") || "");
  let lecturaAnonima = null;
  if (verifyPath) {
    const respuesta = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${verifyPath}`, { signal: AbortSignal.timeout(20000) });
    lecturaAnonima = { status: respuesta.status, content_type: respuesta.headers.get("content-type") };
    if (!respuesta.ok || !String(lecturaAnonima.content_type || "").startsWith("image/")) {
      throw new Error(`La lectura anonima de "${verifyPath}" fallo: ${respuesta.status} ${lecturaAnonima.content_type}`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    ambiente: targetEnvironment,
    bucket: BUCKET,
    acciones,
    public: true,
    file_size_limit: MAX_BYTES,
    allowed_mime_types: ALLOWED_MIME_TYPES,
    lectura_anonima_verificada: lecturaAnonima
  }));
}

main().catch((error) => {
  console.error(`BUCKET_COMERCIO_INVALIDO: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
