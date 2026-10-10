import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

const landing = read("../app/dashboard/gastos-menores/page.tsx");
const conceptos = read("../app/dashboard/gastos-menores/conceptos/page.tsx");
const cajas = read("../app/dashboard/gastos-menores/cajas/page.tsx");
const masters = [
  ["conceptos", conceptos],
  ["cajas", cajas]
];

test("la landing y los dos maestros existen como paginas cliente", () => {
  for (const [label, source] of [["landing", landing], ...masters]) {
    assert.ok(source.length > 0, `la pagina de ${label} debe existir`);
    assert.match(source, /^"use client";/);
  }
});

test("el acceso se vigila con los permisos del modulo contable", () => {
  for (const [label, source] of [["landing", landing], ...masters]) {
    assert.match(source, /hasStoredRolePermission\("accounting", "read"\)/, `${label} exige permiso de lectura contable`);
    assert.match(source, /hasStoredRolePermission\("accounting", "write"\)/, `${label} exige permiso de escritura contable`);
    assert.match(source, /Validando permisos/);
    assert.match(source, /no disponibles? para este perfil/);
  }
});

test("los modales usan ModalFrame, nunca un overlay artesanal", () => {
  for (const [label, source] of masters) {
    assert.match(source, /import \{ ModalFrame \} from "@\/components\/ui\/ModalFrame"/, `${label} importa ModalFrame`);
    assert.match(source, /<ModalFrame/, `${label} renderiza con ModalFrame`);
    assert.doesNotMatch(source, /fixed inset-0/, `${label} no debe declarar su propio overlay`);
  }
});

test("las paginas usan las clases globales del sistema de diseño", () => {
  for (const source of [landing, conceptos, cajas]) {
    assert.match(source, /apex-workspace-shell/);
    assert.match(source, /apex-section-card/);
  }
  assert.match(landing, /apex-dense-actions/);
  for (const [label, source] of masters) {
    assert.match(source, /className="control"/, `${label} usa la clase control`);
    assert.match(source, /className="control pl-9"/, `${label} usa el buscador con la clase control`);
    assert.match(source, /className="btn-primary"/, `${label} usa btn-primary`);
    assert.match(source, /className="btn-secondary"/, `${label} usa btn-secondary`);
  }
});

test("todas las consultas pasan por api<T>() del cliente compartido", () => {
  for (const source of [landing, conceptos, cajas]) {
    assert.match(source, /import \{ api \} from "@\/lib\/api"/);
    assert.match(source, /api<\w+\[\]>\("\/api\/v1\//);
  }
  assert.match(landing, /api<Concept\[\]>\("\/api\/v1\/petty-cash\/concepts"\)/);
  assert.match(landing, /api<Box\[\]>\("\/api\/v1\/petty-cash\/boxes"\)/);
  assert.match(conceptos, /api<Concept\[\]>\("\/api\/v1\/petty-cash\/concepts\?include_inactive=true"\)/);
  assert.match(cajas, /api<Box\[\]>\("\/api\/v1\/petty-cash\/boxes\?include_inactive=true"\)/);
});

test("el formulario de conceptos solo envia campos que declara el esquema del backend", () => {
  const payload = /function conceptPayload\(\) \{[\s\S]*?\n  \}/.exec(conceptos)?.[0] ?? "";
  assert.ok(payload.length > 0, "debe existir conceptPayload()");
  for (const field of [
    "code", "name", "account_code", "advance_account_code", "default_vat_code",
    "requires_supplier", "requires_invoice_reference", "active", "notes"
  ]) {
    assert.match(payload, new RegExp(`${field}: `), `conceptPayload debe enviar ${field}`);
  }
  for (const forbidden of ["id:", "account_id:", "advance_account_id:", "custodian_name:", "ready_for_advances:", "warnings:", "created_by:"]) {
    assert.doesNotMatch(payload, new RegExp(`\\b${forbidden}`), `conceptPayload no debe enviar ${forbidden}`);
  }
});

test("el formulario de cajas solo envia campos que declara el esquema del backend", () => {
  const payload = /function boxPayload\(\) \{[\s\S]*?\n  \}/.exec(cajas)?.[0] ?? "";
  assert.ok(payload.length > 0, "debe existir boxPayload()");
  for (const field of [
    "code", "name", "account_code", "advance_account_code", "custodian_party_id",
    "branch_code", "cost_center_code", "monthly_limit", "require_advance",
    "block_unliquidated_advance", "active", "notes"
  ]) {
    assert.match(payload, new RegExp(`${field}: `), `boxPayload debe enviar ${field}`);
  }
  for (const forbidden of ["id:", "account_id:", "advance_account_id:", "custodian_name:", "ready_for_advances:", "warnings:", "created_by:"]) {
    assert.doesNotMatch(payload, new RegExp(`\\b${forbidden}`), `boxPayload no debe enviar ${forbidden}`);
  }
});

test("crear y editar usan POST y PUT con el JSON del payload cerrado", () => {
  assert.match(conceptos, /api\("\/api\/v1\/petty-cash\/concepts", \{ method: "POST", body: JSON\.stringify\(conceptPayload\(\)\) \}\)/);
  assert.match(conceptos, /api\(`\/api\/v1\/petty-cash\/concepts\/\$\{editing\.id\}`, \{ method: "PUT", body: JSON\.stringify\(conceptPayload\(\)\) \}\)/);
  assert.match(cajas, /api\("\/api\/v1\/petty-cash\/boxes", \{ method: "POST", body: JSON\.stringify\(boxPayload\(\)\) \}\)/);
  assert.match(cajas, /api\(`\/api\/v1\/petty-cash\/boxes\/\$\{editing\.id\}`, \{ method: "PUT", body: JSON\.stringify\(boxPayload\(\)\) \}\)/);
});

test("activate y deactivate viajan sin cuerpo de peticion", () => {
  // El backend no declara body en esas rutas: enviar Content-Type vacio provocaria
  // FST_ERR_CTP_EMPTY_JSON_BODY, por eso el POST va solo con el metodo.
  assert.match(conceptos, /api\(`\/api\/v1\/petty-cash\/concepts\/\$\{row\.id\}\/\$\{action\}`, \{ method: "POST" \}\)/);
  assert.match(cajas, /api\(`\/api\/v1\/petty-cash\/boxes\/\$\{row\.id\}\/\$\{action\}`, \{ method: "POST" \}\)/);
});

test("los errores del backend se presentan con codigo y mensaje", () => {
  for (const [label, source] of [["landing", landing], ...masters]) {
    assert.match(source, /code\?: string/, `${label} lee el codigo del error`);
    assert.match(source, /caught\.message/, `${label} muestra el mensaje del error`);
  }
});

test("los selectores de cuentas filtran por tipo y prefijo del PUC", () => {
  // Concepto: cuenta de gasto; anticipo opcional en activo 13.
  assert.match(conceptos, /row\.type === "expense"/);
  assert.match(conceptos, /row\.type === "asset" && row\.code\.startsWith\("13"\)/);
  // Caja: efectivo en activo 11; anticipo obligatorio en activo 13.
  assert.match(cajas, /row\.type === "asset" && row\.code\.startsWith\("11"\)/);
  assert.match(cajas, /row\.type === "asset" && row\.code\.startsWith\("13"\)/);
});

test("la tabla de conceptos expone las columnas del maestro", () => {
  for (const label of ["Código", "Nombre", "Cuenta contable", "Cuenta de anticipo", "IVA sugerido", "Requiere proveedor", "Requiere ref. factura", "Activo"]) {
    assert.ok(conceptos.includes(`>${label}</th>`), `falta la columna ${label}`);
  }
});

test("la tabla de cajas expone las columnas del maestro", () => {
  for (const label of ["Código", "Nombre", "Cuenta caja", "Cuenta anticipo", "Custodio", "Límite mensual", "Anticipo obligatorio", "Bloqueo sin liquidar", "Activo", "Anticipos"]) {
    assert.ok(cajas.includes(`>${label}</th>`), `falta la columna ${label}`);
  }
});

test("la caja presenta la preparacion de anticipos que calcula el servidor", () => {
  assert.match(cajas, /row\.ready_for_advances/);
  assert.match(cajas, /row\.warnings && row\.warnings\.length/);
  assert.match(cajas, /row\.warnings\.map\(\(warning\) =>/);
  assert.match(cajas, /Intl\.NumberFormat\("es-CO", \{ style: "currency", currency: "COP", maximumFractionDigits: 0 \}\)/);
});

test("la landing calcula su resumen con datos reales de conceptos y cajas", () => {
  assert.match(landing, /activeConcepts\.length/);
  assert.match(landing, /activeBoxes\.length/);
  assert.match(landing, /readyBoxes\.length/);
  assert.match(landing, /row\.ready_for_advances === true/);
  assert.match(landing, /box\.warnings\.join\(" "\)/);
});

test("los maestros manejan carga, vacio y busqueda como el resto del sistema", () => {
  for (const [label, source] of masters) {
    assert.match(source, /Cargando /, `${label} muestra estado de carga`);
    assert.match(source, /colSpan=/, `${label} muestra estado vacio`);
    assert.match(source, /Aún no hay/, `${label} distingue vacio de sin resultados`);
  }
});
