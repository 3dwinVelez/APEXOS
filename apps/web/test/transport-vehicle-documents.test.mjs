import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const apiSource = fs.readFileSync(path.resolve(directory, "../lib/api.ts"), "utf8");
const transportSource = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/page.tsx"), "utf8");

test("la ficha vehicular adjunta archivos reales con FormData", () => {
  assert.match(transportSource, /import \{ inspectFileSignature \} from "@\/lib\/fileSignature";/);
  assert.match(transportSource, /const DOCUMENT_ACCEPT = "\.pdf,\.png,\.jpg,\.jpeg,\.webp,application\/pdf,image\/png,image\/jpeg,image\/webp";/);
  assert.match(transportSource, /const MAX_DOCUMENT_UPLOAD_BYTES = 10 \* 1024 \* 1024;/);
  assert.match(transportSource, /const payload = new FormData\(\);/);
  assert.match(transportSource, /payload\.append\("file", documentFile\);/);
  assert.match(transportSource, /api<VehicleDocument>\(`\/api\/v1\/transport\/vehicles\/\$\{selected\.id\}\/documents`, \{ method: "POST", body: payload \}\)/);
  assert.match(transportSource, /<input accept=\{DOCUMENT_ACCEPT\}[^>]+key=\{documentInputKey\} type="file" onChange=\{\(event\) => selectDocument\(event\.target\.files\?\.\[0\]\)\} \/>/);
});

test("la seleccion valida firma binaria, tamano y reinicia el input", () => {
  assert.match(transportSource, /if \(file\.size > MAX_DOCUMENT_UPLOAD_BYTES\) \{/);
  assert.match(transportSource, /const signature = await inspectFileSignature\(file\);/);
  assert.match(transportSource, /setMessage\("Formato no permitido\. Adjunta un PDF, PNG, JPEG o WEBP\."\);/);
  assert.match(transportSource, /setDocumentInputKey\(\(key\) => key \+ 1\);/);
  assert.doesNotMatch(transportSource, /base64_data/);
  assert.doesNotMatch(transportSource, /FileReader/);
});

test("api() no fuerza JSON cuando el cuerpo es FormData", () => {
  assert.match(apiSource, /typeof FormData !== "undefined" && options\.body instanceof FormData/);
});

test("la vista previa consulta el endpoint de firma y renderiza imagen o PDF integrados", () => {
  assert.match(transportSource, /const view = await api<DocumentView>\(`\/api\/v1\/transport\/vehicles\/\$\{selected\.id\}\/documents\/\$\{document\.id\}\/view`\);/);
  assert.match(transportSource, /documentPreview\.mime_type\.startsWith\("image\/"\) \? \(/);
  assert.match(transportSource, /<img alt=\{documentPreview\.document\.file_name\}[^>]+src=\{documentPreview\.url\} \/>/);
  assert.match(transportSource, /documentPreview\.mime_type === "application\/pdf" \? \(/);
  assert.match(transportSource, /<iframe className="h-\[60vh\] w-full rounded-md border border-line" src=\{documentPreview\.url\} title=\{documentPreview\.document\.file_name\} \/>/);
  assert.match(transportSource, /href=\{documentPreview\.url\} rel="noreferrer" target="_blank">Abrir en pestana<\/a>/);
});

test("el boton Ver solo aparece con archivo real y la fuente del archivo se etiqueta", () => {
  assert.match(transportSource, /has_attachment\?: boolean;/);
  assert.match(transportSource, /\{document\.has_attachment !== false \? \(/);
  assert.match(transportSource, /URL firmada vigente por \$\{Math\.max\(1, Math\.round\(\(documentPreview\.expires_in \|\| 0\) \/ 60\)\)\} min/);
  assert.match(transportSource, /"Archivo almacenado en la base de datos"/);
  assert.match(transportSource, /"Archivo alojado en un enlace externo"/);
  assert.match(transportSource, /Preparando vista previa\.\.\./);
  assert.match(transportSource, /Este formato no tiene vista previa integrada\. Usa &quot;Abrir en pestana&quot;\./);
});
