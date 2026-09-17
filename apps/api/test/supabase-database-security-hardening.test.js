const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.resolve(
  __dirname,
  '../../../supabase/migrations/20260916162822_apexos_database_security_hardening.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

test('inventories public tables without mutating their access implicitly', () => {
  assert.match(migration, /n\.nspname = 'public'/i);
  assert.match(migration, /not c\.relrowsecurity/i);
  assert.match(migration, /SECURITY INVENTORY: public\.% has RLS disabled; no privileges were changed/i);
  assert.doesNotMatch(migration, /alter table %I\.%I enable row level security/i);
  assert.doesNotMatch(migration, /revoke all privileges on table %I\.%I from anon, authenticated/i);
});

test('quarantines only the explicit backend-owned allowlist', () => {
  for (const table of [
    'apex_heart_configs',
    'apex_heart_alert_rules',
    'apex_heart_alerts',
    'apex_heart_inventory_snapshots',
    'apex_heart_report_schedules',
  ]) assert.match(migration, new RegExp(`'${table}'`));
  assert.match(migration, /alter table public\.%I enable row level security/i);
  assert.match(migration, /revoke all privileges on table public\.%I from anon, authenticated/i);
  assert.match(migration, /to_regclass\(format\('public\.%I', relation_name\)\) is not null/i);
});

test('does not change default privileges for unrelated Data API objects', () => {
  assert.doesNotMatch(migration, /alter default privileges/i);
});

test('hardens mutable and unversioned privileged functions', () => {
  assert.match(migration, /touch_master_catalog_updated_at\(\) set search_path = ''/i);
  assert.match(migration, /apexos_reject_correction_change_mutation\(\) set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function public\.rls_auto_enable\(\) from public, anon, authenticated/i
  );
});

test('does not include destructive data or schema operations', () => {
  assert.doesNotMatch(migration, /\b(?:delete\s+from|truncate|drop\s+(?:table|schema)|update\s+[^;]+\s+set)\b/i);
});
