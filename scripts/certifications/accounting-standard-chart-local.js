// Real API + PostgreSQL certification in a NEW disposable local database.
// No remote URL is accepted; the existing local database is read for schema only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "../..");
const MIGRATION = "supabase/migrations/20261020173515_standard_chart_piloto.sql";
const migration = fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");
const catalog = JSON.parse(migration.match(/\$catalog\$([\s\S]*?)\$catalog\$/)[1]);
const checks = [];
const suffix = crypto.randomBytes(5).toString("hex");
const database = "standard_chart_cert_" + suffix;
const output = path.resolve(process.argv[2] || ".tmp/accounting-standard-chart-certification.json");
function docker(args, input) {
  return execFileSync("docker", ["exec", "-i", "infra-postgres-1", ...args], {
    input, encoding: "utf8", maxBuffer: 30 * 1024 * 1024
  }).trim();
}
function sql(query, db = database) {
  return docker(["psql", "-X", "-q", "-U", "apex", "-d", db, "-v", "ON_ERROR_STOP=1", "-At"], query);
}
function check(name, condition, detail = {}) {
  checks.push({ name, passed: Boolean(condition), detail });
  assert.ok(condition, name);
  console.log("PASS " + name);
}
async function main() {
  const schema = docker(["pg_dump", "-U", "apex", "-d", "apexos", "--schema-only", "--no-owner", "--no-acl"]);
  sql('create database "' + database + '";', "postgres");
  sql(schema);
  // Use the versioned SaaS table definitions, without unrelated Auth dependencies.
  const foundation = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260517143000_init_qa_saas_foundation.sql"), "utf8");
  for (const table of ["plans", "companies"]) {
    const definition = foundation.match(new RegExp("create table if not exists public\\." + table + " \\([\\s\\S]*?\\n\\);", "i"));
    assert.ok(definition, "foundation " + table);
    sql(definition[0]);
  }
  // Preexisting empty company and tenant with a referenced account and custom fields.
  sql(`insert into public.companies(id,name) values ('11111111-1111-4111-8111-111111111111','Existing empty');
    insert into public."Tenant"(id,name,updated_at) values ('legacy-cert','Legacy',now());
    insert into public."Account"(tenant_id,code,name,type,level,allows_tx,active)
    values ('legacy-cert','1105','Caja personalizada','asset',1,true,false),
           ('legacy-cert','CUSTOM','Cuenta propia','asset',1,true,true);
    insert into public."LedgerEntry"(tenant_id,account_id,date,debit,credit,balance,description,period)
    select 'legacy-cert',id,now(),12,0,12,'Protected posting','2026-10' from public."Account" where tenant_id='legacy-cert' and code='1105';`);
  const protectedBefore = sql('select row_to_json(e)::text from public."LedgerEntry" e;');
  sql("begin;\n" + migration + "\ncommit;");
  check("snapshot_exact_2508", catalog.length === 2508);
  check("existing_empty_company_backfilled", sql('select count(*) from public."Account" where tenant_id=\'11111111-1111-4111-8111-111111111111\';') === "2508");
  check("existing_custom_account_preserved", sql('select count(*) from public."Account" where tenant_id=\'legacy-cert\';') === "2509");
  check("ledger_and_account_identity_preserved", protectedBefore === sql('select row_to_json(e)::text from public."LedgerEntry" e;'));
  check("inactive_and_custom_fields_preserved", sql('select name||\':\'||active||\':\'||allows_tx from public."Account" where tenant_id=\'legacy-cert\' and code=\'1105\';') === "Caja personalizada:false:true");
  check("missing_parent_repaired_locally", sql('select p.code from public."Account" a join public."Account" p on p.id=a.parent_id and p.tenant_id=a.tenant_id where a.tenant_id=\'legacy-cert\' and a.code=\'1105\';') === "11");
  sql("insert into public.companies(id,name) values ('22222222-2222-4222-8222-222222222222','New company');");
  check("new_platform_company_seeded", sql('select count(*) from public."Account" where tenant_id=\'22222222-2222-4222-8222-222222222222\';') === "2508");
  check("exact_source_fields_and_parent_codes", sql(`select count(*) from apexos_accounting_private.standard_chart s
    join public."Account" a on a.code=s.code and a.tenant_id='22222222-2222-4222-8222-222222222222'
    left join public."Account" p on p.id=a.parent_id and p.tenant_id=a.tenant_id
    where (a.name,a.type,a.level,a.allows_tx,a.active,p.code) is not distinct from
          (s.name,s.type,s.level,s.allows_tx,s.active,s.parent_code);`) === "2508");
  check("idempotent_retry", JSON.parse(sql("select apexos_accounting_private.ensure_standard_chart('legacy-cert');")).created === 0);
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
    const { execFile } = require("node:child_process");
    const child = execFile("docker", ["exec", "-i", "infra-postgres-1", "psql", "-X", "-q", "-U", "apex", "-d", database, "-At", "-v", "ON_ERROR_STOP=1"], (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout)));
    child.stdin.end("select apexos_accounting_private.ensure_standard_chart('legacy-cert');");
  })));
  check("concurrent_retries_no_duplicates", concurrent.every((r) => r.created === 0));
  // Failures occur in a subtransaction so the fixture itself remains untouched.
  sql(`do $test$ begin
    begin
      update public."Account" set type='expense' where tenant_id='legacy-cert' and code='1105';
      perform apexos_accounting_private.ensure_standard_chart('legacy-cert');
      raise exception 'EXPECTED_CONFLICT_NOT_RAISED';
    exception when others then
      if sqlerrm <> 'STANDARD_CHART_CONFLICT' then raise; end if;
    end;
  end $test$;`);
  check("conflict_rollback", sql('select type from public."Account" where tenant_id=\'legacy-cert\' and code=\'1105\';') === "asset");
  sql(`insert into public."Account"(tenant_id,code,name,type,level,allows_tx,active)
    values ('33333333-3333-4333-8333-333333333333','1105','Conflict','expense',1,true,true);
    do $test$ begin
      begin
        insert into public.companies(id,name) values ('33333333-3333-4333-8333-333333333333','Must rollback');
        raise exception 'EXPECTED_CONFLICT_NOT_RAISED';
      exception when others then
        if sqlerrm <> 'STANDARD_CHART_CONFLICT' then raise; end if;
      end;
    end $test$;`);
  check("company_creation_is_atomic_on_conflict", sql("select count(*) from public.companies where id='33333333-3333-4333-8333-333333333333';") === "0");
  sql(`do $test$ begin
    begin
      update public."Account" set parent_id=(select id from public."Account" where tenant_id='22222222-2222-4222-8222-222222222222' and code='11')
        where tenant_id='legacy-cert' and code='1105';
      perform apexos_accounting_private.ensure_standard_chart('legacy-cert');
      raise exception 'EXPECTED_CONFLICT_NOT_RAISED';
    exception when others then
      if sqlerrm <> 'STANDARD_CHART_CONFLICT' then raise; end if;
    end;
  end $test$;`);
  check("cross_tenant_parent_rejected", true);
  sql(`do $test$ begin
    begin
      perform apexos_accounting_private.ensure_standard_chart('nonexistent');
      raise exception 'EXPECTED_TARGET_ERROR_NOT_RAISED';
    exception when others then
      if sqlerrm <> 'STANDARD_CHART_TARGET_REQUIRED' then raise; end if;
    end;
  end $test$;`);
  check("nonexistent_target_rejected", true);
  // A role without grants represents both anon and authenticated for the new objects.
  const role = "chart_untrusted_" + suffix;
  sql('create role "' + role + '";', "postgres");
  check("untrusted_role_cannot_access_private_schema", sql("select has_schema_privilege('" + role + "','apexos_accounting_private','USAGE');") === "f");
  check("untrusted_role_cannot_execute_seeder", sql("select has_function_privilege('" + role + "','apexos_accounting_private.ensure_standard_chart(text)','EXECUTE');") === "f");
  check("untrusted_role_cannot_execute_definer", sql("select has_function_privilege('" + role + "','apexos_accounting_private.seed_new_company_chart()','EXECUTE');") === "f");

  const password = docker(["printenv", "POSTGRES_PASSWORD"]);
  process.env.DATABASE_URL = "postgresql://apex:" + encodeURIComponent(password) + "@127.0.0.1:55432/" + database;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "test";
  process.env.DISABLE_REDIS = "true";
  process.env.REDIS_DISABLED = "true";
  process.env.DISABLE_BACKGROUND_WORKERS = "true";
  const build = require(path.join(ROOT, "apps/api/server"));
  const app = await build();
  await app.ready();
  async function register(label) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: {
      company_name: label + suffix, name: "Local cert", email: label + suffix + "@apex.local",
      password: "Standard-Cert-2026!", country: "CO", industry: "generic", plan: "crown"
    } });
    assert.ok([200,201].includes(response.statusCode), "register " + response.statusCode);
    return response.json();
  }
  try {
    const a = await register("standard-a");
    const b = await register("standard-b");
    const tenantA = a.user.tenant_id;
    const tenantB = b.user.tenant_id;
    check("registration_seeds_new_tenant", sql('select count(*) from public."Account" where tenant_id=\'' + tenantA + '\';') === "2508");
    const call = (method, url, token, payload) => app.inject({ method, url, headers: token ? { authorization: "Bearer " + token } : {}, ...(payload ? { payload } : {}) });
    check("anonymous_init_denied", (await call("POST", "/api/v1/accounting/chart/init", null, {})).statusCode === 401);
    const tokenA = a.token || a.access_token;
    check("authorized_init_2508", (await call("POST", "/api/v1/accounting/chart/init", tokenA, { country: "CO", tenant_id: tenantB })).json().length === 2508);
    const authorizedRows = (await call("POST", "/api/v1/accounting/chart/init", tokenA, { tenant_id: tenantB })).json();
    const ownIds = new Set(sql('select id from public."Account" where tenant_id=\'' + tenantA + '\';').split("\n").map(Number));
    check("body_cannot_select_another_tenant", authorizedRows.every((row) => ownIds.has(row.id)));
    const beforeB = sql('select md5(string_agg(row_to_json(a)::text,\',\' order by id)) from public."Account" a where tenant_id=\'' + tenantB + '\';');
    const accountB = sql('select id from public."Account" where tenant_id=\'' + tenantB + '\' and code=\'1105\';');
    const crossed = await call("PUT", "/api/v1/accounting/accounts/" + accountB, tokenA, { code: "1105", name: "Forbidden", type: "asset", active: true, allows_tx: true });
    check("cross_tenant_account_update_denied", crossed.statusCode >= 400);
    check("other_tenant_unchanged", beforeB === sql('select md5(string_agg(row_to_json(a)::text,\',\' order by id)) from public."Account" a where tenant_id=\'' + tenantB + '\';'));
    sql('update public."Account" set type=\'expense\' where tenant_id=\'' + tenantA + '\' and code=\'1105\';');
    check("api_reports_conflict_without_overwriting", (await call("POST", "/api/v1/accounting/chart/init", tokenA, {})).statusCode === 409);
    sql('update public."Account" set type=\'asset\' where tenant_id=\'' + tenantA + '\' and code=\'1105\';');
    // Remove write permission from a real, registered principal.
    sql('update public."Role" set name=\'CERT_VIEWER\' where tenant_id=\'' + tenantA + '\'; update public."Permission" set module=\'accounting\', action=\'read\' where role_id=(select role_id from public."User" where tenant_id=\'' + tenantA + '\' limit 1);');
    check("read_only_role_cannot_initialize", (await call("POST", "/api/v1/accounting/chart/init", tokenA, { country: "CO" })).statusCode === 403);
    // Exercise the existing tree/auxiliary certification over real local HTTP.
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const { promisify } = require("node:util");
    const { execFile } = require("node:child_process");
    const treeOutput = path.join(path.dirname(output), "accounting-standard-chart-tree-regression.json");
    const tree = await promisify(execFile)(process.execPath, [
      path.join(ROOT, "scripts/certifications/accounting-puc-tree-local.js"),
      "--api-url", address, "--catalog", path.join(ROOT, "apps/api/src/modules/accounting/data/puc-colombia-20261015.json"),
      "--output", treeOutput
    ], { cwd: ROOT, env: process.env, maxBuffer: 5 * 1024 * 1024 });
    fs.writeFileSync(path.join(path.dirname(output), "accounting-standard-chart-tree-regression.log"), tree.stdout);
    check("existing_tree_and_auxiliary_http_certification", JSON.parse(fs.readFileSync(treeOutput, "utf8")).status === "passed");
  } finally {
    await app.close();
    await require(path.join(ROOT, "apps/api/src/core/prisma")).$disconnect();
  }
}
main().then(() => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ status: "passed", environment: "LOCAL", database,
    baseline_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    migration: MIGRATION, migration_sha256: crypto.createHash("sha256").update(migration).digest("hex"),
    source_sha256: Object.fromEntries([MIGRATION, "apps/api/src/modules/accounting/service.js", "scripts/certifications/accounting-standard-chart-local.js", "scripts/certifications/accounting-puc-tree-local.js"]
      .map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex")])),
    tested_at: new Date().toISOString(), checks }, null, 2));
  console.log("Evidence: " + output);
  process.exit(0);
}).catch((error) => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ status: "failed", environment: "LOCAL", database, checks, error: error.message }, null, 2));
  console.error(error.message);
  process.exit(1);
});
