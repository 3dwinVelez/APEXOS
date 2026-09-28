import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Contrato de la pantalla de horarios (rutas) tras la intervencion de Talento Humano:
//  1) el monitor de un horario se abre como ventana emergente (portal + dialog accesible),
//     no como panel lateral estatico;
//  2) con muchos integrantes se puede validar marcaciones y actividades por usuario,
//     acotando la linea de tiempo a una persona o a un tipo de evento;
//  3) el horario se elimina por completo bajo permiso especial de borrado fisico, con
//     vista previa del impacto, motivo obligatorio y confirmacion explicita.

const source = readFileSync(
  new URL("../app/dashboard/talento-humano/rutas/page.tsx", import.meta.url),
  "utf8"
);

const KNOWN_MARKERS = [
  'aria-label="Monitor de horario"',
  'aria-label="Filtrar eventos por persona"',
  "deletion-impact"
];

test("la pantalla de horarios carga completa y conserva sus marcadores clave", () => {
  assert.ok(source.split("\n").length >= 1500, "la pagina debe conservar su tamano funcional");
  for (const marker of KNOWN_MARKERS) {
    assert.ok(source.includes(marker), `falta el marcador ${marker}`);
  }
});

test("el monitor del horario se abre como ventana emergente accesible", () => {
  assert.match(source, /import \{ createPortal \} from "react-dom";/);
  assert.match(source, /\{selectedRoute \? createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /fixed inset-0 z-\[70\] flex items-end/);
  assert.match(source, /md:items-center md:justify-center/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-label="Monitor de horario"/);
  assert.match(source, /ref=\{monitorDialogRef\}/);
  assert.equal((source.match(/createPortal\(/g) || []).length, 3, "monitor, lightbox y accion movil usan portal");
});

test("la ventana emergente gobierna foco y cierre con Escape", () => {
  assert.match(source, /monitorDialogRef\.current\?\.focus\(\)/);
  assert.match(source, /trapFocus\(event, lightboxIndex != null \? lightboxDialogRef\.current : monitorDialogRef\.current\)/);
  assert.match(source, /if \(event\.key === "Escape"\)/);
  assert.match(source, /setSelectedRouteId\(""\)/);
});

test("permite validar marcaciones y actividades por usuario", () => {
  assert.ok(source.includes("Toca una persona para validar solo sus marcaciones y actividades."));
  assert.match(source, /aria-pressed=\{active\}/);
  assert.match(source, /onClick=\{\(\) => setMonitorPerson\(active \? "" : key\)\}/);
  assert.match(source, /aria-label="Filtrar eventos por persona"/);
  assert.match(source, /Todo el equipo \(\{monitorPeople\.length\}\)/);
  assert.match(source, /aria-label="Persona anterior"/);
  assert.match(source, /aria-label="Persona siguiente"/);
  assert.match(source, /moveMonitorPerson\(-1\)/);
  assert.match(source, /moveMonitorPerson\(1\)/);
});

test("acota la linea de tiempo por persona y por tipo de evento", () => {
  assert.match(source, /\[\"all\", `Todos \(\$\{personScopedTimeline\.length\}\)`\]/);
  assert.match(source, /\[\"marca\", `Marcaciones \(\$\{monitorMarcaCount\}\)`\]/);
  assert.match(source, /\[\"actividad\", `Actividades \(\$\{monitorActivityCount\}\)`\]/);
  assert.match(source, /aria-pressed=\{monitorKind === kind\}/);
  assert.match(source, /onClick=\{\(\) => setMonitorKind\(kind\)\}/);
  assert.match(source, /\{monitorPersonRecord \? `Trazabilidad de \$\{monitorPersonRecord\.label\}` : "Trazabilidad cronologica del equipo"\}/);
  assert.match(source, /marcaciones clave/);
  assert.match(source, /registradas/);
});

test("resetea filtros al abrir el monitor y explica los vacios del filtro", () => {
  assert.equal((source.match(/setMonitorPerson\(""\)/g) || []).length >= 2, true, "abrir y cambiar de dia limpian la persona");
  assert.equal((source.match(/setMonitorKind\("all"\)/g) || []).length >= 2, true, "abrir y cambiar de dia limpian el tipo");
  assert.match(source, /function resetMonitorFilters/);
  assert.match(source, /Sin eventos en el dia consultado/);
  assert.match(source, /Sin eventos para el filtro actual/);
  assert.match(source, /Ver todo el equipo/);
  assert.match(source, /Ver todos los tipos/);
  assert.match(source, /Siguiente persona/);
  assert.match(source, /Ir al dia del horario/);
});

test("el borrado completo exige el permiso especial y muestra el impacto con vista previa", () => {
  assert.match(source, /deletion-impact/);
  assert.match(source, /permissions\?\.can_physical_delete/);
  assert.match(source, /const DELETE_REASON_MIN = 12;/);
  assert.match(source, /Eliminar definitivamente/);
  assert.match(source, /permiso especial de borrado fisico/);
  assert.ok(source.includes("Se retiran la malla, su lista de chequeo preoperacional y sus autorizaciones de arranque."));
  assert.ok(source.includes("Tu rol no tiene el permiso especial de borrado fisico sobre Talento Humano."));
  assert.match(source, /Se elimina/);
  assert.match(source, /Se conserva/);
  assert.match(source, /disabled=\{deleting \|\| loadingImpact \|\| !deleteAvailable\}/);
});

test("confirmar el borrado envia motivo, confirmacion y reconocimiento de traza al servidor", () => {
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /reason: deleteReason\.trim\(\)/);
  assert.match(source, /confirmed: true/);
  assert.match(source, /expected_employees: deleteImpact\?\.route\.employee_count/);
  assert.match(source, /expected_date: deleteImpact\?\.route\.date/);
  assert.match(source, /acknowledge_trace: deleteTraceAck/);
  assert.match(source, /impactRequiresTraceAck\(deleteImpact\)/);
  assert.match(source, /deleteReason\.trim\(\)\.length < DELETE_REASON_MIN/);
  assert.match(source, /if \(!deleteConfirmed\)/);
  assert.match(source, /Confirmo que quiero eliminar/);
});
