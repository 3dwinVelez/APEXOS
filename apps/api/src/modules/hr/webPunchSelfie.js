const { assertSafeFile } = require('../../security/policy');
const { normalizePunchType } = require('./timeLogic');
const TYPES = new Set(['entrada', 'inicio_almuerzo', 'fin_almuerzo', 'salida']);
function prepareWebPunchSelfie(input = {}) {
  // Native Android identity remains delegated to its signed-device verifier.
  if (input.metadata?.source === 'apexos-movil' || !TYPES.has(normalizePunchType(input.type || input.tipo_marca))) return input;
  const photo = input.identity_photo;
  if (!photo || typeof photo !== 'object' || !(photo.base64 || photo.base64_data)) {
    const error = new Error('Toma la selfie de validacion para registrar esta marcacion.');
    error.statusCode = 400; error.code = 'SELFIE_REQUERIDA'; throw error;
  }
  const type = String(photo.type || '').toLowerCase();
  const raw = String(photo.base64 || photo.base64_data);
  const bytes = Buffer.from(raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw, 'base64');
  if (!['image/jpeg', 'image/png'].includes(type)) {
    const error = new Error('La selfie debe ser JPEG o PNG.'); error.statusCode = 400; error.code = 'SELFIE_INVALIDA'; throw error;
  }
  try { assertSafeFile({base64_data:raw,mime_type:type,file_size:bytes.length},{maxBytes:2*1024*1024}); }
  catch (error) { error.code = 'SELFIE_INVALIDA'; throw error; }
  const name = String(photo.name || 'selfie.jpg').slice(0,120), base64 = `data:${type};base64,${bytes.toString('base64')}`;
  return {...input,identity_photo:{base64,type,size:bytes.length,name},metadata:{...input.metadata,identity_photo:{base64_data:base64,type,size:bytes.length,name}}};
}
module.exports = { prepareWebPunchSelfie };
