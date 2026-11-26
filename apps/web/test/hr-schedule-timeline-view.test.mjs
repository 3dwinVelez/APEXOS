import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "app/dashboard/talento-humano/rutas/page.tsx"), "utf8");

const has = (needle, why) => assert.ok(page.includes(needle), `falta en la pantalla: ${needle}${why ? ` (${why})` : ""}`);
const lacks = (needle, why) => assert.ok(!page.includes(needle), `no puede aparecer: ${needle}${why ? ` (${why})` : ""}`);

// El bloque del eje se ejecuta aislado: la matematica de la barra es lo que el PDF fija
// (left = (inicio - 6) / 16, width = duracion / 16) y recordarla de memoria no la prueba.
// La fuente aislada es la del propio archivo versionado, no entrada externa.
const helpers = page.slice(page.indexOf("const TIMELINE_START_HOUR"), page.indexOf("function routeStateDotClass"));
assert.ok(helpers.length > 200, "el bloque del eje temporal existe");
const axis = new Function(`${ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText};return { timelineBar, hourOfDay, TIMELINE_MAX_ROWS, TIMELINE_TICK_HOURS };`)();

test("la vista por defecto es la linea de tiempo y se puede cambiar a tabla", () => {
  has('const [scheduleView, setScheduleView] = useState<"timeline" | "table">("timeline");', "por defecto la linea de tiempo");
  has('aria-label="Modo de vista del listado"');
  has('aria-pressed={scheduleView === "timeline"}');
  has('aria-pressed={scheduleView === "table"}');
  has("Línea de tiempo</button>");
  has("Tabla</button>");
  // Cada vista se pinta solo cuando el estado la pide: sin compuerta saldrian las dos a la vez.
  has('{scheduleView === "timeline" && filteredRoutes.length ? (');
  has('{scheduleView === "table" && filteredRoutes.length ? <>');
});

test("la barra se posiciona con la razon del eje de dieciseis horas", () => {
  assert.deepEqual(axis.timelineBar("06:00", "14:00"), { left: "0.00%", width: "50.00%", trimmed: false });
  assert.deepEqual(axis.timelineBar("14:00", "22:00"), { left: "50.00%", width: "50.00%", trimmed: false });
  assert.deepEqual(axis.timelineBar("08:00", "12:00"), { left: "12.50%", width: "25.00%", trimmed: false });
  assert.equal(axis.hourOfDay("06:30"), 6.5);
  assert.equal(axis.hourOfDay(""), null);
  assert.equal(axis.hourOfDay(null), null);
});

test("el recorte se dibuja y se nombra, no se omite", () => {
  // Arranca antes del eje: solo se ve el tramo dentro de la franja (06:00-09:00 = 3 de 16 horas)
  // y la barra avisa que se sale.
  const early = axis.timelineBar("05:00", "09:00");
  assert.equal(early.left, "0.00%");
  assert.equal(early.width, "18.75%");
  assert.equal(early.trimmed, true);
  // Turno que cruza medianoche: no es un rango vacio, la hora suma sigue caminando.
  const night = axis.timelineBar("22:00", "06:00");
  assert.equal(night.trimmed, true);
  assert.equal(night.width, "1.50%");
  assert.notEqual(night.left, "0.00%", "la jornada nocturna no se pega al inicio del dia");
  // Sin horas no hay barra, y la pantalla lo dice en words.
  assert.equal(axis.timelineBar("", ""), null);
  has("sin horario definido");
  has("la jornada se sale de la franja visible");
});

test("el eje cubre la ventana operativa y la lista se acota con aviso", () => {
  assert.deepEqual(axis.TIMELINE_TICK_HOURS, [6, 8, 10, 12, 14, 16, 18, 20, 22]);
  assert.equal(axis.TIMELINE_MAX_ROWS, 60);
  has("const TIMELINE_SPAN_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;");
  has("{timelineRows.visible.map((route) => {");
  has("quedan {timelineRows.hidden} por mostrar");
  has("const timelineRows = useMemo");
});

test("la barra y el nombre son botones que abren el detalle y destacan el horario abierto", () => {
  has("const detailAriaLabel = `Abrir detalle del horario ${label}`;");
  assert.equal((page.match(/aria-label=\{detailAriaLabel\}/g) || []).length, 2, "la barra y el nombre son el mismo acceso");
  assert.ok((page.match(/onClick=\{\(\) => openRouteMonitor\(route\)\}/g) || []).length >= 4, "el detalle abre desde la linea de tiempo y desde la tabla");
  has("const open = String(route.id) === selectedRouteId;");
  has('${open ? "ring-2 ring-apex" : "hover:opacity-90"}');
  has("Haz clic sobre un horario para ver su detalle");
  has('className="relative h-14 flex-1 rounded-md border border-line bg-paper lg:h-10"');
});

test("el estado se pinta con tokens del sistema y sin hexadecimal literal", () => {
  has('function routeStateDotClass(route: RouteMonitor | TimeRoute) {');
  has('if (label === "En seguimiento") return "bg-apex";');
  has('if (label === "Sin eventos") return "bg-warning";');
  assert.ok(!/#[0-9a-fA-F]{6}/.test(page), "los colores del prototipo no entran al codigo");
  assert.ok(!/(bg|border|text)-\[[#rgb]/.test(page), "ni colores arbitrarios de Tailwind");
  // El punto de color sustituye la pastilla de fondo en la tabla, y el texto sigue nombrando el estado.
  has('rounded-full ${routeStateDotClass(route)}`} />{displayState.label}');
  lacks('<span className={`rounded-md px-2 py-1 text-xs font-semibold ${displayState.className}`}>{displayState.label}</span><p className="mt-1 text-xs capitalize');
});

test("la tabla abre por la fila y guarda Editar y Clonar detras del menu de mas acciones", () => {
  has('<tr className="cursor-pointer hover:bg-paper/70" key={String(route.id)} data-route-id={String(route.id)} onClick={() => openRouteMonitor(route)}>');
  has('aria-expanded={rowMenuId === String(route.id)} aria-label={`Mas acciones del horario');
  has("<MoreHorizontal size={15} />");
  has('{ setRowMenuId(""); openEditModal(route); }');
  has('{ setRowMenuId(""); openCreateModal(route); }');
  // El menu se despliega dentro de la misma celda: un cuarto portal romperia el censado del monitor
  // y un flotante absoluto se recorta contra el scroll horizontal de la tabla.
  assert.equal((page.match(/createPortal\(/g) || []).length, 3, "monitor, lightbox y accion movil usan portal");
  lacks("absolute right-0 top-");
});

test("la fila de indicadores es una sola linea adaptativa", () => {
  has("grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2");
  const block = page.slice(page.indexOf("grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))]"), page.indexOf("</div>", page.indexOf("grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))]")));
  assert.equal((block.match(/<KpiTile /g) || []).length, 6, "seis tarjetas compactas en la misma linea");
  lacks("grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6");
});

test("la ventana de detalle flota sobre fondo difuminado con franja de metricas", () => {
  has('className="fixed inset-0 z-[70] flex items-end bg-neutral-950/70 p-0 backdrop-blur-sm');
  for (const metric of ["Marcaciones", "Actividades", "Evidencias", "En vivo"]) {
    assert.ok(page.includes(`/> ${metric}</p>`), `la franja nombra ${metric}`);
  }
  has('<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">');
  lacks("{monitorMarcaCount} marcaciones</Badge>");
});

test("la tarjeta de persona avanza por los cuatro pasos de la jornada", () => {
  has("{Array.from(marks.keys()).length} de {punchSequence.length} pasos");
  has('punchSequence.map((type) => punchShortNames[type]).join(" › ")');
  has('className={`h-px flex-1 ${mark ? "bg-apex" : "bg-line"}`}');
  has('{mark ? <CheckCircle2 size={12} /> : step + 1}');
  // El pendiente se numera: el avance se lee sin depender del color.
  has('rounded-full text-[10px] font-bold ${mark ? "bg-apex text-white" : "bg-surface-muted text-content-subtle"}');
});

test("el rediseno deja intacta la lectura de datos y los anclajes del monitor", () => {
  has('aria-label="Monitor de horario"');
  has('aria-label="Filtrar eventos por persona"');
  has("const ROUTES_BACKSTOP_POLL_MS = 30_000;");
  has("const EVIDENCE_FETCH_CONCURRENCY = 4;");
  has('api<Employee[]>("/api/v1/talento-humano/empleados?active=true", { cache: "no-store" })');
  has('aria-label="Vistas de horarios y mallas"');
  has('["marca", `Marcaciones (${monitorMarcaCount})`]');
  assert.ok(page.split("\n").length >= 1500);
});
