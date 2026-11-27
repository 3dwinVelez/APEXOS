// Contrato del enmudecimiento de Talento Humano: ninguna escritura destructiva puede seguir
// preguntando en el cuadro nativo del sistema. La victima es un borrado o una inversion de saldos
// y el operario tiene que leer que pierde dentro de la pantalla, con el dato de la fila.
//
// Cada comprobacion lleva su control de contraste: un barrido que no puede encontrar una ventanilla
// tampoco puede afirmar que no hay ninguna.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const NATIVE_DIALOG = /(?:^|[^.\w$])(?:\bwindow\.|\bglobalThis\.)?(alert|confirm|prompt)\s*\(/g;

function hrSources(dir = "app/dashboard/talento-humano", found = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hrSources(relative, found);
      continue;
    }
    if (/\.tsx$/.test(entry.name)) found.push(relative);
  }
  return found;
}

test("el barrido detecta la ventanilla nativa escrita con y sin prefijo", () => {
  const muestras = [
    `window.confirm("x")`,
    `globalThis.prompt("y")`,
    `if (!confirm("z")) return;`,
    `alert("w")`
  ].join("\n");
  NATIVE_DIALOG.lastIndex = 0;
  assert.deepEqual([...muestras.matchAll(NATIVE_DIALOG)].map((m) => m[1]).sort(), ["alert", "confirm", "confirm", "prompt"], "sin este control el barrido puede estar verde sin ver nada");
});

test("el barrido no confunde a ConfirmWindow ni sus props con una ventanilla", () => {
  const inocente = `<ConfirmWindow confirmLabel="Borrar" onConfirm={() => run()} title="t" description="d" />`;
  NATIVE_DIALOG.lastIndex = 0;
  assert.deepEqual([...inocente.matchAll(NATIVE_DIALOG)].map((m) => m[1]), [], "un componente propio con la palabra confirm no puede contar como ventanilla");
});

test("Talento Humano no levanta ninguna ventanilla nativa", () => {
  const fuentes = hrSources();
  assert.ok(fuentes.length >= 19, `el barrido debe recorrer las pantallas de Talento Humano, encontro ${fuentes.length}`);
  const culpables = [];
  for (const file of fuentes) {
    NATIVE_DIALOG.lastIndex = 0;
    const encontradas = [...read(file).matchAll(NATIVE_DIALOG)].map((m) => m[1]);
    if (encontradas.length) culpables.push(`${file}: ${encontradas.join(",")}`);
  }
  assert.deepEqual(culpables, [], "las siete preguntas destructivas viven ahora en la ventana de la pantalla");
});

test("la ventana de confirmacion reutiliza el marco accesible y no un cuadro suelto", () => {
  const component = read("components/hr/ConfirmWindow.tsx");
  assert.match(component, /import \{ ModalFrame \} from "@\/components\/ui\/ModalFrame";/, "el marco ya aporta foco atrapado, Escape y aria-modal");
  assert.match(component, /<ModalFrame/, "se monta sobre el marco");
  assert.match(component, /type="button"/, "ningun boton puede ser de envio");
  assert.doesNotMatch(component, /window\.|document\.(?:alert|confirm)/, "la ventana es React, no del navegador");
});

test("cancelar esta al alcance, ejecutar es el segundo clic y mientras se escribe no se duplica", () => {
  const component = read("components/hr/ConfirmWindow.tsx");
  assert.match(component, /className="[^"]*" disabled=\{busy\} onClick=\{onClose\} type="button">Cancelar<\/button>/, "cancelar existe y se desactiva mientras se escribe");
  assert.match(component, /onClick=\{onConfirm\}/, "ejecutar es un gesto aparte");
  assert.match(component, /\{busy \? "Procesando\.\.\." : confirmLabel\}/, "el boton confirma que la escritura esta en vuelo");
  assert.match(component, /disabled=\{busy\} onClick=\{onConfirm\}/, "no se puede mandar dos veces la misma escritura");
});

test("cada pantalla destructiva guarda la fila antes de preguntar", () => {
  const anclajes = [
    ["app/dashboard/talento-humano/rostros/page.tsx", "pendingReset", "setPendingReset", "reset", "onClick={() => setPendingReset(row)}", "onClick={() => void reset(row)}"],
    ["app/dashboard/talento-humano/dispositivos-marcacion/page.tsx", "pendingRevoke", "setPendingRevoke", "revoke", "onClick={() => setPendingRevoke(row)}", "onClick={() => void revoke(row)}"],
    ["app/dashboard/talento-humano/aportes-sociales/page.tsx", "pendingDelete", "setPendingDelete", "deleteDocument", "if (row.id) setPendingDelete(row);", "onClick={() => deleteDocument(row.id)}"],
    ["app/dashboard/talento-humano/liquidacion-trabajador/page.tsx", "pendingDelete", "setPendingDelete", "deleteDocument", "if (row.id) setPendingDelete(row);", "onClick={() => deleteDocument(row.id)}"]
  ];
  for (const [file, state, setter, action, gatillo, directo] of anclajes) {
    const page = read(file);
    assert.match(page, /import \{ ConfirmWindow \} from /, `${file} debe usar la ventana de la pantalla`);
    assert.match(page, new RegExp(`const \\[${state}, ${setter}\\] = useState`), `${file} guarda la fila elegida como estado`);
    assert.ok(page.includes(gatillo), `${file} arma la ventana desde el boton, no ejecuta`);
    assert.ok(!page.includes(directo), `${file} no puede volver a ejecutar la escritura al primer clic`);
    assert.match(page, new RegExp(`\\{${state} \\? \\(`), `${file} solo muestra la ventana cuando hay fila`);
    assert.match(page, new RegExp(`onConfirm=\\{\\(\\) => void ${action}\\(`), `${file} ejecuta por el segundo clic`);
    assert.match(page, new RegExp(`${setter}\\(null\\);`), `${file} cierra la ventana al completar`);
  }
});

test("nomina pregunta las tres escrituras irreversibles dentro de la pantalla", () => {
  const page = read("app/dashboard/talento-humano/nomina/page.tsx");
  assert.match(page, /type PayrollPendingAction = "reopen" \| "delete" \| "external";/, "las tres acciones tienen nombre propio");
  assert.match(page, /const \[pendingAction, setPendingAction\] = useState<PayrollPendingAction \| null>\(null\);/);
  assert.match(page, /onClick=\{\(\) => setPendingAction\("reopen"\)\}/, "reabrir el periodo se arma antes de ejecutarse");
  assert.match(page, /onClick=\{\(\) => setPendingAction\("delete"\)\}/, "borrar documentos de nomina se arma antes de ejecutarse");
  assert.match(page, /onClick=\{\(\) => setPendingAction\("external"\)\}/, "anular jornadas del archivo plano se arma antes de ejecutarse");
  assert.match(page, /onConfirm=\{\(\) => void pendingCopy\[pendingAction\]\.run\(\)\}/, "solo el segundo clic llama la escritura");
  assert.match(page, /description: "Esto reabre el periodo para permitir correcciones\./, "el texto que leia el operario sigue siendo el mismo");
  assert.match(page, /description: "Esto borra los documentos de nomina del periodo para volver a ejecutar\./);
  assert.match(page, /description: "Esto anula las jornadas importadas por archivo plano para este periodo\./);
  assert.doesNotMatch(page, /onClick=\{reopenPeriod\}/, "reabrir no puede volver al clic directo");
  assert.doesNotMatch(page, /onClick=\{deleteLiquidation\}/, "borrar documentos no puede volver al clic directo");
  assert.doesNotMatch(page, /onClick=\{\(\) => void deleteExternalWorkdays\(\)\}/, "anular jornadas no puede volver al clic directo");
});

test("la marcacion por web conserva su propio flujo sin ventanillas", () => {
  const marking = read("app/dashboard/talento-humano/marcacion/page.tsx");
  NATIVE_DIALOG.lastIndex = 0;
  assert.deepEqual([...marking.matchAll(NATIVE_DIALOG)].map((m) => m[1]), [], "marcar jornada no puede depender de un cuadro del sistema");
  assert.match(marking, /selfie/i, "la pantalla de marcacion sigue pidiendo la selfie por paso");
});
