import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

const reportes = read("../app/dashboard/comercio/reportes/page.tsx");
const charts = read("../app/dashboard/comercio/ComercioCharts.tsx");

test("la pantalla es cliente y sigue el gate de acceso del modulo", () => {
  assert.match(reportes, /^"use client";/);
  assert.match(reportes, /useComercioAccess\(\)/);
  assert.match(reportes, /const blocked = comercioGate\(access\)/);
  assert.match(reportes, /if \(blocked\) return blocked/);
});

test("los graficos vienen del modulo compartido de recharts, no de barras CSS", () => {
  assert.match(reportes, /import \{ CashMethodChart, SalesTrendChart, TopProductsChart \} from "\.\.\/ComercioCharts"/);
  for (const chart of ["<SalesTrendChart data=\{summary\.daily_sales\} />", "<CashMethodChart data=\{summary\.cash_by_method\} />", "<TopProductsChart data=\{summary\.top_products\} />"]) {
    assert.ok(reportes.includes(chart), `falta ${chart}`);
  }
  // El redisequeo elimino las barras calculadas a mano con style; ahora manda recharts.
  assert.doesNotMatch(reportes, /style=\{\{ (height|width)/);
});

test("la paleta de los graficos sale de los tokens CSS del documento", () => {
  assert.match(charts, /^"use client";/);
  assert.match(charts, /getComputedStyle\(document\.documentElement\)\.getPropertyValue\(name\)/);
  assert.match(charts, /MutationObserver\(sync\)/);
  assert.match(charts, /attributeFilter: \["class", "data-theme", "data-contrast"\]/);
  // Ni un color literal: el tema claro/oscuro y el contraste alto se heredan del documento.
  assert.doesNotMatch(charts, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(charts, /\brgba?\(\s*\d/);
  // Sin animacion para que el rango recalculado se lea de inmediato.
  const animations = (charts.match(/isAnimationActive=\{false\}/g) || []).length;
  assert.ok(animations >= 5, "toda serie debe pintarse sin reproducion de animacion");
});

test("el promedio movil de 7 dias acompana la tendencia diaria", () => {
  assert.match(charts, /function withTrend\(rows/);
  assert.match(charts, /rows\.slice\(Math\.max\(0, index - 6\), index \+ 1\)/);
  assert.match(charts, /dataKey="tendencia"/);
  assert.match(charts, /Promedio 7 días/);
});

test("los cinco presets de rango son botones presionables y sincronizan desde-hasta", () => {
  for (const label of ['label: "Hoy"', 'label: "7 días"', 'label: "30 días"', 'label: "Este mes"', 'label: "Mes anterior"']) {
    assert.ok(reportes.includes(label), `falta el preset ${label}`);
  }
  assert.match(reportes, /aria-pressed=\{activePreset === preset\.id\}/);
  assert.match(reportes, /function applyPreset\(id: string\)/);
  assert.match(reportes, /setFrom\(range\.from\)/);
  assert.match(reportes, /setTo\(range\.to\)/);
});

test("las seis tarjetas de resultado usan los campos del agregado del servidor", () => {
  // Ningun total se recalcula en la UI: se leen del summary.
  for (const field of ["sales", "cost_of_goods", "gross_margin", "expenses", "purchases", "estimated_result", "receivable", "overdue_receivable", "inventory_value", "cash_collected"]) {
    assert.ok(reportes.includes(`summary.totals.${field}`), `el KPI ${field} debe venir del servidor`);
  }
  assert.doesNotMatch(reportes, /totals\s*=\s*summary\.[a-z_]+\.reduce/);
  assert.match(reportes, /money\(summary\.totals\.sales\)/);
});

test("el buscador de movimientos es inteligente y deja ver cuantos filas oculta", () => {
  assert.match(reportes, /matchesQuery\(query, row\.product_name, REASON_LABELS\[row\.reason\] \|\| row\.reason, row\.reference \|\| ""\)/);
  // La busqueda canonica: SearchField con su etiqueta visible, no un input suelto con aria-label.
  assert.match(reportes, /<SearchField\b[\s\S]{0,320}label="Buscar movimiento"/);
  assert.match(reportes, /import \{ SearchField \} from "@\/components\/ui\/SearchField"/);
  assert.doesNotMatch(reportes, /aria-label="Buscar movimiento de inventario"/);
  assert.match(reportes, /ocultos por el filtro/);
  assert.match(reportes, /\{filteredMovements\.length\} de \{movements\.length\} movimientos/);
});

test("la traza de inventario usa la tabla moderna con orden, columnas y paginacion", () => {
  assert.match(reportes, /<SmartDataTable/);
  assert.match(reportes, /storageKey="comercio-movimientos-inventario"/);
  assert.match(reportes, /pageSize=\{12\}/);
  for (const id of ['id: "date"', 'id: "product"', 'id: "change"', 'id: "before"', 'id: "after"', 'id: "reason"', 'id: "reference"']) {
    assert.ok(reportes.includes(id), `falta la columna ${id}`);
  }
  assert.match(reportes, /emptyTitle=\{hasMovementFilters \? "Ningún movimiento coincide" : "Sin movimientos en el rango"\}/);
});

test("el libro de Excel lleva resumen, diario, medios, productos, clientes y movimientos", () => {
  assert.match(reportes, /import \{ downloadExcelWorkbook \} from "@\/lib\/reportExports"/);
  assert.match(reportes, /downloadExcelWorkbook\(`comercio-reportes-\$\{from\}-a-\$\{to\}\.xlsx`/);
  for (const sheet of ["Resumen", "Ventas por día", "Recaudo por medio", "Top productos", "Mejores clientes", "Movimientos"]) {
    assert.ok(reportes.includes(`name: "${sheet}"`), `falta la hoja ${sheet}`);
  }
  // La hoja de movimientos respeta el filtro activo: lo que se ve es lo que se exporta.
  assert.match(reportes, /rows: filteredMovements\.map/);
});

test("cada panel declara su estado vacio con accion en lugar de un cuadro en blanco", () => {
  for (const detail of ["Sin ventas en este rango", "Sin recaudo registrado", "Sin productos vendidos", "Ninguna venta con cliente asignado", "Ningún producto está por debajo de su mínimo"]) {
    assert.ok(reportes.includes(detail), `falta el estado vacio ${detail}`);
  }
  // La tabla de movimientos distingue "no hay datos" de "el filtro no deja nada".
  assert.match(reportes, /emptyTitle=\{hasMovementFilters \? "Ningún movimiento coincide" : "Sin movimientos en el rango"\}/);
  assert.match(reportes, /emptyDetail="Cambie el rango de fechas o registre una compra, venta o ajuste de inventario\."/);
  assert.match(reportes, /Calculando el periodo\.\.\./);
});
