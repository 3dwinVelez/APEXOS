import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

const reportes = read("../app/dashboard/gastos-menores/reportes/page.tsx");

test("la pagina de reportes existe como pagina cliente", () => {
  assert.ok(reportes.length > 0, "la pagina de reportes debe existir");
  assert.match(reportes, /^"use client";/);
  assert.match(reportes, /import \{ GastosMenoresNav \} from "@\/components\/gastos-menores-nav"/);
});

test("el acceso se vigila con los permisos del modulo contable", () => {
  assert.match(reportes, /hasStoredRolePermission\("accounting", "read"\)/);
  // Exportar sigue el precedente de Talento Humano: capability propia del rol, separada de leer.
  assert.match(reportes, /hasStoredRolePermission\("accounting", "export"\)/);
  assert.match(reportes, /Validando permisos/);
  assert.match(reportes, /no disponibles? para este perfil/);
});

test("consulta los tres endpoints de reporteria del backend", () => {
  assert.match(reportes, /api<SummaryReport>\(`\/api\/v1\/petty-cash\/reports\/summary\?\$\{grouped\.toString\(\)\}`\)/);
  assert.match(reportes, /api<RankingReport>\(`\/api\/v1\/petty-cash\/reports\/boxes-ranking\?\$\{base\.toString\(\)\}`\)/);
  assert.match(reportes, /api<DetailReport>\(`\/api\/v1\/petty-cash\/reports\/detail\?\$\{base\.toString\(\)\}`\)/);
});

test("group_by solo viaja al endpoint summary: los otros lo ignoran", () => {
  // Solo summary consume group_by (reportGroupBy en el servicio); detail y boxes-ranking
  // lo ignoran, y enviarlo ensuciaria el echo de filtros.
  const summaryParamsBody = /function summaryParams\(target: FilterState\) \{[\s\S]*?\n\}/.exec(reportes)?.[0] ?? "";
  assert.match(summaryParamsBody, /params\.set\("group_by", target\.group_by\)/);
  const baseParamsBody = /function baseParams\(target: FilterState\) \{[\s\S]*?\n\}/.exec(reportes)?.[0] ?? "";
  assert.doesNotMatch(baseParamsBody, /group_by/);
});

test("los filtros replican el esquema del backend", () => {
  for (const filter of ["year", "month", "date_from", "date_to", "box_id", "concept_code", "cost_center_code", "branch_code", "supplier_party_id", "account_code", "include_cancelled"]) {
    assert.ok(reportes.includes(`"${filter}"`), `el filtro ${filter} debe viajar al backend`);
  }
  // El backend rechaza month sin year (400 REPORT_FILTER_INVALID): la UI lo replica.
  assert.match(reportes, /disabled=\{!filters\.year\}/);
  // include_cancelled es un enum string true/false en el esquema, nunca un booleano.
  assert.match(reportes, /params\.set\("include_cancelled", target\.include_cancelled\)/);
  assert.match(reportes, /include_cancelled: "true" \| "false"/);
});

test("carga los maestros de los filtros con inactivos incluidos", () => {
  assert.match(reportes, /api<Box\[\]>\("\/api\/v1\/petty-cash\/boxes\?include_inactive=true"\)/);
  assert.match(reportes, /api<Concept\[\]>\("\/api\/v1\/petty-cash\/concepts\?include_inactive=true"\)/);
  assert.match(reportes, /api<Party\[\]>\("\/api\/v1\/accounting\/third-parties\?type=supplier&active=true&limit=500"\)/);
  assert.match(reportes, /api<Account\[\]>\("\/api\/v1\/accounting\/accounts\?active=true&limit=1000"\)/);
  assert.match(reportes, /api<OrgTree>\("\/api\/v1\/accounting\/organization-tree"\)/);
});

test("los totales y porcentajes del tope provienen del servidor", () => {
  // totals nunca se calcula en la UI: se toma del reporte que ya lo trae.
  assert.match(reportes, /summary\?\.totals \|\| ranking\?\.totals \|\| detail\?\.totals/);
  // limit_pct se pinta tal cual y solo cuando existe; sin mes unico se muestra un guion.
  assert.match(reportes, /row\.limit_pct !== null && row\.limit_pct !== undefined/);
  assert.match(reportes, /single_month[\s\S]*?El % del tope solo se calcula/);
});

test("los totales usan los nombres del DTO del servicio", () => {
  // Contrato del backend: *_count para conteos y *_total para dinero agregado.
  for (const field of ["vouchers_count", "lines_count", "base_total", "vat_total", "advance_applied_total", "cash_applied_total"]) {
    assert.ok(reportes.includes(field), `el DTO de totales debe usar ${field}`);
  }
  // El echo de filtros refleja box_code resuelto por el servidor.
  assert.match(reportes, /box_code: string \| null/);
  // El conteo del detalle llega en pagination.total, no como row_count.
  assert.match(reportes, /pagination: \{ limit: number; offset: number; returned: number; total: number \}/);
  assert.match(reportes, /detail\.pagination\.total/);
  assert.doesNotMatch(reportes, /row_count/);
});

test("exporta a Excel con el helper compartido y gate de permiso", () => {
  assert.match(reportes, /import \{ downloadXlsxWorkbook \} from "@\/lib\/reportExports"/);
  assert.match(reportes, /await downloadXlsxWorkbook\(`apexos-reporte-gastos-menores-/);
  assert.match(reportes, /disabled=\{loading \|\| exporting \|\| !access\.canExport\}/);
  assert.match(reportes, /Generando Excel\.\.\./);
  assert.match(reportes, /Tu rol no tiene permiso para exportar reportes de Gastos Menores\./);
});

test("el libro exporta resumen, ranking, agrupacion y detalle", () => {
  for (const sheet of ['name: "Resumen"', 'name: "Por caja"', 'name: "Detalle"']) {
    assert.ok(reportes.includes(sheet), `el libro debe incluir la hoja ${sheet}`);
  }
  assert.match(reportes, /name: `Por \$\{GROUP_LABELS\[summary\.group_by\]\}`/);
  assert.match(reportes, /numberFormat: "#,##0\.00"/);
  assert.match(reportes, /numberFormat: "yyyy-mm-dd"/);
});

test("el reporte avisa cuando el tope de filas lo trunca", () => {
  assert.match(reportes, /summary\?\.truncated \|\| ranking\?\.truncated \|\| detail\?\.truncated/);
  assert.match(reportes, /tope de 20000 filas/);
});

test("la consulta aplica filtros explicitos y se puede limpiar", () => {
  assert.match(reportes, /function consultar\(\) \{[\s\S]*?setApplied\(target\)/);
  assert.match(reportes, /function limpiar\(\) \{[\s\S]*?defaultFilters\(\)/);
  assert.match(reportes, /<BarChart3 size=\{16\} \/> \{loading \? "Consultando\.\.\." : "Consultar"\}/);
});

test("las tablas de ranking, agrupacion y detalle exponen las columnas clave", () => {
  assert.match(reportes, /Ranking de cajas: quién gasta más/);
  assert.match(reportes, /Gasto por \$\{GROUP_LABELS\[summary\.group_by\]\}/);
  assert.match(reportes, /Detalle de líneas de gasto/);
  assert.match(reportes, /row\.status === "cancelled" \? "Anulado" : "Contabilizado"/);
  assert.match(reportes, /row\.vat_code \? money\(row\.vat_amount\) : "Sin IVA"/);
});

test("los estados de carga, vacio y moneda siguen la convencion del modulo", () => {
  assert.match(reportes, /Generando reportes de gastos menores\.\.\./);
  assert.match(reportes, /colSpan=/);
  assert.match(reportes, /Intl\.NumberFormat\("es-CO", \{ style: "currency", currency: "COP", maximumFractionDigits: 0 \}\)/);
});
