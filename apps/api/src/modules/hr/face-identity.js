// Reconocimiento facial de las marcaciones (maestro de rostros, M-17).
//
// Varios empleados marcan en el MISMO celular. El lector de huella del telefono no
// dice de quien es la huella, asi que la persona se identifica por su ROSTRO: cada
// empleado registra su rostro una vez y cada selfie de marcacion se compara con el.
//
// Motor: Human (@vladmandic/human, MIT) con el backend wasm de TensorFlow.js: sin
// binarios nativos. El mismo modelo corre en APEXOS Web Movil, asi que el celular y
// el servidor calculan el mismo embedding y la MISMA similitud (coseno, abajo).
//
// El servidor nunca bloquea una marcacion por el rostro: la evalua y la SENALA. Si el
// modelo no carga, el resultado es `no_disponible`.
const path = require("node:path");
const fs = require("node:fs");
const { fileURLToPath, pathToFileURL } = require("node:url");

const FACE_MODEL = "human-3.3.6/faceres-1024";

function faceConfig(env = process.env) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    enabled: String(env.FACE_RECOGNITION_ENABLED || "true").toLowerCase() !== "false",
    // Coseno entre embeddings. Calibracion inicial con fotos de muestra: misma persona
    // ~0.83, personas distintas ~0.35. DEBE recalibrarse con selfies reales del personal.
    matchThreshold: num(env.FACE_MATCH_THRESHOLD, 0.55),
    // 0 = informativo (se guarda el puntaje sin bloquear) hasta calibrar con fotos reales.
    antispoofMin: num(env.FACE_ANTISPOOF_MIN, 0),
    livenessMin: num(env.FACE_LIVENESS_MIN, 0)
  };
}

// Similitud coseno. La web movil (src/services/face.ts) usa EXACTAMENTE esta formula.
function similarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ---------------------------------------------------------------- motor
let detectorOverride = null;
let humanPromise = null;
let fileFetchInstalled = false;

// Solo pruebas: reemplaza el detector por uno simulado (buffer -> { faces: [...] }).
function setDetectorForTests(fn) {
  detectorOverride = fn;
}

// Node 22 no lee file:// con fetch y Human carga sus modelos con fetch.
function installFileFetch() {
  if (fileFetchInstalled) return;
  fileFetchInstalled = true;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (url.startsWith("file://")) {
      const data = await fs.promises.readFile(fileURLToPath(url));
      return new Response(data, { status: 200, headers: { "content-type": url.endsWith(".json") ? "application/json" : "application/octet-stream" } });
    }
    return nativeFetch(input, init);
  };
}

async function loadHuman() {
  installFileFetch();
  // El mapa "exports" del paquete no expone la build wasm con "./": se carga por ruta.
  const distDir = path.dirname(require.resolve("@vladmandic/human"));
  const { Human } = require(path.join(distDir, "human.node-wasm.js"));
  const modelsDir = path.join(distDir, "..", "models");
  const wasmDir = path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm/package.json"));
  const human = new Human({
    backend: "wasm",
    wasmPath: `${path.join(wasmDir, "dist").replace(/\\/g, "/")}/`,
    modelBasePath: `${pathToFileURL(modelsDir).href}/`,
    debug: false,
    async: false,
    cacheSensitivity: 0,
    face: {
      enabled: true,
      detector: { enabled: true, rotation: false, maxDetected: 3, minConfidence: 0.3 },
      mesh: { enabled: true },
      iris: { enabled: false },
      description: { enabled: true },
      emotion: { enabled: false },
      antispoof: { enabled: true },
      liveness: { enabled: true }
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false }
  });
  await human.load();
  return human;
}

function getHuman() {
  humanPromise ??= loadHuman().catch((error) => {
    humanPromise = null; // se reintenta en la proxima llamada
    throw error;
  });
  return humanPromise;
}

// Analiza una imagen (Buffer JPEG/PNG). Devuelve las caras con su embedding y puntajes.
async function analyzeImage(buffer) {
  if (detectorOverride) return detectorOverride(buffer);
  const sharp = require("sharp");
  const human = await getHuman();
  // rotate(): respeta la orientacion EXIF de las fotos del telefono.
  const { data, info } = await sharp(buffer).rotate().removeAlpha().resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const tensor = human.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
  try {
    const result = await human.detect(tensor);
    return {
      faces: (result.face || []).map((face) => ({
        score: Number(face.score || 0),
        embedding: Array.from(face.embedding || []),
        real: typeof face.real === "number" ? face.real : null,
        live: typeof face.live === "number" ? face.live : null
      }))
    };
  } finally {
    human.tf.dispose(tensor);
  }
}

const round = (n) => (typeof n === "number" ? Math.round(n * 1000) / 1000 : null);

// Una sola cara clara y con embedding: requisito para registrar el rostro.
async function enrollmentFromImage(buffer, config = faceConfig()) {
  const { faces } = await analyzeImage(buffer);
  if (faces.length === 0) return { ok: false, code: "ROSTRO_NO_DETECTADO", message: "No se detecto un rostro. Toma la foto de frente, con buena luz." };
  if (faces.length > 1) return { ok: false, code: "VARIOS_ROSTROS", message: "Hay mas de un rostro en la foto. Debe aparecer solo la persona que se registra." };
  const face = faces[0];
  if (!face.embedding.length) return { ok: false, code: "ROSTRO_NO_LEGIBLE", message: "No se pudo leer el rostro. Repite la foto." };
  if (config.antispoofMin > 0 && face.real !== null && face.real < config.antispoofMin) {
    return { ok: false, code: "POSIBLE_SUPLANTACION", message: "La foto parece tomada a otra foto o a una pantalla." };
  }
  return { ok: true, embedding: face.embedding.map((v) => Math.round(v * 1e6) / 1e6), antispoof: round(face.real), liveness: round(face.live), model: FACE_MODEL };
}

// Compara la selfie de una marcacion con el rostro registrado. Nunca lanza: devuelve
// el estado para SENALAR la marcacion.
async function evaluateSelfie({ enrolledEmbedding, selfieBuffer, config = faceConfig() }) {
  const base = { model: FACE_MODEL, threshold: config.matchThreshold, evaluated_at: new Date().toISOString() };
  if (!config.enabled) return { ...base, status: "no_disponible", reason: "desactivado" };
  let faces;
  try {
    ({ faces } = await analyzeImage(selfieBuffer));
  } catch (error) {
    return { ...base, status: "no_disponible", reason: String(error?.message || error).slice(0, 160) };
  }
  if (faces.length === 0) return { ...base, status: "sin_rostro" };
  if (faces.length > 1) return { ...base, status: "varios_rostros", faces: faces.length };
  const face = faces[0];
  const score = similarity(enrolledEmbedding, face.embedding);
  const spoof = config.antispoofMin > 0 && face.real !== null && face.real < config.antispoofMin;
  const notLive = config.livenessMin > 0 && face.live !== null && face.live < config.livenessMin;
  const status = spoof || notLive ? "suplantacion" : score >= config.matchThreshold ? "coincide" : "no_coincide";
  return { ...base, status, similarity: round(score), antispoof: round(face.real), liveness: round(face.live) };
}

function dataUrlBytes(value) {
  const raw = String(value || "");
  const payload = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  return Buffer.from(payload, "base64");
}

module.exports = {
  FACE_MODEL,
  faceConfig,
  similarity,
  analyzeImage,
  enrollmentFromImage,
  evaluateSelfie,
  dataUrlBytes,
  setDetectorForTests
};
