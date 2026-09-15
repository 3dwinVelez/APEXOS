import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("dashboard usa el enfoque operativo aprobado", () => {
  const source = read("app/dashboard/page.tsx");
  assert.match(source, /Mi operación/);
  assert.match(source, /Acciones frecuentes/);
  assert.match(source, /Mis módulos/);
  assert.match(source, /Actividad reciente/);
});

test("dashboard ya no depende de KPIs ni graficas para la pantalla inicial", () => {
  const source = read("app/dashboard/page.tsx");
  for (const forbidden of ["Servicios programados", "Requiere atención", "Consultando actividad", "chart", "grafica", "BrainPanel"]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"));
  }
});

test("acciones frecuentes salen de rutas existentes y modulos habilitados", () => {
  const source = read("lib/operationalWorkspace.ts");
  for (const href of ["/dashboard/ventas/ordenes/nueva", "/dashboard/compras/ordenes/nueva", "/dashboard/inventario/productos/nuevo", "/dashboard/transporte/operacion"]) {
    assert.match(source, new RegExp(href.replaceAll("/", "\\/")));
  }
  assert.match(read("app/dashboard/page.tsx"), /actionsForWorkspace\(enabledSlugs, roleName\)/);
});

test("acciones frecuentes se priorizan por rol operativo", () => {
  const source = read("lib/operationalWorkspace.ts");
  assert.match(source, /roles\?: string\[\]/);
  assert.match(source, /roleName\.normalize/);
  assert.match(source, /roles\?\.some/);
});

test("mis modulos se limita a permisos y suscripcion", () => {
  const source = read("app/dashboard/page.tsx");
  assert.match(source, /loadModuleAccess\(MODULES\)/);
  assert.match(source, /access\.bySlug\[module\.slug\] === true/);
  assert.match(source, /No tienes módulos habilitados/);
});

test("actividad reciente usa la traza real local y no datos inventados", () => {
  const source = read("app/dashboard/page.tsx");
  assert.match(source, /apex_navigation_trace_v1/);
  assert.match(source, /localStorage\.getItem\(TRACE_KEY\)/);
  assert.match(source, /enabledSlugs\.has\(traceModule\(item\.path\)\)/);
});

test("dashboard cubre estados de carga error y vacio", () => {
  const source = read("app/dashboard/page.tsx");
  assert.match(source, /WorkspaceLoading/);
  assert.match(source, /WorkspaceError/);
  assert.match(source, /EmptyActions/);
  assert.match(source, /Reintentar/);
});

test("sidebar agrupa modulos por dominios funcionales", () => {
  const sidebar = read("components/shell/Sidebar.tsx");
  const workspace = read("lib/operationalWorkspace.ts");
  assert.match(sidebar, /groupModules/);
  assert.match(sidebar, /<details/);
  assert.doesNotMatch(sidebar, /<details[^>]+open>/);
  assert.match(sidebar, /text-neutral-600/);
  assert.doesNotMatch(sidebar, /text-neutral-400 hover:text-neutral-700/);
  for (const group of ["Operación", "Comercial", "Finanzas", "Personas y gestión", "Control y plataforma"]) {
    assert.match(workspace, new RegExp(group));
  }
});

test("busqueda lateral es por modulos y funciones", () => {
  const source = read("components/shell/Sidebar.tsx");
  assert.match(source, /Buscar módulos y funciones/);
  assert.match(source, /capabilities/);
  assert.match(source, /nextActions/);
});

test("paleta de comandos respeta modulos habilitados", () => {
  const source = read("components/system/CommandPalette.tsx");
  assert.match(source, /OPERATIONAL_ACTIONS/);
  assert.match(source, /loadModuleAccess\(MODULES\)/);
  assert.match(source, /access\.bySlug\[slug\] === true/);
  assert.match(source, /isSupabaseSession/);
});

test("barra superior conserva lo esencial y agrupa herramientas secundarias", () => {
  const source = read("components/shell/DashboardChrome.tsx");
  assert.match(source, /SecondaryWorkspaceTools/);
  assert.match(source, /Herramientas/);
  for (const component of ["TraceabilityCenter", "CollaborationPresence", "ExperiencePreferences", "WorldClassToolkit"]) {
    assert.match(source, new RegExp(`<${component}`));
  }
});

test("chrome no muestra el banner global de AI en ningun modulo", () => {
  const source = read("components/shell/DashboardChrome.tsx");
  assert.doesNotMatch(source, /ApexAiHeader/);
  assert.match(source, /<AiExperienceLayer/);
});
