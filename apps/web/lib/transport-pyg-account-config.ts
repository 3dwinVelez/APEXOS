// Reglas espejo del validador del servidor (apps/api/.../transport-pyg/account-config.js)
// para retroalimentacion inmediata en el editor "Rangos PUC". No reemplaza la
// validacion del PUT: el servidor siempre vuelve a validar.

export const ACCOUNT_CODE_LENGTHS = new Set([1, 2, 4, 6, 8]);

// El reporte PYG contable solo lee cuentas de resultado (clases 4 a 7); el
// servidor rechaza rangos fuera de esa clase y el editor debe avisarlo antes.
export const PYG_CLASS_PATTERN = /^[4-7]/;
export const PUC_CLASS_HINT = "Los rangos PYG solo admiten cuentas de las clases PUC 4, 5, 6 o 7 (ingresos, gastos y costos).";

export const KINDS = [
  "income",
  "expense",
  "subtotal_ingresos",
  "subtotal_gastos_operativos",
  "subtotal_utilidad_operacional",
  "subtotal_antes_de_impuestos",
  "subtotal_utilidad_neta",
  "tax",
  "informational"
] as const;
export type ConceptKind = (typeof KINDS)[number];

export const SECTIONS = ["ingresos", "gastos_operativos", "no_operativos", "impuestos", "resultados", "informativa"] as const;
export type ConceptSection = (typeof SECTIONS)[number];

export const KIND_SECTIONS: Record<ConceptKind, ConceptSection[]> = {
  income: ["ingresos", "no_operativos"],
  expense: ["gastos_operativos", "no_operativos"],
  subtotal_ingresos: ["resultados"],
  subtotal_gastos_operativos: ["resultados"],
  subtotal_utilidad_operacional: ["resultados"],
  subtotal_antes_de_impuestos: ["resultados"],
  subtotal_utilidad_neta: ["resultados"],
  tax: ["impuestos"],
  informational: ["informativa"]
};

export const SUBTOTAL_KINDS: ConceptKind[] = [
  "subtotal_ingresos",
  "subtotal_gastos_operativos",
  "subtotal_utilidad_operacional",
  "subtotal_antes_de_impuestos",
  "subtotal_utilidad_neta"
];

export const KIND_LABELS: Record<ConceptKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  subtotal_ingresos: "Total ingresos",
  subtotal_gastos_operativos: "Gastos operacionales",
  subtotal_utilidad_operacional: "Utilidad operacional",
  subtotal_antes_de_impuestos: "Utilidad antes de provisiones",
  subtotal_utilidad_neta: "Utilidad neta",
  tax: "Impuesto",
  informational: "Informativo"
};

export const SECTION_LABELS: Record<ConceptSection, string> = {
  ingresos: "Ingresos",
  gastos_operativos: "Gastos operativos",
  no_operativos: "No operativos",
  impuestos: "Impuestos",
  resultados: "Resultados",
  informativa: "Informativa"
};

export const LEDGER_PRODUCT_LABEL = "libro contable";

export const PENDING_MESSAGE = "Pendiente de asociar cuenta";

export const ACCOUNT_LENGTH_HINT =
  "Use códigos PUC de 8 dígitos; el plan también acepta longitudes 1, 2, 4 o 6 cuando sean coherentes. " +
  "Cada rango debe tener inicio y fin de la misma longitud y solo se compara con cuentas de esa misma longitud. " +
  PUC_CLASS_HINT;

export type PucRange = { start: string; end: string };
export type AccountConceptDraft = {
  code: string; name: string; section: ConceptSection; kind: ConceptKind; order: number;
  ranges: PucRange[]; exclusions: PucRange[];
};
export type ConceptValidationError = { concept_code: string | null; code: string; message: string };

// Códigos internos traducidos a texto humano. Los que ya no tienen entrada
// genérica se muestran con su mensaje completo en lugar del código.
const ERROR_LABELS: Record<string, string> = {
  RANGE_START_INVALID: "inicio de rango inválido",
  RANGE_END_INVALID: "fin de rango inválido",
  RANGE_LENGTH_MISMATCH: "longitudes distintas",
  RANGE_INVERTED: "rango invertido",
  RANGE_DUPLICATE: "rango duplicado",
  RANGE_CLASS_NOT_PYG: "cuenta fuera del PYG",
  EXCLUSION_START_INVALID: "inicio de exclusión inválido",
  EXCLUSION_END_INVALID: "fin de exclusión inválido",
  EXCLUSION_LENGTH_MISMATCH: "exclusión con longitudes distintas",
  EXCLUSION_INVERTED: "exclusión invertida",
  EXCLUSION_DUPLICATE: "exclusión duplicada",
  EXCLUSION_CLASS_NOT_PYG: "exclusión fuera del PYG",
  EXCLUSION_OUTSIDE_RANGE: "exclusión fuera de sus rangos",
  CONCEPT_OVERLAP: "se solapa con otro concepto",
  SUBTOTAL_WITH_RANGES: "subtotal con cuentas asociadas",
  CONCEPT_KIND_SECTION_MISMATCH: "tipo y sección no coinciden",
  CONCEPT_CODE_REQUIRED: "falta el código",
  CONCEPT_CODE_INVALID: "código inválido",
  CONCEPT_CODE_DUPLICATE: "código repetido",
  CONCEPT_NAME_REQUIRED: "falta el nombre",
  CONCEPT_NAME_TOO_LONG: "nombre demasiado largo",
  CONCEPT_ORDER_INVALID: "orden inválido"
};

export function validationErrorLabel(code: string): string {
  return ERROR_LABELS[code] || "revisar el concepto";
}

// Identidad de tarjeta: el índice de la estructura es estable mientras el
// usuario edita campos y no existen reordenamientos de conceptos en la UI.
export function conceptRowKey(index: number): string {
  return `concepto-${index}`;
}

export function normalizeConceptCode(value: string): string {
  return String(value || "").trim().toUpperCase();
}

export function validAccountCode(code: string): boolean {
  const text = String(code || "").trim();
  return /^\d+$/.test(text) && ACCOUNT_CODE_LENGTHS.has(text.length);
}

export function validPygAccountCode(code: string): boolean {
  return validAccountCode(code) && PYG_CLASS_PATTERN.test(String(code).trim());
}

function numberOrNull(code: string): number | null {
  if (!validAccountCode(code)) return null;
  const value = Number(code);
  return Number.isSafeInteger(value) ? value : null;
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function subtractIntervals(intervals: Array<[number, number]>, exclusions: Array<[number, number]>): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const [a, b] of intervals) {
    let cursor = a;
    for (const [x, y] of exclusions) {
      if (y < cursor) continue;
      if (x > b) break;
      if (x > cursor) result.push([cursor, Math.min(b, x - 1)]);
      cursor = Math.max(cursor, y + 1);
      if (cursor > b) break;
    }
    if (cursor <= b) result.push([cursor, b]);
  }
  return result;
}

function effectiveByLength(concept: AccountConceptDraft): Map<number, Array<[number, number]>> {
  const rangesByLength = new Map<number, Array<[number, number]>>();
  const exclusionsByLength = new Map<number, Array<[number, number]>>();
  for (const range of concept.ranges || []) {
    const start = numberOrNull(range.start);
    const end = numberOrNull(range.end);
    if (start === null || end === null || String(range.start).length !== String(range.end).length || start > end) continue;
    const length = String(range.start).length;
    const list = rangesByLength.get(length) || [];
    list.push([start, end]);
    rangesByLength.set(length, list);
  }
  for (const range of concept.exclusions || []) {
    const start = numberOrNull(range.start);
    const end = numberOrNull(range.end);
    if (start === null || end === null || String(range.start).length !== String(range.end).length || start > end) continue;
    const length = String(range.start).length;
    const list = exclusionsByLength.get(length) || [];
    list.push([start, end]);
    exclusionsByLength.set(length, list);
  }
  const byLength = new Map<number, Array<[number, number]>>();
  for (const [length, intervals] of rangesByLength) {
    const merged = mergeIntervals(intervals);
    const exclusions = mergeIntervals(exclusionsByLength.get(length) || []);
    const effective = exclusions.length ? subtractIntervals(merged, exclusions) : merged;
    if (effective.length) byLength.set(length, effective);
  }
  return byLength;
}

function conceptErrors(concept: AccountConceptDraft, index: number, seenCodes: Set<string>): ConceptValidationError[] {
  const errors: ConceptValidationError[] = [];
  const code = normalizeConceptCode(concept.code);
  const name = String(concept.name || "").trim();
  const isSubtotal = SUBTOTAL_KINDS.includes(concept.kind);

  if (!code) errors.push({ concept_code: code || `#${index + 1}`, code: "CONCEPT_CODE_REQUIRED", message: `El concepto ${index + 1} no tiene código.` });
  else if (!/^[A-Z0-9_]{1,60}$/.test(code)) errors.push({ concept_code: code, code: "CONCEPT_CODE_INVALID", message: `Código inválido "${code}": use letras mayúsculas, números y guion bajo (máx. 60).` });
  else if (seenCodes.has(code)) errors.push({ concept_code: code, code: "CONCEPT_CODE_DUPLICATE", message: `El código ${code} está repetido; los códigos deben ser únicos.` });
  if (code) seenCodes.add(code);

  if (!name) errors.push({ concept_code: code || `#${index + 1}`, code: "CONCEPT_NAME_REQUIRED", message: `El concepto ${code || index + 1} requiere nombre.` });
  else if (name.length > 120) errors.push({ concept_code: code, code: "CONCEPT_NAME_TOO_LONG", message: `El nombre de ${code} excede 120 caracteres.` });

  if (!KIND_SECTIONS[concept.kind]?.includes(concept.section)) {
    errors.push({ concept_code: code, code: "CONCEPT_KIND_SECTION_MISMATCH", message: `El tipo ${concept.kind} no es coherente con la sección ${concept.section} en ${code}.` });
  }
  if (!Number.isInteger(concept.order) || concept.order <= 0) {
    errors.push({ concept_code: code, code: "CONCEPT_ORDER_INVALID", message: `El orden de ${code} debe ser un entero positivo.` });
  }

  if (isSubtotal) {
    if ((concept.ranges?.length || 0) > 0 || (concept.exclusions?.length || 0) > 0) {
      errors.push({ concept_code: code, code: "SUBTOTAL_WITH_RANGES", message: `El subtotal ${code} está protegido: no se le pueden asociar cuentas ni exclusiones.` });
    }
  } else {
    const ranges = concept.ranges || [];
    const seenRanges = new Set<string>();
    ranges.forEach((range, rangeIndex) => {
      if (!validAccountCode(range.start)) errors.push({ concept_code: code, code: "RANGE_START_INVALID", message: `Rango ${rangeIndex + 1} de ${code}: inicio "${range.start}" no es un código PUC válido. ${ACCOUNT_LENGTH_HINT}` });
      if (!validAccountCode(range.end)) errors.push({ concept_code: code, code: "RANGE_END_INVALID", message: `Rango ${rangeIndex + 1} de ${code}: fin "${range.end}" no es un código PUC válido. ${ACCOUNT_LENGTH_HINT}` });
      if (validAccountCode(range.start) && validAccountCode(range.end)) {
        if (range.start.length !== range.end.length) errors.push({ concept_code: code, code: "RANGE_LENGTH_MISMATCH", message: `Rango ${rangeIndex + 1} de ${code}: inicio y fin deben tener la misma longitud (${range.start} vs ${range.end}).` });
        else if ((numberOrNull(range.start) ?? 0) > (numberOrNull(range.end) ?? 0)) errors.push({ concept_code: code, code: "RANGE_INVERTED", message: `Rango ${rangeIndex + 1} de ${code} invertido: ${range.start} > ${range.end}.` });
        else {
          const key = `${range.start}|${range.end}`;
          if (seenRanges.has(key)) errors.push({ concept_code: code, code: "RANGE_DUPLICATE", message: `Rango duplicado ${range.start}..${range.end} en ${code}.` });
          seenRanges.add(key);
        }
        if (!PYG_CLASS_PATTERN.test(range.start) || !PYG_CLASS_PATTERN.test(range.end)) {
          errors.push({ concept_code: code, code: "RANGE_CLASS_NOT_PYG", message: `Rango ${rangeIndex + 1} de ${code} (${range.start}..${range.end}) fuera del PYG: ${PUC_CLASS_HINT}` });
        }
      }
    });
    const seenExclusions = new Set<string>();
    (concept.exclusions || []).forEach((range, exclusionIndex) => {
      if (!validAccountCode(range.start)) errors.push({ concept_code: code, code: "EXCLUSION_START_INVALID", message: `Exclusión ${exclusionIndex + 1} de ${code}: inicio "${range.start}" no es un código PUC válido.` });
      if (!validAccountCode(range.end)) errors.push({ concept_code: code, code: "EXCLUSION_END_INVALID", message: `Exclusión ${exclusionIndex + 1} de ${code}: fin "${range.end}" no es un código PUC válido.` });
      if (validAccountCode(range.start) && validAccountCode(range.end)) {
        if (range.start.length !== range.end.length) errors.push({ concept_code: code, code: "EXCLUSION_LENGTH_MISMATCH", message: `Exclusión ${exclusionIndex + 1} de ${code}: inicio y fin deben tener la misma longitud.` });
        else if ((numberOrNull(range.start) ?? 0) > (numberOrNull(range.end) ?? 0)) errors.push({ concept_code: code, code: "EXCLUSION_INVERTED", message: `Exclusión ${exclusionIndex + 1} de ${code} invertida: ${range.start} > ${range.end}.` });
        else {
          const key = `${range.start}|${range.end}`;
          if (seenExclusions.has(key)) errors.push({ concept_code: code, code: "EXCLUSION_DUPLICATE", message: `Exclusión duplicada ${range.start}..${range.end} en ${code}.` });
          seenExclusions.add(key);
        }
        if (!PYG_CLASS_PATTERN.test(range.start) || !PYG_CLASS_PATTERN.test(range.end)) {
          errors.push({ concept_code: code, code: "EXCLUSION_CLASS_NOT_PYG", message: `Exclusión ${exclusionIndex + 1} de ${code} (${range.start}..${range.end}) fuera del PYG: ${PUC_CLASS_HINT}` });
        }
      }
    });
    (concept.exclusions || []).forEach((range, exclusionIndex) => {
      if (!validAccountCode(range.start) || !validAccountCode(range.end) || range.start.length !== range.end.length) return;
      const length = range.start.length;
      const covered = ranges.some((candidate) =>
        validAccountCode(candidate.start) && validAccountCode(candidate.end) &&
        candidate.start.length === length && candidate.end.length === length &&
        (numberOrNull(candidate.start) ?? Infinity) <= (numberOrNull(range.start) ?? -Infinity) &&
        (numberOrNull(range.end) ?? -Infinity) <= (numberOrNull(candidate.end) ?? -Infinity));
      if (!covered) errors.push({ concept_code: code, code: "EXCLUSION_OUTSIDE_RANGE", message: `Exclusión ${exclusionIndex + 1} de ${code} (${range.start}..${range.end}) está fuera de sus rangos.` });
    });
  }
  return errors;
}

export function overlapErrors(concepts: AccountConceptDraft[]): ConceptValidationError[] {
  const errors: ConceptValidationError[] = [];
  const withIntervals = concepts
    .filter((concept) => (concept.ranges?.length || 0) > 0)
    .map((concept) => ({ concept, byLength: effectiveByLength(concept) }));
  for (let i = 0; i < withIntervals.length; i += 1) {
    for (let j = i + 1; j < withIntervals.length; j += 1) {
      const left = withIntervals[i];
      const right = withIntervals[j];
      for (const [length, leftIntervals] of left.byLength) {
        const rightIntervals = right.byLength.get(length);
        if (!rightIntervals) continue;
        for (const [a, b] of leftIntervals) {
          for (const [x, y] of rightIntervals) {
            if (a <= y && x <= b) {
              errors.push({
                concept_code: left.concept.code,
                code: "CONCEPT_OVERLAP",
                message: `Los conceptos ${left.concept.code} y ${right.concept.code} se solapan en cuentas de longitud ${length} (${String(Math.max(a, x)).padStart(length, "0")}..${String(Math.min(b, y)).padStart(length, "0")}); use exclusiones para desambiguar.`
              });
            }
          }
        }
      }
    }
  }
  return errors;
}

export function validateAccountConcepts(concepts: AccountConceptDraft[]): ConceptValidationError[] {
  const errors: ConceptValidationError[] = [];
  const seenCodes = new Set<string>();
  concepts.forEach((concept, index) => errors.push(...conceptErrors(concept, index, seenCodes)));
  if (!errors.some((item) => item.code.startsWith("CONCEPT_"))) errors.push(...overlapErrors(concepts));
  return errors;
}
