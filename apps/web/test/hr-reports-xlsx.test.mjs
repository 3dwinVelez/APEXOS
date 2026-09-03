import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildXlsxWorkbook } from "../lib/reportExports.ts";

const root = path.resolve(import.meta.dirname, "../../..");

test("el reporte genera un XLSX real, ordenado y filtrable", async () => {
  const buffer = await buildXlsxWorkbook([{
    name: "Jornadas",
    title: "Detalle de jornadas",
    subtitle: "Periodo controlado",
    columns: [
      { key: "fecha", label: "Fecha", width: 95, numberFormat: "yyyy-mm-dd" },
      { key: "empleado", label: "Empleado", width: 180 },
      { key: "horas", label: "Horas", width: 90, numberFormat: "0.00" }
    ],
    rows: [{ fecha: new Date("2026-08-25T12:00:00-05:00"), empleado: "Persona QA", horas: 8.5 }]
  }]);

  assert.equal(Buffer.from(buffer).subarray(0, 2).toString(), "PK");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Jornadas");
  assert.ok(sheet);
  assert.equal(sheet.getCell("A1").value, "Detalle de jornadas");
  assert.equal(sheet.getCell("C6").value, 8.5);
  assert.equal(sheet.getColumn(3).numFmt, "0.00");
  assert.equal(sheet.getTable("ApexosJornadasTable").table.autoFilterRef, "A5:C6");
  assert.equal(sheet.views[0].ySplit, 5);
});

test("la pantalla aplica rango al origen, filtros inteligentes y descarga xlsx", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/talento-humano/reportes/page.tsx"), "utf8");
  const api = fs.readFileSync(path.join(root, "apps/web/lib/api.ts"), "utf8");
  assert.match(page, /attendance\?fecha_inicio=/);
  assert.match(page, /work-activities\?fecha_inicio=/);
  assert.match(page, /Estado de jornada/);
  assert.match(page, /Ultimos 7 dias/);
  assert.match(page, /downloadXlsxWorkbook/);
  assert.match(page, /hasStoredRolePermission\("hr", "export"\)/);
  assert.doesNotMatch(page, /Exportar CSV|downloadCsv/);
  assert.match(api, /punch_date=gte/);
  assert.match(api, /route_date=gte/);
  assert.match(api, /captured_at=gte/);
});
