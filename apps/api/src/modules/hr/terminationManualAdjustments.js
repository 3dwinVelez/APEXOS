const builtins = {
  BONIFICACION_SALARIAL: { name: 'Bonificación salarial', salary_constitutive: true },
  BONIFICACION_NO_SALARIAL: { name: 'Bonificación no salarial', salary_constitutive: false }
};
const excluded = new Set(['SALARIO_BASICO', 'SALARIO_PENDIENTE', 'JORNADA_ORDINARIA', 'PRIMA_SERVICIOS', 'CESANTIAS', 'INTERESES_CESANTIAS', 'VACACIONES', 'VACACIONES_DISFRUTADAS', 'VACACIONES_COMPENSADAS', 'AUX_TRANSPORTE']);
function fortnight(value) {
  const date = new Date(value + 'T12:00:00Z'), year = date.getUTCFullYear(), month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, date.getUTCDate() <= 15 ? 1 : 16)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, date.getUTCDate() <= 15 ? month : month + 1, date.getUTCDate() <= 15 ? 15 : 0)).toISOString().slice(0, 10);
  return { start, end, key: `quincena:${start}:${end}` };
}
module.exports = function ({ db, conceptsFor, create, remove, error }) {
  const date = value => {
    const text = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) throw error('Fecha invalida.', 422, 'FECHA_AJUSTE_RETIRO_INVALIDA');
    return text;
  };
  const keyOf = value => new Date(value).toISOString().slice(0, 10);
  async function context(tenantId, input) {
    const employeeId = Number(input.employee_id), cut = date(input.termination_date);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw error('Empleado invalido.', 422, 'EMPLEADO_INVALIDO');
    return db.runWithTenant(tenantId, async () => {
      const employee = await db.employee.findFirst({ where: { tenant_id: tenantId, id: employeeId } });
      if (!employee) throw error('Empleado no encontrado.', 404, 'EMPLEADO_NO_ENCONTRADO');
      const contracts = await db.$queryRaw`SELECT valid_from FROM th_empleado_contratos WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} AND valid_from <= ${cut}::date ORDER BY valid_from DESC,id DESC LIMIT 1`;
      const hire = keyOf(contracts[0]?.valid_from || employee.hire_date || employee.created_at);
      const payrolls = await db.$queryRaw`SELECT date_start,date_end FROM th_nomina_documentos WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} AND date_end >= ${hire}::date ORDER BY date_end DESC LIMIT 1`;
      const latest = payrolls[0]?.date_end;
      if (latest && keyOf(latest) > cut) throw error('Hay una nomina posterior al corte. Revisala antes de agregar ajustes al retiro.', 409, 'NOMINA_POSTERIOR_RETIRO');
      const afterPayroll = latest ? keyOf(new Date(new Date(latest).getTime() + 86400000)) : hire;
      const start = input.pending_start ? date(input.pending_start) : afterPayroll;
      if (start < hire || start < afterPayroll) throw error('El ajuste debe pertenecer al tramo pendiente, sin nominas ya liquidadas.', 409, 'AJUSTE_RETIRO_PERIODO_PAGADO');
      if (start !== afterPayroll) throw error('El inicio pendiente se calcula desde el contrato y las nominas registradas.', 422, 'INICIO_PENDIENTE_REQUIERE_SOPORTE');
      const existing = await db.$queryRaw`SELECT id FROM th_liquidaciones_trabajador WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} AND termination_date = ${cut}::date LIMIT 1`;
      return { employee_id: employeeId, pending_start: start, termination_date: cut, requires_recalculation: existing.length > 0 };
    });
  }
  async function catalog(tenantId, effectiveDate) {
    const configured = await conceptsFor(tenantId, new Date(effectiveDate + 'T05:00:00Z'));
    const all = { ...Object.fromEntries(Object.entries(builtins).map(([code, value]) => [code, { code, ...value, concept_type: 'devengo', default_operation: 'manual' }])), ...configured };
    return Object.entries(all).filter(([code, item]) => !excluded.has(code) && item.concept_type === 'devengo' && item.default_operation !== 'automatico' && item.default_operation !== 'automatic' && !['prestaciones_sociales', 'indemnizacion'].includes(item.metadata?.legal_group)).map(([code, item]) => ({ code, name: item.name, salary_constitutive: item.salary_constitutive !== false }));
  }
  async function list(tenantId, input) {
    const info = await context(tenantId, input);
    const workDate = input.work_date ? date(input.work_date) : info.termination_date;
    const concepts = await catalog(tenantId, fortnight(workDate).start);
    const rows = await db.$queryRaw`SELECT id, employee_id, period_key, concept_code, description, amount, adjustment_type, metadata
      FROM th_nomina_ajustes WHERE tenant_id = ${tenantId} AND employee_id = ${info.employee_id} AND status = 'activo'
        AND adjustment_type IN ('manual','bonificacion','comision') ORDER BY created_at DESC,id DESC LIMIT 500`;
    const adjustments = rows.filter(row => {
      const workDate = row.metadata?.work_date || row.metadata?.date_start;
      const [type, from, to] = row.period_key.split(':');
      return workDate ? workDate >= info.pending_start && workDate <= info.termination_date : type === 'quincena' && from <= info.termination_date && to >= info.pending_start;
    });
    return { ...info, concepts, adjustments };
  }
  async function add(tenantId, input, actor) {
    const info = await context(tenantId, input), workDate = date(input.work_date);
    if (workDate < info.pending_start || workDate > info.termination_date) throw error('La fecha debe estar entre el inicio pendiente y el retiro.', 422, 'AJUSTE_FUERA_RETIRO');
    const period = fortnight(workDate), concepts = await catalog(tenantId, period.start);
    const concept = concepts.find(row => row.code === input.concept_code);
    if (!concept) throw error('Escoge un devengo manual vigente del maestro.', 422, 'CONCEPTO_MANUAL_RETIRO_INVALIDO');
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) throw error('El valor debe ser positivo, con maximo dos decimales.', 422, 'VALOR_MANUAL_RETIRO_INVALIDO');
    if (!/^[0-9a-f-]{36}$/i.test(input.request_id || '')) throw error('Identificador de solicitud invalido.', 422, 'SOLICITUD_MANUAL_RETIRO_INVALIDA');
    const adjustment = await create(tenantId, { employee_id: info.employee_id, period_key: period.key, concept_code: concept.code, adjustment_type: 'manual', amount, description: String(input.description || concept.name).trim().slice(0, 500), date_start: workDate, date_end: workDate,
      metadata: { source: 'liquidacion_trabajador', work_date: workDate, termination_date: info.termination_date, request_id: input.request_id } }, actor);
    return { adjustment, requires_recalculation: info.requires_recalculation };
  }
  async function cancel(tenantId, id, input) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw error('Ajuste invalido.', 422, 'AJUSTE_NOMINA_INVALIDO');
    const info = await context(tenantId, input);
    const rows = await db.$queryRaw`SELECT * FROM th_nomina_ajustes WHERE tenant_id = ${tenantId} AND employee_id = ${info.employee_id} AND id = ${Number(id)} AND status = 'activo' LIMIT 1`;
    const row = rows[0], workDate = row?.metadata?.work_date || row?.metadata?.date_start;
    if (!row || !['manual','bonificacion','comision'].includes(row.adjustment_type)) throw error('Ajuste manual no encontrado.', 404, 'AJUSTE_NOMINA_NO_ENCONTRADO');
    if (!workDate || workDate < info.pending_start || workDate > info.termination_date) throw error('Este ajuste no pertenece al tramo pendiente del retiro.', 409, 'AJUSTE_FUERA_RETIRO');
    return remove(tenantId, id);
  }
  return { list, add, cancel, context };
};
module.exports.fortnight = fortnight;
