const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const apexPrisma = read("apps/api/prisma/migrations/20260907023000_apex_heart_foundation/migration.sql");
const apexSupabase = read("supabase/migrations/20260907021723_apex_heart_foundation.sql");
const hardening = read("supabase/migrations/20260916162822_apexos_database_security_hardening.sql");
const hrPrisma = read("apps/api/prisma/migrations/20260917120000_hr_workday_novelties_foundation/migration.sql");
const hrSupabase = read("supabase/migrations/20260917120000_hr_workday_novelties_foundation.sql");

for (const table of [
  "apex_heart_configs",
  "apex_heart_alert_rules",
  "apex_heart_alerts",
  "apex_heart_inventory_snapshots",
]) {
  assert.match(apexPrisma, new RegExp(`CREATE TABLE "${table}"`, "i"));
  assert.doesNotMatch(apexSupabase, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"));
}
assert.match(apexSupabase, /expected tenant_id text owned by Prisma/i);
assert.doesNotMatch(apexSupabase, /company_id uuid/i);

assert.match(hardening, /SECURITY INVENTORY:/);
assert.match(hardening, /backend_owned_allowlist/);
assert.doesNotMatch(hardening, /alter table %I\.%I enable row level security/i);
assert.doesNotMatch(hardening, /alter default privileges[\s\S]*revoke all privileges on tables/i);

for (const table of [
  "th_tipos_novedad",
  "th_novedades_jornada",
  "th_novedad_historial",
  "th_jornada_kilometrajes",
  "th_entidades_laborales",
  "th_empleado_salarios",
  "th_empleado_afiliaciones",
  "th_parametros_laborales",
  "th_conceptos_recargo",
  "th_calendario_dias",
]) {
  assert.match(hrPrisma, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  assert.doesNotMatch(hrSupabase, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
}
assert.match(hrSupabase, /run Prisma migration 20260917120000 before the Supabase security overlay/i);
assert.match(hrPrisma, /th_parametros_laborales_scope_unique[\s\S]*COALESCE\(company_id, ''\)/i);
assert.match(hrPrisma, /th_conceptos_recargo_scope_unique[\s\S]*COALESCE\(company_id, ''\)/i);
assert.match(hrPrisma, /th_jornada_kilometrajes_one_active[\s\S]*COALESCE\(route_id, -1\)[\s\S]*COALESCE\(employee_id, -1\)/i);
assert.equal((hrPrisma.match(/ON CONFLICT DO NOTHING;/g) || []).length >= 2, true);

console.log("database migration safety: PASS");
