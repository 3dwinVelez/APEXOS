#!/usr/bin/env node
/**
 * candado-gates.js — Medición del blindaje de seguridad de APEXOS
 *
 * Mide 5 indicadores críticos y publica baseline.json con el numerador de hoy.
 * Si baseline.json existe, compara y sale 1 si cualquier numerador subió (regresión).
 * Si no existe, lo crea y sale 0 (modo bootstrap).
 *
 * Uso:
 *   node scripts/security/candado-gates.js            # reporte: mide y compara, nunca reescribe
 *   node scripts/security/candado-gates.js --block    # bloquea: sale 1 si hay regresión
 *   node scripts/security/candado-gates.js --update   # reescribe la baseline (explícito)
 *
 * La baseline es el candado: ningún modo pasivo la sobrescribe.
 *
 * Indicadores medidos:
 *   1. Modelos con tenant_id en schema pero FUERA del allowlist TENANT_MODELS
 *   2. Modelos en TENANT_MODELS SIN columna tenant_id en schema
 *   3. Llamadas raw SQL ($queryRaw/$executeRaw) que evaden el middleware
 *   4. Rutas HTTP/WS sin guarda RBAC (preHandler)
 *   5. Vulnerabilidades npm audit críticas + altas
 *
 * Salida: docs/qa/evidence/plan-candado-20261108/baseline.json
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "docs/qa/evidence/plan-candado-20261108/baseline.json");

function parsePrismaSchema() {
  const schemaPath = path.join(ROOT, "apps/api/prisma/schema.prisma");
  const src = fs.readFileSync(schemaPath, "utf8");
  const models = [];
  let currentModel = null;
  let buf = [];

  for (const line of src.split("\n")) {
    const match = line.match(/^model\s+([A-Za-z0-9_]+)\s*\{/);
    if (match) {
      currentModel = match[1];
      buf = [];
      continue;
    }
    if (currentModel) {
      if (/^\}/.test(line)) {
        if (/tenant_id\s+String/.test(buf.join("\n"))) {
          models.push(currentModel);
        }
        currentModel = null;
      } else {
        buf.push(line);
      }
    }
  }
  return models;
}

function parseTenantModelsAllowlist() {
  const prismaPath = path.join(ROOT, "apps/api/src/core/prisma.js");
  const src = fs.readFileSync(prismaPath, "utf8");
  const match = src.match(/const TENANT_MODELS = new Set\(\[([\s\S]*?)\]\);/);
  if (!match) return [];
  return (match[1].match(/"[A-Za-z0-9_]+"/g) || []).map((s) => s.slice(1, -1));
}

function countRawQueries() {
  // Pure Node walk: no dependency on grep being present in the runner.
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.name.endsWith(".js")) {
        const src = fs.readFileSync(full, "utf8");
        count += (src.match(/\$(queryRaw|executeRaw)/g) || []).length;
      }
    }
  };
  walk(path.join(ROOT, "apps/api/src"));
  return count;
}

function countRouteGuards() {
  const modulesDir = path.join(ROOT, "apps/api/src/modules");
  const PERMISSION_GUARDS = [
    "requirePermission",
    "requireExplicitPermission",
    "requireAnyAdminCapability",
    "requireAdminCapability",
    "requirePhysicalDeleteGrant",
  ];
  let total = 0;
  const withoutAuth = [];
  const withoutPermission = [];

  function balance(src, openIndex, open = "(", close = ")") {
    let depth = 0;
    for (let i = openIndex; i < src.length; i += 1) {
      if (src[i] === open) depth += 1;
      else if (src[i] === close) {
        depth -= 1;
        if (depth === 0) return src.slice(openIndex, i + 1);
      }
    }
    return src.slice(openIndex);
  }

  // Local option maps: const read = { preHandler: requirePermission(...) };
  function localMaps(src) {
    const maps = {};
    const re = /const\s+([A-Za-z0-9_]+)\s*=\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const braceIndex = src.indexOf("{", m.index);
      maps[m[1]] = balance(src, braceIndex, "{", "}");
    }
    return maps;
  }

  function expand(block, maps) {
    return block.replace(/\.\.\.([A-Za-z0-9_]+)/g, (all, name) => (maps[name] ? maps[name] : all));
  }

  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^routes.*\.js$/.test(entry.name)) files.push(full);
    }
  }
  walk(modulesDir);

  const authHookByDir = new Map();
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const hasHook = /addHook\(\s*["']preHandler["'][\s\S]{0,160}?(authenticate|requireAuth)/.test(src);
    const dir = path.dirname(file);
    authHookByDir.set(dir, (authHookByDir.get(dir) || false) || hasHook);
  }

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const maps = localMaps(src);
    const dir = path.dirname(file);
    const parentRoutes = path.join(path.dirname(dir), "routes.js");
    const hasModuleAuth =
      authHookByDir.get(dir) === true ||
      (fs.existsSync(parentRoutes) &&
        /addHook\(\s*["']preHandler["'][\s\S]{0,160}?(authenticate|requireAuth)/.test(
          fs.readFileSync(parentRoutes, "utf8")
        ));
    const re = /fastify\.(get|post|put|patch|delete)\s*\(/g;
    let match;
    while ((match = re.exec(src)) !== null) {
      total += 1;
      const method = match[1].toUpperCase();
      const openIndex = src.indexOf("(", match.index);
      const rawBlock = balance(src, openIndex);
      const block = expand(rawBlock, maps);
      const pathMatch = rawBlock.match(/^\s*\(\s*[`"']([^`"']+)[`"']/);
      const routePath = pathMatch ? pathMatch[1] : "?";
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      const ref = `${method} ${routePath} (${rel})`;
      const hasAuth = hasModuleAuth || /authenticate|requireAuth|preHandler/.test(block);
      const hasPermission = PERMISSION_GUARDS.some((g) => block.includes(g));
      if (!hasAuth) withoutAuth.push(ref);
      else if (!hasPermission) withoutPermission.push(ref);
    }
  }

  return { total, withoutAuth, withoutPermission };
}

function countNpmAuditCriticalHigh() {
  // Run npm's own CLI through node: no shell, no .cmd spawning (blocked on
  // Windows). Falls back to the platform binary with a fixed argv.
  const npmCli = process.env.npm_execpath;
  const options = { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd: ROOT };
  try {
    const out = npmCli && /npm-cli\.js$|npm-cli\.cjs$/.test(npmCli)
      ? execFileSync(process.execPath, [npmCli, "audit", "--json"], options)
      : execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--json"], {
          ...options,
          shell: process.platform === "win32",
        });
    return countFromAuditJson(out);
  } catch (err) {
    // npm audit exits non-zero when vulnerabilities exist; stdout still has JSON.
    const stdout = err.stdout ? err.stdout.toString() : "";
    if (stdout) {
      const parsed = countFromAuditJson(stdout);
      if (parsed >= 0) return parsed;
    }
    console.error("[candado-gates] npm audit no disponible:", err.message);
    return -1;
  }
}

function countFromAuditJson(raw) {
  try {
    const audit = JSON.parse(raw);
    const vulns = audit.vulnerabilities || {};
    return Object.values(vulns).filter(
      (v) => v.severity === "critical" || v.severity === "high"
    ).length;
  } catch {
    return -1;
  }
}

function checkCsp() {
  const cspPath = path.join(ROOT, "apps/web/lib/security/csp.ts");
  const nextPath = path.join(ROOT, "apps/web/next.config.ts");
  const src = [cspPath, nextPath]
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, "utf8"))
    .join("\n");
  return {
    script_src_unsafe_inline: /script-src[^;\n]*'unsafe-inline'/.test(src) ? 1 : 0,
    connect_src_scheme_wildcard: /connect-src[^;\n]*(^|\s)https:(\s|;|$)/m.test(src) ? 1 : 0,
    object_src_not_none: /object-src\s+'self'/.test(src) ? 1 : 0,
  };
}

function checkRlsEffective() {
  // A single-tenant middleware is the only filter if the API connects as owner
  // and no FORCE / app.tenant_id is ever set. Count the guards that would make
  // RLS authoritative.
  const sqlFiles = [];
  const roots = ["apps/api/prisma/migrations", "supabase/migrations"];
  for (const rel of roots) {
    const dir = path.join(ROOT, rel);
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".sql")) sqlFiles.push(full);
      }
    };
    walk(dir);
  }
  let force = 0;
  let enable = 0;
  let policies = 0;
  for (const f of sqlFiles) {
    const s = fs.readFileSync(f, "utf8");
    force += (s.match(/FORCE\s+ROW\s+LEVEL\s+SECURITY/gi) || []).length;
    enable += (s.match(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi) || []).length;
    policies += (s.match(/CREATE\s+POLICY/gi) || []).length;
  }
  let tenantGucSet = 0;
  const apiSrc = path.join(ROOT, "apps/api/src");
  const walkJs = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walkJs(full);
      else if (e.name.endsWith(".js")) {
        const s = fs.readFileSync(full, "utf8");
        tenantGucSet += (s.match(/set_config\(\s*['"]app\.tenant_id/g) || []).length;
      }
    }
  };
  walkJs(apiSrc);
  return {
    rls_force_statements: force,
    rls_enable_statements: enable,
    rls_policies_declared: policies,
    app_tenant_guc_sets_in_code: tenantGucSet,
  };
}

function checkInfraExposure() {
  const composePath = path.join(ROOT, "infra/docker-compose.yml");
  if (!fs.existsSync(composePath)) return { public_bindings: -1, lax_default_credentials: -1, redis_without_password: -1 };
  const src = fs.readFileSync(composePath, "utf8");
  const portLines = src.match(/^\s*-\s*"?\d+:\d+"?\s*$/gm) || [];
  const boundLines = src.match(/^\s*-\s*"\d+\.\d+\.\d+\.\d+:\d+:\d+"/gm) || [];
  const laxDefaults = (src.match(/\$\{[A-Z_]+:-[^}]*(change_me|password|secret)[^}]*\}/gi) || []).length;
  const redisBlock = (src.match(/redis:\s*\n([\s\S]*?)(?=\n\s{2}[a-z-]+:\s*\n|$)/) || [])[1] || "";
  return {
    published_ports: portLines.length,
    explicitly_bound_ports: boundLines.length,
    lax_default_credentials: laxDefaults,
    redis_without_password: /requirepass/.test(redisBlock) ? 0 : 1,
  };
}

function checkEnforcementDefaults() {
  const files = ["config/.env.example", "config/qa.env.example"];
  let enforcementFalse = 0;
  for (const rel of files) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const s = fs.readFileSync(full, "utf8");
    if (/AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED\s*=\s*false/i.test(s)) enforcementFalse += 1;
  }
  return { example_files_with_enforcement_disabled: enforcementFalse };
}

function measure() {
  const modelsWithTenantId = parsePrismaSchema();
  const allowlist = parseTenantModelsAllowlist();

  const outsideAllowlist = modelsWithTenantId.filter((m) => !allowlist.includes(m));
  const inAllowlistWithoutColumn = allowlist.filter((m) => !modelsWithTenantId.includes(m));
  const routes = countRouteGuards();

  return {
    timestamp: new Date().toISOString(),
    indicators: {
      models_with_tenant_id_outside_allowlist: outsideAllowlist.length,
      models_in_allowlist_without_tenant_id_column: inAllowlistWithoutColumn.length,
      raw_sql_queries: countRawQueries(),
      routes_without_auth: routes.withoutAuth.length,
      npm_audit_critical_high: countNpmAuditCriticalHigh(),
      ...checkCsp(),
      ...checkRlsEffective(),
      ...checkInfraExposure(),
      ...checkEnforcementDefaults(),
    },
    informational: {
      routes_authenticated_without_permission_guard: routes.withoutPermission.length,
    },
    details: {
      routes_total: routes.total,
      outside_allowlist: outsideAllowlist,
      in_allowlist_without_column: inAllowlistWithoutColumn,
      routes_without_auth: routes.withoutAuth,
      routes_authenticated_without_permission_guard: routes.withoutPermission,
    },
  };
}

// Indicators that block a regression when they rise above the baseline.
const BLOCKING = [
  "models_with_tenant_id_outside_allowlist",
  "models_in_allowlist_without_tenant_id_column",
  "raw_sql_queries",
  "routes_without_auth",
  "npm_audit_critical_high",
  "script_src_unsafe_inline",
  "connect_src_scheme_wildcard",
  // A lower FORCE / GUC count is a regression too; handled as "must not drop".
];
// Indicators where a drop is the regression (we want them higher).
const MUST_NOT_DROP = [
  "rls_force_statements",
  "app_tenant_guc_sets_in_code",
];
// Indicators where a rise is the regression (we want them lower/zero).
const MUST_NOT_RISE = [
  "object_src_not_none",
  "lax_default_credentials",
  "redis_without_password",
  "example_files_with_enforcement_disabled",
];

function compareAgainstBaseline(current, baseline) {
  const regressions = [];
  for (const key of [...BLOCKING, ...MUST_NOT_RISE]) {
    const curr = current.indicators[key];
    const base = baseline.indicators[key];
    if (typeof curr === "number" && typeof base === "number" && curr > base) {
      regressions.push(`${key} subió de ${base} a ${curr}`);
    }
  }
  for (const key of MUST_NOT_DROP) {
    const curr = current.indicators[key];
    const base = baseline.indicators[key];
    if (typeof curr === "number" && typeof base === "number" && curr < base) {
      regressions.push(`${key} bajó de ${base} a ${curr}`);
    }
  }
  return regressions;
}

function main() {
  const blockMode = process.argv.includes("--block");
  // The baseline is the lock. Only an explicit --update may rewrite it:
  // a passive run must never erase the reference it is supposed to protect.
  const updateMode = process.argv.includes("--update");

  console.log("[candado-gates] Midiendo postura de seguridad...");
  const current = measure();

  console.log("[candado-gates] Indicadores:");
  for (const [key, value] of Object.entries(current.indicators)) {
    console.log(`  ${key}: ${value}`);
  }
  for (const [key, value] of Object.entries(current.informational)) {
    console.log(`  (info) ${key}: ${value}`);
  }

  if (!fs.existsSync(BASELINE_PATH) && !updateMode) {
    console.error(`[candado-gates] No existe baseline en ${BASELINE_PATH}.`);
    console.error("[candado-gates] Se crea solo con --update explícito. Exit 1.");
    process.exit(1);
  }

  if (updateMode) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
    console.log(`[candado-gates] Baseline reescrita por --update: ${BASELINE_PATH}`);
    process.exit(0);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const regressions = compareAgainstBaseline(current, baseline);

  if (!regressions.length) {
    console.log("[candado-gates] Sin regresión frente a la baseline. Exit 0.");
    process.exit(0);
  }

  for (const r of regressions) {
    const line = `[candado-gates] REGRESIÓN: ${r}`;
    if (blockMode) console.error(line);
    else console.log(line);
  }

  if (blockMode) {
    console.error("[candado-gates] Bloqueado por regresión. Exit 1.");
    process.exit(1);
  }

  console.log("[candado-gates] Modo reporte: hay regresiones sin bloquear. Exit 0.");
  process.exit(0);
}

main();
