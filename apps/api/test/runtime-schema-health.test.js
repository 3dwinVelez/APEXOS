const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REQUIRED_RUNTIME_COLUMNS,
  inspectRuntimeSchema,
  missingRuntimeColumns
} = require("../src/core/runtimeSchema");

const completeSchema = REQUIRED_RUNTIME_COLUMNS.map(([table_name, column_name]) => ({ table_name, column_name }));

test("runtime schema accepts every column required by authenticated sessions", () => {
  assert.deepEqual(missingRuntimeColumns(completeSchema), []);
});

test("runtime schema reports the production incident columns explicitly", () => {
  const available = completeSchema.filter(({ column_name }) => column_name !== "authorization_version");
  assert.deepEqual(missingRuntimeColumns(available), [
    "Tenant.authorization_version",
    "User.authorization_version"
  ]);
});

test("runtime schema inspection blocks readiness when a required column is absent", async () => {
  const prisma = { $queryRaw: async () => completeSchema.slice(0, -1) };
  assert.deepEqual(await inspectRuntimeSchema(prisma), {
    ready: false,
    missing: ["AuthorizationSession.tenant_version"]
  });
});
