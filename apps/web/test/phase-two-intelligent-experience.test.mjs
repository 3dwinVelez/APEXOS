import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("command palette ofrece atajo global, búsqueda y acciones rápidas", () => {
  const source = read("components/system/CommandPalette.tsx");
  assert.match(source, /Control\+K Meta\+K/);
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /OPERATIONAL_ACTIONS/);
  assert.match(source, /access\.bySlug\[slug\] === true/);
  assert.match(source, /loadModuleAccess\(MODULES\)/);
  assert.match(source, /router\.push/);
});

test("dashboard adapta el inicio al trabajo operativo", () => {
  const source = read("app/dashboard/page.tsx");
  assert.match(source, /Mi operación/);
  assert.match(source, /Acciones frecuentes/);
  assert.match(source, /Mis módulos/);
  assert.match(source, /Actividad reciente/);
  assert.match(source, /actionsForWorkspace\(enabledSlugs, roleName\)/);
  assert.doesNotMatch(source, /dashboardRoleProfile/);
});

test("APEX AI prioriza anomalías, oportunidades y acciones por módulo", () => {
  const source = read("components/brain/ApexIntelligencePulse.tsx");
  assert.match(source, /brain\/insights/);
  assert.match(source, /critical/);
  assert.match(source, /warning/);
  assert.match(source, /recommended_action/);
  assert.match(source, /Señal inteligente prioritaria/);
});

test("breadcrumbs y trazabilidad conectan el recorrido entre módulos", () => {
  const breadcrumbs = read("components/shell/ContextBreadcrumbs.tsx");
  const traceability = read("components/system/TraceabilityCenter.tsx");
  assert.match(breadcrumbs, /Ruta de navegación/);
  assert.match(breadcrumbs, /aria-current/);
  assert.match(traceability, /apex_navigation_trace_v1/);
  assert.match(traceability, /Recorrido reciente/);
  assert.match(traceability, /slice\(0, 8\)/);
});

test("estado offline-first comunica conectividad y conserva la infraestructura operativa", () => {
  const status = read("components/system/OfflineFirstStatus.tsx");
  const queue = read("lib/offline/operationQueue.ts");
  assert.match(status, /navigator\.onLine/);
  assert.match(status, /window\.addEventListener\("offline"/);
  assert.match(status, /cola local/);
  assert.match(queue, /idempotencyKey/);
  assert.match(queue, /dependsOn/);
  assert.match(queue, /PROCESSING/);
});

test("internacionalización permite ES EN PT y persiste preferencia", () => {
  const i18n = read("lib/i18n.tsx");
  const switcher = read("components/system/LocaleSwitcher.tsx");
  assert.match(i18n, /ApexLocale = "es" \| "en" \| "pt"/);
  assert.match(i18n, /apex_locale/);
  assert.match(i18n, /document\.documentElement\.lang/);
  assert.match(switcher, /ES/);
  assert.match(switcher, /EN/);
  assert.match(switcher, /PT/);
});

test("DashboardChrome integra las capacidades globales sin insertar señales sobre todos los módulos", () => {
  const source = read("components/shell/DashboardChrome.tsx");
  for (const component of ["CommandPalette", "ContextBreadcrumbs", "TraceabilityCenter", "OfflineFirstStatus", "LocaleSwitcher", "StandardTableExperience"]) {
    assert.match(source, new RegExp(`<${component}`), `${component} debe estar montado globalmente`);
  }
  assert.doesNotMatch(source, /ApexIntelligencePulse/, "la señal inteligente no debe mostrarse globalmente en los módulos");
});

test("tablas operativas heredadas reciben contador, columnas y persistencia sin tocar editores", () => {
  const source = read("components/system/StandardTableExperience.tsx");
  assert.match(source, /apex-standard-table-toolbar/);
  assert.match(source, /registros/);
  assert.match(source, /seleccionados/);
  assert.match(source, /Configurar columnas de la tabla/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /closest\("dialog,\[role=dialog\],form"\)/);
  assert.match(source, /tableLayout === "detail"/);
  assert.match(source, /MutationObserver/);
});
