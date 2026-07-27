const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((item) => item.startsWith("--")).map((item) => {
    const [key, ...value] = item.slice(2).split("=");
    return [key, value.length ? value.join("=") : true];
  }));
}

function loadEnvFile(file) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) throw new Error(`No existe el archivo de entorno: ${file}`);
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    if (!process.env[key]) process.env[key] = line.slice(separator + 1).replace(/^"|"$/g, "");
  }
}

function normalizeSql(value) {
  let normalized = String(value || "").replace(/::[a-z_ ]+(\[\])?/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    let depth = 0;
    let enclosesWholeExpression = true;
    for (let index = 0; index < normalized.length; index += 1) {
      if (normalized[index] === "(") depth += 1;
      if (normalized[index] === ")") depth -= 1;
      if (depth === 0 && index < normalized.length - 1) {
        enclosesWholeExpression = false;
        break;
      }
    }
    if (!enclosesWholeExpression) break;
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function normalizeRoles(value) {
  const roles = Array.isArray(value) ? value : String(value || "").replace(/[{}"]/g, "").split(",");
  return roles.map((role) => role.trim().toLowerCase()).filter(Boolean).sort().join(",");
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}:${url.port || "default"}/${url.pathname.split("/").filter(Boolean)[0] || ""}`;
  } catch {
    return "[invalid-url]";
  }
}

function projectRef(supabaseUrl) {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return "";
  }
}

function repositoryState(root) {
  const sqlFiles = [];
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(resolved);
      else if (entry.name.endsWith(".sql")) sqlFiles.push(resolved);
    }
  }
  visit(path.join(root, "supabase"));
  const rlsTables = new Set();
  const policies = new Map();
  const functions = new Map();

  for (const file of sqlFiles.sort()) {
    const sql = fs.readFileSync(file, "utf8");
    for (const match of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:(["\w]+)\.)?(["\w]+)\s+enable\s+row\s+level\s+security/gi)) {
      rlsTables.add(`${(match[1] || "public").replaceAll('"', "")}.${match[2].replaceAll('"', "")}`);
    }
    const policyStatementPattern = /(?:create\s+policy\s+(?:"[^"]+"|[\w-]+)\s+on\s+(?:(?:["\w]+)\.)?(?:["\w]+)[\s\S]*?;|drop\s+policy\s+(?:if\s+exists\s+)?(?:"[^"]+"|[\w-]+)\s+on\s+(?:(?:["\w]+)\.)?(?:["\w]+)\s*;)/gi;
    for (const statementMatch of sql.matchAll(policyStatementPattern)) {
      const statement = statementMatch[0];
      const drop = statement.match(/drop\s+policy\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([\w-]+))\s+on\s+(?:(["\w]+)\.)?(["\w]+)/i);
      if (drop) {
        const schema = (drop[3] || "public").replaceAll('"', "");
        const table = drop[4].replaceAll('"', "");
        policies.delete(`${schema}.${table}.${drop[1] || drop[2]}`);
        continue;
      }
      const match = statement.match(/create\s+policy\s+(?:"([^"]+)"|([\w-]+))\s+on\s+(?:(["\w]+)\.)?(["\w]+)([\s\S]*?);/i);
      if (!match) continue;
      const schema = (match[3] || "public").replaceAll('"', "");
      const table = match[4].replaceAll('"', "");
      const body = match[5];
      const command = body.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1]?.toUpperCase() || "ALL";
      const roles = body.match(/\bto\s+([^\n]+?)(?=\s+(?:using|with\s+check)\b|$)/i)?.[1]?.trim() || "public";
      const using = body.match(/\busing\s*\(([\s\S]*?)\)\s*(?=with\s+check|$)/i)?.[1] || "";
      const check = body.match(/\bwith\s+check\s*\(([\s\S]*?)\)\s*$/i)?.[1] || "";
      const key = `${schema}.${table}.${match[1] || match[2]}`;
      policies.set(key, { schema, table, name: match[1] || match[2], command, roles: normalizeRoles(roles), using: normalizeSql(using), check: normalizeSql(check), source: path.relative(root, file) });
    }
    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:(["\w]+)\.)?(["\w]+)\s*\(/gi)) {
      const schema = (match[1] || "public").replaceAll('"', "");
      const name = match[2].replaceAll('"', "");
      functions.set(`${schema}.${name}`, { schema, name, source: path.relative(root, file) });
    }
  }
  return { files: sqlFiles.length, rlsTables: [...rlsTables].sort(), policies: [...policies.values()], functions: [...functions.values()] };
}

async function inspect(tx) {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  const identity = await tx.$queryRawUnsafe(`select current_database() database, current_user db_user, inet_server_addr()::text server_address, version() server_version`);
  const relations = await tx.$queryRawUnsafe(`
      select n.nspname schema, c.relname name, c.relkind kind, c.relrowsecurity rls_enabled,
             c.relforcerowsecurity rls_forced, pg_get_userbyid(c.relowner) owner
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m')
      order by 1,2`);
  const policies = await tx.$queryRawUnsafe(`
      select schemaname schema, tablename table_name, policyname name, permissive, roles, cmd command,
             coalesce(qual,'') using_expression, coalesce(with_check,'') check_expression
      from pg_policies where schemaname in ('public','storage') order by 1,2,3`);
  const grants = await tx.$queryRawUnsafe(`
      select table_schema schema, table_name, grantee, privilege_type, is_grantable
      from information_schema.role_table_grants
      where table_schema in ('public','storage') order by 1,2,3,4`);
  const functions = await tx.$queryRawUnsafe(`
      select n.nspname schema, p.proname name, pg_get_userbyid(p.proowner) owner,
             p.prosecdef security_definer, coalesce(array_to_string(p.proconfig, ','),'') settings,
             pg_get_function_identity_arguments(p.oid) arguments,
             md5(pg_get_functiondef(p.oid)) definition_hash
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','app_private','storage') order by 1,2,6`);
  const storagePresence = await tx.$queryRawUnsafe(`select to_regclass('storage.buckets')::text relation`);
  const buckets = storagePresence[0]?.relation
    ? await tx.$queryRawUnsafe(`select id, name, public, file_size_limit::text file_size_limit, allowed_mime_types from storage.buckets order by id`)
    : [];
  return { identity: identity[0], relations, policies, grants, functions, buckets };
}

function compare(repository, deployed) {
  const liveRls = new Set(deployed.relations.filter((item) => item.rls_enabled).map((item) => `${item.schema}.${item.name}`));
  const livePolicies = new Map(deployed.policies.map((item) => [`${item.schema}.${item.table_name}.${item.name}`, item]));
  const expectedPolicies = new Map(repository.policies.map((item) => [`${item.schema}.${item.table}.${item.name}`, item]));
  const missingRls = repository.rlsTables.filter((item) => !liveRls.has(item));
  const tablesWithoutRls = deployed.relations.filter((item) => ["r", "p"].includes(item.kind) && !item.rls_enabled).map((item) => `${item.schema}.${item.name}`);
  const tablesWithRlsWithoutPolicies = deployed.relations.filter((item) => item.rls_enabled && !deployed.policies.some((policy) => policy.schema === item.schema && policy.table_name === item.name)).map((item) => `${item.schema}.${item.name}`);
  const missingPolicies = [...expectedPolicies.keys()].filter((key) => !livePolicies.has(key));
  const extraPolicies = [...livePolicies.keys()].filter((key) => !expectedPolicies.has(key));
  const logicDifferences = [];
  for (const [key, expected] of expectedPolicies) {
    const actual = livePolicies.get(key);
    if (!actual) continue;
    const expectedLogic = [normalizeSql(expected.command), normalizeRoles(expected.roles), normalizeSql(expected.using), normalizeSql(expected.check)];
    const actualLogic = [normalizeSql(actual.command), normalizeRoles(actual.roles), normalizeSql(actual.using_expression), normalizeSql(actual.check_expression)];
    if (expectedLogic.join("|") !== actualLogic.join("|")) logicDifferences.push({ key, expected: expectedLogic, deployed: actualLogic, source: expected.source });
  }
  const duplicatePolicies = Object.entries(deployed.policies.reduce((acc, item) => {
    const key = `${item.schema}.${item.table_name}.${item.command}.${normalizeSql(item.using_expression)}.${normalizeSql(item.check_expression)}`;
    (acc[key] ||= []).push(item.name);
    return acc;
  }, {})).filter(([, names]) => names.length > 1).map(([logic, names]) => ({ logic, names }));
  const policyText = deployed.policies.map((item) => `${item.using_expression} ${item.check_expression}`).join(" ");
  const referencedFunctions = [...new Set([...policyText.matchAll(/\b([a-z_][\w]*)\s*\(/gi)].map((match) => match[1]).filter((name) => !["select", "exists", "coalesce", "nullif", "current_setting"].includes(name.toLowerCase())))].sort();
  return { missingRls, tablesWithoutRls, tablesWithRlsWithoutPolicies, missingPolicies, extraPolicies, logicDifferences, duplicatePolicies, referencedFunctions };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = String(args.target || "");
  if (!["local", "qa", "production"].includes(target)) throw new Error("--target debe ser local, qa o production.");
  const envFile = args["env-file"] || `config/${target}.env`;
  loadEnvFile(envFile);
  const databaseUrl = process.env.DATABASE_URL || "";
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!databaseUrl) throw new Error("DATABASE_URL es obligatorio.");
  const expectedRef = projectRef(supabaseUrl);
  const isLocalDatabase = /localhost|127\.0\.0\.1/i.test(databaseUrl);
  if (target !== "local" && (isLocalDatabase || !expectedRef || !databaseUrl.includes(expectedRef))) {
    throw new Error(`La conexión DB no coincide con el proyecto Supabase ${target}; inspección cancelada antes de conectar.`);
  }
  if (target === "production" && args["confirm-production"] !== "READ_ONLY_PRODUCTION") {
    throw new Error("Producción exige --confirm-production=READ_ONLY_PRODUCTION.");
  }

  const root = path.resolve(__dirname, "../..");
  const repository = repositoryState(root);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  let deployed;
  try {
    deployed = await prisma.$transaction((tx) => inspect(tx), { timeout: 60_000 });
  } finally {
    await prisma.$disconnect();
  }
  const comparison = compare(repository, deployed);
  const report = {
    generated_at: new Date().toISOString(),
    target,
    connection: { redacted: redactUrl(databaseUrl), project_ref_sha256: crypto.createHash("sha256").update(expectedRef).digest("hex").slice(0, 12) },
    repository,
    deployed,
    comparison
  };
  const output = path.resolve(args.output || `reports/security/rls-${target}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[rls-inspect] target=${target} tables=${deployed.relations.length} policies=${deployed.policies.length} missing_rls=${comparison.missingRls.length} logic_differences=${comparison.logicDifferences.length}`);
  console.log(`[rls-inspect] report=${output}`);
}

main().catch((error) => {
  console.error(`[rls-inspect] ${error.message}`);
  process.exitCode = 1;
});
