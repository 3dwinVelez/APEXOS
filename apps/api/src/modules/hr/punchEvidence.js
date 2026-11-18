// Canonical photo reader for TimePunch. Pure JS: used by the API and web adapter.
// Un item puede llegar sin bytes y solo con `storage_path`: es la referencia que deja
// la purga del rescate o el almacen nuevo. Se emite igual para que la pantalla la pida
// por id a `getMonitorEvidence`; aqui solo se lee, nunca se baja el objeto.
function punchPhotoItems(row = {}) {
  const metadata = row.metadata || {};
  const candidates = [metadata.identity_photo, row.extra_evidence, metadata.extra_evidence,
    metadata.photo ? { base64_data: metadata.photo, file_name: metadata.photo_name } : null];
  const items = [];
  const seen = new Set();
  for (const candidate of candidates.flat()) {
    if (!candidate || typeof candidate !== 'object') continue;
    let base64 = String(candidate.base64_data || '').trim() || String(candidate.base64 || '').trim();
    const fileUrl = String(candidate.file_url || candidate.url || '').trim();
    const storagePath = String(candidate.storage_path || '').trim();
    if (!base64 && !fileUrl) {
      if (!storagePath) continue;
      const refKey = `storage:${storagePath}`;
      if (seen.has(refKey)) continue;
      seen.add(refKey);
      items.push({
        file_name: String(candidate.file_name || candidate.name || 'evidencia.jpg'),
        ...(candidate.mime_type || candidate.type ? { mime_type: String(candidate.mime_type || candidate.type).toLowerCase() } : {}),
        storage_path: storagePath
      });
      continue;
    }
    const mime = String(base64.match(/^data:([^;]+);base64,/i)?.[1] || candidate.mime_type || candidate.type || 'image/jpeg').toLowerCase();
    const allowed = candidate === metadata.identity_photo ? /^image\/(jpeg|png|webp|gif)$/ : /^(image\/(jpeg|png|webp|gif)|application\/pdf|video\/(mp4|webm))$/;
    if (base64 && !allowed.test(mime)) continue;
    if (base64 && !base64.startsWith('data:')) {
      base64 = `data:${mime};base64,${base64}`;
    }
    if (base64 && !/^data:[^;]+;base64,/i.test(base64)) continue;
    const key = base64 || fileUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      ...(base64 ? { base64_data: base64 } : {}), ...(fileUrl ? { file_url: fileUrl } : {}),
      ...(storagePath ? { storage_path: storagePath } : {}),
      file_name: String(candidate.file_name || candidate.name || 'evidencia.jpg'),
      mime_type: mime
    });
  }
  return items;
}

function punchMonitorMetadata(metadata = {}) {
  const { identity_photo, extra_evidence, photo, ...rest } = metadata || {};
  return rest;
}

function punchEvidenceCount(row = {}) {
  const references = new Set();
  for (const item of [row.extra_evidence, row.metadata?.extra_evidence].flat()) {
    // punchPhotoItems ya emite la referencia con storage_path; aqui solo queda lo que
    // anuncia un archivo por nombre sin ruta ni bytes (cabeceras huerfanas).
    if (item && !item.base64 && !item.base64_data && !item.file_url && !item.url && !item.storage_path && item.file_name) references.add(item.file_name);
  }
  return punchPhotoItems(row).length + references.size;
}
module.exports = { punchPhotoItems, punchMonitorMetadata, punchEvidenceCount };
