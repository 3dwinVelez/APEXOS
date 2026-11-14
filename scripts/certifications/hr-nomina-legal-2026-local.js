// Marcacion -> jornada -> nomina -> aportes -> cierre contra PostgreSQL local y API HTTP real.
// Sin mocks ni escrituras remotas. Certifica R-01..R-10A de la auditoria 2026-10-30.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('../load-env')();
if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Local database required');
Object.assign(process.env, { NODE_ENV: 'test', REDIS_DISABLED: 'true', DISABLE_REDIS: 'true', JWT_SECRET: randomUUID() + randomUUID() });
const db = require('../../apps/api/src/core/prisma');
const bcrypt = require('bcrypt');
const result = { status: 'running', environment: 'LOCAL', started_at: new Date().toISOString(), checks: [] };
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const SMMLV = 1750905;
const AUX = 249095;
const MONTH_KEY = 'mes:2026-09-01:2026-09-30';
const PERIOD = { fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30', period_type: 'mes', period_key: MONTH_KEY };
let app;
const close = (actual, expected, message) => assert.ok(Math.abs(Number(actual) - Number(expected)) < 0.05, `${message}: ${actual} != ${expected}`);
async function check(name, fn) { await fn(); result.checks.push(name); console.log('PASS ' + name); }
function punchTime(day, time) { return new Date(`${day}T${time}:00-05:00`); }
function dayDate(day) { return new Date(`${day}T05:00:00Z`); }

(async () => { try {
  const run = randomUUID(), password = 'Qa!9' + randomUUID(), hash = await bcrypt.hash(password, 10);
  async function account(label, permissions) {
    const tenant = await db.tenant.create({ data: { name: 'QA nomina legal ' + label + ' ' + run, active_modules: ['M-17', 'M-22'] } });
    const role = await db.role.create({ data: { tenant_id: tenant.id, name: 'QA Nomina', metadata: { role_type: 'admin_empresa' }, permissions: { create: permissions.map(([module, action]) => ({ module, action })) } } });
    const user = await db.user.create({ data: { tenant_id: tenant.id, name: 'QA Nomina ' + label, email: `nomina-legal-${label}-${run}@example.invalid`, password: hash, role_id: role.id } });
    return { tenant, role, user };
  }
  const permissions = [['payroll', 'read'], ['payroll', 'write'], ['hr', 'read'], ['hr', 'write'], ['admin', 'read']];
  const own = await account('own', permissions);
  const foreign = await account('foreign', permissions);
  const noRole = await db.role.create({ data: { tenant_id: own.tenant.id, name: 'Sin nomina' } });
  const denied = await db.user.create({ data: { tenant_id: own.tenant.id, name: 'QA Denied', email: `nomina-denied-${run}@example.invalid`, password: hash, role_id: noRole.id } });
  const tenantId = own.tenant.id;

  async function employee(label, salaryBase) {
    const user = await db.user.create({ data: { tenant_id: tenantId, name: 'QA Nomina ' + label, email: `nomina-employee-${label}-${run}@example.invalid`, password: hash, role_id: own.role.id } });
    return db.employee.create({ data: { tenant_id: tenantId, user_id: user.id, code: 'QA-' + label, position: 'Operario', department: 'QA', salary_base: salaryBase, contract_type: 'indefinido', hire_date: new Date('2026-01-01T05:00:00Z'), metadata: { name: 'QA Nomina ' + label, document: '900' + label, social_security: { arl_risk_class: 1 } } } });
  }
  const empSalary = await employee('Salario', 2000000);
  const empCap = await employee('Tope', 150000000);
  const empSinMarcacion = await employee('SinMarcacion', 2000000);
  const empFloor = await employee('Piso', 1400000);
  const foreignEmployee = await db.employee.create({ data: { tenant_id: foreign.tenant.id, user_id: foreign.user.id, code: 'QA-Foreign', position: 'Operario', department: 'QA', salary_base: 2000000, contract_type: 'indefinido', hire_date: new Date('2026-01-01T05:00:00Z'), metadata: { name: 'QA Nomina Foreign', document: '901', social_security: { arl_risk_class: 1 } } } });

  await db.workSchedule.create({ data: { tenant_id: tenantId, name: 'QA Oficina 08-17', start_time: '08:00', end_time: '17:00', lunch_start_time: '12:00', lunch_end_time: '13:00', workable_days: [1, 2, 3, 4, 5], active: true } });

  async function parameter(code, name, value, unit, metadata = {}, validFrom = '2026-01-01') {
    await db.$executeRaw`
      INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
      VALUES (${tenantId}, 'CO', ${code}, ${name}, ${value}, ${unit}, ${validFrom}::date, 100, 'Certificacion local nomina legal 2026', ${JSON.stringify(metadata)}::jsonb)
    `;
  }
  await parameter('SMMLV', 'Salario minimo mensual', SMMLV, 'currency');
  await parameter('AUX_TRANSPORTE', 'Auxilio de transporte', AUX, 'currency');
  await parameter('AUX_TRANSPORTE_TOPE_SMMLV', 'Tope auxilio en SMMLV', 2, 'smmlv');
  await parameter('IBC_TOPE_SMMLV', 'Tope del IBC en SMMLV', 25, 'smmlv');
  await parameter('IBC_CAPS_FLOORS', 'Topes y pisos de IBC', null, 'json', { salud: {}, pension: {}, arl: {} });
  await parameter('HORAS_MENSUALES_ORDINARIAS', 'Divisor hora ordinaria', 220, 'hour');
  await parameter('HORAS_MENSUALES_ORDINARIAS', 'Divisor hora ordinaria', 210, 'hour', {}, '2026-07-15');
  await parameter('JORNADA_NOCTURNA_INICIO', 'Inicio jornada nocturna', 19, 'hour', { legal_group: 'jornada' });
  await parameter('MAX_HE_DIARIO', 'Maximo horas extra por dia', 2, 'hour', { legal_group: 'trabajo_suplementario', control: 'alerta_trazada' });
  await parameter('MAX_HE_SEMANAL', 'Maximo horas extra por semana', 12, 'hour', { legal_group: 'trabajo_suplementario', control: 'alerta_trazada' });
  const deduction = { category: 'deduction', legal_group: 'seguridad_social' };
  await parameter('DED_SALUD', 'Deduccion salud empleado', 4, 'percent', deduction);
  await parameter('DED_PENSION', 'Deduccion pension empleado', 4, 'percent', deduction);
  await parameter('DED_FONDO_SOLIDARIDAD_PENSIONAL', 'Fondo de solidaridad pensional', 0, 'percent', deduction);
  const surcharges = [
    ['RECARGO_NOCTURNO', 'Recargo nocturno ordinario', 'porcentaje_adicional', 35, 1.35, '2026-01-01', null],
    ['HED', 'Hora extra diurna', 'factor_total', 25, 1.25, '2026-01-01', null],
    ['HEN', 'Hora extra nocturna', 'factor_total', 75, 1.75, '2026-01-01', null],
    ['DOM_FEST_DIURNO', 'Trabajo ordinario dominical/festivo diurno', 'porcentaje_adicional', 80, 1.8, '2026-01-01', '2026-06-30'],
    ['DOM_FEST_NOCTURNO', 'Trabajo ordinario dominical/festivo nocturno', 'porcentaje_adicional', 115, 2.15, '2026-01-01', '2026-06-30'],
    ['HEDD', 'Hora extra diurna dominical/festiva', 'factor_total', 105, 2.05, '2026-01-01', '2026-06-30'],
    ['HEND', 'Hora extra nocturna dominical/festiva', 'factor_total', 155, 2.55, '2026-01-01', '2026-06-30'],
    ['DOM_FEST_DIURNO', 'Trabajo ordinario dominical/festivo diurno', 'porcentaje_adicional', 90, 1.9, '2026-07-01', null],
    ['DOM_FEST_NOCTURNO', 'Trabajo ordinario dominical/festivo nocturno', 'porcentaje_adicional', 125, 2.25, '2026-07-01', null],
    ['HEDD', 'Hora extra diurna dominical/festiva', 'factor_total', 115, 2.15, '2026-07-01', null],
    ['HEND', 'Hora extra nocturna dominical/festiva', 'factor_total', 165, 2.65, '2026-07-01', null]
  ];
  for (const [code, name, valueType, percent, factor, validFrom, validTo] of surcharges) {
    await db.$executeRaw`
      INSERT INTO th_conceptos_recargo (tenant_id, country, code, name, value_type, percent, factor, valid_from, valid_to, priority, source_note)
      VALUES (${tenantId}, 'CO', ${code}, ${name}, ${valueType}, ${percent}, ${factor}, ${validFrom}::date, ${validTo}::date, 100, 'Certificacion local nomina legal 2026')
    `;
  }
  await db.$executeRaw`
    INSERT INTO th_libranza_conceptos (tenant_id, code, name, active, metadata)
    VALUES (${tenantId}, 'LIBRANZA_QA', 'Libranza QA cooperativa', true, '{}'::jsonb)
  `;
  const libranzaConcept = (await db.$queryRaw`SELECT id FROM th_libranza_conceptos WHERE tenant_id = ${tenantId} AND code = 'LIBRANZA_QA'`)[0];

  async function punch(employeeId, name, day, time, type) {
    await db.timePunch.create({ data: { tenant_id: tenantId, employee_id: employeeId, user_name: name, type, time, date: dayDate(day), punched_at: punchTime(day, time) } });
  }
  const plan = {
    '2026-09-01': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['08:00', 'entrada'], ['12:00', 'inicio_almuerzo'], ['13:00', 'fin_almuerzo'], ['17:00', 'salida']] },
    '2026-09-02': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['08:00', 'entrada'], ['12:00', 'inicio_almuerzo'], ['13:00', 'fin_almuerzo'], ['17:00', 'salida']] },
    '2026-09-03': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['08:00', 'entrada'], ['12:00', 'inicio_almuerzo'], ['13:00', 'fin_almuerzo'], ['17:00', 'salida']] },
    '2026-09-04': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['08:00', 'entrada'], ['12:00', 'inicio_almuerzo'], ['13:00', 'fin_almuerzo'], ['17:00', 'salida']] },
    // Domingo: 8 h ordinarias (2 nocturnas) + 1 h extra nocturna -> HEND y DOM_FEST_*
    '2026-09-06': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['12:00', 'entrada'], ['16:00', 'inicio_almuerzo'], ['17:00', 'fin_almuerzo'], ['22:00', 'salida']] },
    // Lunes: 8 h ordinarias (2 nocturnas) + 1 h extra nocturna -> RECARGO_NOCTURNO y HEN
    '2026-09-07': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['12:00', 'entrada'], ['17:00', 'inicio_almuerzo'], ['18:00', 'fin_almuerzo'], ['22:00', 'salida']] },
    // Martes: 8 h ordinarias + 4 h extra (2 diurnas + 2 nocturnas) -> TOPES excedidos
    '2026-09-08': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['08:00', 'entrada'], ['12:00', 'inicio_almuerzo'], ['13:00', 'fin_almuerzo'], ['21:00', 'salida']] },
    '2026-09-09': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['08:00', 'entrada'], ['12:00', 'inicio_almuerzo'], ['13:00', 'fin_almuerzo'], ['17:00', 'salida']] },
    // Domingo: 8 h ordinarias + 1 h extra diurna -> HEDD
    '2026-09-13': { name: 'QA Nomina Salario', id: empSalary.id, punches: [['08:00', 'entrada'], ['12:00', 'inicio_almuerzo'], ['13:00', 'fin_almuerzo'], ['18:00', 'salida']] }
  };
  const salaryPunchDays = Object.keys(plan);
  for (const [day, entry] of Object.entries(plan)) for (const [time, type] of entry.punches) await punch(entry.id, entry.name, day, time, type);
  // El empleado del tope y el del piso replican las mismas marcaciones; el tercero queda sin marcas.
  for (const employeeId of [empCap.id, empFloor.id]) for (const [day, entry] of Object.entries(plan)) for (const [time, type] of entry.punches) {
    if (employeeId === empFloor.id && day !== '2026-09-01') continue;
    await punch(employeeId, employeeId === empCap.id ? 'QA Nomina Tope' : 'QA Nomina Piso', day, time, type);
  }
  await punch(foreignEmployee.id, 'QA Nomina Foreign', '2026-09-01', '08:00', 'entrada');
  await punch(foreignEmployee.id, 'QA Nomina Foreign', '2026-09-01', '12:00', 'inicio_almuerzo');
  await punch(foreignEmployee.id, 'QA Nomina Foreign', '2026-09-01', '13:00', 'fin_almuerzo');
  await punch(foreignEmployee.id, 'QA Nomina Foreign', '2026-09-01', '17:00', 'salida');

  app = await require('../../apps/api/server')();
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  async function call(route, token, method = 'GET', body) {
    const response = await fetch(origin + '/api/v1' + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  async function login(user) { const response = await call('/auth/login', null, 'POST', { email: user.email, password }); assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.token; }
  const token = await login(own.user), foreignToken = await login(foreign.user), deniedToken = await login(denied);

  await check('R-01: la marcacion 19:00-22:00 se clasifica nocturna y la jornada se persiste', async () => {
    const processed = await call('/hr/workdays/process', token, 'POST', { date: '2026-09-07' });
    assert.equal(processed.status, 200, JSON.stringify(processed.body));
    const row = processed.body.data.find(day => day.employee_id === empSalary.id);
    assert.equal(row.ordinary_night_minutes, 120, 'las 2 h ordinarias de 19:00 a 21:00 son nocturnas');
    assert.equal(row.overtime_night_minutes, 60, 'la hora extra de 21:00 a 22:00 es nocturna');
    const stored = await db.processedWorkday.findFirst({ where: { tenant_id: tenantId, employee_id: empSalary.id, date: dayDate('2026-09-07') } });
    assert.equal(stored.ordinary_night_minutes, 120);
    const second = await call('/hr/workdays/process', token, 'POST', { date: '2026-09-08' });
    const overtime = second.body.data.find(day => day.employee_id === empSalary.id);
    assert.equal(overtime.overtime_day_minutes, 120);
    assert.equal(overtime.overtime_night_minutes, 120);
  });

  let salaryRow, capRow, floorRow;
  await check('R-02/R-03/R-07: recargos 2026-H2, divisor 210 y auxilio fuera de la base de prestaciones', async () => {
    const preview = await call('/talento-humano/nomina/preview', token, 'POST', PERIOD);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    salaryRow = preview.body.documents.find(row => row.employee_id === empSalary.id);
    capRow = preview.body.documents.find(row => row.employee_id === empCap.id);
    floorRow = preview.body.documents.find(row => row.employee_id === empFloor.id);
    assert.equal(salaryRow.days_worked, 9);
    const line = code => salaryRow.lines.find(item => item.code === code);
    const hourly = 2000000 / 210;
    close(line('SALARIO_BASICO').amount, 600000, 'salario de 9 dias con divisor 210');
    close(line('RECARGO_NOCTURNO').amount, 2 * hourly * 0.35, 'recargo nocturno al 35%');
    close(line('HED').amount, 2 * hourly * 1.25, 'HED al 125%');
    close(line('HEN').amount, 3 * hourly * 1.75, 'HEN al 175%');
    close(line('HEDD').amount, 1 * hourly * 2.15, 'HEDD 2026-H2 al 215%');
    close(line('HEND').amount, 1 * hourly * 2.65, 'HEND 2026-H2 al 265%');
    close(line('DOM_FEST_DIURNO').amount, 14 * hourly * 0.9, 'dominical diurno al 90%');
    close(line('DOM_FEST_NOCTURNO').amount, 2 * hourly * 1.25, 'dominical nocturno al 125%');
    close(line('AUX_TRANSPORTE').amount, AUX / 30 * 9, 'auxilio prorrateado por 9 dias');
    close(salaryRow.gross, 600000 + 270000 + AUX / 30 * 9, 'devengo total');
    close(salaryRow.source_summary.base_prestaciones_sociales, 2900000, 'base de prestaciones sin auxilio');
    close(salaryRow.source_summary.base_vacaciones, 2900000, 'base de vacaciones sin auxilio');
    close(salaryRow.source_summary.auxilio_transporte.valor_periodo, AUX / 30 * 9, 'auxilio reportado');
    assert.equal(salaryRow.source_summary.auxilio_transporte.aplica, true);
    close(salaryRow.lines.find(item => item.code === 'DED_SALUD').amount, -34800, '4% de salud sobre 870.000');
    close(salaryRow.lines.find(item => item.code === 'DED_PENSION').amount, -34800, '4% de pension sobre 870.000');
    close(salaryRow.source_summary.ibc, 870000, 'IBC del periodo sin auxilio');
  });

  await check('R-04: tope de 25 SMMLV y piso de 1 SMMLV en la nomina', async () => {
    assert.ok(capRow.source_summary.ibc_sin_topes > capRow.source_summary.ibc, 'el tope reduce el IBC de la nomina');
    close(capRow.source_summary.ibc_subsistemas.salud, SMMLV * 25, 'tope mensual de 25 SMMLV');
    assert.equal(capRow.source_summary.ibc_reglas.aplicado, true);
    close(floorRow.source_summary.ibc_subsistemas.salud, SMMLV / 30, 'piso de 1 SMMLV por un dia');
    assert.ok(floorRow.source_summary.ibc > floorRow.source_summary.ibc_sin_topes, 'el piso eleva el IBC');
  });

  await check('R-10A: el tope de trabajo suplementario queda alertado y trazado', async () => {
    const trace = salaryRow.source_summary.topes_trabajo_suplementario;
    assert.equal(trace.excedido, true);
    assert.equal(trace.modo, 'alerta');
    assert.equal(trace.tope_diario_horas, 2);
    assert.equal(trace.tope_semanal_horas, 12);
    assert.ok(trace.dias_excedidos.some(day => day.date === '2026-09-08' && day.horas === 4), JSON.stringify(trace));
    const validation = await call('/talento-humano/nomina/validar', token, 'POST', PERIOD);
    assert.equal(validation.status, 200);
    assert.ok(validation.body.issues.some(issue => issue.code === 'TOPES_TRABAJO_SUPLEMENTARIO' && issue.severity === 'warning'));
    assert.ok(!validation.body.issues.some(issue => issue.code === 'TOPES_TRABAJO_SUPLEMENTARIO' && issue.severity === 'error'), 'el tope alerta, no bloquea');
  });

  await check('R-07: sin marcaciones la validacion bloquea y la justificacion trazable lo degrada', async () => {
    const withoutPunches = { ...PERIOD, employee_id: empSinMarcacion.id };
    const blocked = await call('/talento-humano/nomina/validar', token, 'POST', withoutPunches);
    assert.equal(blocked.body.ok, false);
    assert.ok(blocked.body.issues.some(issue => issue.code === 'SIN_MARCACIONES' && issue.severity === 'error'));
    const justified = await call('/talento-humano/nomina/validar', token, 'POST', { ...withoutPunches, justificacion_sin_marcaciones: 'Personal de direccion con salario fijo sin marcacion.' });
    assert.equal(justified.body.ok, true);
    assert.ok(justified.body.issues.some(issue => issue.code === 'SIN_MARCACIONES_JUSTIFICADA' && issue.severity === 'warning'));
    const rejected = await call('/talento-humano/nomina/liquidaciones', token, 'POST', withoutPunches);
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.code, 'SIN_MARCACIONES');
    const preview = await call('/talento-humano/nomina/preview', token, 'POST', withoutPunches);
    const row = preview.body.documents.find(document => document.employee_id === empSinMarcacion.id);
    assert.equal(row.gross, 0);
    assert.equal(row.source_summary.base_prestaciones_sociales, 0);
    assert.ok(!row.lines.some(item => item.code === 'AUX_TRANSPORTE'));
  });

  await check('R-06: la libranza se descuenta una sola vez al relicitar', async () => {
    const created = await call('/hr/payroll/employee-libranzas', token, 'POST', { employee_id: empSalary.id, concept_id: libranzaConcept.id, description: 'Libranza QA', frequency: 'mes', mode: 'cuotas', original_amount: 1000000, installments_total: 5, installment_amount: 200000, start_date: '2026-09-01' });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    await db.employee.update({ where: { id: empSinMarcacion.id }, data: { active: false } });
    const first = await call('/talento-humano/nomina/liquidaciones', token, 'POST', PERIOD);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.documents, 3);
    const second = await call('/talento-humano/nomina/liquidaciones', token, 'POST', { ...PERIOD, recalculate: true });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const movements = await db.$queryRaw`SELECT COUNT(*)::int AS total, COALESCE(SUM(amount), 0) AS amount FROM th_libranza_movimientos WHERE tenant_id = ${tenantId} AND status = 'aplicado'`;
    assert.equal(movements[0].total, 1, 'una sola aplicacion para el periodo');
    close(movements[0].amount, 200000, 'una sola cuota aplicada');
    const listed = await call(`/hr/payroll/employee-libranzas?employee_id=${empSalary.id}`, token);
    close(listed.body[0].balance_amount, 800000, 'saldo descontado una vez');
    const documents = await call(`/talento-humano/nomina/liquidaciones?period_key=${encodeURIComponent(MONTH_KEY)}`, token);
    const document = documents.body.find(row => row.employee_id === empSalary.id);
    close(Math.abs(document.lines.find(item => item.source === 'libranza').amount), 200000, 'linea de libranza unica');
  });

  await check('R-09/R-08: una sola via oficial de liquidacion con documentos auditables', async () => {
    const legacy = await call('/hr/payroll/process', token, 'POST', PERIOD);
    assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
    const documents = await db.$queryRaw`SELECT COUNT(*)::int AS total FROM th_nomina_documentos WHERE tenant_id = ${tenantId} AND period_key = ${MONTH_KEY}`;
    assert.equal(documents[0].total, 3);
    const mirrors = await db.payroll.count({ where: { tenant_id: tenantId, period: MONTH_KEY } });
    assert.equal(mirrors, 3);
    const termination = await call('/hr/payroll/terminations/preview', token, 'POST', { employee_id: empSalary.id, termination_date: '2026-09-30', termination_reason: 'renuncia' });
    assert.equal(termination.status, 200, JSON.stringify(termination.body));
    const summary = termination.body.document?.source_summary || termination.body.source_summary || {};
    assert.ok(termination.body.document?.smmlv_referencia_indemnizacion || summary.smmlv_referencia_indemnizacion || termination.body.smmlv_referencia_indemnizacion, 'la indemnizacion declara el SMMLV de referencia');
  });

  await check('R-05: el cierre provisiona prestaciones reales y conserva la secuencia', async () => {
    const validation = await call('/hr/payroll/period-closures/validate', token, 'POST', PERIOD);
    assert.equal(validation.status, 200);
    assert.equal(validation.body.ok, true, JSON.stringify(validation.body.issues));
    const closed = await call('/hr/payroll/period-closures/close', token, 'POST', PERIOD);
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    const closure = closed.body.closure;
    assert.ok(Number(closure.total_provisions) > 0, 'el cierre causa provisiones');
    assert.equal(closure.status, 'cerrado');
    const steps = closure.source_summary.steps;
    assert.deepEqual(steps, ['validacion', 'nomina', 'provisiones', 'aportes_sociales', 'cierre']);
    close(closure.source_summary.social_benefit_provisions.total_provisions, closure.total_provisions, 'el total provisionado se reporta');
    const balances = await db.$queryRaw`SELECT concept_code, COUNT(*)::int AS total FROM th_prestaciones_saldos WHERE tenant_id = ${tenantId} GROUP BY concept_code ORDER BY concept_code`;
    assert.equal(balances.length, 4, JSON.stringify(balances));
    assert.ok(balances.every(row => row.total === 3), JSON.stringify(balances));
    const movements = await db.$queryRaw`SELECT COUNT(*)::int AS total FROM th_libranza_movimientos WHERE tenant_id = ${tenantId} AND status = 'aplicado'`;
    assert.equal(movements[0].total, 1, 'el cierre reliquida sin duplicar la libranza');
  });

  await check('R-04: aportes aplican tope y piso y rechazan el salario como respaldo', async () => {
    const preview = await call('/hr/payroll/social-contributions/preview', token, 'POST', PERIOD);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const document = preview.body.document;
    const byEmployee = id => document.employees.find(row => row.employee_id === id);
    close(byEmployee(empSalary.id).ibc, 870000, 'IBC de nomina sin auxilio');
    close(byEmployee(empCap.id).ibc, SMMLV * 25, 'aporte tope de 25 SMMLV');
    close(byEmployee(empFloor.id).ibc, SMMLV / 30, 'aporte con piso de 1 SMMLV');
    const missing = await call('/hr/payroll/social-contributions/preview', token, 'POST', { fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', period_type: 'mes' });
    assert.equal(missing.status, 409);
    assert.equal(missing.body.code, 'IBC_REPORTADO_REQUERIDO');
  });

  await check('R-10: el reporte lee las jornadas que liquida la nomina', async () => {
    const workdays = await call('/hr/workdays?fecha_inicio=2026-09-01&fecha_fin=2026-09-30', token);
    assert.equal(workdays.status, 200, JSON.stringify(workdays.body));
    const mine = workdays.body.filter(row => row.employee_id === empSalary.id);
    assert.equal(mine.length, 9);
    const overtime = mine.reduce((sum, row) => sum + Number(row.overtime_day_minutes || 0) + Number(row.overtime_night_minutes || 0) + Number(row.overtime_sunday_holiday_day_minutes || 0) + Number(row.overtime_sunday_holiday_night_minutes || 0), 0);
    assert.equal(overtime, 420, '7 horas extra en las jornadas');
    const documents = await call(`/talento-humano/nomina/liquidaciones?period_key=${encodeURIComponent(MONTH_KEY)}`, token);
    const document = documents.body.find(row => row.employee_id === empSalary.id);
    const extraHours = ['HED', 'HEN', 'HEDD', 'HEND'].reduce((sum, code) => sum + Number(document.lines.find(item => item.code === code)?.quantity || 0), 0);
    close(extraHours, 7, 'la nomina liquida las mismas 7 horas extra que reportan las jornadas');
    close(document.source_summary.overtime_hrs, 25, 'extras y recargos: 7 h extra mas 18 h ordinarias con recargo');
    const report = await call('/talento-humano/nomina/reportes/conceptos?fecha_inicio=2026-09-01&fecha_fin=2026-09-30', token);
    assert.equal(report.status, 200, JSON.stringify(report.body));
  });

  await check('RBAC y aislamiento: sin token 401, sin permiso 403 y otro tenant no ve la nomina', async () => {
    assert.equal((await call('/talento-humano/nomina/preview', null, 'POST', PERIOD)).status, 401);
    assert.equal((await call('/talento-humano/nomina/preview', deniedToken, 'POST', PERIOD)).status, 403);
    const other = await call('/talento-humano/nomina/preview', foreignToken, 'POST', PERIOD);
    assert.equal(other.status, 200);
    assert.ok(other.body.documents.every(row => row.employee_id !== empSalary.id));
    assert.ok(other.body.documents.every(row => row.employee_id === foreignEmployee.id || row.days_worked === 0));
    const documents = await db.$queryRaw`SELECT COUNT(*)::int AS total FROM th_nomina_documentos WHERE tenant_id = ${tenantId}`;
    assert.equal(documents[0].total, 3);
  });

  result.tenant_id = tenantId;
  result.period_key = MONTH_KEY;
  result.status = 'passed';
} catch (error) {
  result.status = 'failed';
  result.error = error.message;
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  result.finished_at = new Date().toISOString();
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  if (app) await app.close();
  await db.$disconnect();
  process.exit(process.exitCode || 0);
} })();
