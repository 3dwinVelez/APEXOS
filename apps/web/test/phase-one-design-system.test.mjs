import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("los tokens cubren color tipografía espacio radios y sombras", () => {
  const css = read("app/globals.css");
  const tailwind = read("tailwind.config.ts");
  for (const token of ["--color-apex", "--space-page", "--radius-control", "--radius-card", "--shadow-card", "--shadow-overlay"]) assert.match(css, new RegExp(token));
  assert.match(tailwind, /borderRadius/);
  assert.match(tailwind, /boxShadow/);
  assert.match(tailwind, /fontFamily/);
});

test("los controles comparten validación accesible", () => {
  const controls = read("components/ui/form-controls.tsx");
  assert.match(controls, /aria-describedby/);
  assert.match(controls, /aria-invalid/);
  assert.match(controls, /role=\{error \? "alert"/);
  assert.match(read("components/ui/button.tsx"), /loading/);
});

test("la biblioteca incluye superficies y overlays estandarizados", () => {
  assert.match(read("components/ui/card.tsx"), /rounded-card/);
  assert.match(read("components/ui/feedback.tsx"), /export function Badge/);
  assert.match(read("components/ui/feedback.tsx"), /export function Skeleton/);
  assert.match(read("components/ui/ModalFrame.tsx"), /aria-modal="true"/);
  assert.match(read("components/ui/ModalFrame.tsx"), /event\.key === "Tab"/);
  assert.match(read("components/ui/drawer.tsx"), /role="dialog"/);
  assert.match(read("components/ui/avatar.tsx"), /export function Avatar/);
});

test("DataTable ofrece selección orden filtros paginación y columnas persistentes", () => {
  const table = read("components/ui/data-table.tsx");
  assert.match(table, /export function SmartDataTable/);
  assert.match(table, /aria-sort/);
  assert.match(table, /bulkActions/);
  assert.match(table, /apex_table_columns/);
  assert.match(table, /<Pagination/);
  assert.match(read("app/dashboard/inventario/productos/page.tsx"), /storageKey="inventory-products"/);
});

test("formularios extensos usan pasos y los formularios simples dos columnas con onBlur", () => {
  const product = read("app/dashboard/inventario/productos/nuevo/page.tsx");
  const sale = read("app/dashboard/ventas/ordenes/nueva/page.tsx");
  assert.match(product, /<StepIndicator/);
  assert.match(product, /createStep === 2/);
  assert.match(product, /aria-label=\{`Perfil de \$\{title\.toLowerCase\(\)\}`\}/);
  assert.match(product, /aria-pressed=\{checked\}/);
  assert.match(sale, /<FormGrid/);
  assert.match(sale, /onBlur=/);
  const purchase = read("app/dashboard/compras/ordenes/nueva/page.tsx");
  assert.match(purchase, /aria-label="Buscar productos para la orden"/);
  assert.match(purchase, /aria-label=\{label\}/);
});

test("tabs resuelven overflow y las notificaciones conservan historial", () => {
  const tabs = read("components/ui/tabs.tsx");
  const center = read("components/system/NotificationCenter.tsx");
  const toast = read("components/system/ToastCenter.tsx");
  assert.match(tabs, /overflow-x-auto/);
  assert.match(tabs, /role="tablist"/);
  assert.match(read("components/inventory-nav.tsx"), /<TabsList/);
  assert.match(center, /NOTIFICATION_STORAGE_KEY/);
  assert.match(center, /Historial reciente/);
  assert.match(toast, /NOTIFICATION_EVENT/);
});
