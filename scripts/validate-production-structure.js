const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

function loadEnvFile(file = ".env") {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) return;
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1).replace(/^"|"$/g, "");
  }
}

const args = parseArgs(process.argv.slice(2));
loadEnvFile(args["env-file"] || process.env.VALIDATE_ENV_FILE || ".env");

const TARGET_ENV = process.env.TARGET_ENV || "";
const CONFIRM_PROD_VALIDATE = process.env.CONFIRM_PROD_VALIDATE || "";
const EXPECT_EMPTY_PROD = process.env.EXPECT_EMPTY_PROD === "true" || args["expect-empty"] === true;
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!["qa", "production"].includes(TARGET_ENV)) {
  throw new Error("TARGET_ENV debe ser 'qa' o 'production'.");
}

if (TARGET_ENV === "production" && CONFIRM_PROD_VALIDATE !== "true") {
  throw new Error("Para validar produccion define CONFIRM_PROD_VALIDATE=true.");
}

if (!DATABASE_URL) throw new Error("DATABASE_URL es obligatorio para validar estructura.");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.");

const EXPECTED_BUCKETS = [
  "company-assets",
  "user-avatars",
  "service-images",
  "vehicle-documents",
  "route-evidence",
  "general-attachments",
  "accounting-documents",
  "operational-evidence",
  "user-documents"
];

const EXPECTED_PUBLIC_TABLES = [
  "companies",
  "profiles",
  "company_users",
  "company_modules",
  "modules",
  "plans",
  "plan_modules",
  "employees",
  "vehicles",
  "vehicle_documents",
  "vehicle_master_audit_log",
  "service_references",
  "service_reference_parts",
  "service_orders",
  "service_incidents",
  "service_evidence",
  "operational_routes",
  "route_assignments",
  "time_punches",
  "gps_pings",
  "master_catalogs",
  "master_catalog_items",
  "user_master_documents",
  "user_master_audit_events",
  "Project",
  "ProjectCommitment",
  "ProjectDeliverable",
  "ProjectRisk",
  "ProjectResourceAssignment",
  "User",
  "Role",
  "Permission",
  "Tenant",
  "Vehicle",
  "ServiceOrder",
  "Employee",
  "TimePunch",
  "GpsPing",
  "WorkSession",
  "WorkActivity"
];

const EMPTY_TABLES = [
  "companies",
  "profiles",
  "company_users",
  "company_modules",
  "platform_admins",
  "company_admin_onboarding",
  "employees",
  "vehicles",
  "vehicle_documents",
  "vehicle_master_audit_log",
  "service_orders",
  "service_incidents",
  "service_evidence",
  "route_assignments",
  "operational_routes",
  "time_punches",
  "gps_pings",
  "user_master_documents",
  "user_master_audit_events",
  "Project",
  "ProjectCommitment",
  "ProjectDeliverable",
  "ProjectRisk",
  "ProjectResourceAssignment",
  "User",
  "Employee",
  "Vehicle",
  "ServiceOrder",
  "TimePunch",
  "GpsPing",
  "WorkSession",
  "WorkActivity"
];

async function storage(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${body?.message || body?.error || text}`);
  return body;
}

async function main() {
  const prisma = require("../apps/api/src/core/prisma");
  const failures = [];

  const tables = await prisma.$queryRaw`
    select tablename
    from pg_tables
    where schemaname = 'public'
  `;
  const tableSet = new Set(tables.map((row) => row.tablename));
  const missingTables = EXPECTED_PUBLIC_TABLES.filter((table) => !tableSet.has(table));
  if (missingTables.length) failures.push({ check: "missing_tables", detail: missingTables });

  const noRls = await prisma.$queryRaw`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
    order by c.relname
  `;
  if (noRls.length) failures.push({ check: "public_tables_without_rls", detail: noRls });

  const policySummary = await prisma.$queryRaw`
    select schemaname, count(*)::int as policies
    from pg_policies
    where schemaname in ('public', 'storage')
    group by schemaname
    order by schemaname
  `;
  const publicPolicies = policySummary.find((row) => row.schemaname === "public")?.policies || 0;
  const storagePolicies = policySummary.find((row) => row.schemaname === "storage")?.policies || 0;
  if (publicPolicies < 50) failures.push({ check: "public_policy_count_low", detail: publicPolicies });
  if (storagePolicies < 15) failures.push({ check: "storage_policy_count_low", detail: storagePolicies });

  const functions = await prisma.$queryRaw`
    select proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
  `;
  const functionSet = new Set(functions.map((row) => row.proname));
  for (const fn of ["is_company_member", "is_company_admin", "has_company_module", "is_platform_admin"]) {
    if (!functionSet.has(fn)) failures.push({ check: "missing_app_private_function", detail: fn });
  }

  const emptyCounts = [];
  for (const table of EMPTY_TABLES.filter((name) => tableSet.has(name))) {
    const rows = await prisma.$queryRawUnsafe(`select count(*)::int as count from public."${table}"`);
    emptyCounts.push({ table, count: rows[0]?.count || 0 });
  }
  const nonEmpty = emptyCounts.filter((row) => row.count !== 0);
  if (EXPECT_EMPTY_PROD && nonEmpty.length) failures.push({ check: "tables_expected_empty_have_rows", detail: nonEmpty });

  const authUsers = await prisma.$queryRaw`
    select count(*)::int as count
    from auth.users
    where email is not null
  `;
  if (EXPECT_EMPTY_PROD && (authUsers[0]?.count || 0) !== 0) failures.push({ check: "auth_users_not_empty", detail: authUsers[0]?.count || 0 });

  const storageObjects = await prisma.$queryRaw`
    select count(*)::int as count
    from storage.objects
  `;
  if (EXPECT_EMPTY_PROD && (storageObjects[0]?.count || 0) !== 0) failures.push({ check: "storage_objects_not_empty", detail: storageObjects[0]?.count || 0 });

  const buckets = await storage("/storage/v1/bucket");
  const bucketById = new Map((Array.isArray(buckets) ? buckets : []).map((bucket) => [bucket.id, bucket]));
  const missingBuckets = EXPECTED_BUCKETS.filter((bucket) => !bucketById.has(bucket));
  const publicBuckets = EXPECTED_BUCKETS.filter((bucket) => bucketById.get(bucket)?.public === true);
  if (missingBuckets.length) failures.push({ check: "missing_buckets", detail: missingBuckets });
  if (publicBuckets.length) failures.push({ check: "public_buckets", detail: publicBuckets });

  const result = {
    ok: failures.length === 0,
    target_env: TARGET_ENV,
    summary: {
      public_tables: tables.length,
      public_policies: publicPolicies,
      storage_policies: storagePolicies,
      app_private_functions: functions.length,
      buckets: EXPECTED_BUCKETS.length,
      empty_tables_checked: emptyCounts.length,
      expect_empty_prod: EXPECT_EMPTY_PROD,
      non_empty_tables: nonEmpty,
      auth_users: authUsers[0]?.count || 0,
      storage_objects: storageObjects[0]?.count || 0
    },
    failures
  };

  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();

  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(`[validate-production-structure] ${error.message}`);
  process.exit(1);
});
