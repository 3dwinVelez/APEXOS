import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// MAR-103 (auditoria 2026-11-18, horario #336 de produccion): `loadMonitor` y
// `loadEventSummaries` terminaban en un `catch {}`. El respaldo periodico remedia el bache,
// pero mientras tanto el panel afirmaba "Sin eventos en el dia consultado" sobre un horario que
// si los tiene: el dueno lo leyio como "el horario no tenia marcaciones". El fallo tecnico pasa
// a ser un estado del dato, con la hora de la ultima lectura valida.

const page = readFileSync(
  new URL("../app/dashboard/talento-humano/rutas/page.tsx", import.meta.url),
  "utf8"
);

test("el monitor registra cuando fue la ultima lectura valida y si el ultimo intento fallo", () => {
  assert.match(page, /setMonitorSnapshot\(\{ at: Date\.now\(\), failed: false \}\)/);
  assert.match(page, /setSummariesSnapshot\(\{ at: Date\.now\(\), failed: false \}\)/);
  assert.match(page, /setMonitorSnapshot\(\(current\) => \(\{ at: current\.at, failed: true \}\)\)/);
  assert.match(page, /setSummariesSnapshot\(\(current\) => \(\{ at: current\.at, failed: true \}\)\)/);
});

test("ninguna de las dos lecturas del monitor vuelve a terminar muda", () => {
  for (const loader of ["loadMonitor", "loadEventSummaries"]) {
    const source = page.match(new RegExp(`const ${loader} = useCallback\\([\\s\\S]*?\\n {2}\\}, \\[`))?.[0] || "";
    assert.ok(source, `no se encontro ${loader} en la pantalla`);
    assert.match(source, /catch \{[\s\S]*?Snapshot\(\(current\) =>/, `${loader} volvio a descartar el error en silencio`);
  }
});

test("el aviso de lectura no reciente llega a la pantalla", () => {
  assert.match(page, /monitorNotices\.length \? \(/);
  assert.match(page, /role="alert"[\s\S]{0,240}monitorNotices\.map/);
  assert.match(page, /lo que se muestra es la lectura de las/);
});

test("el vacio deja de afirmar que no hay eventos cuando la lectura fallo o aun no llega", () => {
  assert.match(page, /monitorSnapshot\.failed \? "Sin lectura reciente del monitor" : !operations && loadingMonitor \? "Cargando los eventos del dia…" : "Sin eventos en el dia consultado"/);
  assert.match(page, /el vacio no significa que no haya marcaciones/);
  assert.match(page, /Es la primera lectura de este dia/);
});

test("el reintento sigue siendo automatico y el aviso lo dice", () => {
  assert.match(page, /window\.setInterval\(refreshVisible, ROUTES_BACKSTOP_POLL_MS\)/);
  assert.match(page, /La pantalla reintenta sola/);
});

// El contrato nulo-versus-cero del paquete 3: un contador que ninguna fuente afirmo no puede
// pintarse como `0`. Sin esta distincion, "0 evento(s)" sobre un fallo de red es exactamente el
// "el horario no tiene marcaciones" que el dueno leyó en el monitor.
test("un contador sin lectura se conserva nulo y solo el cero afirmado se pinta como cero", () => {
  assert.match(page, /punch_count: number \| null/);
  assert.match(page, /event_count: summary\?\.event_count \?\? null/);
  assert.doesNotMatch(page, /event_count: summary\?\.event_count \|\| 0/);
  assert.doesNotMatch(page, /evidence_count: summary\?\.evidence_count \|\| 0/);
  assert.match(page, /if \(events === null\) return \{ status, label: "Sin lectura"/);
  assert.match(page, /if \(events\) return \{ status, label: "En seguimiento"/);
  assert.match(page, /return \{ status, label: "Sin eventos"/);
});

test("la etiqueta del contador separa el sin lectura del numero", () => {
  assert.match(page, /function counterText\(value: number \| null \| undefined, noun: string\)/);
  assert.match(page, /if \(value === null \|\| value === undefined\) return `\$\{noun\} sin lectura`/);
  assert.match(page, /counterText\(events, "evento\(s\)"\)/);
  assert.match(page, /counterText\(route\.evidence_count, "evidencia\(s\)"\)/);
  assert.doesNotMatch(page, /\{events\} evento\(s\)/);
  assert.doesNotMatch(page, /route\.evidence_count \|\| 0\} evidencia\(s\)/);
});
