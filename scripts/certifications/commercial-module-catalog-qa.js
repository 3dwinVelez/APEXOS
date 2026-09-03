const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const evidencePath = path.resolve(root, process.argv[2] || "docs/qa/evidence/commercial-module-catalog-20260903/certification.json");
const migrationPath = path.resolve(root, "supabase/migrations/20260903100000_commercial_management_module_catalog.sql");
const postgresBin = process.env.PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/16/bin" : "");
const executable = (name) => postgresBin ? path.join(postgresBin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const clusterPath = path.join(require("node:os").tmpdir(), `apexos-commercial-catalog-qa-${process.pid}`);
const postgresPort = 55000 + (process.pid % 5000);
const startedAt = new Date().toISOString();
const checks = [];

function run(name, command, args, options = {}) {
  const useShell = process.platform === "win32" && command === "npm";
  const resolvedCommand = command;
  const result = spawnSync(resolvedCommand, args, {
    cwd: root,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    shell: useShell,
    input: options.input
  });
  checks.push({
    name,
    status: result.status === 0 ? "passed" : "failed",
    command: [resolvedCommand, ...args].join(" "),
    exit_code: result.status,
    stdout: String(result.stdout || "").slice(-12000),
    stderr: String(result.stderr || result.error || "").slice(-12000)
  });
  if (result.status !== 0) throw new Error(`${name} fallo con codigo ${result.status}`);
  return result;
}

function psql(name, input) {
  return run(name, executable("psql"), [
    "-h", "127.0.0.1", "-p", String(postgresPort), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"
  ], { input });
}

function startPostgres() {
  const server = spawn(executable("postgres"), [
    "-D", clusterPath, "-h", "127.0.0.1", "-p", String(postgresPort)
  ], { cwd: root, detached: true, stdio: "ignore", windowsHide: true });
  server.unref();
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const ready = spawnSync(executable("pg_isready"), ["-h", "127.0.0.1", "-p", String(postgresPort), "-U", "postgres"], {
      cwd: root,
      encoding: "utf8",
      shell: false
    });
    if (ready.status === 0) {
      checks.push({ name: "catalog_postgres_start", status: "passed", command: `postgres -D ${clusterPath} -p ${postgresPort}`, exit_code: 0, stdout: ready.stdout.trim(), stderr: ready.stderr.trim() });
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error("PostgreSQL temporal no estuvo disponible a tiempo");
}

function databaseFlow() {
  run("catalog_postgres_init", executable("initdb"), ["-D", clusterPath, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"]);
  startPostgres();

  const bootstrap = `
    create table public.modules (
      id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
      description text, route text, icon text, is_active boolean not null default true,
      sort_order integer not null default 0, visibility_scope text not null default 'tenant'
    );
    create table public.plans (id uuid primary key default gen_random_uuid(), code text not null unique);
    create table public.companies (id uuid primary key default gen_random_uuid(), name text not null, plan_id uuid references public.plans(id));
    create table public.plan_modules (
      id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.plans(id),
      module_id uuid not null references public.modules(id), enabled boolean not null default false,
      unique(plan_id, module_id)
    );
    create table public.company_modules (
      id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
      module_id uuid not null references public.modules(id), enabled boolean not null default false,
      source text not null default 'manual', unique(company_id, module_id)
    );
    insert into public.plans(code) values ('semilla'), ('copa');
    insert into public.companies(name, plan_id)
      select 'NYVORA', id from public.plans where code = 'semilla';
    insert into public.companies(name, plan_id)
      select 'SCJ', id from public.plans where code = 'copa';
  `;
  psql("catalog_database_bootstrap", bootstrap);

  const migration = fs.readFileSync(migrationPath, "utf8");
  psql("catalog_migration_first_run", migration);

  const enableAndAssert = `
    do $$
    declare module_count integer; plan_count integer; company_count integer; disabled_count integer;
    begin
      select count(*) into module_count from public.modules where code = 'gestion_comercial' and route = '/dashboard/gestion-comercial' and is_active and visibility_scope = 'tenant';
      select count(*) into plan_count from public.plan_modules pm join public.modules m on m.id = pm.module_id where m.code = 'gestion_comercial';
      select count(*) into company_count from public.company_modules cm join public.modules m on m.id = cm.module_id where m.code = 'gestion_comercial';
      select count(*) into disabled_count from public.company_modules cm join public.modules m on m.id = cm.module_id where m.code = 'gestion_comercial' and cm.enabled = false;
      if module_count <> 1 or plan_count <> 2 or company_count <> 2 or disabled_count <> 2 then
        raise exception 'catalog initialization failed: module %, plans %, companies %, disabled %', module_count, plan_count, company_count, disabled_count;
      end if;
    end $$;
    insert into public.company_modules(company_id, module_id, enabled, source)
    select c.id, m.id, true, 'manual' from public.companies c cross join public.modules m
    where c.name = 'NYVORA' and m.code = 'gestion_comercial'
    on conflict (company_id, module_id) do update set enabled = excluded.enabled, source = excluded.source;
    do $$
    begin
      if not exists (
        select 1 from public.company_modules cm
        join public.companies c on c.id = cm.company_id
        join public.modules m on m.id = cm.module_id
        where c.name = 'NYVORA' and m.code = 'gestion_comercial' and cm.enabled = true
      ) then raise exception 'M-27 could not be enabled for NYVORA'; end if;
    end $$;
  `;
  psql("catalog_company_enable_flow", enableAndAssert);

  psql("catalog_migration_idempotent_rerun", migration);
  const preserveEnablement = `
    do $$ begin
      if (select count(*) from public.modules where code = 'gestion_comercial') <> 1 then raise exception 'duplicate module'; end if;
      if not exists (
        select 1 from public.company_modules cm join public.companies c on c.id = cm.company_id
        join public.modules m on m.id = cm.module_id
        where c.name = 'NYVORA' and m.code = 'gestion_comercial' and cm.enabled = true and cm.source = 'manual'
      ) then raise exception 'idempotent rerun overwrote enablement'; end if;
    end $$;
  `;
  psql("catalog_idempotency_assertion", preserveEnablement);
}

try {
  databaseFlow();
  run("catalog_web_contract", "node", ["--test", "apps/web/test/commercial-module-catalog.test.mjs", "apps/web/test/commercial-visit-selection.test.mjs"]);
  run("commercial_api_contract", "node", ["--test", "apps/api/test/commercial-management-contract.test.js", "apps/api/test/rbac-module-access.test.js", "apps/api/test/supabase-auth-modules.test.js"]);
  run("web_typecheck", "npm", ["--workspace", "apps/web", "run", "typecheck"]);
  run("web_production_build", "npm", ["--workspace", "apps/web", "run", "build"]);
  run("protected_platform_regression", "node", ["--test", "apps/api/test/purchases-supplier-flow.test.js", "apps/api/test/inventory-valuation-transit.test.js", "apps/api/test/service-order-items-domain.test.js"]);

  const evidence = {
    change_id: "commercial-module-catalog-20260903",
    status: "passed",
    environment: "QA_LOCAL",
    model_company: "NYVORA",
    commit: process.env.CERTIFIED_COMMIT || "WORKTREE",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    checks
  };
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`CERTIFICACION CATALOGO M-27 APROBADA: ${evidencePath}`);
} catch (error) {
  const evidence = {
    change_id: "commercial-module-catalog-20260903",
    status: "failed",
    commit: process.env.CERTIFIED_COMMIT || "WORKTREE",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    checks
  };
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(evidence.error);
  process.exitCode = 1;
} finally {
  if (fs.existsSync(clusterPath)) {
    spawnSync(executable("pg_ctl"), ["-D", clusterPath, "-m", "fast", "-w", "stop"], { cwd: root, encoding: "utf8", shell: false });
    fs.rmSync(clusterPath, { recursive: true, force: true });
  }
}
