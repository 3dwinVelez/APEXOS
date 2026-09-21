import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// El repositorio usa CRLF; se normaliza para que las busquedas multilinea de los tests de
// contrato no dependan del final de linea.
const read = (relative) => fs.readFileSync(path.resolve(here, relative), "utf8").replace(/\r\n/g, "\n");

const markingSource = read("../app/dashboard/talento-humano/marcacion/page.tsx");
const sliceFrom = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `debe existir ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  assert.ok(end > start, `debe existir ${endMarker} despues de ${startMarker}`);
  return source.slice(start, end);
};

const {
  buildHrOfflineSnapshot,
  classifySyncFailure,
  decideOfflineMarking,
  degradeUntilPersisted,
  degradedScheduleNotice,
  evidenceRefMarker,
  evidenceRefOf,
  gpsFailureCause,
  gpsUnavailableMetadata,
  inlineEvidenceBytes,
  payloadByteLength,
  quotaDegradationPlan,
  requestOutcome,
  resolveDegradedSchedule,
  syncFailureReason,
  GPS_UNAVAILABLE_REASONS,
  OFFLINE_GPS_REASON
} = await import("../lib/hrOfflineMarking.ts");

const evidenceStore = await import("../lib/hrOfflineEvidence.ts");

// Escenario Edwin: el operario marca desde que abre el horario, con o sin senal. La marcacion
// conserva su hora real, se avisa que se sincronizara y la falta de GPS deja novedad en vez de
// bloquear la jornada.

test("B: sin senal se puede marcar aunque el GPS sea obligatorio y queda novedad", () => {
  const decision = decideOfflineMarking({ online: false, gpsRequired: true, hasFix: false, cause: null });

  assert.equal(decision.allowed, true);
  assert.equal(decision.gpsUnavailable, true);
  assert.equal(decision.reason, OFFLINE_GPS_REASON);
  assert.match(decision.userMessage, /Sin senal/);
  assert.match(decision.userMessage, /fecha y hora reales/);
  assert.match(decision.userMessage, /GPS inactivo por falta de senal/);
});

test("B: el permiso denegado es decision del usuario y sigue bloqueando la marcacion", () => {
  const decision = decideOfflineMarking({ online: true, gpsRequired: true, hasFix: false, cause: "PERMISSION_DENIED" });

  assert.equal(decision.allowed, false);
  assert.equal(decision.gpsUnavailable, false, "no hay novedad cuando el bloqueo lo provoco el usuario");
  assert.match(decision.userMessage, /permiso de ubicacion/i);
});

test("B: timeout, posicion no disponible y equipo sin GPS permiten marcar con novedad", () => {
  for (const cause of ["TIMEOUT", "POSITION_UNAVAILABLE", "UNSUPPORTED", "UNKNOWN"]) {
    const decision = decideOfflineMarking({ online: true, gpsRequired: true, hasFix: false, cause });
    assert.equal(decision.allowed, true, cause);
    assert.equal(decision.gpsUnavailable, true, cause);
    assert.equal(decision.reason, GPS_UNAVAILABLE_REASONS[cause], cause);
    assert.ok(decision.reason.length <= 120, "el backend trunca reason a 120 caracteres");
  }
});

test("B: con fix disponible o con horario sin GPS no se declara novedad", () => {
  assert.equal(decideOfflineMarking({ online: true, gpsRequired: true, hasFix: true, cause: null }).gpsUnavailable, false);
  assert.equal(decideOfflineMarking({ online: false, gpsRequired: true, hasFix: true, cause: "TIMEOUT" }).gpsUnavailable, false);

  const withoutGps = decideOfflineMarking({ online: false, gpsRequired: false });
  assert.equal(withoutGps.allowed, true);
  assert.equal(withoutGps.gpsUnavailable, false);
});

test("B: el metadata de GPS inactivo coincide con gpsUnavailableFromInput del backend", () => {
  assert.deepEqual(
    gpsUnavailableMetadata({ gpsUnavailable: true, reason: "sin_senal", queuedAt: "2026-09-21T12:00:00.000Z" }),
    { gps_unavailable: true, gps_unavailable_reason: "sin_senal", queued_at: "2026-09-21T12:00:00.000Z" }
  );
  assert.deepEqual(gpsUnavailableMetadata({ gpsUnavailable: false, reason: "", queuedAt: "" }), {});
});

test("B: gpsFailureCause lee la causa estable y tambien un GeolocationPositionError crudo", () => {
  assert.equal(gpsFailureCause(Object.assign(new Error("x"), { gpsCause: "TIMEOUT" })), "TIMEOUT");
  assert.equal(gpsFailureCause(Object.assign(new Error("x"), { gpsCause: "permission_denied" })), "PERMISSION_DENIED");
  assert.equal(gpsFailureCause({ code: 1 }), "PERMISSION_DENIED");
  assert.equal(gpsFailureCause({ code: 2 }), "POSITION_UNAVAILABLE");
  assert.equal(gpsFailureCause({ code: 3 }), "TIMEOUT");
  assert.equal(gpsFailureCause({ code: 9 }), "UNKNOWN");
  assert.equal(gpsFailureCause(new Error("sin causa")), "UNKNOWN");
  assert.equal(gpsFailureCause(null), "UNKNOWN");
  assert.equal(gpsFailureCause(undefined), "UNKNOWN");
});

test("B: lib/gps propaga la causa estable sin cambiar la firma que ya consumia la pantalla", () => {
  const gps = read("../lib/gps.ts");
  assert.match(gps, /export function getGpsFix\(timeout = 8000\): Promise<GpsFix>/);
  assert.match(gps, /gpsCause: GpsFixFailureCause/);
  assert.match(gps, /gpsFixError\("UNSUPPORTED"\)/);
  assert.match(gps, /error\.code === error\.PERMISSION_DENIED/);
  assert.match(gps, /error\.code === error\.TIMEOUT/);
  assert.match(gps, /causeOf\(retryError\)/);
  // El reintento en baja precision sigue siendo exclusivo del timeout.
  assert.match(gps, /enableHighAccuracy: false, timeout: 5000, maximumAge: 30000/);
  assert.doesNotMatch(gps, /reject\(new Error\("Activa el permiso de ubicacion para continuar\."\)\)/);
});

test("A: el snapshot solo sirve como horario vigente si se tomo el dia de hoy", () => {
  const snapshot = { taken_at: "2026-09-21T12:00:00.000Z", taken_day: "2026-09-21", self: { id: 1 }, routes: [{ id: 7 }], activity_types: [] };

  const usable = resolveDegradedSchedule({ routesOk: false, liveRoutes: [], snapshot, today: "2026-09-21" });
  assert.equal(usable.source, "snapshot");
  assert.deepEqual(usable.routes, [{ id: 7 }]);
  assert.match(degradedScheduleNotice(usable, "2026-09-21"), /horario del dia guardado en este dispositivo/);
});

test("A: un snapshot de otro dia no se usa como horario y se avisa sin inventar jornada", () => {
  const snapshot = { taken_at: "2026-09-20T22:00:00.000Z", taken_day: "2026-09-20", self: { id: 1 }, routes: [{ id: 7 }], activity_types: [] };

  const stale = resolveDegradedSchedule({ routesOk: false, liveRoutes: [], snapshot, today: "2026-09-21" });
  assert.equal(stale.source, "stale_snapshot");
  assert.deepEqual(stale.routes, [], "no se debe reutilizar el horario de ayer");
  const notice = degradedScheduleNotice(stale, "2026-09-21");
  assert.match(notice, /2026-09-20/);
  assert.match(notice, /no sirve para marcar/);

  const none = resolveDegradedSchedule({ routesOk: false, liveRoutes: [], snapshot: null, today: "2026-09-21" });
  assert.equal(none.source, "none");
  assert.match(degradedScheduleNotice(none, "2026-09-21"), /sin horario guardado/);
});

test("A: con respuesta viva manda la API y no el snapshot", () => {
  const snapshot = { taken_at: "2026-09-21T12:00:00.000Z", taken_day: "2026-09-21", self: null, routes: [{ id: 7 }], activity_types: [] };
  const resolved = resolveDegradedSchedule({ routesOk: true, liveRoutes: [{ id: 9 }], snapshot, today: "2026-09-21" });

  assert.equal(resolved.source, "live");
  assert.deepEqual(resolved.routes, [{ id: 9 }]);
});

test("A: el snapshot se reescribe solo con rutas frescas y conserva el resto del dia anterior", () => {
  const previous = { taken_at: "ayer", taken_day: "2026-09-20", self: { id: 1 }, routes: [{ id: 7 }], activity_types: [{ id: 3 }] };

  const routesFailed = buildHrOfflineSnapshot({
    previous,
    self: requestOutcome(false, null),
    routes: requestOutcome(false, []),
    activityTypes: requestOutcome(false, []),
    takenAt: "hoy",
    takenDay: "2026-09-21"
  });
  assert.equal(routesFailed, previous, "sin rutas frescas el snapshot anterior debe envejecer por su propia taken_day");

  const refreshed = buildHrOfflineSnapshot({
    previous,
    self: requestOutcome(true, { id: 2 }),
    routes: requestOutcome(true, [{ id: 8 }]),
    activityTypes: requestOutcome(false, []),
    takenAt: "2026-09-21T13:00:00.000Z",
    takenDay: "2026-09-21"
  });
  assert.equal(refreshed.taken_day, "2026-09-21");
  assert.deepEqual(refreshed.routes, [{ id: 8 }]);
  assert.deepEqual(refreshed.self, { id: 2 });
  assert.deepEqual(refreshed.activity_types, [{ id: 3 }], "los tipos previos se conservan si su peticion fallo");
});

test("A: la pantalla persiste el snapshot y entra en modo degradado en el arranque en frio", () => {
  const load = sliceFrom(markingSource, "const load = useCallback(async () => {", "useEffect(() => {\n    load();");

  assert.match(load, /settle<Employee \| null>\(api<Employee>\("\/api\/v1\/hr\/self"\), null\)/);
  assert.match(load, /buildHrOfflineSnapshot\(/);
  assert.match(load, /writeHrSnapshot\(snapshot\)/);
  assert.match(load, /resolveDegradedSchedule<TimeRoute>\(/);
  assert.match(load, /setScheduleSource\(resolved\.source\)/);
  assert.match(load, /degradedScheduleNotice\(resolved, today\)/);
  assert.match(load, /setEmployee\(meResult\.ok \? meResult\.value : \(\(snapshot\?\.self \|\| null\) as Employee \| null\)\)/);
  // La regla de "solo el horario del dia en curso" sigue aplicada sobre la respuesta viva.
  assert.match(load, /routesResult\.value\.filter\(\(item\) => !item\.date \|\| String\(item\.date\)\.slice\(0, 10\) === today\)/);
});

test("C: la degradacion por cuota sacrifica primero la foto inline mas pesada", () => {
  const items = [
    { id: "vieja-chica", created_at: "2026-09-21T10:00:00.000Z", photo: 100 },
    { id: "vieja-grande", created_at: "2026-09-21T10:05:00.000Z", photo: 900 },
    { id: "reciente-sin-foto", created_at: "2026-09-21T11:00:00.000Z", photo: 0 }
  ];

  const plan = quotaDegradationPlan(items, (item) => item.photo);
  assert.deepEqual(plan.slice(0, 2), [
    { type: "strip_photo", id: "vieja-grande" },
    { type: "strip_photo", id: "vieja-chica" }
  ]);
  assert.deepEqual(plan.filter((action) => action.type === "drop_item").map((action) => action.id), [
    "vieja-chica",
    "vieja-grande"
  ], "los descartes van del mas antiguo al mas reciente y nunca tocan el ultimo");
});

test("C: degradeUntilPersisted se detiene en cuanto la cola cabe y no pierde el registro nuevo", () => {
  const photo = (bytes) => "x".repeat(bytes);
  const make = (id, created_at, bytes) => ({ id, created_at, payload: { photo: { base64: photo(bytes) } } });
  const items = [make("a", "2026-09-21T10:00:00.000Z", 900), make("b", "2026-09-21T11:00:00.000Z", 100)];
  const budget = 700;
  const stripEvidence = (item) => ({ ...item, payload: { photo: null }, evidence_dropped: true });

  const result = degradeUntilPersisted({
    items,
    limit: 50,
    serialize: (entries) => JSON.stringify(entries),
    persist: (serialized) => serialized.length <= budget,
    stripEvidence,
    photoBytesOf: (item) => inlineEvidenceBytes(item.payload)
  });

  assert.equal(result.persisted, true);
  assert.deepEqual(result.stripped, ["a"], "solo se sacrifica lo minimo necesario");
  assert.deepEqual(result.dropped, []);
  assert.equal(result.items.length, 2, "ningun registro se descarta cuando basta quitar la foto");
  assert.equal(result.items[0].evidence_dropped, true);
});

test("C: cuando ni quitando fotos cabe, se descartan los antiguos y se reporta el fracaso", () => {
  const make = (id, created_at, bytes) => ({ id, created_at, payload: { note: "y".repeat(bytes) } });
  const items = [
    make("antigua", "2026-09-21T08:00:00.000Z", 500),
    make("media", "2026-09-21T09:00:00.000Z", 500),
    make("nueva", "2026-09-21T10:00:00.000Z", 500)
  ];

  const result = degradeUntilPersisted({
    items,
    limit: 50,
    serialize: (entries) => JSON.stringify(entries),
    persist: (serialized) => serialized.length <= 1200,
    stripEvidence: (item) => item,
    photoBytesOf: () => 0
  });

  assert.equal(result.persisted, true);
  assert.deepEqual(result.dropped, ["antigua"], "se descarta primero la mas antigua");
  assert.ok(result.items.some((item) => item.id === "nueva"), "la marcacion que el operario acaba de hacer no se descarta");
});

test("C: si nada cabe, degradeUntilPersisted lo dice en vez de lanzar", () => {
  const result = degradeUntilPersisted({
    items: [{ id: "unica", created_at: "2026-09-21T10:00:00.000Z", payload: {} }],
    limit: 50,
    serialize: (entries) => JSON.stringify(entries),
    persist: () => false,
    stripEvidence: (item) => item,
    photoBytesOf: () => 0
  });

  assert.equal(result.persisted, false);
  assert.equal(result.items.length, 1, "el registro sigue visible en memoria aunque no se pueda persistir");
});

test("C: writePendingSync envuelve setItem en try/catch y degrada sin lanzar", () => {
  const fn = sliceFrom(markingSource, "function writePendingSync(items: PendingSyncItem[])", "\nfunction quotaNotice");

  assert.match(fn, /degradeUntilPersisted<PendingSyncItem>\(/);
  assert.match(fn, /try \{\s*localStorage\.setItem\(pendingSyncKey, serialized\);\s*return true;\s*\} catch \{\s*return false;\s*\}/);
  assert.match(fn, /photoBytesOf: \(item\) => inlineEvidenceBytes\(item\.payload\)/);
  assert.match(fn, /notice: "El almacenamiento local del dispositivo esta lleno/);
  assert.doesNotMatch(fn, /localStorage\.setItem\(pendingSyncKey, JSON\.stringify\(items\.slice\(-50\)\)\);/);
});

test("C: inlineEvidenceBytes mide solo el base64 y payloadByteLength el serializado completo", () => {
  assert.equal(inlineEvidenceBytes({ photo: { base64: "abcd", name: "a.jpg" } }), 4);
  assert.equal(inlineEvidenceBytes({ extra_evidence: { base64: "ab", evidence: [{ base64_data: "cde" }] } }), 5);
  assert.equal(inlineEvidenceBytes({ photo: { __hr_offline_evidence: "ref-1" } }), 0, "una referencia no pesa");
  assert.equal(inlineEvidenceBytes(null), 0);
  assert.equal(payloadByteLength({ a: "b" }), 9);
  assert.equal(payloadByteLength({ a: "ñ" }), 10, "debe medir bytes reales, no longitud de string");
});

test("C: la referencia de evidencia ida y vuelta", () => {
  const marker = evidenceRefMarker("ref-42");
  assert.equal(evidenceRefOf(marker), "ref-42");
  assert.equal(evidenceRefOf({ base64: "x" }), null);
  assert.equal(evidenceRefOf(null), null);
  assert.equal(evidenceRefOf("ref-42"), null);
});

test("C: las evidencias viajan por IndexedDB y la cola conserva solo la referencia", () => {
  const externalize = sliceFrom(markingSource, "async function externalizeEvidence", "async function rehydrateEvidence");
  assert.match(externalize, /putHrOfflineEvidence\(ref, \{ base64: photo\.base64, size: photo\.size, type: photo\.type, name: photo\.name \}\)/);
  assert.match(externalize, /result\[key\] = evidenceRefMarker\(ref\)/);

  const rehydrate = sliceFrom(markingSource, "async function rehydrateEvidence", "async function cleanupEvidence");
  assert.match(rehydrate, /getHrOfflineEvidence\(ref\)/);
  assert.match(rehydrate, /throw new Error\("La evidencia guardada en este dispositivo ya no esta disponible\."\)/);

  const flush = sliceFrom(markingSource, "async function flushPendingSync", "\nfunction offlineQueueWeight");
  assert.match(flush, /outbound = await rehydrateEvidence\(item\.payload\)/);
  assert.match(flush, /JSON\.stringify\(outbound\)/);
  assert.match(flush, /void cleanupEvidence\(item\)/);
});

test("C: el almacen de evidencias guarda, recupera, borra y poda en IndexedDB", async () => {
  const ref = evidenceStore.newHrOfflineEvidenceRef("test");
  const photo = { base64: "data:image/jpeg;base64,AAA", size: 3, type: "image/jpeg", name: "a.jpg" };

  assert.equal(await evidenceStore.putHrOfflineEvidence(ref, photo), true);
  assert.deepEqual(await evidenceStore.getHrOfflineEvidence(ref), photo);
  assert.equal(await evidenceStore.putHrOfflineEvidence("sin-base64", { base64: "", size: 0, type: "", name: "" }), false);
  assert.equal(await evidenceStore.getHrOfflineEvidence("no-existe"), null);

  const orphan = evidenceStore.newHrOfflineEvidenceRef("test");
  await evidenceStore.putHrOfflineEvidence(orphan, photo);
  await evidenceStore.pruneHrOfflineEvidence([ref]);
  assert.deepEqual(await evidenceStore.getHrOfflineEvidence(ref), photo, "la evidencia activa sobrevive a la poda");
  assert.equal(await evidenceStore.getHrOfflineEvidence(orphan), null, "el blob huerfano se poda");

  await evidenceStore.deleteHrOfflineEvidence(ref);
  assert.equal(await evidenceStore.getHrOfflineEvidence(ref), null);
});

test("C: un fallo permanente queda bloqueado y visible con el motivo real de la API", () => {
  const flush = sliceFrom(markingSource, "async function flushPendingSync", "\nfunction offlineQueueWeight");

  assert.match(flush, /if \(permanentSyncFailure\(error\)\)/);
  assert.match(flush, /blockPendingSync\(queue, item\.id, syncFailureReason\(failure\), failure\.code\)/);
  assert.match(flush, /onUpdate\?\.\(queue, `\$\{item\.label\} no fue aceptado: \$\{syncFailureReason\(failure\)\}`, "error"\)/);
  assert.doesNotMatch(flush, /queue = queue\.slice\(1\);\s*writePendingSync\(queue\);\s*changed = true;\s*onUpdate/, "ya no se descarta en silencio");
  // Los reintentables siguen en cola con su contador de intentos.
  assert.match(flush, /const next = \{ \.\.\.item, attempts: item\.attempts \+ 1 \}/);
  assert.match(flush, /Se reintentara automaticamente/);

  assert.match(markingSource, /Descartar registro/);
  assert.match(markingSource, /onClick=\{\(\) => setPendingSync\(discardPendingSync\(item\.id\)\)\}/);
  assert.match(markingSource, /\{item\.blocked_reason \|\| "Rechazado por el servidor\."\}/);
  assert.match(markingSource, /\{pendingBlocked\.length \? \(/);
});

test("C: classifySyncFailure separa el 4xx permanente del reintentable y conserva el motivo", () => {
  const permanent = classifySyncFailure(Object.assign(new Error("Solo puedes operar el horario asignado para el dia de la marcacion."), { status: 409, code: "HORARIO_FUERA_DEL_DIA" }));
  assert.equal(permanent.permanent, true);
  assert.equal(permanent.retryable, false);
  assert.equal(syncFailureReason(permanent), "Solo puedes operar el horario asignado para el dia de la marcacion. (HORARIO_FUERA_DEL_DIA)");

  for (const status of [408, 429, 500, 502, 0]) {
    const failure = classifySyncFailure(Object.assign(new Error("transitorio"), { status }));
    assert.equal(failure.permanent, false, `status ${status}`);
    assert.equal(failure.retryable, true, `status ${status}`);
  }

  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(classifySyncFailure(Object.assign(new Error("x"), { status })).permanent, true, `status ${status}`);
  }

  const unknown = classifySyncFailure("sin forma de error");
  assert.equal(unknown.status, 0);
  assert.equal(unknown.retryable, true);
  assert.ok(unknown.message.length > 0);
});

test("C: la regla de fallo permanente del modulo es la misma que fija la pantalla", () => {
  const pageFn = sliceFrom(markingSource, "function permanentSyncFailure", "\n}");
  assert.match(pageFn, /return status >= 400 && status < 500 && !\[408, 429\]\.includes\(status\);/);
  const moduleSource = read("../lib/hrOfflineMarking.ts");
  assert.match(moduleSource, /const permanent = status >= 400 && status < 500 && !\[408, 429\]\.includes\(status\);/);
});

test("C: el banner tiene tono: error rosa role=alert, exito verde y pendiente ambar role=status", () => {
  assert.match(markingSource, /error: \{ className: "border-rose-200 bg-rose-50 text-rose-900", role: "alert" \}/);
  assert.match(markingSource, /success: \{ className: "border-emerald-200 bg-emerald-50 text-emerald-900", role: "status" \}/);
  assert.match(markingSource, /pending: \{ className: "border-amber-200 bg-amber-50 text-amber-950", role: "status" \}/);
  assert.match(markingSource, /className=\{`rounded-md border p-4 text-sm font-medium \$\{messageToneStyles\[messageTone\]\.className\}`\} role=\{messageToneStyles\[messageTone\]\.role\}/);
  assert.doesNotMatch(markingSource, /\{message \? <div className="rounded-md border border-emerald-200/);
  assert.match(markingSource, /border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900" role="alert"/);
  assert.match(markingSource, /border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950" role="status"/);
});

test("B: la marcacion encola el instante real del clic, no el del flush", () => {
  const body = sliceFrom(markingSource, "async function mark(type: string)", "async function openActivityModal");

  assert.match(body, /const markedAt = new Date\(\);/);
  assert.match(body, /punched_at: markedAt\.toISOString\(\)/);
  assert.doesNotMatch(body, /punched_at: new Date\(\)\.toISOString\(\)/);
  assert.ok(
    body.indexOf("const markedAt = new Date();") < body.indexOf("await refreshGps()"),
    "el instante debe capturarse antes de esperar el GPS, que puede tardar 8 s"
  );
  assert.ok(
    body.indexOf("const markedAt = new Date();") < body.indexOf("await enqueuePendingSync("),
    "el instante debe capturarse antes de encolar"
  );
  assert.match(body, /time: optimisticTime/);
  assert.match(body, /const optimisticTime = markedAt\.toLocaleTimeString/);
});

test("B: la marcacion decide con la causa GPS y encola el metadata de novedad", () => {
  const body = sliceFrom(markingSource, "async function mark(type: string)", "async function openActivityModal");

  assert.match(body, /const isOnline = typeof navigator === "undefined" \? true : navigator\.onLine !== false;/);
  // Sin senal no se pide un fix nuevo (bloquearia al operario hasta 13 s), pero un fix en
  // cache de menos de 25 s se reutiliza: descartarlo perderia ubicacion valida y dispararia
  // la novedad GPS_INACTIVO_SIN_SENAL sin motivo.
  assert.match(body, /if \(gpsRequired\) \{\s*if \(isOnline\) \{/, "con senal se refresca el fix GPS");
  assert.match(body, /else if \(gps && Date\.now\(\) - gpsUpdatedAt < 25000\)/, "sin senal se reutiliza el fix en cache");
  assert.match(body, /decideOfflineMarking\(\{ online: isOnline, gpsRequired, hasFix: Boolean\(fix\), cause \}\)/);
  assert.match(body, /if \(!decision\.allowed\) \{\s*notify\(decision\.userMessage, "error"\);/);
  assert.match(body, /const queuedAt = new Date\(\)\.toISOString\(\);/);
  assert.match(body, /gpsUnavailableMetadata\(\{ gpsUnavailable: decision\.gpsUnavailable, reason: decision\.reason, queuedAt \}\)/);
});

test("B: la actividad declara occurred_at del clic para que la regla del dia la respete", () => {
  const body = sliceFrom(markingSource, "async function saveActivity()", "async function evidenceFile");

  assert.match(body, /const occurredAt = new Date\(\);/);
  assert.match(body, /occurred_at: occurredAt\.toISOString\(\),/);
  assert.match(body, /decideOfflineMarking\(\{ online: isOnline, gpsRequired, hasFix: Boolean\(fix\), cause \}\)/);
  assert.match(body, /gpsUnavailableMetadata\(\{ gpsUnavailable: decision\.gpsUnavailable, reason: decision\.reason, queuedAt \}\)/);
  assert.doesNotMatch(body, /GPS obligatorio\. Habilita la ubicacion del navegador y reintenta\./);
  // gps_required sigue declarandose: sin el metadata de novedad el backend responderia 422.
  assert.match(body, /gps_required: gpsRequired,/);
  // Una actividad encolada sin senal no debe descartar un fix capturado segundos antes.
  assert.match(body, /else if \(gps && Date\.now\(\) - gpsUpdatedAt < 25000\)/, "la actividad reutiliza el fix en cache");
});

test("B: sin senal no se quema el timeout de red en cada intento de sincronizacion", () => {
  const flush = sliceFrom(markingSource, "async function flushPendingSync", "\nfunction offlineQueueWeight");
  assert.match(flush, /if \(navigator\.onLine === false\) return false;/);
  assert.match(markingSource, /window\.addEventListener\("offline", goOffline\)/);
  assert.match(markingSource, /window\.removeEventListener\("offline", goOffline\)/);
  assert.match(markingSource, /Sin senal\. Puedes seguir marcando/);
});

test("D: las escrituras self-service de HR tampoco caen al respaldo Supabase", () => {
  const api = read("../lib/api.ts");
  const start = api.indexOf("function shouldBlockHrWriteFallback");
  assert.ok(start >= 0, "debe existir shouldBlockHrWriteFallback");
  const guard = api.slice(start, api.indexOf("\n}", start) + 2);

  assert.match(guard, /const hrSelfServiceWrite = pathname\.startsWith\("\/api\/v1\/hr\/self\/"\);/);
  assert.match(guard, /return method !== "GET" && \(criticalWritePaths\.has\(pathname\) \|\| hrRouteDetailWrite \|\| hrSelfServiceWrite\);/);
  // Lo ya certificado por hr-route-write-fallback.test.mjs se conserva intacto.
  assert.match(guard, /"\/api\/v1\/hr\/routes"/);
  assert.match(guard, /"\/api\/v1\/hr\/routes\/bulk"/);
  assert.match(guard, /\^\\\/api\\\/v1\\\/hr\\\/routes\\\/\[\^\/\]\+\$/);
  assert.match(guard, /return method !== "GET" &&/);
});

test("la pantalla conserva los contratos de marcacion ya certificados", () => {
  for (const endpoint of [
    "/api/v1/hr/self",
    "/api/v1/hr/self/routes",
    "/api/v1/hr/self/attendance",
    "/api/v1/hr/self/work-session",
    "/api/v1/hr/self/time-punches",
    "/api/v1/hr/self/work-activities",
    "/api/v1/hr/self/gps/ping"
  ]) assert.ok(markingSource.includes(endpoint), `Falta endpoint seguro ${endpoint}`);

  assert.match(markingSource, /timeZone: "America\/Bogota"/);
  assert.match(markingSource, /String\(item\.date\)\.slice\(0, 10\) !== todayBogota\(\)/);
  assert.match(markingSource, /idempotency_key: idempotencyKey/);
  assert.match(markingSource, /publishHrMonitorRefresh\(\{ source: "mobile-punch"/);
  assert.match(markingSource, /publishHrMonitorRefresh\(\{ source: "mobile-activity"/);
  assert.match(markingSource, /Kilometraje recorrido del dia/);
  assert.match(markingSource, /kilometraje_dia/);
  assert.match(markingSource, /maximo un decimal/);
  assert.doesNotMatch(markingSource, /Selecciona horario para marcar/);
  assert.doesNotMatch(markingSource, /selectedRouteId/);
  assert.doesNotMatch(markingSource, /api<[^>]+>\("\/api\/v1\/hr\/routes"/);
  assert.doesNotMatch(markingSource, /\/api\/v1\/hr\/operations-map/);
});
