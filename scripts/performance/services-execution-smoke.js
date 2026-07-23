#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const files = {
  servicePage: path.join(root, "apps/web/app/dashboard/servicios/[id]/page.tsx"),
  photoCapture: path.join(root, "apps/web/components/operations/PhotoCapture.tsx"),
  webApi: path.join(root, "apps/web/lib/api.ts"),
  apiService: path.join(root, "apps/api/src/modules/services/service.js")
};

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(content, needle, message) {
  if (!content.includes(needle)) throw new Error(message);
}

function assertNotIncludes(content, needle, message) {
  if (content.includes(needle)) throw new Error(message);
}

function main() {
  const servicePage = read(files.servicePage);
  const photoCapture = read(files.photoCapture);
  const webApi = read(files.webApi);
  const apiService = read(files.apiService);

  assertIncludes(photoCapture, "URL.createObjectURL(file)", "PhotoCapture debe mostrar preview local inmediato.");
  assertIncludes(photoCapture, "optimizeForStorage", "PhotoCapture debe optimizar imagen antes de guardar.");
  assertIncludes(photoCapture, "progress", "PhotoCapture debe exponer progreso por archivo.");
  assertIncludes(photoCapture, "Fallo la carga. Conserva la foto y reintenta.", "PhotoCapture debe conservar la foto ante error.");

  assertIncludes(servicePage, "client_upload_id", "La carga de evidencia debe enviar un identificador idempotente.");
  assertIncludes(servicePage, "inFlightUploads", "La UI debe bloquear solo la carga duplicada del archivo actual.");
  assertNotIncludes(
    servicePage,
    "api<ServicePhoto[]>(`/api/v1/services/orders/${params.id}/photos`)",
    "No se debe recargar toda la galeria despues de subir una foto."
  );
  assertIncludes(servicePage, "mergeOrderState", "Las respuestas de avance deben fusionarse sin perder evidencias locales.");

  assertIncludes(webApi, "writeCacheScope", "Las escrituras de servicios deben invalidar cache de forma especifica.");
  assertIncludes(webApi, "metadata->>client_upload_id", "El fallback Supabase debe detectar reintentos idempotentes.");
  assertIncludes(apiService, "client_upload_id", "El backend Fastify debe detectar reintentos idempotentes.");

  console.log(JSON.stringify({
    ok: true,
    checked_files: Object.values(files).map((file) => path.relative(root, file)),
    budgets_ms: {
      "service.open": 1000,
      "service.step.save": 600,
      "service.step.advance": 800,
      "service.photo.capture.preview": 100,
      "service.photo.confirm": 500
    },
    note: "Smoke estatico. Las metricas reales deben capturarse en QA/produccion con empresa Nyvora."
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
