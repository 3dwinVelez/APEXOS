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
  const email = emailKey(identity.email);
  if (!email) return null;
  const users = await db.user.findMany({ where: { tenant_id: tenantId, email: { equals: email, mode: "insensitive" }, __includeInactive: true }, include: { employee: true } });
  if (users.length > 1) conflict();
  const user = users[0];
  if (!user) return null;
  if (user.employee && user.employee.id !== employeeId) conflict();
  return user.id;
}
module.exports = { selectEmployee, findEmployeeForUser, findUserForEmployee };
