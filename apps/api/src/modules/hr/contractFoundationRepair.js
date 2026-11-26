const { contractCalendarKey } = require('./contractCalendarDate');

const fail = (message, code, statusCode = 409) => Object.assign(new Error(message), { statusCode, code });

// Explicit opt-in repair for the single initial contract affected by the former
// UTC-midnight conversion. Never re-dates amendments, rehires or used contracts.
function foundationRepairService(prisma) {
  return async function repair(tenantId, employeeId, input, user = {}) {
    return prisma.runWithTenant(tenantId, () => prisma.$transaction(async tx => {
      // Same lock as payroll/termination prevents a financial write during repair.
      const lock = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${tenantId}), 7418) AS acquired`;
      if (!lock[0]?.acquired) throw fail('Hay una operación de nómina en curso. Reintenta al finalizar.', 'REPARACION_CONTRATO_OCUPADA');
      const employees = await tx.$queryRaw`SELECT id, hire_date, active FROM "Employee" WHERE tenant_id=${tenantId} AND id=${Number(employeeId)} FOR UPDATE`;
      const employee = employees[0];
      if (!employee) throw fail('Empleado no encontrado.', 'EMPLEADO_NO_ENCONTRADO', 404);
      if (!employee.active) throw fail('El empleado no está activo.', 'REPARACION_CONTRATO_NO_APLICA');
      const contracts = await tx.$queryRaw`SELECT * FROM th_empleado_contratos WHERE tenant_id=${tenantId} AND employee_id=${Number(employeeId)} FOR UPDATE`;
      if (contracts.length !== 1) throw fail('La corrección requiere un único contrato inicial, sin otrosí ni recontratación.', 'REPARACION_CONTRATO_NO_APLICA');
      const contract = contracts[0];
      const target = contractCalendarKey(employee.hire_date);
      const current = contractCalendarKey(contract.valid_from);
      const expected = contractCalendarKey(input.expected_start);
      if (Number(contract.id) !== Number(input.contract_id) || target !== contractCalendarKey(input.expected_hire_date)) throw fail('La ficha o el contrato cambiaron. Vuelve a consultar.', 'REPARACION_CONTRATO_CONFLICTO');
      if (contract.status !== 'activo' || contract.reason !== 'ingreso' || contract.previous_contract_id || contract.termination_document_id || contract.metadata?.seeded_from_employee_master !== true) throw fail('Solo se corrige el contrato inicial generado desde el maestro.', 'REPARACION_CONTRATO_NO_APLICA');
      const marker = contract.metadata?.calendar_date_repair;
      if (current === target && marker?.from === expected && marker?.to === target) return { changed: false, employee_id: employee.id, contract_id: Number(contract.id), valid_from: target };
      if (current !== expected || new Date(`${target}T00:00:00Z`) - new Date(`${current}T00:00:00Z`) !== 86400000) throw fail('El contrato no presenta el desfase de un día esperado.', 'REPARACION_CONTRATO_NO_APLICA');
      const used = await tx.$queryRaw`
        SELECT EXISTS(SELECT 1 FROM "Payroll" WHERE tenant_id=${tenantId} AND employee_id=${Number(employeeId)})
        OR EXISTS(SELECT 1 FROM th_nomina_documentos WHERE tenant_id=${tenantId} AND employee_id=${Number(employeeId)})
        OR EXISTS(SELECT 1 FROM th_liquidaciones_trabajador WHERE tenant_id=${tenantId} AND employee_id=${Number(employeeId)})
        OR EXISTS(SELECT 1 FROM th_prestaciones_saldos WHERE tenant_id=${tenantId} AND employee_id=${Number(employeeId)})
        OR EXISTS(SELECT 1 FROM th_prestaciones_pagos_lineas WHERE tenant_id=${tenantId} AND employee_id=${Number(employeeId)})
        OR EXISTS(SELECT 1 FROM th_aportes_sociales_lineas WHERE tenant_id=${tenantId} AND employee_id=${Number(employeeId)}) AS used
      `;
      if (used[0]?.used) throw fail('El empleado tiene liquidaciones guardadas; requiere revisión antes de corregir el contrato.', 'REPARACION_CONTRATO_CON_MOVIMIENTOS');
      if (contract.valid_to && contractCalendarKey(contract.valid_to) < target) throw fail('La fecha final es anterior al ingreso.', 'REPARACION_CONTRATO_NO_APLICA');
      if (input.apply === true) {
        const audit = { from: current, to: target, actor_id: user.id || null, at: new Date().toISOString(), reason: 'UTC midnight calendar date correction' };
        await tx.$executeRaw`UPDATE th_empleado_contratos SET valid_from=${target}::date, metadata=metadata || ${JSON.stringify({ calendar_date_repair: audit })}::jsonb, updated_at=now() WHERE tenant_id=${tenantId} AND employee_id=${Number(employeeId)} AND id=${Number(contract.id)}`;
      }
      return { changed: input.apply === true, dry_run: input.apply !== true, employee_id: employee.id, contract_id: Number(contract.id), previous_start: current, valid_from: target };
    }, { isolationLevel: 'Serializable', timeout: 15000 }));
  };
}

module.exports = { foundationRepairService };
