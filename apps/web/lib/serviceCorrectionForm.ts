export type ServiceCorrectionMode = "field" | "observation" | "piece-issue" | "status" | "add-evidence" | "remove-evidence" | "reopen" | "force-close";

export type ServiceCorrectionValidationInput = {
  mode: ServiceCorrectionMode;
  reason: string;
  description: string;
  confirmed: boolean;
  expectedVersion: number;
  currentValue?: unknown;
  nextValue?: unknown;
  observation?: string;
  pieceSelection?: string;
  pieceName?: string;
  pieceQuantity?: number;
  pieceUnit?: string;
  pieceComment?: string;
  fileSelected?: boolean;
  evidenceId?: string;
};

export const serviceCorrectionModeLabels: Record<ServiceCorrectionMode, string> = {
  field: "Editar información",
  observation: "Agregar novedad",
  "piece-issue": "Reportar pieza",
  status: "Cambiar estado",
  "add-evidence": "Anexar foto o soporte",
  "remove-evidence": "Retirar evidencia",
  reopen: "Reabrir orden",
  "force-close": "Cerrar administrativamente"
};

export function correctionDescriptionMinimum(reason: string) {
  return reason === "OTHER" ? 24 : 12;
}

function comparable(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function serviceCorrectionValidationIssues(input: ServiceCorrectionValidationInput) {
  const issues: string[] = [];
  const minimum = correctionDescriptionMinimum(input.reason);
  if (input.description.trim().length < minimum) {
    issues.push(`Explica el motivo con al menos ${minimum} caracteres.`);
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    issues.push("Recarga la orden para obtener una versión válida.");
  }
  if (!input.confirmed) issues.push("Confirma la revisión del antes y el después.");

  if (input.mode === "field" && comparable(input.currentValue) === comparable(input.nextValue)) {
    issues.push("El nuevo valor debe ser diferente al valor actual.");
  }
  if (input.mode === "observation" && String(input.observation || "").trim().length < 4) {
    issues.push("Describe la novedad con al menos 4 caracteres.");
  }
  if (input.mode === "piece-issue") {
    if (!input.pieceSelection) issues.push("Selecciona la pieza afectada o elige otra pieza.");
    if (String(input.pieceName || "").trim().length < 2) issues.push("Registra el nombre de la pieza.");
    if (!Number.isFinite(input.pieceQuantity) || Number(input.pieceQuantity) <= 0) issues.push("La cantidad debe ser mayor que cero.");
    if (!String(input.pieceUnit || "").trim()) issues.push("Registra la unidad de la pieza.");
    if (String(input.pieceComment || "").trim().length < 4) issues.push("Describe la novedad de la pieza.");
  }
  if (input.mode === "status" && (!comparable(input.nextValue) || comparable(input.currentValue) === comparable(input.nextValue))) {
    issues.push("Selecciona un estado diferente al actual.");
  }
  if (input.mode === "add-evidence" && !input.fileSelected) issues.push("Selecciona la foto o soporte que deseas anexar.");
  if (input.mode === "remove-evidence" && !input.evidenceId) issues.push("Selecciona la evidencia que deseas retirar.");
  if (input.mode === "force-close" && String(input.observation || "").trim().length < 8) {
    issues.push("Explica el cierre administrativo con al menos 8 caracteres.");
  }
  return issues;
}
