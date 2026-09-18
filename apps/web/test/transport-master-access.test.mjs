import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/page.tsx"), "utf8");

test("Transporte carga retirados para que el filtro sea funcional", () => {
  assert.match(source, /transport\/vehicles\?include_retired=true/);
  assert.match(source, /\["retirado", "Retirados"\]/);
  assert.match(source, /statusFilter \? vehicle\.master_status === statusFilter : vehicle\.master_status !== "retirado"/);
});

test("Transporte alinea lectura y escritura de UI con RBAC", () => {
  assert.match(source, /hasStoredRolePermission\("transport", "read"\)/);
  assert.match(source, /hasStoredRolePermission\("transport", "write"\)/);
  assert.match(source, /Transporte no disponible para este perfil/);
  assert.match(source, /access\.canWrite \? <button[\s\S]+?Crear vehiculo/);
  assert.match(source, /disabled=\{!access\.canWrite\}/);
  assert.match(source, /Consulta de solo lectura/);
});

test("la falta de HR no bloquea la consulta de flota", () => {
  assert.match(source, /access\.canReadHr \? api<Employee\[]>/);
  assert.match(source, /Puedes continuar con un conductor manual/);
  assert.doesNotMatch(source, /Revisa permisos RLS/);
});

test("los errores de permisos no se presentan como conectividad", () => {
  assert.match(source, /\/403\|permiso\/i/);
  assert.match(source, /transport:read/);
  assert.match(source, /empresa activa o la conectividad/);
});
