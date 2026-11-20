#!/usr/bin/env node
// Sonda de campo de la Fase 3 (causas A y D).
//
// El certificador de navegador demuestra que el operario no ve ventana; esta sonda demuestra la
// otra mitad: que el cuerpo 5xx que sirve el despliegue ya no trae el detalle del proveedor de
// datos. Se dispara contra QA o Producción con sesiones falsas, de modo que el primer viaje del
// handler al proveedor es una lectura de sesion (`/auth/v1/user`) que rebota. No escribe empresas,
// usuarios ni ordenes: ninguna sonda pasa la barrera de autenticacion.
//
// Uso:
//   node scripts/certifications/fase-3-ad-provider-detail-probe.js --target=qa --expected-commit 81cd253a --output docs/qa/evidence/<carpeta>

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [flag, inline] = value.slice(2).split("=");
    const next = argv[index + 1];
    result[flag] = inline !== undefined ? inline : next && !next.startsWith("--") ? argv[++index] : true;
  }
  return result;
}

const args = argsFrom(process.argv.slice(2));
const TARGET = String(args.target || "qa");
const ENV_FILE = String(args["env-file"] || `config/${TARGET}.env`);
const EXPECTED_COMMIT = String(args["expected-commit"] || "");
const OUT = path.resolve(ROOT, String(args.output || `docs/qa/evidence/fase-3-ad-probe-${TARGET}`));

require("../load-env")(path.resolve(ROOT, ENV_FILE));

const WEB_URL = String(process.env.FRONTEND_URL || "").replace(/\/+$/, "");
const API_URL = String(process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "").replace(/\/+$/, "");

const CHECKS = [];
const RESULT = {
  target: TARGET,
  environment: TARGET === "production" ? "PRODUCCION" : "QA",
  env_file: ENV_FILE,
  base_web: WEB_URL,
  base_api: API_URL,
  expected_commit: EXPECTED_COMMIT,
  deployed_commit: "",
  started_at: new Date().toISOString(),
  probes: [],
  checks: []
};

// El detalle que el corte quitó del cuerpo. `provider_detail` es la firma exacta que producía
// `Supabase ${status}: ${detail}`; el resto del vocabulario interno cubre los otros caminos por los
// que el proveedor llegaba a la pantalla del operario.
const PROVIDER_DETAIL = /Supabase\s+\d{3}\s*:/i;
const PROVIDER_VOCABULARY = [
  { token: "rest/v1", reason: "ruta interna del proveedor de datos" },
  { token: "auth/v1", reason: "ruta interna del proveedor de identidad" },
  { token: "P2028", reason: "codigo de Prisma" },
  { token: "P2024", reason: "codigo de Prisma" },
  { token: "P2034", reason: "codigo de Prisma" },
  { token: "Could not find the table", reason: "mensaje del proveedor" },
  { token: "invalid credentials", reason: "mensaje del proveedor" },
  { token: "Expected datasource to be connected", reason: "mensaje de Prisma" },
  { token: "connection was terminated", reason: "mensaje de Postgres" }
];

function bodyLeaks(text) {
  const found = [];
  if (PROVIDER_DETAIL.test(text)) found.push("Supabase <status>:");
  for (const item of PROVIDER_VOCABULARY) {
    if (text.toLowerCase().includes(item.token.toLowerCase())) found.push(item.token);
  }
  return found;
}

function check(name, ok, detail) {
  RESULT.checks.push({ name, ok: Boolean(ok), detail });
  const line = `${ok ? "PASS" : "FAIL"} ${name}${detail ? ` ${JSON.stringify(detail).slice(0, 260)}` : ""}`;
  console.log(line);
}

async function probe(label, { method, url, headers, body, expect_provider_touch }) {
  let status = 0;
  let text = "";
  let error = "";
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json", ...(headers || {}) },
      ...(body ? { body: JSON.stringify(body) } : undefined),
      signal: AbortSignal.timeout(45_000)
    });
    status = response.status;
    text = await response.text();
  } catch (caught) {
    error = String(caught && caught.message);
  }
  const leaked = error ? [] : bodyLeaks(text);
  const entry = {
    label,
    method,
    pathname: url.replace(WEB_URL, "").replace(API_URL, ""),
    status,
    cuerpo: text.slice(0, 300),
    error,
    tokens_en_cuerpo: leaked,
    toca_proveedor: expect_provider_touch && status >= 500
  };
  RESULT.probes.push(entry);
  check(`sonda_sin_detalle_del_proveedor_${label}`, !error && leaked.length === 0, { status, leaked, error });
  return entry;
}

function writeEvidence() {
  fs.mkdirSync(OUT, { recursive: true });
  RESULT.verdict = {
    passed: RESULT.checks.filter((item) => item.ok).length,
    failed: RESULT.checks.filter((item) => !item.ok).length,
    total: RESULT.checks.length
  };
  RESULT.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "sonda-campo.json"), JSON.stringify(RESULT, null, 2));
}

async function main() {
  if (!WEB_URL || !API_URL) throw new Error(`Faltan FRONTEND_URL / NEXT_PUBLIC_API_URL en ${ENV_FILE}`);

  // Control positivo: el detector tiene que señalar la firma vieja. Sin este control, la sonda
  // puede estar verde porque el cuerpo es neutro o porque el detector no sabe detectar.
  const muestra_vieja = 'Supabase 404: Could not find the table "public.company_roles" in the schema cache';
  check("el_detector_de_fuga_detecta_la_firma_vieja", bodyLeaks(muestra_vieja).length >= 2, {
    detectados: bodyLeaks(muestra_vieja)
  });
  check("el_detector_no_marca_el_mensaje_neutral", bodyLeaks(
    "El servicio de datos no respondió como se esperaba. Intente de nuevo o avise a soporte."
  ).length === 0);

  let salud = null;
  try {
    const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(30_000) });
    salud = await response.json();
    RESULT.deployed_commit = String(salud?.commit || "");
  } catch (caught) {
    RESULT.deployed_commit = "";
    RESULT.health_error = String(caught && caught.message);
  }
  check("api_responde_health", Boolean(RESULT.deployed_commit), { commit: RESULT.deployed_commit });
  if (EXPECTED_COMMIT) {
    check("build_desplegado_es_el_evaluado", RESULT.deployed_commit.startsWith(EXPECTED_COMMIT.replace(/^v/, "")), {
      deployed: RESULT.deployed_commit, expected: EXPECTED_COMMIT
    });
  }

  const bogus = { authorization: "Bearer fase3-sonda-sin-sesion.falsavalida" };

  // Los cuatro handlers que el corte tocó y que dan al navegador un cuerpo 5xx cuando el proveedor
  // rebate. Cuerpos completos para que la validación de forma no los devuelva antes de tiempo.
  await probe("platform_companies", {
    method: "POST",
    url: `${WEB_URL}/api/platform/companies`,
    headers: bogus,
    body: {
      name: `__sonda_fase3_${Date.now()}__`,
      admin_email: "sonda.fase3@no-debe-escribir.example",
      admin_full_name: "Sonda Fase 3",
      admin_password: "Temporal123!"
    },
    expect_provider_touch: true
  });

  await probe("platform_company_modules", {
    method: "POST",
    url: `${WEB_URL}/api/platform/company-modules`,
    headers: bogus,
    body: { company_id: "00000000-0000-4000-8000-000000000000", module_code: "SONDA_FASE3", status: "active" },
    expect_provider_touch: true
  });

  await probe("admin_users", {
    method: "POST",
    url: `${WEB_URL}/api/admin/users`,
    headers: bogus,
    body: {
      name: "Sonda Fase 3",
      email: "sonda.fase3@no-debe-escribir.example",
      company_id: "00000000-0000-4000-8000-000000000000",
      role: "viewer"
    },
    expect_provider_touch: true
  });

  await probe("services_orders_id", {
    method: "PUT",
    url: `${WEB_URL}/api/v1/services/orders/00000000-0000-4000-8000-000000000000`,
    headers: bogus,
    body: { status: "sondeada" },
    expect_provider_touch: true
  });

  const tocaron = RESULT.probes.filter((item) => item.toca_proveedor);
  check("al_menos_una_sonda_toco_el_camino_de_fallo_del_proveedor", tocaron.length >= 1, {
    son_5xx: RESULT.probes.map((item) => `${item.label}:${item.status}`).join(" ")
  });

  // Causa A: el mapeo de congestion vive en el API. En campo no se puede forzar P2028 sin montar
  // una concurrencia que sì afecte al ambiente, asi que aqui se registra el commit desplegado y se
  // declara la limite: la forma del 503 la prueba la suite unitaria, no esta sonda.
  RESULT.causa_A = {
    desplegada_por_commit: EXPECTED_COMMIT ? RESULT.deployed_commit.startsWith(EXPECTED_COMMIT.replace(/^v/, "")) : null,
    reproducida_en_campo: false,
    motivo: "Forzar P2028/P2024 en el banco compartido de QA o Produccion exige concurrencia real sobre los datos de una empresa; eso no se monta contra un ambiente con clientes."
  };
  check("causa_A_desplegada_en_el_ambiente", RESULT.causa_A.desplegada_por_commit === true, RESULT.causa_A);

  writeEvidence();
  const fallo = RESULT.checks.filter((item) => !item.ok);
  console.log(`VEREDICTO SONDA ${RESULT.target.toUpperCase()} ${RESULT.checks.length - fallo.length}/${RESULT.checks.length} · evidencia en ${OUT}`);
  if (fallo.length) {
    console.log(`SONDA CON ${fallo.length} FALLOS: ${fallo.map((item) => item.name).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("SONDA APROBADA: ningun cuerpo 5xx del despliegue trae el detalle del proveedor");
  }
}

main().catch((error) => {
  RESULT.error = String(error && error.stack || error);
  writeEvidence();
  console.error("SONDA INTERRUMPIDA:", RESULT.error);
  process.exit(1);
});
