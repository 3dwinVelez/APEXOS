const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.resolve(
  __dirname,
  '../../../supabase/migrations/20260916162822_apexos_database_security_hardening.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

test('quarantines every existing public table that lacks RLS', () => {
  assert.match(migration, /n\.nspname = 'public'/i);
  assert.match(migration, /not c\.relrowsecurity/i);
  assert.match(migration, /alter table %I\.%I enable row level security/i);
  assert.match(migration, /revoke all privileges on table %I\.%I from anon, authenticated/i);
});

test('future public tables and functions require explicit client grants', () => {
  assert.match(
    migration,
    /alter default privileges in schema public\s+revoke all privileges on tables from anon, authenticated/is
  );
  assert.match(
    migration,
    /alter default privileges in schema public\s+revoke execute on functions from public, anon, authenticated/is
  );
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
