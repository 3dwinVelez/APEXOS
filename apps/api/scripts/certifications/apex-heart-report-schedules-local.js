const fs = require("node:fs");
const path = require("node:path");
process.env.REDIS_DISABLED = "true";
const prisma = require("../../src/core/prisma");
const service = require("../../src/modules/apex-heart/service");
const outputArg = process.argv.find((value) => value.startsWith("--output="));
const output = outputArg ? outputArg.slice(9) : "docs/qa/evidence/ui-ux-phase-three-analytics-20260909/api-certification.json";
const checks = [];
function check(name, passed, detail = {}) { checks.push({ name, passed, detail }); if (!passed) throw new Error(`${name}: ${JSON.stringify(detail)}`); }

(async () => {
  let created;
  try {
    const tenant = await prisma.tenant.findFirst({ where: { active: true }, select: { id: true } });
    check("active_tenant_available", Boolean(tenant?.id));
    created = await service.saveReportSchedule(tenant.id, null, { name: `Certificación ${Date.now()}`, view: "abc", frequency: "weekly", weekday: 1, send_hour: 8, recipients: ["qa@apex.local"] });
    check("schedule_persisted", Boolean(created.id && created.tenant_id === tenant.id));
    const listed = await service.listReportSchedules(tenant.id);
    check("tenant_list_contains_schedule", listed.some((row) => row.id === created.id));
    await prisma.apexHeartReportSchedule.update({ where: { id: created.id }, data: { next_run_at: new Date(Date.now() - 60_000) } });
    const execution = await service.runDueReportSchedules();
    const executed = await prisma.apexHeartReportSchedule.findUnique({ where: { id: created.id } });
    check("due_schedule_executed", execution.processed >= 1 && Boolean(executed.last_run_at));
  } finally {
    if (created?.id) await service.deleteReportSchedule(created.tenant_id, created.id).catch(() => undefined);
    await prisma.$disconnect();
  }
  const result = { certification: "apex-heart-report-schedules-local", environment: "LOCAL", generatedAt: new Date().toISOString(), status: "passed", checks };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`CERTIFICACIÓN REPORTES PROGRAMADOS PASSED: ${checks.length} comprobaciones`);
})().catch(async (error) => { await prisma.$disconnect().catch(() => undefined); console.error(error); process.exitCode = 1; });
