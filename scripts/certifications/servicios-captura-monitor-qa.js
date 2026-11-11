// Certificacion REMOTA de la cadena captura -> monitor de Servicios en QA.
//
// Que mide y por que no lo cubre la suite unitaria:
// apps/web/test/public-service-requests-security.test.mjs y service-monitor-live-refresh.test.mjs
// prueban el handler en aislamiento (fetch simulado). Aca se ejerce el BUILD DESPLEGADO en
// Railway contra la base real de QA:
//   1. GET /api/public/service-requests responde catalogo (referencias, tipos, almacenes).
//   2. POST /api/public/service-requests crea la preorden con el payload del formulario.
//   3. El monitor autenticado encuentra esa orden con la empresa propia y sin empresa, y
//      rechaza con 403 + X-Apexos-Scope-Reason: no-eligible-membership una empresa ajena
//      (el contrato del servidor no se relaja; la pantalla es la que se auto-repara).
//   4. La corrida borra por id exacto lo que creo (orden, membresia, perfil, usuario) y lo
//      comprueba; nunca escribe sobre el tenant demo compartido.
//
// Uso:
//   node scripts/certifications/servicios-captura-monitor-qa.js --env-file=config/qa.env \
//     --output=docs/qa/evidence/servicios-captura-monitor-20261111/qa-certification.json
//
// Requiere en config/qa.env (gitignore; los valores nunca se imprimen ni se escriben):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
const fs = require("node:fs");
const path = require("node:path");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const pair = value.slice(2).split("=");
    if (pair.length > 1) {
      out[pair[0]] = pair.slice(1).join("=");
      continue;
    }
    out[pair[0]] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}
const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const WEB_URL = String(args["web-url"] || process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const COMPANY_ID = String(args["company-id"] || "cbbf3627-4336-4f23-95c6-1077414bcd17");
const FOREIGN_COMPANY_ID = "00000000-0000-4000-8000-000000000000";
const TIMEOUT_MS = 30_000;

if (!/^https:\/\/apexos-web-qa-production\.up\.railway\.app$/.test(WEB_URL)) {
  console.error("BLOQUEADO: esta certificacion solo corre contra la web de QA en Railway (HTTPS).");
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("BLOQUEADO: se requieren SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_ANON_KEY (config/qa.env).");
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(COMPANY_ID)) {
  console.error("BLOQUEADO: --company-id debe ser un UUID de la allowlist publica de QA.");
  process.exit(1);
}

const stamp = Date.now();
const marker = `CERT-CAPTURA-MONITOR-${stamp}`;
const email = `certificado.captura.monitor.${stamp}@certificacion.qa`;
const password = `Efimera-${stamp}-Aa1!`;

const checks = [];
function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
}

async function supabase(method, resource, body, bearer) {
  const response = await fetch(`${SUPABASE_URL}${resource}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${bearer || SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function main() {
  let userId = "";
  let orderId = "";
  const cleanup = {};

  try {
    const catalogResponse = await fetch(`${WEB_URL}/api/public/service-requests`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const catalog = await catalogResponse.json().catch(() => ({}));
    const reference = catalog.references?.[0];
    const serviceType = catalog.service_types?.[0];
    const store = catalog.service_stores?.[0];
    check("catalogo_publico_responde", catalogResponse.status === 200 && Boolean(reference?.id && serviceType?.code && store?.code), {
      status: catalogResponse.status,
      references: Array.isArray(catalog.references) ? catalog.references.length : null,
      service_types: Array.isArray(catalog.service_types) ? catalog.service_types.length : null,
      service_stores: Array.isArray(catalog.service_stores) ? catalog.service_stores.length : null
    });
    if (!reference?.id) throw new Error("El catalogo publico de QA no devolvio referencias; no se puede capturar.");

    const payload = {
      customer_name: marker,
      customer_document: "1099999999",
      customer_phone: "3001234567",
      customer_phone_secondary: "3007654321",
      company_name: "",
      invoice_number: "",
      service_type: serviceType.code,
      reference_id: reference.id,
      product_reference: reference.code,
      product_description: reference.name,
      customer_address: "Calle de certificacion 123",
      customer_neighborhood: "Centro",
      service_store: store.code,
      notes: "cadena captura-monitor",
      items: [{ reference_id: reference.id, service_type: serviceType.code, observation: "cadena", quantity: 1 }]
    };
    const captureResponse = await fetch(`${WEB_URL}/api/public/service-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const captureBody = await captureResponse.json().catch(() => ({}));
    orderId = captureBody.order?.id || "";
    check("captura_crea_preorden", captureResponse.status === 200 && Boolean(orderId), {
      status: captureResponse.status,
      order: captureBody.order?.number || "",
      message: captureBody.message || ""
    });

    const created = await supabase("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });
    userId = created.data?.id || "";
    check("usuario_efimero_creado", created.status === 200 && Boolean(userId), { status: created.status });
    if (!userId) throw new Error("No se pudo aprovisionar el usuario efimero de QA.");

    const profile = await supabase("POST", "/rest/v1/profiles", { id: userId, email, full_name: "Certificacion Captura Monitor" });
    const membership = await supabase("POST", "/rest/v1/company_users", { company_id: COMPANY_ID, user_id: userId, role: "admin", status: "active" });
    check("membresia_efimera_creada", profile.status >= 200 && profile.status < 300 && membership.status >= 200 && membership.status < 300, {
      profile: profile.status,
      membership: membership.status
    });

    const grant = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const session = await grant.json().catch(() => ({}));
    const token = session.access_token || "";
    check("token_efimero_emitido", grant.status === 200 && Boolean(token), { status: grant.status });
    if (!token) throw new Error("El grant de password no emitio token para el usuario efimero.");

    const readMonitor = async (companyQuery) => {
      const query = new URLSearchParams({ limit: "200", q: marker });
      if (companyQuery) query.set("company_id", companyQuery);
      const response = await fetch(`${WEB_URL}/api/services/monitor-orders?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const body = await response.json().catch(() => ({}));
      const found = Array.isArray(body.data) ? body.data.find((order) => String(order.customer_name || "").includes(marker)) : null;
      return {
        status: response.status,
        total: body.total ?? null,
        rows: Array.isArray(body.data) ? body.data.length : null,
        found: Boolean(found),
        number: found?.number || "",
        message: body.message || "",
        reason: response.headers.get("x-apexos-scope-reason") || ""
      };
    };

    const own = await readMonitor(COMPANY_ID);
    check("monitor_empresa_propia_encuentra_la_orden", own.status === 200 && own.found, own);
    const absent = await readMonitor("");
    check("monitor_sin_empresa_encuentra_la_orden", absent.status === 200 && absent.found, absent);
    const foreign = await readMonitor(FOREIGN_COMPANY_ID);
    check("monitor_empresa_ajena_rechaza_con_403", foreign.status === 403 && foreign.reason === "no-eligible-membership", foreign);
  } catch (error) {
    check("corrida_sin_excepcion", false, { message: error instanceof Error ? error.message : String(error) });
  } finally {
    if (orderId) cleanup.service_orders = (await supabase("DELETE", `/rest/v1/service_orders?id=eq.${encodeURIComponent(orderId)}`)).status;
    if (userId) {
      cleanup.company_users = (await supabase("DELETE", `/rest/v1/company_users?user_id=eq.${encodeURIComponent(userId)}`)).status;
      cleanup.profiles = (await supabase("DELETE", `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`)).status;
      cleanup.auth_user = (await supabase("DELETE", `/auth/v1/admin/users/${encodeURIComponent(userId)}`)).status;
    }
    const cleanupOk = Boolean(orderId) && Object.values(cleanup).length === 4 && Object.values(cleanup).every((status) => status >= 200 && status < 300);
    check("limpieza_por_id_exacto", cleanupOk, cleanup);
  }

  const passed = checks.filter((item) => item.ok).length;
  const failed = checks.filter((item) => !item.ok).map((item) => item.name);
  const evidence = {
    environment: { name: "QA", web_url: WEB_URL, company_id: COMPANY_ID, marker },
    executed_at: new Date().toISOString(),
    summary: { passed, failed: failed.length, total: checks.length, failed_checks: failed },
    checks
  };

  const serialized = JSON.stringify(evidence, null, 2);
  for (const secret of [SERVICE_KEY, ANON_KEY]) {
    if (secret && serialized.includes(secret)) {
      console.error("HALLAZGO: la evidencia contiene una credencial; se aborta sin escribir archivo.");
      process.exit(1);
    }
  }

  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(String(args.output))), { recursive: true });
    fs.writeFileSync(path.resolve(String(args.output)), `${serialized}\n`);
  }
  console.log(serialized);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`BLOQUEADO: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
