// Identity matching is tenant-scoped and never uses names.
const emailKey = value => String(value || "").trim().toLowerCase();
const documentKey = value => String(value || "").trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
function conflict() {
  const error = new Error("No se puede asociar automaticamente: hay coincidencias ambiguas, documentos diferentes o un vinculo previo. Revise el empleado y el usuario.");
  error.statusCode = 409;
  error.code = "EMPLEADO_USUARIO_CONFLICTO";
  throw error;
}
function selectEmployee(rows, identity, userId = null) {
  const document = documentKey(identity.document);
  const email = emailKey(identity.email);
  const matches = rows.filter(row =>
    (document && documentKey(row.metadata?.document) === document) ||
    (email && [row.metadata?.email, row.metadata?.access?.email, row.user?.email].some(value => emailKey(value) === email)));
  if (matches.length > 1) conflict();
  const row = matches[0];
  if (row && ((row.user_id != null && row.user_id !== userId) ||
    (document && documentKey(row.metadata?.document) && documentKey(row.metadata.document) !== document) ||
    (identity.document_type && row.metadata?.document_type && documentKey(identity.document_type) !== documentKey(row.metadata.document_type)))) conflict();
  return row || null;
}
async function findEmployeeForUser(db, tenantId, identity, userId = null) {
  const rows = await db.employee.findMany({ where: { tenant_id: tenantId, __includeInactive: true }, include: { user: { select: { email: true } } } });
  return selectEmployee(rows, identity, userId);
}
async function findUserForEmployee(db, tenantId, identity, employeeId = null) {
  if (identity.user_id !== undefined) {
    const id = Number(identity.user_id);
    if (!Number.isSafeInteger(id) || id <= 0) conflict();
    const user = await db.user.findFirst({ where: { tenant_id: tenantId, id, __includeInactive: true }, select: { id: true, employee: { select: { id: true } } } });
    if (!user || (user.employee && user.employee.id !== employeeId)) conflict();
    return user.id;
  }
  const email = emailKey(identity.email);
  if (!email) return null;
  const users = await db.user.findMany({ where: { tenant_id: tenantId, email: { equals: email, mode: "insensitive" }, __includeInactive: true }, include: { employee: true } });
  if (users.length > 1) conflict();
  const user = users[0];
  if (!user) return null;
  if (user.employee && user.employee.id !== employeeId) conflict();
  return user.id;
}

async function listUserCandidates(db, tenantId, query = {}) {
  const document = documentKey(query.document);
  const type = documentKey(query.document_type);
  const q = String(query.q || '').trim();
  const select = { id: true, name: true, email: true, active: true, employee: { select: { id: true, metadata: true } } };
  const results = new Map();
  if (document && type) {
    // Documents live on the labor record, not on User. Keep its identity/history intact.
    const employees = await db.employee.findMany({ where: { tenant_id: tenantId, user_id: { not: null }, __includeInactive: true }, select: { id: true, metadata: true, user: { select: { id: true, name: true, email: true, active: true } } } });
    for (const employee of employees) {
      if (employee.user && documentKey(employee.metadata?.document) === document && documentKey(employee.metadata?.document_type) === type) {
        results.set(employee.user.id, { ...employee.user, employee: { id: employee.id, metadata: employee.metadata }, document_match: true });
      }
    }
  }
  if (q.length >= 2) {
    const users = await db.user.findMany({ where: { tenant_id: tenantId, __includeInactive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }, select, take: 30, orderBy: { id: 'asc' } });
    for (const user of users) if (!results.has(user.id)) results.set(user.id, user);
  }
  return [...results.values()].slice(0, 30).map(user => ({
    id: user.id, name: user.name, email: user.email, active: user.active,
    employee_id: user.employee?.id || null,
    document_match: user.document_match === true,
    available: !user.employee || String(user.employee.id) === String(query.employee_id || '')
  }));
}
module.exports = { selectEmployee, findEmployeeForUser, findUserForEmployee, listUserCandidates };
