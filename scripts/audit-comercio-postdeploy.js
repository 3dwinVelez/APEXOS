#!/usr/bin/env node
/* Verificacion post-despliegue del modulo Comercio (M-30) en un ambiente real.
 *
 * Solo lectura: GETs al API y a Storage + consultas raw de information_schema, ledger y
 * catalogo. No escribe, no habilita modulos por empresa y no imprime secretos ni rutas locales.
 *
 * Uso:
 *   npm run audit:comercio:postdeploy:prod
 *   npm run audit:comercio:postdeploy:qa
 *   node scripts/audit-comercio-postdeploy.js --target=production [--expect-commit=<sha>] [--output=<ruta>]
 *
 * Las tres aserciones que demuestran que el deploy trae el modulo, sin credenciales:
 *   1. `/health` publica el commit desplegado.
 *   2. La ruta protegida del modulo responde 401 TOKEN_INVALIDO (existe en el build).
 *   3. La ruta publica del catalogo responde su codigo de negocio CATALOG_NOT_FOUND
 *      (llego al servicio y consulto la tabla), no un 404 de router.
 */
const fs = require("node:fs");
const path = require("node:path");
const loadEnv = require("./load-env");

const PROYECTOS = {
  production: { ref: "jzbwzmkidfthknsohhnr", envFile: "config/production.env" },
  qa: { ref: "jbirkghkekuifgfsgquq", envFile: "config/qa.env" }
};

// Las 15 tablas que crea el DDL de Comercio; se exige que esten, no que sean exactas,
// para que el dia que el modulo gane una tabla esta gate no confunda alcance con falla.
const TABLAS_COMERCIO = [
  "comercio_credits", "comercio_customers", "comercio_expenses", "comercio_installments",
  "comercio_payments", "comercio_products", "comercio_promotion_categories",
  "comercio_promotion_products", "comercio_promotion_sends", "comercio_promotions",
  "comercio_purchases", "comercio_sale_items", "comercio_sales", "comercio_settings",
  "comercio_stock_movements"
];
const MIGRACIONES_COMERCIO = [
  "20261026120000_comercio_foundation",
  "20261026140000_comercio_payment_allocations",
  "20261027120000_comercio_public_catalog",
  "20261027150000_comercio_social_links",
  "20261028120000_comercio_discounts",
  "20261028190000_comercio_promotions"
];
const BUCKET = "comercio-assets";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const separator = item.indexOf("=");
    if (separator === -1) args[item.slice(2)] = true;
    else args[item.slice(2, separator)] = item.slice(separator + 1);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const target = String(args.target || "production").toLowerCase();
const proyecto = PROYECTOS[target];
if (!proyecto) throw new Error("El destino debe ser production o qa.");
loadEnv(path.resolve(__dirname, "..", args["env-file"] || proyecto.envFile));

const databaseUrl = String(process.env.DATABASE_URL || "");
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const apiBase = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

// El codigo del link publico es `^[a-zA-Z0-9]{4,32}$`; sin un link real no se puede leer una
// vitrina, pero si se puede demostrar que la ruta existe y que el servicio consulto la tabla.
const CODIGO_SONDEO = "SONDEAPOSTDEPLOYNOEXISTE";

function assertProyecto() {
  if (!databaseUrl.includes(proyecto.ref)) {
    throw new Error(`DATABASE_URL no corresponde al proyecto ${target} autorizado; se aborta sin consultar nada.`);
  }
  if (!supabaseUrl.includes(proyecto.ref)) {
    throw new Error(`SUPABASE_URL no corresponde al proyecto ${target} autorizado; se aborta sin consultar nada.`);
  }
}

async function getJson(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text.slice(0, 120) }; }
    return { status: response.status, payload };
  } catch (error) {
    return { status: null, payload: { error: String(error).slice(0, 120) } };
  }
}

const resultados = [];
function registrar(id, ok, detalle) {
  resultados.push({ id, ok: Boolean(ok), detalle });
  return Boolean(ok);
}

async function main() {
  assertProyecto();
  const prisma = require("../apps/api/src/core/prisma");

  // 1. Que build esta sirviendo.
  const health = await getJson(`${apiBase}/health`);
  const commit = String(health.payload?.commit || "");
  let commitOk = /^[a-f0-9]{7,40}$/i.test(commit);
  if (commitOk && args["expect-commit"]) commitOk = commit.startsWith(String(args["expect-commit"]));
  registrar("health_publica_commit_desplegado", health.status === 200 && commitOk, {
    status: health.status, commit: commit || "sin-commit", version: health.payload?.version ?? null,
    modulos: Array.isArray(health.payload?.modules) ? health.payload.modules.length : health.payload?.modules ?? null
  });

  // 2. Ruta protegida del modulo sin credenciales: el 401 con codigo propio demuestra que el
  //    build desplegado contiene el modulo. Un 404 de router diria lo contrario.
  const protegida = await getJson(`${apiBase}/api/v1/comercio/settings`);
  registrar("ruta_protegida_sin_token_devuelve_401_del_modulo",
    protegida.status === 401 && protegida.payload?.code === "TOKEN_INVALIDO",
    { status: protegida.status, code: protegida.payload?.code ?? null });

  // 3. Ruta publica con un link inexistente: tiene que llegar al servicio y responder su
  //    codigo de negocio, prueba de que la tabla del catalogo existe y se consulta.
  const catalogo = await getJson(`${apiBase}/api/v1/public/comercio/catalog/${CODIGO_SONDEO}`);
  registrar("ruta_publica_del_catalogo_llega_al_servicio",
    catalogo.status === 404 && catalogo.payload?.code === "CATALOG_NOT_FOUND",
    { status: catalogo.status, code: catalogo.payload?.code ?? null });

  // 4. Esquema: las tablas del modulo.
  const tablas = await prisma.$queryRawUnsafe(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name like 'comercio%'"
  );
  const presentes = new Set(tablas.map((row) => row.table_name));
  const faltantes = TABLAS_COMERCIO.filter((table) => !presentes.has(table));
  registrar("las_15_tablas_de_comercio_existen", faltantes.length === 0, { total: presentes.size, faltantes });

  // 5. Ledger: cada migracion del modulo registrada y terminada.
  const ledger = await prisma.$queryRawUnsafe(
    "select distinct migration_name, finished_at from _prisma_migrations where migration_name like '%comercio%'"
  );
  const porNombre = new Map(ledger.map((row) => [row.migration_name, row.finished_at]));
  const ledgerFalta = MIGRACIONES_COMERCIO.filter((name) => !porNombre.has(name));
  const ledgerSinTerminar = MIGRACIONES_COMERCIO.filter((name) => porNombre.has(name) && !porNombre.get(name));
  registrar("el_ledger_registra_las_6_migraciones_de_comercio",
    ledgerFalta.length === 0 && ledgerSinTerminar.length === 0,
    { registradas: porNombre.size, faltan: ledgerFalta, sin_finished_at: ledgerSinTerminar });

  // 6. Catalogo de plataforma: el modulo publicado.
  const modulo = await prisma.$queryRawUnsafe(
    "select code, route, is_active, visibility_scope from public.modules where code = 'comercio'"
  );
  registrar("comercio_publicado_en_el_catalogo",
    modulo.length === 1 && modulo[0].is_active === true && modulo[0].route === "/dashboard/comercio",
    { encontrado: modulo.length, fila: modulo[0] ? { route: modulo[0].route, is_active: modulo[0].is_active, visibility_scope: modulo[0].visibility_scope } : null });

  // 7. Estado por empresa: se reporta, no se afirma. Habilitar un modulo en una empresa real
  //    es decision del dueno del tenant, nunca de esta verificacion.
  const empresas = await prisma.$queryRawUnsafe(
    `select c.name, cm.enabled, cm.source
       from public.companies c
       join public.modules m on m.code = 'comercio'
       left join public.company_modules cm on cm.company_id = c.id and cm.module_id = m.id
      order by c.name`
  );
  registrar("lectura_de_habilitacion_por_empresa", true, {
    empresas: empresas.map((row) => ({ nombre: row.name, enabled: row.enabled ?? null, source: row.source ?? null }))
  });

  // 8. Bucket de la vitrina: publico, con los topes que aplica el modulo.
  const bucket = await getJson(`${supabaseUrl}/storage/v1/bucket/${BUCKET}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
  registrar("bucket_comercio_assets_publico_con_topes_del_modulo",
    bucket.status === 200 && bucket.payload?.public === true
      && Number(bucket.payload?.file_size_limit) === MAX_BYTES
      && JSON.stringify(bucket.payload?.allowed_mime_types || []) === JSON.stringify(ALLOWED_MIME_TYPES),
    { status: bucket.status, public: bucket.payload?.public ?? null, file_size_limit: bucket.payload?.file_size_limit ?? null, allowed_mime_types: bucket.payload?.allowed_mime_types ?? null });

  // 9. La lectura anonima del almacen sirve (el navegador de un cliente no lleva apikey).
  //    Se pide un objeto que no existe: tiene que responder el almacen, no el borde.
  const anonima = await getJson(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${CODIGO_SONDEO}.png`);
  registrar("la_ruta_publica_del_objeto_responde_sin_apikey",
    anonima.status !== null && anonima.status < 500,
    { status: anonima.status, code: anonima.payload?.code ?? null });

  await prisma.$disconnect();

  const fallas = resultados.filter((item) => !item.ok);
  const reporte = {
    ok: fallas.length === 0,
    ambiente: target,
    ejecutado_en: new Date().toISOString(),
    checks: resultados,
    fallas: fallas.map((item) => item.id)
  };
  const salida = JSON.stringify(reporte, null, 2);
  if (args.output) {
    const destino = path.resolve(process.cwd(), args.output);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, `${salida}\n`);
  }
  console.log(salida);
  if (!reporte.ok) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`AUDIT_COMERCIO_POSTDEPLOY_BLOQUEADO: ${error instanceof Error ? error.message : String(error)}`);
  try { require("../apps/api/src/core/prisma").$disconnect(); } catch { /* aun no habia conexion */ }
  process.exitCode = 1;
});
