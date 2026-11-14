import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../components/accounting/PygVehicleExpanded.tsx", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");

test("la consulta nunca se lanza sin un período válido", () => {
  // El guard de load es un `return` temprano en una línea: basta con que exista antes
  // de la llamada a la API, sin imponer llaves.
  const guard = /if \(!isPygPeriod\(targetPeriod\)\) return;/.exec(source);
  const call = /getTransportPygReport\(targetPeriod\)/.exec(source);
  assert.ok(guard, "falta el guard de retorno para un período inválido");
  assert.ok(call, "falta la lectura del reporte con el período objetivo");
  assert.ok(guard.index < call.index, "el guard debe ejecutarse antes de la API");
  assert.doesNotMatch(source, /getTransportPygReport\(targetPeriod \|\| undefined\)/);
  // La UI y el efecto también validan el período: botón deshabilitado y carga condicionada.
  assert.match(source, /disabled=\{!periodValid\}/);
  assert.match(source, /if \(isPygPeriod\(period\)\) void load\(period\)/);
});

test("una placa inexistente no se sustituye por otra ni miente sobre la mostrada", () => {
  assert.match(source, /const unknownPlate = reportReady && !!selection && !selectionKnown/);
  assert.match(source, /La placa \{selection\} no tiene lectura en el período \{report\.period\}\. No se muestra otra placa/);
  assert.doesNotMatch(source, /se muestra \{vehicles\[0\]/);
  assert.doesNotMatch(source, /item\.plate === selection\) \|\| vehicles/);
});

test("la selección vacía pide elegir vehículo en vez de mostrar uno por defecto", () => {
  assert.match(source, /const missingSelection = reportReady && !selection/);
  assert.match(source, /Selecciona un vehículo en «Vehículo» para ver su PYG/);
  assert.match(source, /"Selecciona un vehículo"/);
});

test("la URL refleja placa o sentinel y período, conservando la selección tras F5", () => {
  assert.match(source, /pygExpandedHref\(\{ plate: selection, period: report\.period \}\)/);
  assert.match(source, /window\.history\.replaceState\(window\.history\.state, "", href\)/);
  assert.match(source, /selection === PYG_UNASSIGNED_CODE/);
});

test("el soporte de pantalla completa se detecta en useEffect y escucha fullscreenchange", () => {
  assert.match(source, /const \[fullscreen, setFullscreen\] = useState<FullscreenState>\("unsupported"\)/);
  assert.match(source, /const \[fullscreenSupported, setFullscreenSupported\] = useState\(false\)/);
  assert.match(source, /detectFullscreenSupport\(\)/);
  assert.match(source, /document\.addEventListener\("fullscreenchange", sync\)/);
  assert.match(source, /Salir de pantalla completa/);
  assert.match(source, /Pantalla completa/);
  assert.match(source, /catch \{[\s\S]*?No fue posible cambiar a pantalla completa/);
  assert.doesNotMatch(source, /= useState<FullscreenState>\(detectFullscreenSupport/);
});

test("el contenedor en pantalla completa tiene fondo y scroll", () => {
  assert.match(source, /\[&:fullscreen\]:overflow-y-auto/);
  assert.match(source, /\[&:fullscreen\]:bg-paper/);
});
