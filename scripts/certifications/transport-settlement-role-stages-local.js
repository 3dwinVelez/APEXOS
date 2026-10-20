// Invocado por la certificacion local de paquetes, despues de comprobar segregacion.
// Solo crea identidades sinteticas; no concede permisos a usuarios existentes.
module.exports = async function certifyRoleStages({ apiUrl, adminToken, login, packageId, runId, check }) {
  const db = require('../../apps/api/src/core/prisma');
  if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Solo base local');
  const actions = ['approve_settlements', 'account_settlements', 'liquidate_settlements'];
  const endpoints = ['decision', 'account', 'close'];
  const bodies = [{ decision: 'aprobada', comment: 'Aprobador sintetico independiente' }, { reference: `QA-RBAC-${runId}`, accounting_period: '2026-10', idempotency_key: `QA-RBAC-${runId}` }, { status: 'liquidada' }];
  async function call(token, route, method = 'GET', body) {
    const response = await fetch(`${apiUrl}/api/v1${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  const tenantId = login.user.tenant_id;
  const original = await db.user.findFirstOrThrow({ where: { id: login.user.id, tenant_id: tenantId } });
  const tokens = [];
  for (const [index, action] of [...actions, 'approve'].entries()) {
    const permissions = { transporte: { access: true, view: true, [action]: true } };
    const role = await call(adminToken, '/admin/roles', 'POST', { name: `QA etapas ${runId} ${index}`, role_type: 'custom', permissions });
    check(`role_${action}_saved`, role.status === 201 && role.body.raw_permissions.some(p => p.module === 'transport' && p.action === action));
    check(`role_${action}_no_implicit_stage_grants`, actions.every(a => Boolean(role.body.permissions.transporte[a]) === (a === action)) && role.body.raw_permissions.filter(p => actions.includes(p.action)).length === (index < 3 ? 1 : 0));
    const updated = await call(adminToken, `/admin/roles/${role.body.id}`, 'PUT', { name: role.body.name, role_type: 'custom', permissions });
    check(`role_${action}_round_trip`, updated.status === 200 && updated.body.permissions.transporte[action] === true);
    const email = `qa-stages-${runId}-${index}@apex.local`;
    await db.runWithTenant(tenantId, async () => await db.user.create({ data: { tenant_id: tenantId, name: 'QA etapas sintetico', email, password: original.password, role_id: role.body.id } }));
    const response = await fetch(`${apiUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: process.env.LOCAL_TMS_PASSWORD || 'test1234' }) });
    const session = await response.json();
    check(`role_${action}_real_login`, response.status === 200 && Boolean(session.token));
    tokens.push(session.token);
  }
  // Probar todas las denegaciones antes de avanzar estados: ningun fallo se debe al workflow.
  for (let user = 0; user < tokens.length; user++) {
    for (let stage = 0; stage < actions.length; stage++) {
      if (user === stage) continue;
      const denied = await call(tokens[user], `/transport/settlement-packages/${packageId}/${endpoints[stage]}`, 'POST', bodies[stage]);
      check(`stage_${stage}_denies_role_${user}`, denied.status === 403);
    }
  }
  for (let stage = 0; stage < actions.length; stage++) {
    const allowed = await call(tokens[stage], `/transport/settlement-packages/${packageId}/${endpoints[stage]}`, 'POST', bodies[stage]);
    check(`stage_${stage}_authorized_independent_actor`, allowed.status === 200 && allowed.body.status === ['aprobada', 'contabilizada', 'liquidada'][stage], { status: allowed.status, state: allowed.body.status });
  }
  // Desactivar identidades sinteticas al terminar; conservar roles y auditoria como evidencia local.
  await db.runWithTenant(tenantId, async () => await db.user.updateMany({ where: { tenant_id: tenantId, email: { startsWith: `qa-stages-${runId}-` } }, data: { active: false } }));
};
