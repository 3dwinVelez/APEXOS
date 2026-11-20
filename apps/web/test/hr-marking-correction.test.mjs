import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), "utf8").replace(/\r\n/g, "\n");

const {
  CORRECTION_REASON_MAXIMUM,
  CORRECTION_REASON_MINIMUM,
  PUNCH_LADDER_LABELS,
  correctionBody,
  correctionInstant,
  correctionValidationIssues,
  isPunchLadderType,
  missingLadderTypes,
  scheduledClockFor
} = await import("../lib/hrMarkingCorrection.ts");

const AHORA = new Date("2026-11-19T15:00:00Z");
const HORARIO = { start_time: "06:00", end_time: "14:30" };

function entrada(input = {}) {
  return {
    employeeId: 463,
    userName: "EMP-463",
    date: "2026-11-18",
    type: "entrada",
    clock: "06:00",
    reason: "La marcacion de entrada fue rechazada y no pudo repetir",
    schedule: HORARIO,
    ...input
  };
}

test("la escalera incompleta ofrece los huecos en el orden en que debian ocurrir", () => {
  assert.deepEqual(missingLadderTypes({ entrada: true, salida: true }), ["inicio_almuerzo", "fin_almuerzo"]);
  assert.deepEqual(missingLadderTypes({ entrada: true }), ["inicio_almuerzo", "fin_almuerzo", "salida"]);
  assert.deepEqual(missingLadderTypes({}), ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"]);
  assert.deepEqual(missingLadderTypes({ entrada: true, inicio_almuerzo: true, fin_almuerzo: true, salida: true }), []);
  assert.deepEqual(missingLadderTypes(null), ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"]);
});

test("el horario define la entrada y la salida, y el almuerzo se escribe a mano", () => {
  assert.equal(scheduledClockFor("entrada", HORARIO), "06:00");
  assert.equal(scheduledClockFor("salida", HORARIO), "14:30");
  // Sin dato no hay hora sugerida: inventarla seria justo lo que la autorizacion excluye.
  assert.equal(scheduledClockFor("inicio_almuerzo", HORARIO), "");
  assert.equal(scheduledClockFor("fin_almuerzo", HORARIO), "");
  assert.equal(scheduledClockFor("entrada", null), "");
  assert.equal(scheduledClockFor("entrada", { start_time: "06:00:00" }), "06:00");
});

test("la hora corregida viaja con su desplazamiento, no con el del servidor", () => {
  const instant = correctionInstant("2026-11-18", "06:00");
  assert.equal(instant, "2026-11-18T06:00:00-05:00");
  // 06:00 de Bogota son 11:00 UTC: si se perdiera el desplazamiento, la jornada empezaria a la 1.
  assert.equal(new Date(instant).toISOString(), "2026-11-18T11:00:00.000Z");
});

test("una hora mal formada no produce instante", () => {
  assert.equal(correctionInstant("2026-11-18", "6:00"), "");
  assert.equal(correctionInstant("2026-11-18", "24:00"), "");
  assert.equal(correctionInstant("2026-11-18", "06:60"), "");
  assert.equal(correctionInstant("2026-11-18", ""), "");
  assert.equal(correctionInstant("18/11/2026", "06:00"), "");
  assert.equal(correctionInstant("", "06:00"), "");
});

test("la validacion exige ficha resuelta, hora presente y motivo legible", () => {
  assert.deepEqual(correctionValidationIssues(entrada(), AHORA), []);
  assert.match(correctionValidationIssues(entrada({ employeeId: null }), AHORA)[0], /no resolvio la ficha/);
  assert.match(correctionValidationIssues(entrada({ employeeId: "463" }), AHORA)[0], /no resolvio la ficha/);
  assert.match(correctionValidationIssues(entrada({ clock: "6:00" }), AHORA)[0], /HH:MM/);
  assert.match(correctionValidationIssues(entrada({ date: "2026-11-19", clock: "21:00" }), AHORA)[0], /posterior a este momento/);
  assert.match(correctionValidationIssues(entrada({ reason: "  " }), AHORA)[0], new RegExp(String(CORRECTION_REASON_MINIMUM)));
  assert.match(correctionValidationIssues(entrada({ reason: "ok" }), AHORA)[0], new RegExp(String(CORRECTION_REASON_MINIMUM)));
  // Relleno que cumple el conteo de caracteres y no dice nada.
  assert.equal(correctionValidationIssues(entrada({ reason: "-------------" }), AHORA).length, 1);
  assert.match(correctionValidationIssues(entrada({ userName: "  " }), AHORA)[0], /identificador del trabajador/);
  assert.match(correctionValidationIssues(entrada({ type: "almuerzo" }), AHORA)[0], /marcacion que falta/);
});

test("la hora dentro de la tolerancia del futuro relativo se acepta", () => {
  // 15:00 UTC son 10:00 en Bogota: las 11:00 locales todavia no ocurren.
  assert.equal(correctionValidationIssues(entrada({ date: "2026-11-19", clock: "11:00" }), AHORA).length, 1);
  assert.deepEqual(correctionValidationIssues(entrada({ date: "2026-11-19", clock: "09:00" }), AHORA), []);
});

test("el cuerpo declara la correccion, el destino y nunca un horario", () => {
  const body = correctionBody(entrada({ clock: "06:00" }));
  assert.equal(body.employee_id, 463);
  assert.equal(body.user_name, "EMP-463");
  assert.equal(body.type, "entrada");
  assert.equal(body.punched_at, "2026-11-18T06:00:00-05:00");
  assert.equal(body.correccion_administrativa, true);
  assert.equal(body.motivo_correccion.length, entrada().reason.length);
  // Sin route_id: el supervisor corrige una hora, no autoriza el inicio de una ruta (ahi se
  // atraviesa el checklist preoperacional del conductor sobre una jornada que ya ocurrio).
  assert.equal(body.route_id, undefined);
  assert.equal(body.vehicle_plate, undefined);
  assert.equal(body.extra_evidence, undefined);
  assert.equal(Object.keys(body).length, 6);
});

test("el motivo se recorta al maximo que admite el servidor", () => {
  const body = correctionBody(entrada({ reason: `  ${"a".repeat(CORRECTION_REASON_MAXIMUM + 40)}  ` }));
  assert.equal(body.motivo_correccion.length, CORRECTION_REASON_MAXIMUM);
  assert.equal(correctionValidationIssues(entrada({ reason: "a".repeat(CORRECTION_REASON_MAXIMUM + 1) }), AHORA).length, 1);
});

test("los cuatro tipos de la escalera tienen nombre en la pantalla", () => {
  for (const type of ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"]) {
    assert.ok(isPunchLadderType(type));
    assert.ok(PUNCH_LADDER_LABELS[type].length > 2, `${type} debe tener etiqueta legible`);
  }
  assert.equal(isPunchLadderType("recargo"), false);
});

test("la pantalla monta la correccion sobre el permiso hr:write y el endpoint administrativo", () => {
  const page = read("../app/dashboard/talento-humano/reportes/page.tsx");
  assert.match(page, /hasStoredRolePermission\("hr", "write"\)/, "la accion debe estar gateada por el mismo permiso que el endpoint");
  assert.match(page, /api\/v1\/hr\/time-punches/, "debe invocar el endpoint administrativo, no el self-service");
  assert.doesNotMatch(page, /api\/v1\/hr\/self\/time-punches/, "el canal propio no puede recibir correcciones");
  assert.match(page, /correctionBody\(input\)/, "el cuerpo se construye con el helper puro");
  assert.match(page, /correctionValidationIssues\(input\)/, "la validacion corre del lado del cliente antes de enviar");
  assert.match(page, /Motivo de la correccion/, "el dialogo pide el motivo obligatorio");
  assert.match(page, /maxLength=\{CORRECTION_REASON_MAXIMUM\}/, "el campo se corta donde corta el servidor");
  assert.match(page, /missingPunches\.map/, "la pantalla ofrece cada hueco de la escalera");
  assert.match(page, /correccion_administrativa/, "la fila corregida se lee como correccion en la trazabilidad");
});

test("cada boton que nace de la escalera lleva su key", () => {
  const page = read("../app/dashboard/talento-humano/reportes/page.tsx");
  const escalera = page.match(/\{missingPunches\.map\(\(type\) => \(\s*([\s\S]*?)<\/button>\s*\)\)\}/);
  assert.ok(escalera, "la escalera debe seguir iterando los huecos: si cambió de forma, este control ya no mide nada");
  assert.match(escalera[1], /<button key=\{type\}/, "un iterador sin key apaga el lint de la rama");
});
