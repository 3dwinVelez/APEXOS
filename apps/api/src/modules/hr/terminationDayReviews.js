const { classifications } = require('./dayReview');
const { fortnight } = require('./terminationManualAdjustments');
module.exports = function ({ db, context, build, error }) {
  async function list(tenantId, input) {
    const document = await build(tenantId, input);
    return { days: document.source_summary.revision_dias, summary: document.source_summary.resumen_salario_pendiente, pending_start: document.source_summary.pendientes_desde, classifications };
  }
  async function save(tenantId, input, actor) {
    const workDate = String(input.work_date || '');
    const decision = Object.hasOwn(classifications, input.classification) ? classifications[input.classification] : null;
    const note = String(input.note || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !Number.isFinite(Date.parse(workDate)) || new Date(workDate).toISOString().slice(0,10) !== workDate || !decision) throw error('Fecha o clasificacion invalida.',422,'REVISION_DIA_INVALIDA');
    if (note.length < 5 || note.length > 1000) throw error('Escribe una observacion de 5 a 1000 caracteres.',422,'REVISION_DIA_SIN_OBSERVACION');
    if (!/^[0-9a-f-]{36}$/i.test(input.request_id || '')) throw error('Identificador de solicitud invalido.',422,'REVISION_SOLICITUD_INVALIDA');
    return db.runWithTenant(tenantId, () => db.$transaction(async tx => {
      // Same lock as payroll and termination writes: a saved decision cannot race a final document.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), 7418)`;
      const info = await context(tenantId, input);
      if (workDate < info.pending_start || workDate > info.termination_date) throw error('El dia no pertenece al tramo pendiente del contrato.',422,'REVISION_DIA_FUERA_RETIRO');
      const responsible = await tx.user.findFirst({where:{id:Number(actor?.id),tenant_id:tenantId,active:true},select:{id:true,name:true}});
      if (!responsible) throw error('Responsable de revision invalido.',403,'REVISION_RESPONSABLE_INVALIDO');
      const current = await build(tenantId, input, tx);
      const day = current.source_summary.revision_dias.find(day => day.date === workDate);
      if (!day || day.status === 'soportado') throw error('El dia ya tiene jornada o novedad registrada. Corrige ese soporte en su modulo.',409,'REVISION_DIA_YA_SOPORTADO');
      const rows = await tx.$queryRaw`SELECT id,metadata FROM th_nomina_ajustes WHERE tenant_id=${tenantId} AND employee_id=${info.employee_id} AND adjustment_type='revision_dia' AND status='activo' AND metadata->>'work_date'=${workDate} ORDER BY id DESC LIMIT 1 FOR UPDATE`;
      const old = rows[0];
      if (old?.metadata?.request_id === input.request_id) {
        if (old.metadata.classification !== input.classification || old.metadata.note !== note) throw error('La solicitud ya se uso con otros datos.',409,'REVISION_SOLICITUD_CONFLICTO');
        return { adjustment: old, requires_recalculation: info.requires_recalculation };
      }
      const previous = old?.metadata || {};
      const history = [...(previous.history || []), ...(old ? [{classification:previous.classification,note:previous.note,actor_id:previous.actor_id,actor_name:previous.actor_name,reviewed_at:previous.reviewed_at}] : [])];
      const metadata = { source:'revision_salario_retiro',work_date:workDate,classification:input.classification,note,actor_id:responsible.id,actor_name:responsible.name,reviewed_at:new Date().toISOString(),request_id:input.request_id,history };
      const period = fortnight(workDate);
      const saved = old ? await tx.$queryRaw`UPDATE th_nomina_ajustes SET description=${note},metadata=${JSON.stringify(metadata)}::jsonb WHERE tenant_id=${tenantId} AND id=${old.id} RETURNING id,metadata`
        : await tx.$queryRaw`INSERT INTO th_nomina_ajustes (tenant_id,employee_id,period_key,adjustment_type,concept_code,description,minutes,amount,metadata,created_by) VALUES (${tenantId},${info.employee_id},${period.key},'revision_dia','REVISION_DIA',${note},0,0,${JSON.stringify(metadata)}::jsonb,${responsible.id}) RETURNING id,metadata`;
      return { adjustment:saved[0],requires_recalculation:info.requires_recalculation };
    }));
  }
  return { list, save };
};
