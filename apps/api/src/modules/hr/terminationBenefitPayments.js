const { randomUUID } = require('node:crypto');
const types = { PRIMA_SERVICIOS: 'prima', CESANTIAS: 'cesantias', INTERESES_CESANTIAS: 'intereses_cesantias', VACACIONES: 'vacaciones' };
const money = value => Math.round((Number(value) || 0) * 100) / 100;

async function reverseTerminationBenefits(tx, tenantId, id) {
  await tx.$executeRaw`UPDATE th_prestaciones_pagos_documentos SET status = 'anulado', updated_at = now()
    WHERE tenant_id = ${tenantId} AND source_summary->>'termination_document_id' = ${String(id)} AND status <> 'anulado'`;
  const rows = await tx.$queryRaw`SELECT * FROM th_prestaciones_saldos WHERE tenant_id = ${tenantId}
    AND metadata->'termination_settlement'->>'document_id' = ${String(id)} ORDER BY id FOR UPDATE`;
  for (const row of rows) {
    const before = row.metadata.termination_settlement.before;
    const metadata = { ...row.metadata }; delete metadata.termination_settlement;
    await tx.$executeRaw`UPDATE th_prestaciones_saldos SET accrued_amount = ${Number(before.accrued_amount)}, paid_amount = ${Number(before.paid_amount)},
      balance_amount = ${Number(before.balance_amount)}, metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = now() WHERE tenant_id = ${tenantId} AND id = ${row.id}`;
  }
  // Retain zeroed rows referenced by annulled vouchers for traceability.
  await tx.$executeRaw`UPDATE th_prestaciones_saldos SET accrued_amount = 0, paid_amount = 0, balance_amount = 0, updated_at = now()
    WHERE tenant_id = ${tenantId} AND source_document_type = 'retiro' AND source_document_id = ${id}`;
}

async function settleTerminationBenefits(tx, tenantId, document, actorId) {
  const result = [];
  for (const [code, paymentType] of Object.entries(types)) {
    const concepts = document.lines.filter(line => line.source === 'retiro' && line.code === code);
    let remaining = money(concepts.reduce((sum, line) => sum + Number(line.amount), 0));
    const total = remaining;
    const balances = await tx.$queryRaw`SELECT * FROM th_prestaciones_saldos WHERE tenant_id = ${tenantId} AND employee_id = ${document.employee_id}
      AND concept_code = ${code} AND source_document_type = 'provision' AND date_start >= ${document.source_summary.fecha_ingreso}::date
      AND date_start <= ${document.termination_date}::date AND balance_amount > 0 ORDER BY date_start, id FOR UPDATE`;
    const allocations = [];
    for (const row of balances) {
      const applied = money(Math.min(remaining, Number(row.balance_amount)));
      const paid = money(Number(row.paid_amount) + applied);
      const metadata = { ...row.metadata, termination_settlement: { document_id: document.id, before: { accrued_amount: Number(row.accrued_amount), paid_amount: Number(row.paid_amount), balance_amount: Number(row.balance_amount) }, applied_amount: applied, reconciliation: money(Number(row.balance_amount) - applied) } };
      await tx.$executeRaw`UPDATE th_prestaciones_saldos SET accrued_amount = ${paid}, paid_amount = ${paid}, balance_amount = 0,
        metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = now() WHERE tenant_id = ${tenantId} AND id = ${row.id}`;
      if (applied > 0) allocations.push({ id: row.id, amount: applied });
      remaining = money(remaining - applied);
    }
    if (remaining > 0) {
      const rows = await tx.$queryRaw`INSERT INTO th_prestaciones_saldos (tenant_id, employee_id, concept_code, period_key, date_start, date_end, accrued_amount, paid_amount, balance_amount, source_document_type, source_document_id, metadata)
        VALUES (${tenantId}, ${document.employee_id}, ${code}, ${'retiro:' + document.id}, ${document.source_summary.fecha_ingreso}::date, ${document.termination_date}::date, ${remaining}, ${remaining}, 0, 'retiro', ${document.id}, ${JSON.stringify({ paid_in_termination: true })}::jsonb)
        ON CONFLICT (tenant_id, employee_id, concept_code, period_key) DO UPDATE SET accrued_amount = EXCLUDED.accrued_amount, paid_amount = EXCLUDED.paid_amount, balance_amount = 0, updated_at = now() RETURNING id`;
      allocations.push({ id: rows[0].id, amount: remaining });
    }
    if (!total) continue;
    const docs = await tx.$queryRaw`INSERT INTO th_prestaciones_pagos_documentos (tenant_id, payment_type, period_key, date_start, date_end, payment_date, status, total_amount, source_summary, created_by)
      VALUES (${tenantId}, ${paymentType}, ${'retiro:' + document.id + ':' + code + ':' + randomUUID()}, ${document.source_summary.fecha_ingreso}::date,
        ${document.termination_date}::date, ${document.termination_date}::date, 'draft', ${total}, ${JSON.stringify({ termination_document_id: document.id, employee_id: document.employee_id, payment_target: 'trabajador', included_in_termination_net: true, accrual_windows: concepts.map(line => line.metadata) })}::jsonb, ${actorId || null}) RETURNING id`;
    for (const allocation of allocations) {
      await tx.$executeRaw`INSERT INTO th_prestaciones_pagos_lineas (tenant_id, document_id, employee_id, benefit_balance_id, concept_code, amount, metadata)
        VALUES (${tenantId}, ${docs[0].id}, ${document.employee_id}, ${allocation.id}, ${code}, ${allocation.amount}, ${JSON.stringify({ payment_target: 'trabajador', included_in_termination_net: true, termination_document_id: document.id })}::jsonb)`;
    }
    result.push({ payment_type: paymentType, document_id: Number(docs[0].id), amount: total, payment_target: 'trabajador' });
  }
  return result;
}
module.exports = { settleTerminationBenefits, reverseTerminationBenefits };
