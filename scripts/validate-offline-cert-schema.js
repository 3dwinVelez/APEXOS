const { PrismaClient } = require("@prisma/client");

const EXPECTED_HOSTS = new Set(["127.0.0.1", "localhost"]);
const EXPECTED_PORT = "54320";
const EXPECTED_DATABASE = "apexos_offline_cert_local";
const REQUIRED_TABLES = [
  "Tenant",
  "User",
  "Role",
  "Permission",
  "Employee",
  "AuthorizationSession",
  "AuditLog",
  "ServiceOrder",
  "ServiceReference",
  "ServiceReferencePart",
  "ServiceIncident",
  "ServicePhoto",
  "evidence_upload_authorizations"
];
const REQUIRED_COLUMNS = [
  ["Tenant", "authorization_version", "integer"],
  ["User", "authorization_version", "integer"],
  ["AuthorizationSession", "user_version", "integer"],
  ["AuthorizationSession", "tenant_version", "integer"],
  ["ServiceOrder", "tenant_id", "text"],
  ["ServiceOrder", "technician_id", "integer"],
  ["ServiceOrder", "updated_at", "timestamp without time zone"]
];
const REQUIRED_MIGRATIONS = [
  "20260602_accounting_inventory_purchases_payroll",
  "20260605_qa_performance_indexes",
  "20260720090000_read_performance_indexes",
  "20260724000000_performance_indexes_fase2",
  "20260724000001_add_storage_path",
  "20260727013000_fix_service_photo_pending_index",
  "20260727040000_authoritative_evidence_uploads",
  "20260727042000_authorization_versions"
];

function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (!EXPECTED_HOSTS.has(url.hostname)) throw new Error("Remote database host rejected.");
  if (url.port !== EXPECTED_PORT) throw new Error("Unexpected certification database port.");
  if (url.pathname.slice(1) !== EXPECTED_DATABASE) throw new Error("Unexpected database name.");
}

async function validate() {
  assertLocalDatabase();
  const prisma = new PrismaClient();
  try {
    const identity = await prisma.$queryRaw`
      SELECT current_database() database_name,
             current_user user_name,
             current_setting('server_version') server_version
    `;
    if (identity[0].database_name !== EXPECTED_DATABASE) throw new Error("Database identity mismatch.");

    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const tableSet = new Set(tables.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((table) => !tableSet.has(table));
    if (missingTables.length) throw new Error(`Missing tables: ${missingTables.join(", ")}`);

    const columns = await prisma.$queryRaw`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
    for (const [table, column, type] of REQUIRED_COLUMNS) {
      const match = columns.find(
        (row) => row.table_name === table && row.column_name === column && row.data_type === type
      );
      if (!match) throw new Error(`Missing or incompatible column: ${table}.${column}`);
    }

    const migrations = await prisma.$queryRaw`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name
    `;
    const migrationSet = new Set(migrations.map((row) => row.migration_name));
    const missingMigrations = REQUIRED_MIGRATIONS.filter((name) => !migrationSet.has(name));
    if (missingMigrations.length) throw new Error(`Missing migrations: ${missingMigrations.join(", ")}`);

    const counts = {};
    for (const table of ["Tenant", "User", "ServiceOrder", "ServicePhoto", "evidence_upload_authorizations"]) {
      const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int count FROM "${table}"`);
      counts[table] = rows[0].count;
      if (rows[0].count !== 0) throw new Error(`Expected empty table: ${table}`);
    }

    const foreignKeys = await prisma.$queryRaw`
      SELECT count(*)::int count
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'
    `;
    const indexes = await prisma.$queryRaw`
      SELECT count(*)::int count FROM pg_indexes WHERE schemaname = 'public'
    `;
    const extensions = await prisma.$queryRaw`
      SELECT extname FROM pg_extension ORDER BY extname
    `;
    const rls = await prisma.$queryRaw`
      SELECT count(*)::int count FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relrowsecurity
    `;
    const policies = await prisma.$queryRaw`
      SELECT count(*)::int count FROM pg_policies WHERE schemaname = 'public'
    `;

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: identity[0],
          tables: tableSet.size,
          migrations: migrations.length,
          foreignKeys: foreignKeys[0].count,
          indexes: indexes[0].count,
          extensions: extensions.map((row) => row.extname),
          rlsTables: rls[0].count,
          policies: policies[0].count,
          emptyCounts: counts,
          supabaseLocalRequired: false
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

validate().catch((error) => {
  console.error(`[offline-cert-schema] ${error.message}`);
  process.exitCode = 1;
});
