const classifications = {
  trabajado_sin_marcacion: { label: 'Trabajado sin marcación', paid: true },
  induccion: { label: 'Inducción', paid: true },
  descanso: { label: 'Descanso remunerado', paid: true },
  permiso_remunerado: { label: 'Permiso remunerado', paid: true },
  ausencia_no_remunerada: { label: 'Ausencia no remunerada', paid: false }
};
const iso = value => new Date(value).toISOString().slice(0, 10);
function reviewDays({ start, end, hire, covered = new Set(), unpaid = new Set(), adjustments = [] }) {
  const from = [iso(start), iso(hire || start)].sort().at(-1), to = iso(end);
  const reviews = new Map(adjustments.filter(row => row.adjustment_type === 'revision_dia').map(row => [row.metadata?.work_date, row]));
  const result = [];
  for (let cursor = new Date(from+'T12:00:00Z'); iso(cursor) <= to; cursor.setUTCDate(cursor.getUTCDate()+1)) {
    if (result.length >= 3700) throw Object.assign(new Error('Rango de revisión demasiado amplio.'), { statusCode: 422 });
    const date = iso(cursor), row = reviews.get(date), metadata = row?.metadata || {};
    const known = covered.has(date) || unpaid.has(date), decision = Object.hasOwn(classifications, metadata.classification) ? classifications[metadata.classification] : null;
    result.push({ date, status: known ? 'soportado' : decision ? 'justificado' : 'pendiente', paid: known ? !unpaid.has(date) : decision?.paid || false,
      classification: known ? (unpaid.has(date) ? 'novedad_no_remunerada' : 'jornada_registrada') : metadata.classification || '',
      note: metadata.note || '', actor_id: metadata.actor_id || row?.created_by || null, actor_name: metadata.actor_name || '', reviewed_at: metadata.reviewed_at || null, adjustment_id: row?.id || null });
  }
  return result;
}
module.exports = { classifications, reviewDays };
