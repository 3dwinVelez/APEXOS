#!/usr/bin/env node

// Corroboracion REMOTA en QA del enlace de la app movil administrable por ambiente.
//
// Por que existe: la certificacion local (mobile-app-url-admin-local.js) corre contra una base
// efimera del puesto y contra un artefacto de build local, con EXPECTED_ENVIRONMENT forzado por
// bandera. Demuestra el codigo, no el ambiente. Este instrumento hace la otra mitad: corre contra
// el API desplegado desde `develop` y contra la base de QA, y afirma lo que solo se puede saber ahi:
//   1) que el binario servido es el commit promocionado;
//   2) que la migracion 20261125183000_platform_settings esta aplicada EN LA BASE QUE LEE EL API;
//   3) que el servidor, por si solo, declara en que ambiente esta quien administra;
//   4) que guardar en QA se ve en el acceso publico de QA sin tocar Produccion.
//
// Safety: aborta si el env-file no es el de QA, si cualquier URL apunta al project ref de
// Produccion, o si el host de API no es el HTTPS de QA en Railway. No escribe en Produccion ni
// deja cuentas vivas: las dos cuentas que siembra son efimeras y se retiran por el endpoint.
//
// Uso:
//   node scripts/certifications/mobile-app-url-admin-qa.js \
//     --env-file=config/qa.env --expect-commit=<sha promocionado> \
//     --output=docs/qa/evidence/<dir>/qa-remoto.json
//   --hold            : no retira la cuenta superadmin y la deja en --fixture-output=<ruta .tmp>
//                       para la pata de navegador; sin bandera, retira todo.
//   --retire=<fixture>: modo limpio: vuelve el enlace al respaldo, retira las cuentas del fixture
//                       y borra el fixture. Se usa despues de la pata de navegador.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

const ROOT = path.resolve(__dirname, "..", "..");
const QA_API_HOST = "https://apexos-api-qa-production.up.railway.app";
const QA_REF = "jbirkghkekuifgfsgquq";
const PROD_REF = "jzbwzmkidfthknsohhnr";
const FALLBACK = "https://appapexos-production.up.railway.app";
// URL real y viva del propio ambiente: si el enlace administrado no llegara al acceso, se nota.
const QA_MARKER_URL = "https://apexos-web-qa-production.up.railway.app";

function arg(name) {
  const eq = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : index >= 0;
}

const ENV_FILE = String(arg("env-file") || "");
const OUTPUT = String(arg("output") || "");
const FIXTURE = arg("fixture") === true ? "" : String(arg("fixture") || "");
const RETIRE = arg("retire") === true ? "" : String(arg("retire") || "");
const HOLD = arg("hold") === true;
const EXPECT_COMMIT = String(arg("expect-commit") || "");

if (!ENV_FILE) throw new Error("Falta --env-file=config/qa.env: este instrumento no elige ambiente por defecto.");
if (!OUTPUT) throw new Error("Falta --output con la ruta de evidencia.");
if (!RETIRE && !EXPECT_COMMIT) throw new Error("Falta --expect-commit con el sha promocionado a develop.");

const absoluteEnv = path.resolve(ROOT, ENV_FILE);
const absoluteOutput = path.resolve(ROOT, OUTPUT);
if (!fs.existsSync(absoluteEnv)) throw new Error(`No existe ${ENV_FILE}`);
if (!absoluteOutput.startsWith(path.join(ROOT, "docs", "qa", "evidence") + path.sep)) {
  throw new Error("--output debe escribir dentro de docs/qa/evidence/: la evidencia no se archiva en cualquier lado.");
}
if (fs.existsSync(absoluteOutput) && arg("allow-output-overwrite") !== true && !RETIRE && !arg("seed-only")) {
  throw new Error(`--output apunta a evidencia existente (${OUTPUT}): un rojo no pisa la corrida buena. Use una ruta nueva o --allow-output-overwrite`);
}

require(path.join(ROOT, "scripts", "load-env"))(absoluteEnv);

const declaredEnv = String(process.env.TARGET_ENV || "").toLowerCase();
if (declaredEnv !== "qa") throw new Error(`${ENV_FILE} no declara TARGET_ENV=qa (dice "${declaredEnv || "nada"}").`);
for (const key of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_URL"]) {
  const value = String(process.env[key] || "");
  if (!value) continue;
  if (value.includes(PROD_REF)) throw new Error(`${key} apunta al project ref de Produccion: se aborta sin conectar.`);
  if (!value.includes(QA_REF)) throw new Error(`${key} no pertenece al project ref de QA (${QA_REF}).`);
}

const API_URL = String(arg("api-url") || process.env.QA_API_URL || QA_API_HOST).replace(/\/$/, "");
if (API_URL !== QA_API_HOST) throw new Error(`BLOQUEADO: solo se puede correr contra ${QA_API_HOST}.`);

const prisma = require(path.join(ROOT, "apps", "api", "src", "core", "prisma"));

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
const FIXTURE_PATH = path.resolve(ROOT, String(FIXTURE || `.tmp/qa-ephemeral-${RUN_ID}.json`));
const PASSWORD = `Qa-Plat-${crypto.randomBytes(8).toString("hex")}#26`;
const COMPANY = String(arg("company") || "NYVORA");

const doc = {
  instrumento: "mobile-app-url-admin-qa",
  ejecutado_en: new Date().toISOString(),
  ambiente: "QA (despliegue de develop)",
  api_url: API_URL,
  env_file: ENV_FILE,
  commit_esperado: EXPECT_COMMIT,
  checks: [],
  notas: []
};

function registrar(nombre, ok, detalle) {
  doc.checks.push({ nombre, ok: Boolean(ok), detalle });
  if (!ok) throw new Error(`ROTO ${nombre}: ${JSON.stringify(detalle).slice(0, 400)}`);
  return detalle;
}

async function paso(method, route, token, body) {
  const res = await fetch(`${API_URL}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch { parsed = { crudo: text.slice(0, 300) }; }
  return { status: res.status, body: parsed, headers: Object.fromEntries(res.headers.entries()) };
}

async function login(email, password) {
  const r = await paso("POST", "/api/v1/auth/login", null, { email, password });
  const token = r.body.token || r.body.access_token;
  if (!token) throw new Error(`login ${email}: HTTP ${r.status} sin token: ${JSON.stringify(r.body).slice(0, 200)}`);
  return token;
}

async function esperaPublico(urlEsperada, maxMs = 30000) {
  const inicio = Date.now();
  let ultimo = null;
  while (Date.now() - inicio < maxMs) {
    ultimo = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
    if (String(ultimo.body.url || "") === urlEsperada) return { ms: Date.now() - inicio, url: ultimo.body.url };
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { ms: Date.now() - inicio, url: ultimo && ultimo.body.url, agoto_tiempo: true };
}

async function sembrar(nombre, correo, rolNombre, clave) {
  const tenant = await prisma.$queryRawUnsafe(
    `select t.id from "Tenant" t join "Role" r on r.tenant_id = t.id where t.name ilike $1 and upper(r.name) = 'APEX_ADMIN' limit 2`,
    `%${COMPANY}%`
  );
  if (!tenant.length) throw new Error(`No se encontro el tenant ${COMPANY} con rol APEX_ADMIN en QA.`);
  const tenantId = String(tenant[0].id);
  const rol = nombre === "superadmin"
    ? await prisma.$queryRawUnsafe(`select id, name from "Role" where tenant_id = $1 and upper(name) = 'APEX_ADMIN' order by id limit 1`, tenantId)
    : await prisma.$queryRawUnsafe(`select id, name from "Role" where tenant_id = $1 and name = $2 order by id limit 1`, tenantId, rolNombre);
  if (!rol.length) throw new Error(`No hay rol "${rolNombre}" en el tenant ${tenantId} de QA.`);
  const user = await prisma.user.create({
    data: {
      tenant_id: tenantId,
      name: `QA ENLACE ${nombre} ${RUN_ID}`,
      email: correo,
      password: await bcrypt.hash(clave, 10),
      role_id: Number(rol[0].id),
      active: true
    }
  });
  return { id: Number(user.id), email: correo, clave, tenantId, rolId: Number(rol[0].id), rolNombre: String(rol[0].name) };
}

async function retirar(token, id) {
  const r = await paso("PATCH", `/api/v1/admin/users/${id}/status`, token, { active: false });
  return { status: r.status, cuerpo: JSON.stringify(r.body).slice(0, 120) };
}

async function modoRetiro() {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(ROOT, RETIRE), "utf8"));
  const notas = [];
  let token = null;
  try {
    token = await login(fixture.superadmin.email, fixture.superadmin.clave);
    const restaurado = await paso("PUT", "/api/v1/admin/platform/mobile-app", token, { url: FALLBACK });
    notas.push(`restaurar por el endpoint: HTTP ${restaurado.status}, restaurada ${restaurado.body.restaurada}`);
    const reflejado = await esperaPublico(FALLBACK);
    notas.push(`acceso publico de vuelta al respaldo en ${reflejado.ms} ms: ${reflejado.url}`);
  } catch (error) {
    notas.push(`restauracion del enlace no completo: ${String(error.message).slice(0, 160)}`);
  }
  const fila = await prisma.platformSetting.findUnique({ where: { key: "mobile_app.url" } });
  // La capa de Prisma de la casa bloquea el borrado fisico de PlatformSetting (no tiene soft-delete),
  // y no se le va a dar la vuelta con SQL crudo: la fila que queda vale lo mismo que el respaldo,
  // asi que se declara como residuo en lugar de esconderla.
  notas.push(`fila final: ${fila ? JSON.stringify(fila.value) + " actualizada por " + fila.updated_by : "sin fila"}`);
  notas.push("residuo declarado: la prueba deja UNA fila con el destino quemado (etiqueta 'administrado en este ambiente' en vez de 'respaldo'). El enlace que ve el usuario es el mismo.");
  for (const cuenta of [fixture.superadmin, ...(fixture.secundarios || [])]) {
    try {
      if (!token) token = await login(fixture.superadmin.email, fixture.superadmin.clave);
      const r = await retirar(token, cuenta.id);
      const intento = await paso("POST", "/api/v1/auth/login", null, { email: cuenta.email, password: cuenta.clave });
      notas.push(`${cuenta.email}: retiro HTTP ${r.status}, login despues HTTP ${intento.status}`);
    } catch (error) {
      notas.push(`${cuenta.email}: NO se pudo retirar (${String(error.message).slice(0, 160)})`);
    }
  }
  const vivas = await prisma.$queryRawUnsafe(
    `select count(*)::int as n from "User" where email like 'qa.plat.%' and active = true`);
  notas.push(`cuentas de prueba todavia activas en QA: ${vivas[0].n}`);
  const informe = { modo: "retiro", ejecutado_en: new Date().toISOString(), notas, cuentas_vivas: vivas[0].n };
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(informe, null, 2)}\n`);
  fs.rmSync(path.resolve(ROOT, RETIRE), { force: true });
  console.log(`${vivas[0].n === 0 ? "CUENTAS RETIRADAS" : "RETIRO INCOMPLETO"}: ${notas.length} notas en ${OUTPUT}`);
  for (const n of notas) console.log(`  - ${n}`);
  if (vivas[0].n !== 0) process.exitCode = 1;
  await prisma.$disconnect();
}

async function modoSiembra() {
  // Solo deja una cuenta superadmin viva, con su credencial en el fixture de .tmp, para la pata de
  // navegador contra el ambiente desplegado. Se cierra con --retire, que ademas devuelve el enlace.
  const cuenta = await sembrar("superadmin", `qa.plat.web.${RUN_ID}@apexos.invalid`, "APEX_ADMIN", PASSWORD);
  const token = await login(cuenta.email, PASSWORD);
  const lectura = await paso("GET", "/api/v1/admin/platform/mobile-app", token, undefined);
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify({
    superadmin: { id: cuenta.id, email: cuenta.email, clave: PASSWORD },
    secundarios: [], dejar_fila: false, api_url: API_URL, run_id: RUN_ID,
    creado: new Date().toISOString(), ambiente_declado_por_el_servidor: lectura.body.environment
  }, null, 2));
  const informe = {
    modo: "siembra_para_navegador", ejecutado_en: new Date().toISOString(), api_url: API_URL,
    cuenta: { id: cuenta.id, email: cuenta.email, rol: cuenta.rolNombre },
    administracion_lee: { status: lectura.status, environment: lectura.body.environment, source: lectura.body.source },
    fixture: path.relative(ROOT, FIXTURE_PATH).replace(/\\/g, "/")
  };
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(informe, null, 2)}\n`);
  console.log(`CUENTA VIVA: ${cuenta.email} rol ${cuenta.rolNombre}, ambiente declarado ${lectura.body.environment}, fixture ${informe.fixture}`);
  await prisma.$disconnect();
}

async function main() {
  if (RETIRE) return modoRetiro();
  if (arg("seed-only")) return modoSiembra();

  let superadmin = null;
  let empresa = null;
  try {
    // 1. identidad del binario servido
    const health = await paso("GET", "/health", null, undefined);
    registrar("binario_servido_es_el_commit_promocionado",
      String(health.body.commit || "").startsWith(EXPECT_COMMIT.slice(0, 12)),
      { health_commit: health.body.commit, esperado: EXPECT_COMMIT, modulos: health.body.modules });

    // 2. la tabla existe en LA base que lee este API (no solo en el arbol)
    const columnas = await prisma.$queryRawUnsafe(
      "select count(*)::int as n from information_schema.columns where table_name = 'platform_settings'");
    const filasIniciales = await prisma.platformSetting.count();
    registrar("migracion_aplicada_en_la_base_de_qa", Number(columnas[0].n) === 6,
      { columnas: Number(columnas[0].n), filas_iniciales: filasIniciales });

    // 3. siembra de las dos cuentas del turno
    superadmin = await sembrar("superadmin", `qa.plat.sup.${RUN_ID}@apexos.invalid`, "APEX_ADMIN", PASSWORD);
    empresa = await sembrar("empresa", `qa.plat.emp.${RUN_ID}@apexos.invalid`, "Administrador de empresa", PASSWORD);
    registrar("dos_cuentas_efimeras_sembradas", superadmin.id > 0 && empresa.id > 0,
      { tenant: superadmin.tenantId, rol_super: superadmin.rolNombre, rol_empresa: empresa.rolNombre });

    const tokenSuper = await login(superadmin.email, PASSWORD);
    const tokenEmpresa = await login(empresa.email, PASSWORD);
    registrar("login_remoto_contra_el_api_desplegado", Boolean(tokenSuper && tokenEmpresa), { autenticadas: 2 });

    // 4. lectura publica: la que consume el acceso antes del login
    const publica = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
    registrar("lectura_publica_sin_sesion",
      publica.status === 200 && String(publica.body.url) === FALLBACK && Object.keys(publica.body).join() === "url",
      { status: publica.status, url: publica.body.url, claves: Object.keys(publica.body), cache_control: publica.headers["cache-control"], limite: publica.headers["x-ratelimit-limit"] });

    // 5. guardas de acceso
    const sinSesionGet = await paso("GET", "/api/v1/admin/platform/mobile-app", null, undefined);
    registrar("administracion_sin_sesion_rechaza", sinSesionGet.status === 401, { status: sinSesionGet.status });
    const sinSesionPut = await paso("PUT", "/api/v1/admin/platform/mobile-app", null, { url: QA_MARKER_URL });
    registrar("escritura_sin_sesion_rechaza", sinSesionPut.status === 401, { status: sinSesionPut.status });
    const antesDeRechazo = await prisma.platformSetting.count();
    const empresaIntenta = await paso("PUT", "/api/v1/admin/platform/mobile-app", tokenEmpresa, { url: "https://desvio-ajeno.example" });
    const despuesDeRechazo = await prisma.platformSetting.count();
    registrar("administrador_de_empresa_no_escribe",
      empresaIntenta.status === 403 && despuesDeRechazo === antesDeRechazo,
      { status: empresaIntenta.status, code: empresaIntenta.body.code, filas_antes: antesDeRechazo, filas_despues: despuesDeRechazo });

    // 6. el servidor declara su ambiente (lo que el dueno pidio: no equivocarse de ambiente)
    const lecturaAdmin = await paso("GET", "/api/v1/admin/platform/mobile-app", tokenSuper, undefined);
    registrar("el_servidor_declara_el_ambiente_qa",
      lecturaAdmin.status === 200 && lecturaAdmin.body.environment === "qa",
      { status: lecturaAdmin.status, environment: lecturaAdmin.body.environment, source: lecturaAdmin.body.source, fallback_url: lecturaAdmin.body.fallback_url, updated_by: lecturaAdmin.body.updated_by });

    // 7. validaciones con nombre propio, sobre el binario desplegado
    const rechazos = [];
    for (const [etiqueta, valor, code] of [
      ["vacia", "", "URL_APP_MOVIL_VACIA"],
      ["sin_esquema", "app.midominio.co", "URL_APP_MOVIL_INVALIDA"],
      ["sin_dominio", "https://midominio", "URL_APP_MOVIL_SIN_DOMINIO"],
      ["con_credenciales", "https://user:pass@midominio.co", "URL_APP_MOVIL_CON_CREDENCIALES"],
      ["con_fragmento", "https://midominio.co/#app", "URL_APP_MOVIL_CON_FRAGMENTO"]
    ]) {
      const r = await paso("PUT", "/api/v1/admin/platform/mobile-app", tokenSuper, { url: valor });
      rechazos.push({ etiqueta, status: r.status, code: r.body.code, ok: r.status === 400 && r.body.code === code });
    }
    const filasTrasRechazos = await prisma.platformSetting.count();
    registrar("cinco_rechazos_con_nombre_propio_y_cero_escritura",
      rechazos.every((r) => r.ok) && filasTrasRechazos === antesDeRechazo,
      { rechazos, filas: filasTrasRechazos });

    // 8. guardar el enlace de QA y que se vea en el acceso
    const guardado = await paso("PUT", "/api/v1/admin/platform/mobile-app", tokenSuper, { url: QA_MARKER_URL });
    registrar("superadmin_guarda_el_enlace_de_qa",
      guardado.status === 200 && guardado.body.url === QA_MARKER_URL && guardado.body.restaurada === false,
      { status: guardado.status, url: guardado.body.url, environment: guardado.body.environment, restaurada: guardado.body.restaurada });

    const lecturaTrasGuardar = await paso("GET", "/api/v1/admin/platform/mobile-app", tokenSuper, undefined);
    registrar("la_autoria_es_el_correo_no_un_numero",
      lecturaTrasGuardar.body.updated_by === superadmin.email && lecturaTrasGuardar.body.source === "base",
      { updated_by: lecturaTrasGuardar.body.updated_by, source: lecturaTrasGuardar.body.source });

    const propaga = await esperaPublico(QA_MARKER_URL);
    registrar("el_acceso_publico_refleja_lo_guardado", !propaga.agoto_tiempo,
      { tardo_ms: propaga.ms, url_publica: propaga.url });

    const auditoria = await prisma.$queryRawUnsafe(
      `select action, entity, old_value, new_value from "AuditLog" where entity = 'PlatformSetting' and user_id = $1 order by id desc limit 1`,
      superadmin.id);
    registrar("el_cambio_dejo_auditoria", auditoria.length > 0,
      { action: auditoria[0] && auditoria[0].action, anterior: auditoria[0] && JSON.stringify(auditoria[0].old_value), nuevo: auditoria[0] && JSON.stringify(auditoria[0].new_value) });

    // 9. volver el ambiente al estado encontrado
    const restaurado = await paso("PUT", "/api/v1/admin/platform/mobile-app", tokenSuper, { url: FALLBACK });
    registrar("restaurar_devuelve_el_respaldo", restaurado.status === 200 && restaurado.body.restaurada === true,
      { status: restaurado.status, restaurada: restaurado.body.restaurada });
    const deVuelta = await esperaPublico(FALLBACK);
    registrar("el_acceso_vuelve_al_respaldo", !deVuelta.agoto_tiempo, { tardo_ms: deVuelta.ms, url: deVuelta.url });
  } catch (error) {
    doc.error = String(error && error.message || error).slice(0, 600);
  } finally {
    // Las cuentas del turno no se quedan vivas en QA, pase lo que pase.
    const limpieza = [];
    try {
      const token = (superadmin && await login(superadmin.email, PASSWORD).catch(() => null))
        || (empresa && await login(empresa.email, PASSWORD).catch(() => null));
      // Si el turno se corto con el enlace apuntando al marcador, se devuelve al respaldo igualmente.
      const publicaAlFinal = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
      if (String(publicaAlFinal.body.url || "") !== FALLBACK && superadmin && token) {
        const rescate = await paso("PUT", "/api/v1/admin/platform/mobile-app", token, { url: FALLBACK });
        doc.notas.push(`el enlace no estaba en su respaldo al cerrar (quedo ${publicaAlFinal.body.url}): se restauro por el endpoint con HTTP ${rescate.status}`);
      }
      if (superadmin && empresa) {
        if (token) limpieza.push({ empresa: await retirar(token, empresa.id) });
      }
      if (superadmin) {
        const tokenSuper = await login(superadmin.email, PASSWORD).catch(() => null);
        if (HOLD) {
          fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
          fs.writeFileSync(FIXTURE_PATH, JSON.stringify({
            superadmin: { id: superadmin.id, email: superadmin.email, clave: PASSWORD },
            secundarios: empresa ? [{ id: empresa.id, email: empresa.email, clave: PASSWORD }] : [],
            dejar_fila: false, api_url: API_URL, run_id: RUN_ID, creado: new Date().toISOString()
          }, null, 2));
          doc.notas.push(`bandera --hold: la cuenta superadmin queda viva y su credencial se escribio en ${path.relative(ROOT, FIXTURE_PATH).replace(/\\/g, "/")} (fuera del repo) para la pata de navegador. Se retira con --retire.`);
        } else if (tokenSuper) {
          limpieza.push({ superadmin: await retirar(tokenSuper, superadmin.id) });
          const intento = await paso("POST", "/api/v1/auth/login", null, { email: superadmin.email, password: PASSWORD });
          registrar("las_cuentas_efimeras_quedan_retiradas", [401, 403].includes(intento.status),
            { status_tras_retiro: intento.status, limpieza });
        } else {
          doc.notas.push("no se pudo volver a iniciar sesion para retirar las cuentas: quedan vivas y hay que retirarlas a mano");
        }
      } else if (empresa && token) {
        await retirar(token, empresa.id);
      }
      const final = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
      doc.estado_final = { url_publica: final.body.url, filas: await prisma.platformSetting.count() };
      doc.limpieza = limpieza;
    } catch (error) {
      doc.notas.push(`limpieza incompleta: ${String(error.message).slice(0, 200)}`);
    }
  }

  const rotos = doc.checks.filter((c) => !c.ok);
  doc.resumen = { total: doc.checks.length, verdes: doc.checks.length - rotos.length, rojos: rotos.length };
  doc.veredicto = !doc.error && rotos.length === 0 && doc.checks.length >= 14
    ? "QA SIRVE EL BINARIO PROMOCIONADO Y EL ENLACE SE ADMINISTRA EN ESE AMBIENTE"
    : "ROJO: la corroboracion en QA no se completo";
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`${doc.veredicto}: ${doc.resumen.verdes}/${doc.resumen.total} controles en ${OUTPUT}`);
  for (const c of doc.checks.filter((x) => !x.ok)) console.log(`  ROTO ${c.nombre}: ${JSON.stringify(c.detalle).slice(0, 220)}`);
  if (doc.error) console.log(`  ERROR: ${doc.error}`);
  for (const n of doc.notas) console.log(`  NOTA: ${n}`);
  await prisma.$disconnect();
  if (doc.veredicto.startsWith("ROJO")) process.exitCode = 1;
}

main().catch((error) => { console.error(`ROJO: ${error.message}`); process.exitCode = 1; });
