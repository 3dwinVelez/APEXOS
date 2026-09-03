import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("el calendario comercial se abre como ventana accesible y conserva vistas dinámicas", () => {
  const agenda = read("app/dashboard/gestion-comercial/agenda/page.tsx");
  const modal = read("components/ui/ModalFrame.tsx");
  assert.match(agenda, /calendarOpen/);
  assert.match(agenda, /Abrir calendario dinámico/);
  assert.match(agenda, /title="Calendario comercial"/);
  assert.match(agenda, /params\.get\("calendario"\) === "1"\) \{ deepLinkHandled\.current = true;/);
  assert.match(agenda, /\["day", "week", "month"\]/);
  assert.match(agenda, /aria-live="polite"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key === "Escape"/);
});

test("los eventos usan etiquetas inteligentes y agrupación lineal por fecha", () => {
  const agenda = read("app/dashboard/gestion-comercial/agenda/page.tsx");
  assert.match(agenda, /function smartStatus/);
  for (const label of ["Programada", "En curso", "Completada", "Vencida", "Hoy"]) assert.ok(agenda.includes(label));
  assert.match(agenda, /const visitsByDay = useMemo/);
  assert.match(agenda, /new Map<string, Row\[]>/);
  assert.match(agenda, /visitsByDay\.get\(date\)/);
  assert.doesNotMatch(agenda, /dates\.map[\s\S]{0,500}visits\.filter/);
});

test("la agenda evita recargar maestros por cada navegación del calendario", () => {
  const agenda = read("app/dashboard/gestion-comercial/agenda/page.tsx");
  assert.match(agenda, /const loadMasters = useCallback[\s\S]*?\}, \[\]\);/);
  assert.match(agenda, /const loadVisits = useCallback/);
  assert.match(agenda, /\[range\.from, range\.to, filters\]/);
  assert.match(agenda, /Mostrando los próximos 8 eventos/);
});

test("Gestión Comercial comparte navegación homogénea en todas sus pantallas", () => {
  const nav = read("components/commercial-nav.tsx");
  const layout = read("app/dashboard/gestion-comercial/layout.tsx");
  for (const label of ["Resumen", "Mi día", "Agenda", "Clientes", "Maestros", "Presupuestos", "Cotizaciones", "Pedidos", "Reportes"]) assert.ok(nav.includes(label));
  assert.match(nav, /aria-current=\{active \? "page"/);
  assert.match(nav, /overflow-x-auto/);
  assert.match(nav, /prefetch=\{false\}/);
  assert.match(layout, /<CommercialNav \/>/);
});
