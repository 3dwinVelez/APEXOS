// Autorizacion de tratamiento de datos biometricos (rostro) para marcar jornada.
//
// BORRADOR PARA REVISION JURIDICA. El texto definitivo lo debe aprobar el area legal
// de la empresa (Ley 1581 de 2012, Decreto 1377 de 2013 y la politica de tratamiento
// de datos de la empresa). Al cambiar el texto se debe cambiar FACE_CONSENT_VERSION:
// cada registro guarda la version y el sha256 del texto exacto que acepto el empleado.
const crypto = require("node:crypto");

const FACE_CONSENT_VERSION = "2026-11-v1";

const FACE_CONSENT_TEXT = [
  "Autorizo a la empresa a recolectar y usar la imagen de mi rostro y un patron numerico derivado de ella (dato biometrico sensible) con la unica finalidad de verificar mi identidad cuando marco mi jornada laboral en APEXOS.",
  "Entiendo que no estoy obligado a autorizar el tratamiento de datos sensibles y que, si no lo autorizo, podre marcar por otro medio que la empresa disponga.",
  "Mis datos se conservaran mientras exista la relacion laboral o hasta que solicite su supresion. Puedo conocer, actualizar, rectificar y suprimir mis datos, y revocar esta autorizacion, a traves de talento humano.",
  "La foto y el patron se guardan cifrados en transito y con acceso restringido al personal autorizado de talento humano."
].join("\n\n");

const FACE_CONSENT_SHA256 = crypto.createHash("sha256").update(FACE_CONSENT_TEXT, "utf8").digest("hex");

module.exports = { FACE_CONSENT_VERSION, FACE_CONSENT_TEXT, FACE_CONSENT_SHA256 };
