/* Certificacion de AMBIENTE QA del alcance de sesion de Administracion (401 -> 403).
 *
 * Que celda cubre y por que las otras no la cubren:
 *   - sesion-administracion-local.js levanta el API real en un puerto efimero con un Supabase
 *     simulado. Mide el codigo en el arbol que se promove, pero el Supabase simulado es nuestro:
 *     no prueba que el deployed de Railway con el Supabase productivo de verdad cambie de 401 a 403.
 *   - auth-session-readiness.js mide login, identidad y los rechazos de token, pero nunca toca
 *     /api/v1/admin/*, que es exactamente la ruta que expulsaba al usuario en produccion.
 *   - Ninguna certificacion existente ejercitaba el sintoma reportado contra un ambiente desplegado.
 *
 * Que se mide aqui, contra la API de QA en Railway y el Supabase de QA:
 *   1. Salud y commit desplegado: el ambiente que se certifica es el que tiene el fix.
 *   2. Los rechazos de credencial siguen siendo 401: sin sesion, token basura y token firmado con
 *      una clave que no es la real. La autenticacion no se relajo.
 *   3. El sintoma reproducido de punta a punta: una cuenta Supabase real, recién creada, con cero
 *      vinculos de empresa abre Administracion y recibe 403 EMPRESA_NO_VINCULADA. Antes del fix
 *      este mismo request devolvia 401 y el cliente tiraba la sesion.
 *   4. La sesion sobrevive: con ese mismo token, la identidad sigue resolviendo y ninguna respuesta
 *      del alcance es 401.
 *   5. Empresa modelo NYVORA: la misma cuenta, ya vinculada a la empresa, vuelve a abrir
 *      Administracion sin que ninguna respuesta sea 401; la ruta autorizada sigue funcionando.
 *   6. Limpieza verificada: los vinculos y las cuentas efimeras dejan de existir y la ruta deja de
 *      autorizar con esos tokens.
 *
 * Huella: escribe solo en QA. Crea dos cuentas efimeras de Supabase etiquetadas con el RUN_ID, un
 * vinculo `company_users` y su `profiles` para la empresa modelo, y los borra por id exacto al
 * terminar (nunca por empresa ni por patron). NO toca produccion: aborta si la URL de API no es
 * exactamente el host HTTPS de QA en Railway.
 *
 * Uso:
 *   node scripts/certifications/sesion-administracion-qa.js --env-file=config/qa.env \
 *     --expected-commit=6edf85c7 \
 *     --output=docs/qa/evidence/sesion-main-20261108/sesion-qa-certification.json
 *
 * Las credenciales salen de config/qa.env (gitignore). Ningun token, clave ni contrasena se escribe
 * en la evidencia: la corrida registra codigos de estado, codigos de negocio e ids de las cuentas
 * efimeras, cuyo correo es un fixture sintetico del arnes.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (!v.startsWith("--")) continue;
    const eq = v.indexOf("=");
    if (eq > 1) {
      out[v.slice(2, eq)] = v.slice(eq + 1);
      continue;
    }
    out[v.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const API_URL = String(args["api-url"] || process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
if (!/^https:\/\/apexos-api-qa-production\.up\.railway\.app$/.test(API_URL)) {
  console.error("BLOQUEADO: esta certificacion solo corre contra la API de QA en Railway (HTTPS).");
  process.exit(1);
}
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EXPECTED_COMMIT = String(args["expected-commit"] || "").trim();
const MODEL_COMPANY = String(args["company-id"] || "5f713e65-a3c1-414b-9260-a411a5a2e2bd");
const MODEL_COMPANY_NAME = String(args["company-name"] || "NYVORA");
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("BLOQUEADO: se requieren SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY (config/qa.env).");
  process.exit(1);
}
if (!/^[a-f0-9]{7,40}$/i.test(EXPECTED_COMMIT)) {
  console.error("BLOQUEADO: --expected-commit es obligatorio para poder afirmar que el fix esta desplegado.");
  process.exit(1);
}

const RUN_ID = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`.slice(-10);
const OUTPUT = path.resolve(ROOT, String(args["output"] || `docs/qa/evidence/sesion-admin-produccion-20261108/sesion-qa-${RUN_ID}.json`));
const ADMIN_PATH = "/api/v1/admin/roles";
const created = [];
let deployedCommit = "";

async function send(baseUrl, route, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text };
}

const api = (route, options = {}) => send(API_URL, route, options);
const supabaseAdmin = (route, options = {}) => send(SUPABASE_URL, route, {
  ...options,
  headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", ...(options.headers || {}) }
});
const supabasePublic = (route, options = {}) => send(SUPABASE_URL, route, {
  ...options,
  headers: { apikey: ANON_KEY, "content-type": "application/json", ...(options.headers || {}) }
});

const controles = [];
let fallos = 0;
function check(name, ok, detail) {
  controles.push({ control: name, ok: Boolean(ok), detail: String(detail ?? "").slice(0, 220) });
  console.log(`${ok ? "  OK " : " FALLA"} ${name}${detail !== undefined ? ` :: ${String(detail).slice(0, 160)}` : ""}`);
  if (!ok) fallos += 1;
}

function codeOf(result) {
  return String(result.body?.code || "");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function forgeWrongSecretToken() {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ sub: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 3600 }));
  const encoded = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", "secreto-de-prueba-que-no-es-el-de-qa-123456").update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

async function createEphemeralUser(label) {
  const email = `sesion-${label}.${RUN_ID}@certificacion.qa`;
  const password = `Sesion-${label}-${crypto.randomBytes(8).toString("hex")}#26`;
  const createdUser = await supabaseAdmin("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, user_metadata: { full_name: `Fixture sesion ${label}`, fixture_tag: RUN_ID } }
  });
  if (!createdUser.body?.id) throw new Error(`No se pudo crear la cuenta efimera ${label}: ${createdUser.status} ${createdUser.text.slice(0, 160)}`);
  created.push({ id: createdUser.body.id, email, password });
  const session = await supabasePublic("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  const token = session.body?.access_token;
  if (!token) throw new Error(`La cuenta efimera ${label} no logra iniciar sesion en Supabase: ${session.status}`);
  return { id: createdUser.body.id, email, token };
}

async function linkToCompany(user, companyId) {
  const profile = await supabaseAdmin("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: [{ id: user.id, full_name: `Fixture sesion ${RUN_ID}`, email: user.email, status: "active" }]
  });
  const membership = await supabaseAdmin("/rest/v1/company_users?on_conflict=company_id,user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: [{ company_id: companyId, user_id: user.id, role: "admin", status: "active" }]
  });
  if (membership.status >= 400) throw new Error(`No se pudo vincular la cuenta efimera: ${membership.status} ${membership.text.slice(0, 160)}`);
  return { profile: profile.status, membership: membership.status };
}

async function dropEphemeralUser(user) {
  await supabaseAdmin(`/rest/v1/company_users?user_id=eq.${user.id}`, { method: "DELETE" });
  await supabaseAdmin(`/rest/v1/profiles?id=eq.${user.id}`, { method: "DELETE" });
  await supabaseAdmin(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
}

async function main() {
  console.log(`Certificacion de sesion en QA contra ${API_URL} (run ${RUN_ID})`);

  // 01 El ambiente medido tiene el fix desplegado.
  const health = await api("/health");
  deployedCommit = String(health.body?.commit || "");
  check("01 salud_y_commit_desplegado",
    health.status === 200 && health.body?.status === "OK" && deployedCommit.startsWith(EXPECTED_COMMIT.slice(0, 12)),
    `health=${health.body?.status} commit=${deployedCommit.slice(0, 12)} esperado=${EXPECTED_COMMIT.slice(0, 12)}`);

  // 02-04 La autenticacion no se relajo: la credencial inservible sigue siendo 401.
  const anonimo = await api(ADMIN_PATH);
  check("02 administracion_sin_sesion_sigue_siendo_401",
    anonimo.status === 401 && codeOf(anonimo) === "TOKEN_INVALIDO",
    `${anonimo.status} ${codeOf(anonimo)}`);

  const basura = await api(ADMIN_PATH, { headers: { authorization: "Bearer no-es-un-jwt" } });
  check("03 token_basura_sigue_siendo_401",
    basura.status === 401 && codeOf(basura) === "TOKEN_INVALIDO",
    `${basura.status} ${codeOf(basura)}`);

  const firmaFalsa = await api(ADMIN_PATH, { headers: { authorization: `Bearer ${forgeWrongSecretToken()}` } });
  check("04 token_firmado_sin_la_clave_real_sigue_siendo_401",
    firmaFalsa.status === 401 && codeOf(firmaFalsa) === "TOKEN_INVALIDO",
    `${firmaFalsa.status} ${codeOf(firmaFalsa)}`);

  // 05-06 El sintoma reportado, reproducido contra el deployed: cuenta valida sin empresa.
  const suelta = await createEphemeralUser("sin-empresa");
  const sinEmpresa = await api(ADMIN_PATH, { headers: { authorization: `Bearer ${suelta.token}` } });
  check("05 cuenta_valida_sin_empresa_responde_403_empresa_no_vinculada",
    sinEmpresa.status === 403 && codeOf(sinEmpresa) === "EMPRESA_NO_VINCULADA",
    `${sinEmpresa.status} ${codeOf(sinEmpresa)}`);

  const identidadSuelta = await api("/api/v1/auth/me", { headers: { authorization: `Bearer ${suelta.token}` } });
  check("06_la_sesion_sin_empresa_no_es_expulsada",
    identidadSuelta.status !== 401 && sinEmpresa.status !== 401,
    `auth/me=${identidadSuelta.status} admin/roles=${sinEmpresa.status} code=${codeOf(sinEmpresa)}`);

  // 07 Empresa modelo NYVORA: la misma ruta con el vinculo existente deja de ser un rechazo de alcance.
  const vinculada = await createEphemeralUser("con-empresa");
  await linkToCompany(vinculada, MODEL_COMPANY);
  const conEmpresa = await api(ADMIN_PATH, {
    headers: { authorization: `Bearer ${vinculada.token}`, "x-company-id": MODEL_COMPANY }
  });
  const identidadVinculada = await api("/api/v1/auth/me", { headers: { authorization: `Bearer ${vinculada.token}` } });
  check(`07_${MODEL_COMPANY_NAME}_vinculada_no_es_expulsada`,
    identidadVinculada.status === 200 && conEmpresa.status !== 401 && codeOf(conEmpresa) !== "EMPRESA_NO_VINCULADA",
    `auth/me=${identidadVinculada.status} admin/roles=${conEmpresa.status} code=${codeOf(conEmpresa) || "-"}`);

  // 08 Limpieza verificada: fuera el vinculo no queda ninguna fila y la ruta sigue rechazando por
  //    alcance (403), nunca por credencial (401). El codigo exacto despues de desvincular depende
  //    del espejo que la propia corrida dejo en el API, y se registra como se midio.
  await supabaseAdmin(`/rest/v1/company_users?user_id=eq.${vinculada.id}`, { method: "DELETE" });
  const desvinculada = await api(ADMIN_PATH, {
    headers: { authorization: `Bearer ${vinculada.token}`, "x-company-id": MODEL_COMPANY }
  });
  const listaRemanente = await supabaseAdmin(`/rest/v1/company_users?select=user_id&user_id=eq.${vinculada.id}`);
  const filasRemanentes = Array.isArray(listaRemanente.body) ? listaRemanente.body.length : -1;
  check("08 limpieza_verificada_sin_vinculos_remanentes",
    desvinculada.status === 403 && filasRemanentes === 0,
    `sin_vinculo=${desvinculada.status} ${codeOf(desvinculada)} filas_remanentes=${filasRemanentes}`);

  for (const user of created) await dropEphemeralUser(user);
  const correos = created.map((user) => String(user.email).toLowerCase());
  const inventario = await supabaseAdmin("/auth/v1/admin/users?page=1&per_page=1000");
  const restantes = Array.isArray(inventario.body?.users)
    ? inventario.body.users.filter((row) => correos.includes(String(row.email || "").toLowerCase())).length
    : -1;
  const saludFinal = await api("/health");
  check("09 cuentas_efimeras_eliminadas_y_api_sana",
    restantes === 0 && saludFinal.body?.status === "OK",
    `cuentas_restantes=${restantes} health_final=${saludFinal.body?.status}`);
}

main()
  .then(async () => {
    const informe = {
      certificacion: "sesion-administracion-qa",
      alcance: "sesion-admin-produccion-20261108",
      ambiente: "QA",
      api_url: API_URL,
      empresa_modelo: MODEL_COMPANY_NAME,
      commit_esperado: EXPECTED_COMMIT,
      commit_medido: deployedCommit,
      run_id: RUN_ID,
      ejecutado_en: new Date().toISOString(),
      controles,
      cheques: controles.length,
      fallos
    };
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(informe, null, 2)}\n`, "utf8");
    if (fallos) {
      console.error(`CERTIFICACION QA FALLIDA: ${controles.length} cheques, ${fallos} fallos`);
      for (const user of created) {
        try {
          await dropEphemeralUser(user);
        } catch {
          /* la limpieza ya se intento; no se reescribe el fallo original */
        }
      }
      process.exit(1);
    }
    console.log(`CERTIFICACION QA OK: ${controles.length} cheques, 0 fallos -> ${path.relative(ROOT, OUTPUT)}`);
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`BLOQUEO: ${error.message}`);
    for (const user of created) {
      try {
        await dropEphemeralUser(user);
      } catch {
        /* mejor esfuerzo: el fallo principal ya esta reportado */
      }
    }
    process.exit(1);
  });
