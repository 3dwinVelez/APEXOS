import assert from "node:assert/strict";
import test from "node:test";

import {
  correctionDescriptionMinimum,
  serviceCorrectionModeLabels,
  serviceCorrectionValidationIssues
} from "../lib/serviceCorrectionForm.ts";

function valid(overrides = {}) {
  return {
    mode: "field",
    reason: "DATA_ENTRY_ERROR",
    description: "Se corrige un dato digitado incorrectamente",
    confirmed: true,
    expectedVersion: 3,
    currentValue: "Anterior",
    nextValue: "Nuevo",
    ...overrides
  };
}

test("explica todos los requisitos que antes mantenian el boton bloqueado", () => {
  const issues = serviceCorrectionValidationIssues(valid({
    description: "corto",
    confirmed: false,
    currentValue: "igual",
    nextValue: "igual"
  }));
  assert.deepEqual(issues, [
    "Explica el motivo con al menos 12 caracteres.",
    "Confirma la revisión del antes y el después.",
    "El nuevo valor debe ser diferente al valor actual."
  ]);
});

test("el motivo otro exige una justificacion reforzada", () => {
  assert.equal(correctionDescriptionMinimum("OTHER"), 24);
  assert.equal(serviceCorrectionValidationIssues(valid({ reason: "OTHER", description: "Motivo demasiado corto" }))[0], "Explica el motivo con al menos 24 caracteres.");
});

test("valida novedades, estados, piezas, evidencias y cierre administrativo", () => {
  assert.match(serviceCorrectionValidationIssues(valid({ mode: "observation", observation: "" }))[0], /novedad/);
  assert.match(serviceCorrectionValidationIssues(valid({ mode: "status", currentValue: "cerrada", nextValue: "cerrada" }))[0], /estado diferente/);
  assert.equal(serviceCorrectionValidationIssues(valid({ mode: "add-evidence", fileSelected: false }))[0], "Selecciona la foto o soporte que deseas anexar.");
  assert.equal(serviceCorrectionValidationIssues(valid({ mode: "remove-evidence", evidenceId: "" }))[0], "Selecciona la evidencia que deseas retirar.");
  assert.match(serviceCorrectionValidationIssues(valid({ mode: "force-close", observation: "corto" }))[0], /8 caracteres/);
  assert.equal(serviceCorrectionValidationIssues(valid({
    mode: "piece-issue",
    pieceSelection: "manual",
    pieceName: "Bisagra",
    pieceQuantity: 1,
    pieceUnit: "und",
    pieceComment: "Falta en el producto"
  })).length, 0);
});

test("un formulario completo queda listo para guardar y aplicar", () => {
  assert.equal(serviceCorrectionValidationIssues(valid()).length, 0);
  assert.equal(serviceCorrectionModeLabels.field, "Editar información");
});
