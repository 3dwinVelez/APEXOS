import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("dashboard usa el enfoque operativo aprobado con lobby corporativo V4", () => {
  const source = read("app/dashboard/page.tsx");
  assert.match(source, /Creamos sistemas/);
  assert.match(source, /a tu medida\./);
  assert.match(source, /Tu operación, más simple y/);
  assert.match(source, /Acciones frecuentes/);
  assert.match(source, /Mis módulos/);
  assert.doesNotMatch(source, /Continúa donde estabas/);
});

test("el hero lleva la frase de marca y no botones de arranque", () => {
  const source = read("app/dashboard/page.tsx");
  assert.doesNotMatch(source, /Comenzar/);
  assert.doesNotMatch(source, /Explorar módulos/);
  assert.doesNotMatch(source, /apex-lobby-cta-/);
  assert.doesNotMatch(source, /startHref/);
});

test("lobby V4 monta banner corporativo y tarjetas fotográficas por módulo", () => {
  const source = read("app/dashboard/page.tsx");
  const assets = read("lib/lobbyAssets.ts");
  assert.match(source, /apex-lobby-hero/);
  assert.match(source, /LOBBY_BANNER/);
  assert.match(source, /lobbyModuleImage\(module\.slug\)/);
  assert.match(assets, /banner-truck\.webp/);
  assert.match(assets, /module-inventario\.webp/);
  assert.match(assets, /module-transporte\.webp/);
  assert.match(read("app/globals.css"), /--lobby-accent: 8 205 187/);
});

test("todos los módulos del catálogo tienen su fotografía en el lobby", () => {
  const slugs = [...read("lib/modules.ts").matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);
  const assets = read("lib/lobbyAssets.ts");
  const mapped = [...assets.matchAll(/^\s{2}"?([\w-]+)"?:\s*"([^"]+)"/gm)].map((match) => ({ slug: match[1], file: match[2] }));
  assert.equal(slugs.length, 32);
  const bySlug = Object.fromEntries(mapped.map((entry) => [entry.slug, entry.file]));
  for (const slug of slugs) {
    assert.ok(bySlug[slug], `módulo sin fotografía: ${slug}`);
    const file = path.join(root, "public", bySlug[slug]);
    assert.ok(fs.existsSync(file), `asset inexistente para ${slug}: ${bySlug[slug]}`);
  }
  const files = mapped.map((entry) => entry.file);
  assert.equal(new Set(files).size, slugs.length, "cada módulo usa una fotografía propia");
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

test("los módulos ocupan el ancho completo del lobby sin panel secundario", () => {
  const source = read("app/dashboard/page.tsx");
  assert.match(source, /xl:grid-cols-4/);
  assert.doesNotMatch(source, /apex_navigation_trace_v1/);
  assert.doesNotMatch(source, /xl:grid-cols-\[1\.35fr_1fr\]/);
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
