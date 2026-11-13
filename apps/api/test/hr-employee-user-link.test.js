const assert = require('node:assert/strict');
const test = require('node:test');
const { selectEmployee, findEmployeeForUser, findUserForEmployee } = require('../src/modules/hr/employeeUserLink');
const employee = (id, document, email, user_id = null) => ({ id, user_id, metadata: { document, email, document_type: 'CC' } });
const conflict = error => error.statusCode === 409 && error.code === 'EMPLEADO_USUARIO_CONFLICTO';
test('matches normalized document and case-insensitive email without replacing labor data', () => {
  const row = employee(1, '1.234-5', 'Personal@EXAMPLE.COM');
  assert.equal(selectEmployee([row], { document: '12345', email: ' personal@example.com ' }), row);
  assert.equal(selectEmployee([row], { document: '12345' }), row);
  assert.equal(selectEmployee([row], { email: 'personal@example.com' }), row);
  assert.equal(selectEmployee([row], { name: 'Same name' }), null);
});
test('rejects ambiguous matches, contradictory documents, document types and occupied links', () => {
  const row = employee(1, '123', 'a@example.com');
  assert.throws(() => selectEmployee([row, employee(2, '456', 'b@example.com')], { document: '123', email: 'b@example.com' }), conflict);
  assert.throws(() => selectEmployee([row], { document: '456', email: 'a@example.com' }), conflict);
  assert.throws(() => selectEmployee([row], { document: '123', document_type: 'CE' }), conflict);
  assert.throws(() => selectEmployee([{ ...row, user_id: 8 }], { document: '123' }), conflict);
  assert.equal(selectEmployee([{ ...row, user_id: 8 }], { document: '123' }, 8).id, 1);
});
test('user lookup explicitly scopes tenant, includes inactive records and normalizes email', async () => {
  let query;
  const db = { user: { findMany: async args => { query = args; return [{ id: 8, employee: null }]; } } };
  assert.equal(await findUserForEmployee(db, 'tenant-a', { email: ' A@EXAMPLE.COM ' }), 8);
  assert.deepEqual(query.where, { tenant_id: 'tenant-a', email: { equals: 'a@example.com', mode: 'insensitive' }, __includeInactive: true });
  assert.equal(await findUserForEmployee(db, 'tenant-a', {}), null);
});
test('existing employee link is never taken over', async () => {
  const db = { user: { findMany: async () => [{ id: 8, employee: { id: 5 } }] } };
  await assert.rejects(findUserForEmployee(db, 'a', { email: 'a@example.com' }), conflict);
  assert.equal(await findUserForEmployee(db, 'a', { email: 'a@example.com' }, 5), 8);
});
test('employee lookup is tenant-scoped and includes inactive employees to prevent duplicates', async () => {
  let query;
  const db = { employee: { findMany: async args => { query = args; return [employee(1, '123', '')]; } } };
  assert.equal((await findEmployeeForUser(db, 'tenant-b', { document: '123' })).id, 1);
  assert.equal(query.where.tenant_id, 'tenant-b');
  assert.equal(query.where.__includeInactive, true);
});
test('absent and ambiguous users are handled explicitly', async () => {
  const db = { user: { findMany: async () => [] } };
  assert.equal(await findUserForEmployee(db, 'a', { email: 'none@example.com' }), null);
  db.user.findMany = async () => [{ id: 1 }, { id: 2 }];
  await assert.rejects(findUserForEmployee(db, 'a', { email: 'none@example.com' }), conflict);
});

test('HR services persist automatic links on create and edit, and reject occupied links before writing', async () => {
  process.env.DISABLE_REDIS = 'true';
  const prismaPath = require.resolve('../src/core/prisma');
  const cachePath = require.resolve('../src/core/tenantCache');
  const servicePath = require.resolve('../src/modules/hr/service');
  const originalPrisma = require.cache[prismaPath];
  const originalCache = require.cache[cachePath];
  const originalService = require.cache[servicePath];
  const tree = { accounting: { organization_tree: {
    societies: [{ code: 'S' }], branches: [{ code: 'B', society_code: 'S' }],
    cost_centers: [{ code: 'C', society_code: 'S', branch_code: 'B' }]
  } } };
  let saved, writes = 0, occupied = false;
  const db = {
    runWithTenant: async (_tenant, fn) => fn(),
    $transaction: async fn => fn(db),
    $queryRaw: async () => [],
    user: { findMany: async () => [{ id: 42, employee: occupied ? { id: 999 } : null }] },
    employee: {
      create: async ({ data }) => { writes++; saved = { id: 17, ...data }; return saved; },
      findFirst: async () => saved,
      update: async ({ data }) => { writes++; saved = { ...saved, ...data }; return saved; }
    }
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
  require.cache[cachePath] = { id: cachePath, filename: cachePath, loaded: true, exports: { getTenantConfig: async () => tree } };
  delete require.cache[servicePath];
  try {
    const hr = require(servicePath);
    const input = { document: '123', document_type: 'CC', name: 'QA', email: 'qa@example.com', salary_base: 0, branch_code: 'B', cost_center_code: 'C', hire_date: '2026-01-01' };
    assert.equal((await hr.createEmployee('tenant-a', input)).user_id, 42);
    saved.user_id = null;
    assert.equal((await hr.updateEmployee('tenant-a', 17, { email: input.email })).user_id, 42);
    occupied = true;
    const before = writes;
    await assert.rejects(hr.createEmployee('tenant-a', input), conflict);
    assert.equal(writes, before);
  } finally {
    for (const [key, value] of [[prismaPath, originalPrisma], [cachePath, originalCache], [servicePath, originalService]]) {
      if (value) require.cache[key] = value; else delete require.cache[key];
    }
  }
});

test('user creation connects the existing employee without overwriting payroll', async () => {
  const prismaPath = require.resolve('../src/core/prisma');
  const servicePath = require.resolve('../src/modules/admin/service');
  const originalPrisma = require.cache[prismaPath];
  const originalService = require.cache[servicePath];
  let existing = { ...employee(7, '123', 'qa@example.com'), salary_base: 2500000, metadata: { document: '123', document_type: 'CC', email: 'qa@example.com', accounting: { cost_center_code: 'C' } } };
  let creation, audits = 0;
  const db = {
    runWithTenant: async (_tenant, fn) => fn(),
    $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(db); },
    tenant: { findUnique: async () => ({ active_modules: [] }) },
    role: { findMany: async ({ where }) => where.name.in.map(name => ({ name })), findFirst: async () => ({ id: 3, name: 'Empleado' }) },
    employee: {
      findMany: async () => [existing],
      update: async ({ data }) => { assert.equal(data.salary_base, undefined); existing = { ...existing, ...data }; return existing; }
    },
    user: {
      findFirst: async () => null,
      create: async ({ data }) => { creation = data; return { id: 42, ...data, employee: existing, role: { name: 'Empleado' } }; }
    },
    auditLog: { create: async () => { audits++; } }
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
  delete require.cache[servicePath];
  try {
    const admin = require(servicePath);
    const result = await admin.createUser('tenant-a', { name: 'QA', email: 'qa@example.com', document: '123', document_type: 'CC', company: 'QA', role_id: 3, password: 'Valid!Password2026' });
    assert.deepEqual(creation.employee, { connect: { id: 7 } });
    assert.equal(result.employee_id, 7);
    assert.equal(existing.salary_base, 2500000);
    assert.equal(existing.metadata.accounting.cost_center_code, 'C');
    assert.equal(audits, 1);
    existing.user_id = 99;
    await assert.rejects(admin.createUser('tenant-a', { name: 'QA', email: 'qa@example.com', document: '123', company: 'QA', role_id: 3, password: 'Valid!Password2026' }), conflict);
    assert.equal(audits, 1);
  } finally {
    for (const [key, value] of [[prismaPath, originalPrisma], [servicePath, originalService]]) {
      if (value) require.cache[key] = value; else delete require.cache[key];
    }
  }
});
