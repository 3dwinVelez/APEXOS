// Comercio - generador de imagenes de vitrina con modelo gratuito sin clave.
// Pollinations (image.pollinations.ai): el unico host que el servicio visita; el prompt
// del usuario NUNCA se convierte en URL. La salida se valida con firma real en storage.js
// antes de subirse al bucket, como si fuera una foto cargada por el cliente.
const crypto = require("node:crypto");

const MAX_BYTES = 5 * 1024 * 1024;
const GENERATOR_BASE_URL = "https://image.pollinations.ai/prompt/";
const GENERATE_TIMEOUT_MS = 45_000;
const MIN_PROMPT = 4;
const MAX_PROMPT = 300;

function genError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanPrompt(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length < MIN_PROMPT || text.length > MAX_PROMPT) {
    throw genError(400, "IMAGEGEN_PROMPT_INVALID", `La descripcion debe tener entre ${MIN_PROMPT} y ${MAX_PROMPT} caracteres`);
  }
  return text;
}

// Lee el cuerpo con tope duro: una respuesta gigante no entra completa a memoria.
async function readCapped(response) {
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += piece.length;
    if (total > MAX_BYTES) throw genError(413, "IMAGEGEN_TOO_LARGE", "La imagen generada supera el limite de 5 MB");
    chunks.push(piece);
  }
  return Buffer.concat(chunks);
}

// Devuelve el binario de la imagen; el llamador la valida y la almacena.
async function generateBannerImage(prompt) {
  const text = cleanPrompt(prompt);
  const seed = crypto.randomInt(0, 1_000_000);
  const url = `${GENERATOR_BASE_URL}${encodeURIComponent(text)}?width=1280&height=540&nologo=true&seed=${seed}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw genError(504, "IMAGEGEN_TIMEOUT", "El generador tardo demasiado. Intenta de nuevo.");
    throw genError(502, "IMAGEGEN_UNAVAILABLE", "El generador de imagenes no esta disponible. Puedes subir tu propia imagen.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw genError(502, "IMAGEGEN_UNAVAILABLE", `El generador responded con ${response.status}. Puedes subir tu propia imagen.`);
  const bytes = await readCapped(response);
  if (!bytes.length) throw genError(502, "IMAGEGEN_EMPTY", "El generador no devolvio una imagen. Intenta con otra descripcion.");
  return bytes;
}

module.exports = {
  MAX_BYTES,
  GENERATOR_BASE_URL,
  cleanPrompt,
  generateBannerImage
};
