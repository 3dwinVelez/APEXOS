#!/usr/bin/env node
"use strict";

// Certifica que el modulo Comercio (M-30) esta publicado en el catalogo de modulos de
// plataforma del ambiente, que su activacion por empresa existe para todas las empresas,
// que solo las empresas autorizadas quedaron habilitadas y que el resto del catalogo no
// se movio. Lee el ambiente con la clave de servicio; no escribe nada.
//
// Uso: node scripts/certifications/comercio-module-catalog-qa.js --env-file=config/qa.env \
//        --output=docs/qa/evidence/<cambio>/catalogo-qa.json [--empresa=<nombre>]...

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const MIGRATION_REL = "supabase/migrations/20261107120000_comercio_module_catalog.sql";
const EXPECTED = {
  code: "comercio",
  name: "Comercio",
  route: "/dashboard/comercio",
  icon: "shopping-cart",
  sort_order: 290,
  visibility_scope: "tenant",
  is_active: true
};
const DEFAULT_AUTHORIZED = ["Cliente Piloto QA", "Empresa Demo APEX-OS"];

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
};
const envFile = readFlag("env-file", path.join("config", "qa.env"));
const outputRel = readFlag("output", "docs/qa/evidence/comercio-catalogo-20261107/catalogo-qa.json");
const authorized = args.filter((a) => a.startsWith("--empresa=")).map((a) => a.slice("--empresa=".length));
const AUTHORIZED = authorized.length ? authorized : DEFAULT_AUTHORIZED;

function loadEnv() {
  const file = path.resolve(ROOT, envFile);
  if (!fs.existsSync(file)) throw new Error(`Sin archivo de ambiente: ${file}`);
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const BASE = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
if (!BASE || !KEY) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo de ambiente.");

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, status: ok ? "passed" : "failed", detail });
  return ok;
}

async function rest(query) {
  const res = await fetch(`${BASE}/rest/v1/${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(45000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${query}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : [];
}

async function main() {
  const migration = fs.readFileSync(path.join(ROOT, MIGRATION_REL), "utf8");
  check("migracion_versionada_presente", migration.includes("comercio") && migration.includes("/dashboard/comercio"), {
    ruta: MIGRATION_REL,
    bytes: Buffer.byteLength(migration)
  });

  const modulos = await rest("modules?select=id,code,name,route,icon,sort_order,is_active,visibility_scope&limit=500");
  const filasComercio = modulos.filter((m) => m.code === EXPECTED.code);
  check("una_sola_fila_de_catalogo", filasComercio.length === 1, { encontradas: filasComercio.length });
  if (filasComercio.length !== 1) return entregar();

  const modulo = filasComercio[0];
  const campo = Object.keys(EXPECTED).find((k) => String(modulo[k]) !== String(EXPECTED[k]));
  check("renglon_coincide_con_la_migracion", !campo, campo ? { campo, esperado: EXPECTED[campo], actual: modulo[campo] } : modulo);

  const plans = await rest("plans?select=id,name,code");
  const planModules = await rest(`plan_modules?select=plan_id,enabled&module_id=eq.${modulo.id}`);
  check("plan_modules_cubierto", plans.length > 0 && planModules.length === plans.length, {
    planes: plans.length,
    filas: planModules.length,
    habilitados_en_plan: planModules.filter((p) => p.enabled).length
  });

  const empresas = await rest("companies?select=id,name,status");
  const companyModules = await rest(`company_modules?select=company_id,enabled,source&module_id=eq.${modulo.id}`);
  check("toggle_existe_para_todas_las_empresas", empresas.length > 0 && companyModules.length === empresas.length, {
    empresas: empresas.length,
    filas: companyModules.length
  });

  const porEmpresa = new Map(companyModules.map((c) => [c.company_id, c]));
  const idsAutorizadas = empresas.filter((e) => AUTHORIZED.includes(e.name)).map((e) => e.id);
  check("empresas_autorizadas_identificadas", idsAutorizadas.length === AUTHORIZED.length, {
    pedidas: AUTHORIZED,
    resueltas: empresas.filter((e) => AUTHORIZED.includes(e.name)).map((e) => e.name)
  });
  const activas = companyModules.filter((c) => c.enabled === true).map((c) => c.company_id);
  check("solo_autorizadas_habilitadas", activas.length === idsAutorizadas.length && idsAutorizadas.every((id) => activas.includes(id)), {
    autorizadas: empresas.filter((e) => AUTHORIZED.includes(e.name)).map((e) => e.name),
    habilitadas: empresas.filter((e) => activas.includes(e.id)).map((e) => e.name)
  });

  const noAutorizadas = empresas.filter((e) => !AUTHORIZED.includes(e.name) && porEmpresa.get(e.id)?.enabled === true);
  check("ninguna_otra_empresa_recibe_el_modulo", noAutorizadas.length === 0, {
    inesperadas: noAutorizadas.map((e) => e.name)
  });

  // Regresion: el resto del catalogo no se movio. El sort_order compartido SI es preexistente
  // en este ambiente (compras/apex_heart en 20, finanzas/contabilidad en 70, tesoreria/reportes
  // en 80, costos/wms en 90, configuracion/presupuestos en 100); lo que se exige aqui es que la
  // fila nueva no introduzca colisiones y no desplazara a nadie.
  const otros = modulos.filter((m) => m.code !== EXPECTED.code);
  const codigos = modulos.map((m) => m.code);
  const duplicados = codigos.filter((c, i, a) => a.indexOf(c) !== i);
  const colisionOrden = otros.filter((m) => m.sort_order === EXPECTED.sort_order).map((m) => m.code);
  check("restodel_catalogo_intacto", duplicados.length === 0 && colisionOrden.length === 0, {
    filas_totales: modulos.length,
    otras_modulos: otros.length,
    codigos_duplicados: duplicados,
    colision_de_sort_order_con_la_fila_nueva: colisionOrden,
    orden_compartido_preexistente: Object.entries(
      otros.reduce((acc, m) => {
        acc[m.sort_order] = (acc[m.sort_order] || []).concat(m.code);
        return acc;
      }, {})
    )
      .filter(([, v]) => v.length > 1)
      .map(([s, v]) => `${s}:${v.join("+")}`)
  });

  const comercioExterior = modulos.find((m) => m.code === "comercio_exterior");
  check("comercio_no_pisa_comercio_exterior", Boolean(comercioExterior) && comercioExterior.route !== EXPECTED.route, {
    comercio_exterior: comercioExterior ? { route: comercioExterior.route, sort_order: comercioExterior.sort_order } : null
  });

  const api = String(process.env.NEXT_PUBLIC_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
  let salud = null;
  let sinSesion = null;
  try {
    salud = await (await fetch(`${api}/health`, { signal: AbortSignal.timeout(30000) })).json();
    const res = await fetch(`${api}/api/v1/comercio/settings`, { signal: AbortSignal.timeout(30000) });
    sinSesion = { status: res.status, code: String((await res.text()).slice(0, 200)) };
  } catch (error) {
    sinSesion = { error: String(error).slice(0, 160) };
  }
  check("el_api_desplegado_sigue_exponiendo_el_modulo", sinSesion?.status === 401, {
    commit: salud?.commit ?? null,
    modulos_reportados: salud?.modules ?? null,
    sin_sesion: sinSesion
  });

  return entregar();
}

async function entregar() {
  const fallidos = checks.filter((c) => c.status === "failed").map((c) => c.name);
  const documento = {
    change_id: "comercio-catalogo-20261107",
    certification: "comercio_module_catalog_qa",
    environment: "QA",
    generated_at: new Date().toISOString(),
    supabase_project: BASE.replace(/^https:\/\//, "").split(".")[0],
    migration: MIGRATION_REL,
    modulo: EXPECTED,
    empresas_autorizadas: AUTHORIZED,
    checks,
    checks_total: checks.length,
    checks_failed: fallidos.length,
    status: fallidos.length ? "failed" : "passed"
  };
  const out = path.resolve(ROOT, outputRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(documento, null, 2)}\n`, "utf8");
  for (const c of checks) console.log(`${c.status === "passed" ? "OK  " : "ROJO"} ${c.name}`);
  console.log(`\nCERTIFICATION_${documento.status.toUpperCase()} total=${checks.length} fallidos=[${fallidos.join(", ")}]`);
  console.log(`evidencia: ${path.relative(ROOT, out)}`);
  process.exit(fallidos.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`[comercio-module-catalog-qa] ${String(error.message || error).slice(0, 300)}`);
  process.exit(1);
});
