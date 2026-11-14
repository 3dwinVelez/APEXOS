/* Certificacion funcional de la nomina legal 2026 en el ambiente QA liberado.
 *
 * Que mide, contra la API desplegada y la base de QA:
 *   1. El commit desplegado es el candidato promovido.
 *   2. El reporte de jornadas por rango devuelve la proyeccion de marcaciones que
 *      liquida la nomina, con sus minutos por bucket (R-10).
 *   3. La vista previa de liquidacion del mes con mas jornadas calcula documentos,
 *      deja el auxilio fuera de la base de prestaciones (R-07) y publica la metadata
 *      de la libranza (R-06).
 *   4. Los topes de trabajo suplementario viajan en el resumen de cada documento (R-10A).
 *   5. Los listados de liquidaciones, cierres, saldos, aportes y libranzas responden.
 *   6. La autenticacion es obligatoria.
 *   7. La semilla de QA tiene el auxilio corregido y los topes sembrados (migracion 20261113120000).
 *
 * Huella: crea un rol y un usuario efimeros en el tenant NYVORA, con permisos de lectura
 * de nomina, y lo desactiva al terminar. No escribe documentos de nomina: la vista previa
 * no persiste. Ningun correo, clave, token ni service role queda en la evidencia.
 *
 * Uso:
 *   node scripts/certifications/hr-nomina-legal-2026-qa.js --env-file=config/qa.env \
 *     --expected-commit=1590f18e --output=docs/qa/evidence/nomina-legal-2026-20261113/qa-certification.json
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    args[item.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}

async function request(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000), ...options });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw: raw.slice(0, 300) }; }
  return { status: response.status, ok: response.ok, body };
}

function monthBounds(month) {
  const [year, index] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function monthOf(date) {
  return String(date || "").slice(0, 7);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["env-file"]) require("../load-env")(String(args["env-file"]));
  const apiUrl = String(process.env.QA_API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!apiUrl.includes("apexos-api-qa-production.up.railway.app") || apiUrl.includes("-prod-production")) {
    throw new Error(`El API no es el servicio QA autorizado: ${apiUrl}`);
  }
  if (String(process.env.TARGET_ENV || "").toLowerCase() !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  const expectedRef = required("EXPECTED_SUPABASE_PROJECT_REF");
  if (!String(process.env.DATABASE_URL || "").includes(expectedRef)) throw new Error("DATABASE_URL no corresponde al proyecto Supabase de QA.");
  const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const expectedCommit = required("QA_EXPECTED_COMMIT");
  const output = path.resolve(String(args.output || "nomina-legal-2026-qa.json"));

  const runId = `hrlegal${Date.now().toString(36)}`;
  const email = `hr.nomina.legal.${runId}@internal.apexos.local`;
  const password = `HrLegal-QA-${crypto.randomBytes(12).toString("base64url")}#26`;

  const evidence = {
    certification: "hr-nomina-legal-2026-qa",
    environment: "QA",
    expected_commit: expectedCommit,
    certified_at: new Date().toISOString(),
    credentials_recorded: false,
    checks: []
  };
  const record = (name, state, detail = {}) => {
    evidence.checks.push({ name, status: state, detail });
    const mark = state === "passed" ? "OK" : state === "skipped" ? "SKIP" : "FALLO";
    console.log(`${mark} ${name}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ""}`);
  };
  const check = (name, ok, detail = {}) => record(name, ok ? "passed" : "failed", detail);

  const prisma = require("../../apps/api/src/core/prisma");
  let bcrypt;
  try { bcrypt = require("bcrypt"); } catch { bcrypt = require("../../apps/api/node_modules/bcrypt"); }
  let user = null;

  try {
    const tenant = await prisma.tenant.findFirst({ where: { name: { equals: "NYVORA", mode: "insensitive" }, active: true } });
    if (!tenant) throw new Error("Tenant NYVORA no encontrado en QA.");
    evidence.tenant = "NYVORA";

    const role = await prisma.role.upsert({
      where: { tenant_id_name: { tenant_id: tenant.id, name: "HR Nomina Legal 2026 Cert" } },
      update: { description: "Rol efimero de la certificacion de nomina legal 2026 en QA" },
      create: { tenant_id: tenant.id, name: "HR Nomina Legal 2026 Cert", description: "Rol efimero de la certificacion de nomina legal 2026 en QA" }
    });
    await prisma.permission.deleteMany({ where: { role_id: role.id } });
    await prisma.permission.createMany({
      data: [{ module: "hr", action: "read" }, { module: "payroll", action: "read" }].map((item) => ({ ...item, role_id: role.id })),
      skipDuplicates: true
    });
    user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: `HR Nomina Legal ${runId}`,
        email,
        password: await bcrypt.hash(password, 12),
        role_id: role.id,
        active: true,
        preferences: { source: "hr_nomina_legal_2026_qa", run_id: runId }
      }
    });

    const health = await request(`${apiUrl}/health`);
    check("commit_desplegado", health.ok && String(health.body.commit || "").startsWith(expectedCommit.slice(0, 12)), { status: health.status, commit: health.body.commit || "sin commit" });

    const unauth = await request(`${apiUrl}/api/v1/hr/workdays?from=2026-09-01&to=2026-09-30`);
    check("jornadas_exigen_autenticacion", unauth.status === 401, { status: unauth.status });

    const session = await request(`${apiUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    check("login_usuario_certificacion", session.ok && Boolean(session.body.token || session.body.access_token), { status: session.status });
    if (!session.ok) throw new Error("Sin sesion no se puede certificar la nomina de QA.");
    const headers = { Authorization: `Bearer ${session.body.token || session.body.access_token}`, "Content-Type": "application/json" };

    const config = await request(`${apiUrl}/api/v1/hr/payroll/config`, { headers });
    check("configuracion_nomina_legible", config.ok && Boolean(config.body && typeof config.body === "object"), { status: config.status });

    const workdays = await request(`${apiUrl}/api/v1/hr/workdays?from=2026-06-01&to=2026-11-30`, { headers });
    const rows = Array.isArray(workdays.body) ? workdays.body : Array.isArray(workdays.body?.data) ? workdays.body.data : null;
    check("reporte_jornadas_por_rango", workdays.ok && Array.isArray(rows), { status: workdays.status, rows: rows?.length ?? null });

    const withMinutes = rows?.filter((row) => "overtime_day_minutes" in row || "overtime_night_minutes" in row || "worked_minutes" in row).length || 0;
    check("jornadas_exportan_minutos_liquidados", Boolean(rows && rows.length && withMinutes === rows.length), { rows: rows?.length || 0, con_minutos: withMinutes });

    const byMonth = {};
    for (const row of rows || []) {
      const month = monthOf(row.date);
      if (!month) continue;
      byMonth[month] = (byMonth[month] || 0) + 1;
    }
    const targetMonth = Object.entries(byMonth).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
    record("mes_con_jornadas", targetMonth ? "passed" : "skipped", { mes: targetMonth, distribucion: byMonth });

    if (targetMonth) {
      const bounds = monthBounds(targetMonth);
      const preview = await request(`${apiUrl}/api/v1/hr/payroll/preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fecha_inicio: bounds.start, fecha_fin: bounds.end, period_type: "mes" })
      });
      const documents = Array.isArray(preview.body?.documents) ? preview.body.documents : [];
      check("vista_previa_liquida_el_mes", preview.ok && documents.length > 0, { status: preview.status, mes: targetMonth, documentos: documents.length });
      if (preview.ok && documents.length) {
        const doc = documents[0];
        check("documento_con_lineas_y_resumen", Array.isArray(doc.lines) && doc.lines.length > 0 && Boolean(doc.source_summary), { lineas: doc.lines?.length || 0, periodo: doc.period_key || null });

        const auxilio = documents.flatMap((item) => (item.lines || []).map((line) => ({ line, doc: item }))).find((item) => item.line.code === "AUX_TRANSPORTE");
        if (auxilio) {
          const excluded = auxilio.line.exclude_from_social_benefits_base === true
            || auxilio.line.metadata?.exclude_from_social_benefits_base === true
            || auxilio.line.metadata?.include_in_social_benefits_base === false;
          check("auxilio_fuera_de_la_base_de_prestaciones", excluded, {
            excluido: auxilio.line.exclude_from_social_benefits_base ?? null,
            base_prestaciones: auxilio.doc.source_summary?.base_prestaciones_sociales ?? null
          });
        } else {
          record("auxilio_fuera_de_la_base_de_prestaciones", "skipped", { motivo: "el mes certificado no tiene empleados con auxilio" });
        }

        const libranza = documents.flatMap((item) => (item.lines || []).map((line) => ({ line, doc: item }))).find((item) => item.line.source === "libranza");
        if (libranza) {
          check("libranza_con_metadata_de_movimiento", Boolean(libranza.line.metadata?.libranza_id), { concepto: libranza.line.code, libranza_id: libranza.line.metadata?.libranza_id ?? null });
        } else {
          record("libranza_con_metadata_de_movimiento", "skipped", { motivo: "el mes certificado no tiene libranzas" });
        }

        const caps = documents.find((item) => item.source_summary?.topes_trabajo_suplementario)?.source_summary?.topes_trabajo_suplementario;
        check("topes_de_trabajo_suplementario_trazados", Boolean(caps && Number(caps.tope_diario_horas) === 2 && Number(caps.tope_semanal_horas) === 12 && caps.modo === "alerta"), {
          tope_diario_horas: caps?.tope_diario_horas ?? null,
          tope_semanal_horas: caps?.tope_semanal_horas ?? null,
          excedido: caps?.excedido ?? null,
          modo: caps?.modo ?? null
        });

        const overtimeLine = documents.flatMap((item) => item.lines || []).find((line) => ["HED", "HEN", "HEDD", "HEND"].includes(line.code));
        record("extras_en_la_liquidacion", overtimeLine ? "passed" : "skipped", { concepto: overtimeLine?.code ?? null, cantidad: overtimeLine?.quantity ?? null });
      }
    }

    const reads = [
      ["liquidaciones_listables", "/api/v1/hr/payroll/liquidations"],
      ["cierres_de_periodo_listables", "/api/v1/hr/payroll/period-closures"],
      ["saldos_de_prestaciones_listables", "/api/v1/hr/payroll/benefit-balances"],
      ["aportes_sociales_listables", "/api/v1/hr/payroll/social-contributions"],
      ["libranzas_de_empleado_listables", "/api/v1/hr/payroll/employee-libranzas"]
    ];
    for (const [name, endpoint] of reads) {
      const result = await request(`${apiUrl}${endpoint}`, { headers });
      check(name, result.status === 200, { status: result.status });
    }

    if (serviceRole) {
      const auxilio = await request(`${supabaseUrl}/rest/v1/th_nomina_conceptos?select=code,metadata&country=eq.CO&code=eq.AUX_TRANSPORTE`, {
        headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }
      });
      const row = Array.isArray(auxilio.body) ? auxilio.body[0] : null;
      check("semilla_auxilio_corregida_en_bd", Boolean(row && row.metadata?.include_in_social_benefits_base === false && row.metadata?.exclude_from_social_benefits_base === true), {
        status: auxilio.status,
        include_in_social_benefits_base: row?.metadata?.include_in_social_benefits_base ?? null,
        exclude_from_social_benefits_base: row?.metadata?.exclude_from_social_benefits_base ?? null
      });

      const limits = await request(`${supabaseUrl}/rest/v1/th_parametros_laborales?select=code,value,valid_from&code=in.(MAX_HE_DIARIO,MAX_HE_SEMANAL)&valid_from=eq.2026-01-01`, {
        headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }
      });
      const params = Array.isArray(limits.body) ? limits.body : [];
      const daily = params.find((item) => item.code === "MAX_HE_DIARIO");
      const weekly = params.find((item) => item.code === "MAX_HE_SEMANAL");
      check("topes_suplementarios_sembrados_en_bd", Boolean(params.length && Number(daily?.value) === 2 && Number(weekly?.value) === 12), {
        status: limits.status,
        filas: params.length,
        diario: daily?.value ?? null,
        semanal: weekly?.value ?? null
      });
    } else {
      record("semilla_auxilio_corregida_en_bd", "skipped", { motivo: "SUPABASE_SERVICE_ROLE_KEY no disponible" });
      record("topes_suplementarios_sembrados_en_bd", "skipped", { motivo: "SUPABASE_SERVICE_ROLE_KEY no disponible" });
    }
  } finally {
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { active: false } });
      evidence.certification_user_deactivated = true;
    }
    const failed = evidence.checks.filter((item) => item.status === "failed");
    evidence.summary = {
      total: evidence.checks.length,
      passed: evidence.checks.filter((item) => item.status === "passed").length,
      skipped: evidence.checks.filter((item) => item.status === "skipped").length,
      failed: failed.length
    };
    evidence.status = failed.length ? "failed" : "passed";
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`CERTIFICACION QA ${evidence.status.toUpperCase()}: ${evidence.summary.passed}/${evidence.summary.total} passed, ${evidence.summary.skipped} skipped, ${evidence.summary.failed} failed`);
    await prisma.$disconnect();
    if (failed.length) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`CERTIFICACION QA BLOQUEADA: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
