import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("inventario organiza navegación por dominios sin fila extensa ni WMS visible", () => {
  const nav = read("components/inventory-nav.tsx");
  for (const label of ["Resumen", "Maestros", "Existencias", "Movimientos", "Productos", "Nuevo producto", "Stock", "Kardex", "Traslados", "Ajustes"]) {
    assert.match(nav, new RegExp(label));
  }
  assert.match(nav, /role="tablist"/);
  assert.match(nav, /aria-current/);
  assert.match(nav, /sm:hidden/);
  assert.doesNotMatch(nav, /TabsList|overflow-x-auto|inventario\/wms|label: "WMS"/);
});

test("portada de inventario no ofrece WMS ni duplica la navegación secundaria", () => {
  const home = read("app/dashboard/inventario/page.tsx");
  assert.match(home, /Herramientas activas de inventario/);
  assert.match(home, /ActionCard/);
  assert.doesNotMatch(home, /inventario\/wms|title: "WMS"|<InventoryNav/);
});

test("APEX AI no apunta a WMS oculto dentro de inventario", () => {
  const aiLayer = read("components/brain/AiExperienceLayer.tsx");
  assert.doesNotMatch(aiLayer, /inventario\/wms|wms-lego|Layout WMS/);
  assert.match(aiLayer, /stock-control/);
});

test("nuevo producto no duplica directorio ni trazabilidad como navegación interna", () => {
  const source = read("app/dashboard/inventario/productos/nuevo/page.tsx");
  assert.match(source, /<InventoryNav/);
  assert.doesNotMatch(source, /SegmentedNav|setActiveTab|Vista de productos/);
  assert.match(source, /Nuevo producto/);
  assert.match(source, /Código automático/);
  assert.match(source, /Se asignará al crear el producto/);
});

test("formulario de producto separa inventariables de servicios y no inventariables", () => {
  const source = read("app/dashboard/inventario/productos/nuevo/page.tsx");
  assert.match(source, /INVENTORY_TRACKED_TYPES/);
  assert.match(source, /handlesInventory/);
  assert.match(source, /value="service"/);
  assert.match(source, /value="non_inventory"/);
  assert.match(source, /Sin existencias físicas/);
  assert.match(source, /no generan stock, lote, serie, vencimiento ni kardex físico/);
  assert.match(source, /stock_min: handlesInventory\(nextType\) \? p\.stock_min : 0/);
});

test("formulario de producto usa agrupación operacional de fase 3", () => {
  const source = read("app/dashboard/inventario/productos/nuevo/page.tsx");
  for (const label of ["Identificación", "Clasificación", "Configuración", "Tipo de registro", "Categoría", "Subcategoría", "Línea", "Sublínea", "Stock mínimo", "Stock máximo"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Selecciona una categoría primero/);
  assert.match(source, /Selecciona una subcategoría primero/);
  assert.match(source, /Selecciona una línea primero/);
});
