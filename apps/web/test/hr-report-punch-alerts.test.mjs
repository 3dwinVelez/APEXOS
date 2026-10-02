import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isCriticalPunctuality, minutesFromTime, punchClockTime, punctualityAlert } from "../lib/punchPunctuality.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const window = { startTime: "06:30", endTime: "14:30", toleranceMinutes: 10 };

test("la puntualidad de marcacion replica las alertas criticas del monitor de rutas", () => {
  assert.deepEqual(punctualityAlert({ type: "entrada", time: "06:40", ...window }), { label: "Dentro de tolerancia (+10 min)", tone: "info" });
  assert.deepEqual(punctualityAlert({ type: "entrada", time: "06:54", ...window }), { label: "Tarde 24 min", tone: "warning" });
  assert.deepEqual(punctualityAlert({ type: "entrada", time: "06:30", ...window }), { label: "En punto", tone: "success" });
  assert.deepEqual(punctualityAlert({ type: "entrada", time: "06:10", ...window }), { label: "Anticipado 20 min", tone: "success" });
  assert.deepEqual(punctualityAlert({ type: "salida", time: "14:30", ...window }), { label: "Cierre a tiempo", tone: "success" });
  assert.deepEqual(punctualityAlert({ type: "salida", time: "14:25", ...window }), { label: "Cierre anticipado 5 min", tone: "info" });
  assert.deepEqual(punctualityAlert({ type: "salida", time: "14:00", ...window }), { label: "Salida temprana 30 min", tone: "warning" });
  assert.equal(punctualityAlert({ type: "inicio_almuerzo", time: "10:00", ...window }), null);
  assert.equal(punctualityAlert({ type: "entrada", time: null, punched_at: null, ...window }), null);
  assert.equal(punctualityAlert({ type: "entrada", time: "06:54", startTime: null, endTime: "14:30" }), null);
  assert.equal(isCriticalPunctuality(punctualityAlert({ type: "entrada", time: "06:54", ...window })), true);
  assert.equal(isCriticalPunctuality(punctualityAlert({ type: "entrada", time: "06:40", ...window })), false);
});

test("la hora de marcacion se deriva del reloj de Bogota cuando solo existe punched_at", () => {
  assert.equal(minutesFromTime("06:54:00"), 414);
  assert.equal(punchClockTime({ time: "06:54", punched_at: null }), "06:54");
  assert.equal(punchClockTime({ time: null, punched_at: "2026-09-26T11:54:00.000Z" }), "06:54");
  const alert = punctualityAlert({ type: "entrada", time: null, punched_at: "2026-09-26T11:54:00.000Z", ...window });
  assert.deepEqual(alert, { label: "Tarde 24 min", tone: "warning" });
});

test("el reporte de talento humano refleja las alertas por marcacion en tabla, detalle y excel", () => {
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/talento-humano/reportes/page.tsx"), "utf8");
  assert.match(page, /from "@\/lib\/punchPunctuality"/);
  assert.match(page, /"Cierre", "Alertas", "Laboradas"/);
  assert.match(page, /function PunchAlertStack/);
  assert.match(page, /function reportPunchAlerts/);
  assert.match(page, /alerts\.map/);
  assert.match(page, /rowKey=\{row\.key\}/);
  assert.match(page, /w-\[22rem\]/);
  assert.match(page, /const punchAlerts = reportPunchAlerts\(entry, exit, route\)/);
  assert.doesNotMatch(page, /const punchAlerts = events\.flatMap/);
  assert.match(page, /alerta_entrada: row\.punchAlerts\.find\(\(alert\) => alert\.type === "entrada"\)/);
  assert.match(page, /alerta_cierre: row\.punchAlerts\.find\(\(alert\) => alert\.type === "salida"\)/);
  assert.match(page, /alerta: event\.alert\?\.label \|\| ""/);
  assert.match(page, /Jornadas con alerta critica/);
  assert.match(page, /event\.alert \? <Badge tone=\{event\.alert\.tone\}/);
  assert.match(page, /Trazabilidad cronologica del equipo/);
  assert.match(page, /selected\.events\.filter\(\(event\) => event\.kind === "Marcacion"\)\.length\} marcaciones/);
  assert.match(page, /MapPin size=\{12\}/);
  assert.match(page, /Sin evidencia fotografica/);
  assert.match(page, /<ol className="space-y-3">/);
  assert.match(page, /className="relative pl-14"/);
  assert.match(page, /ring-4 ring-paper/);
  assert.match(page, /\{isMark \? "Marcacion" : "Actividad"\}/);
  assert.match(page, /event\.userName\} · <span className="font-semibold text-content-body">/);
  assert.match(page, /fixed inset-0 z-50 flex items-end justify-center/);
  assert.match(page, /document\.body\.style\.overflow = "hidden"/);
  assert.match(page, /detailDialogRef\.current\?\.focus\(\)/);
  assert.match(page, /overscroll-contain/);
  assert.match(page, /md:max-w-6xl md:rounded-overlay/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /lg:grid-cols-\[320px_1fr\]/);
  assert.doesNotMatch(page, /ml-auto flex h-full/);
});

test("el monitor de rutas y el reporte comparten la misma fuente de puntualidad", () => {
  const rutas = fs.readFileSync(path.join(root, "apps/web/app/dashboard/talento-humano/rutas/page.tsx"), "utf8");
  assert.match(rutas, /from "@\/lib\/punchPunctuality"/);
  assert.doesNotMatch(rutas, /function minutesFromTime/);
  assert.doesNotMatch(rutas, /Tarde \$\{diff\} min/);
  assert.match(rutas, /punctualityAlert\(\{/);
});
