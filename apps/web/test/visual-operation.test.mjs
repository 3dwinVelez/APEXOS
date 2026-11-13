import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const operationBlock = () => {
  const css = read("app/globals.css");
  const start = css.indexOf("/* ===== Operación: gráficos, tablas y estados");
  assert.ok(start >= 0, "falta el bloque de operación visual en globals.css");
  const end = css.indexOf("html.dark .apex-context-hero", start);
  return css.slice(start, end === -1 ? undefined : end);
};

test("el lienzo de gráficos usa tokens y no mueve la caja", () => {
  const css = operationBlock();
  const chartBlock = css.slice(css.indexOf(".apex-chart-card"));
  assert.match(chartBlock, /\.apex-chart-card \{[^}]*border-radius: var\(--radius-card\);/s);
  assert.match(chartBlock, /\.recharts-cartesian-axis-tick-value \{[^}]*fill: rgb\(var\(--text-muted\)\);/s);
  assert.match(chartBlock, /html\.dark \.apex-chart-card \.recharts-cartesian-grid line \{[^}]*stroke: rgb\(45 212 191 \/ 0\.1\);/s);
  assert.match(chartBlock, /html\.dark \.apex-chart-card \.recharts-cartesian-axis-tick-value \{[^}]*fill: rgb\(155 170 178\);/s);
  assert.doesNotMatch(chartBlock, /(?:^|[;{]\s*)(width|height|margin|padding|position|top|left)\s*:/m, "la piel del gráfico no cambia caja ni posición");
});

test("los dos gráficos del producto declaran su lienzo", () => {
  assert.match(read("components/accounting/AccountingPyg.tsx"), /className="apex-chart-card h-\[300px\]"/);
  assert.match(read("app/dashboard/comercio/ComercioCharts.tsx"), /className=\{`apex-chart-card w-full \$\{height\}`\}/);
});

test("la tabla operativa gana jerarquía de encabezado sin cambiar densidad de caja", () => {
  const css = operationBlock();
  assert.match(css, /\.apex-standard-table thead th \{[^}]*text-transform: uppercase;/s);
  assert.match(css, /\.apex-standard-table thead th \{[^}]*letter-spacing: 0\.06em;/s);
  assert.match(css, /\.apex-standard-table thead th \{[^}]*font-size: 0\.6875rem;/s);
  assert.match(css, /\.apex-standard-table tbody td \{[^}]*font-variant-numeric: tabular-nums;/s);
  assert.match(css, /\.apex-standard-table tbody tr:hover \{[^}]*background: rgb\(var\(--color-apex\) \/ 0\.06\);/s);
  assert.match(css, /html\.dark \.apex-standard-table thead th \{[^}]*border-bottom: 1px solid rgb\(45 212 191 \/ 0\.16\);/s);
  assert.doesNotMatch(css.match(/\.apex-standard-table thead th \{[^}]*\}/s)[0], /(?:^|[;{]\s*)(width|height)\s*:/m);
});

test("el estado vacío compartido pinta oficio y se apaga en alto contraste", () => {
  const css = operationBlock();
  assert.match(css, /\.apex-empty \{[^}]*border: 1px dashed rgb\(var\(--color-line\)\);/s);
  assert.match(css, /\.apex-empty \{[^}]*background: linear-gradient\(180deg/s);
  assert.match(css, /\.apex-empty-icon \{[^}]*box-shadow: 0 0 0 6px rgb\(var\(--color-apex\) \/ 0\.06\);/s);
  assert.match(css, /html\.dark \.apex-empty-icon \{[^}]*color: rgb\(153 246 228\);/s);
  assert.match(css, /html\[data-contrast="high"\] \.apex-empty \{[^}]*background: none;/s);
  const feedback = read("components/ui/feedback.tsx");
  assert.match(feedback, /apex-empty grid min-h-48/);
  assert.match(feedback, /apex-empty-icon mx-auto mb-4/);
});
