const REQUIRED_RUNTIME_COLUMNS = Object.freeze([
  ["Tenant", "authorization_version"],
  ["User", "authorization_version"],
  ["AuthorizationSession", "user_version"],
  ["AuthorizationSession", "tenant_version"]
]);

function missingRuntimeColumns(rows) {
  const available = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  return REQUIRED_RUNTIME_COLUMNS
    .map(([table, column]) => `${table}.${column}`)
    .filter((column) => !available.has(column));
}

async function inspectRuntimeSchema(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'Tenant' AND column_name = 'authorization_version') OR
        (table_name = 'User' AND column_name = 'authorization_version') OR
        (table_name = 'AuthorizationSession' AND column_name IN ('user_version', 'tenant_version'))
      )
  `;
  const missing = missingRuntimeColumns(rows);
  return { ready: missing.length === 0, missing };
}

module.exports = { REQUIRED_RUNTIME_COLUMNS, inspectRuntimeSchema, missingRuntimeColumns };
