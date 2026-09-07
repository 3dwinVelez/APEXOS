import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), "utf8");

test("Apex Heart está registrado como M-28 y visible en Reportes", () => {
  const modules = read("../lib/modules.ts");
  const access = read("../lib/moduleAccess.ts");
  const page = read("../app/dashboard/reportes/apex-heart/page.tsx");
  assert.match(modules, /id:\s*"M-28"/);
  assert.match(modules, /name:\s*"Apex Heart"/);
  assert.match(access, /reportes:\s*"apex_heart"/);
  for (const label of ["Pulso ejecutivo", "Productos ABC", "Compra → Caja", "Alertas", "Configuración"]) assert.match(page, new RegExp(label));
});

test("la migración Supabase protege todas las tablas Apex Heart con RLS", () => {
  const migration = fs.readFileSync(new URL("../../../supabase/migrations/20260907021723_apex_heart_foundation.sql", import.meta.url), "utf8");
  for (const table of ["apex_heart_configs", "apex_heart_alert_rules", "apex_heart_alerts", "apex_heart_inventory_snapshots"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /revoke all .* from anon/is);
  assert.match(migration, /app_private\.is_company_admin\(company_id\)/);
});
