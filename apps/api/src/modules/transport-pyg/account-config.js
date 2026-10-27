/* Configuracion de conceptos PYG por vehiculo con rangos PUC inclusivos y
 * exclusiones puntuales (fuente contable). Motor puro sin Prisma: valida la
 * estructura, detecta solapes efectivos entre conceptos y resuelve a que
 * concepto pertenece una cuenta por coincidencia EXACTA de longitud
 * (nunca se amplia por prefijo).
 *
 * Fuente de la propuesta: hoja "Resumen" del presupuesto.xlsx revisado por la
 * coordinacion (solo lectura; este modulo no escribe el Excel).
 */

const ACCOUNT_CODE_LENGTHS = new Set([1, 2, 4, 6, 8]);
const CONCEPT_CODE_RE = /^[A-Z0-9_]{1,60}$/;
const MAX_CONCEPTS = 100;
const MAX_NAME_LENGTH = 120;

const KINDS = new Set([
  "income",
  "expense",
  "subtotal_ingresos",
  "subtotal_gastos_operativos",
  "subtotal_utilidad_operacional",
  "subtotal_antes_de_impuestos",
  "subtotal_utilidad_neta",
  "tax",
  "informational"
]);

const SECTIONS = new Set(["ingresos", "gastos_operativos", "no_operativos", "impuestos", "resultados", "informativa"]);

// Coherencia tipo/seccion: las formulas de los subtotales son conocidas por
// seccion y nunca se evaluan cadenas arbitrarias.
const KIND_SECTIONS = {
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

const SUBTOTAL_KINDS = new Set([
  "subtotal_ingresos",
  "subtotal_gastos_operativos",
  "subtotal_utilidad_operacional",
  "subtotal_antes_de_impuestos",
  "subtotal_utilidad_neta"
]);

const ACCOUNT_LENGTH_HINT =
  "Use codigos PUC de 8 digitos; el plan tambien acepta longitudes 1, 2, 4 o 6 cuando sean coherentes. " +
  "Cada rango debe tener inicio y fin de la misma longitud y solo se compara con cuentas de esa misma longitud.";

// El reporte PYG contable solo lee cuentas de resultado (clases 4 a 7): un
// rango que toque activos/pasivos/patrimonio nunca aportaria importes y
// silenciaria cuentas reales, por eso se rechaza en la validacion.
const PYG_CLASS_RE = /^[4-7]/;
const PUC_CLASS_HINT = "Los rangos PYG solo admiten cuentas de las clases PUC 4, 5, 6 o 7 (ingresos, gastos y costos).";

// Estructura de la hoja Resumen del presupuesto.xlsx (orden exacto de filas).
// Codigos estables de los conceptos existentes para compatibilidad con
// presupuestos guardados; TOTAL_INGRESOS es nuevo. CREDITOS, AVERIAS y
// DEPRECIACION no tienen cuenta asociada en el Excel y quedan pendientes.
const EXCEL_PROPOSAL = {
  source: "accounting",
  label: "Hoja Resumen de presupuesto.xlsx",
  concepts: [
    { code: "INGRESOS", name: "INGRESOS", section: "ingresos", kind: "income", order: 1, ranges: [{ start: "41450101", end: "41999999" }], exclusions: [] },
    { code: "TOTAL_INGRESOS", name: "TOTAL INGRESOS", section: "resultados", kind: "subtotal_ingresos", order: 2, ranges: [], exclusions: [] },
    { code: "GASTOS_PERSONAL", name: "GASTOS DE PERSONAL", section: "gastos_operativos", kind: "expense", order: 3, ranges: [{ start: "52050601", end: "52050601" }], exclusions: [] },
    { code: "PROVISION_PRESTACIONES", name: "PROVISION PRESTACIONES SOCIALES", section: "gastos_operativos", kind: "expense", order: 4, ranges: [{ start: "52053001", end: "52053001" }], exclusions: [] },
    { code: "DOTACION", name: "DOTACION", section: "gastos_operativos", kind: "expense", order: 5, ranges: [{ start: "52059501", end: "52059501" }], exclusions: [] },
    { code: "SEGURIDAD_SOCIAL", name: "SEGURIDAD SOCIAL", section: "gastos_operativos", kind: "expense", order: 6, ranges: [{ start: "52056801", end: "52056801" }], exclusions: [] },
    { code: "HONORARIOS_CONTABLES_SST", name: "HONORARIOS", section: "gastos_operativos", kind: "expense", order: 7, ranges: [{ start: "52103001", end: "52103001" }], exclusions: [] },
    { code: "COMBUSTIBLE", name: "COMBUSTIBLE", section: "gastos_operativos", kind: "expense", order: 8, ranges: [{ start: "52953501", end: "52953501" }], exclusions: [] },
    { code: "VIATICOS", name: "VIATICOS", section: "gastos_operativos", kind: "expense", order: 9, ranges: [{ start: "52550501", end: "52550501" }], exclusions: [] },
    { code: "CREDITOS", name: "CREDITOS", section: "gastos_operativos", kind: "expense", order: 10, ranges: [], exclusions: [] },
    { code: "MANTENIMIENTO_VEHICULO", name: "MANTENIMIENTO VEHICULO", section: "gastos_operativos", kind: "expense", order: 11, ranges: [{ start: "52454001", end: "52454001" }], exclusions: [] },
    { code: "SEGURO_POLIZA", name: "SEGUROS POLIZAS MUNDIAL DE SEGUROS", section: "gastos_operativos", kind: "expense", order: 12, ranges: [{ start: "52304001", end: "52304001" }], exclusions: [] },
    { code: "PARQUEADERO", name: "PARQUEADERO", section: "gastos_operativos", kind: "expense", order: 13, ranges: [{ start: "52956501", end: "52956501" }], exclusions: [] },
    { code: "PEAJES", name: "PEAJES", section: "gastos_operativos", kind: "expense", order: 14, ranges: [{ start: "52559501", end: "52559501" }], exclusions: [] },
    { code: "SEGURIDAD_MONITOREO", name: "SEGURIDAD (MONITOREO) RENOVACION", section: "gastos_operativos", kind: "expense", order: 15, ranges: [{ start: "52350501", end: "52350501" }], exclusions: [] },
    { code: "OTROS", name: "OTROS (EXAMENES MEDICOS-SOAT-TECNOMECANICA-PLAN CELULARES-PAPELERIA)", section: "gastos_operativos", kind: "expense", order: 16, ranges: [{ start: "52304002", end: "52304002" }], exclusions: [] },
    { code: "AVERIAS", name: "AVERIAS", section: "gastos_operativos", kind: "expense", order: 17, ranges: [], exclusions: [] },
    { code: "TOTAL_GASTOS_OPERACIONALES", name: "GASTOS OPERACIONALES", section: "resultados", kind: "subtotal_gastos_operativos", order: 18, ranges: [], exclusions: [] },
    { code: "UTILIDAD_OPERACIONAL", name: "PERDIDA O UTILIDAD OPERACIONAL", section: "resultados", kind: "subtotal_utilidad_operacional", order: 19, ranges: [], exclusions: [] },
    { code: "INGRESOS_NO_OPERACIONALES", name: "INGRESOS NO OPERACIONALES", section: "no_operativos", kind: "income", order: 20, ranges: [{ start: "42100501", end: "42100501" }], exclusions: [] },
    { code: "GASTOS_FINANCIEROS", name: "GASTOS FINANCIEROS", section: "no_operativos", kind: "expense", order: 21, ranges: [{ start: "53052001", end: "53052001" }], exclusions: [] },
    { code: "GASTOS_NO_FINANCIEROS", name: "GASTOS NO FINANCIEROS (COMISION SODEXO)", section: "no_operativos", kind: "expense", order: 22, ranges: [{ start: "53159501", end: "53159501" }], exclusions: [] },
    { code: "UTILIDAD_ANTES_DE_IMPUESTOS", name: "PERDIDA O UTILIDAD ANTES DE PROVISIONES", section: "resultados", kind: "subtotal_antes_de_impuestos", order: 23, ranges: [], exclusions: [] },
    { code: "IMPUESTO_REGIMEN_SIMPLE", name: "IMPUESTO REGIMEN SIMPLE", section: "impuestos", kind: "tax", order: 24, ranges: [{ start: "54100501", end: "54100501" }], exclusions: [] },
    { code: "UTILIDAD_NETA", name: "UTILIDAD NETA", section: "resultados", kind: "subtotal_utilidad_neta", order: 25, ranges: [], exclusions: [] },
    { code: "DEPRECIACION", name: "DEPRECIACION", section: "informativa", kind: "informational", order: 26, ranges: [], exclusions: [] }
  ]
};

const UNCLASSIFIED_INCOME_CONCEPT = { code: "INGRESOS_SIN_CLASIFICAR", name: "INGRESOS SIN CLASIFICAR", section: "ingresos", kind: "income" };
const UNCLASSIFIED_EXPENSE_CONCEPT = { code: "GASTOS_SIN_CLASIFICAR", name: "GASTOS SIN CLASIFICAR", section: "gastos_operativos", kind: "expense" };
const PENDING_MESSAGE = "Pendiente de asociar cuenta";

function cloneProposal() {
  return JSON.parse(JSON.stringify(EXCEL_PROPOSAL));
}

function normalizeConceptCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeAccountCode(value) {
  return String(value || "").trim();
}

function validAccountCode(code) {
  const text = normalizeAccountCode(code);
  if (!/^\d+$/.test(text)) return false;
  if (!ACCOUNT_CODE_LENGTHS.has(text.length)) return false;
  return true;
}

function parseAccountNumber(code) {
  if (!validAccountCode(code)) return null;
  const value = Number(code);
  return Number.isSafeInteger(value) ? value : null;
}

function compareAccountCodes(a, b) {
  const left = parseAccountNumber(a);
  const right = parseAccountNumber(b);
  if (left === null || right === null) return null;
  return left - right;
}

// Une intervalos enteros inclusivos ordenados (sin solape entre si).
function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function subtractIntervals(intervals, exclusions) {
  const result = [];
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

function intervalsOverlap(left, right) {
  for (const [a, b] of left) {
    for (const [x, y] of right) {
      if (a <= y && x <= b) return [Math.max(a, x), Math.min(b, y)];
    }
  }
  return null;
}

function rangePairs(concept) {
  const list = Array.isArray(concept.ranges) ? concept.ranges : [];
  return list.map((range) => ({
    start: normalizeAccountCode(range && range.start),
    end: normalizeAccountCode(range && range.end)
  }));
}

function exclusionPairs(concept) {
  const list = Array.isArray(concept.exclusions) ? concept.exclusions : [];
  return list.map((range) => ({
    start: normalizeAccountCode(range && range.start),
    end: normalizeAccountCode(range && range.end)
  }));
}

// Intervalos efectivos por longitud (rangos menos exclusiones), ya fusionados.
function effectiveIntervals(concept) {
  const rangesByLength = new Map();
  const exclusionsByLength = new Map();
  for (const pair of rangePairs(concept)) {
    if (!validAccountCode(pair.start) || !validAccountCode(pair.end)) continue;
    const length = pair.start.length;
    if (pair.end.length !== length) continue;
    const start = parseAccountNumber(pair.start);
    const end = parseAccountNumber(pair.end);
    if (start === null || end === null || start > end) continue;
    const list = rangesByLength.get(length) || [];
    list.push([start, end]);
    rangesByLength.set(length, list);
  }
  for (const pair of exclusionPairs(concept)) {
    if (!validAccountCode(pair.start) || !validAccountCode(pair.end)) continue;
    const length = pair.start.length;
    if (pair.end.length !== length) continue;
    const start = parseAccountNumber(pair.start);
    const end = parseAccountNumber(pair.end);
    if (start === null || end === null || start > end) continue;
    const list = exclusionsByLength.get(length) || [];
    list.push([start, end]);
    exclusionsByLength.set(length, list);
  }
  const byLength = new Map();
  for (const [length, intervals] of rangesByLength) {
    const merged = mergeIntervals(intervals);
    const exclusions = mergeIntervals(exclusionsByLength.get(length) || []);
    const effective = exclusions.length ? subtractIntervals(merged, exclusions) : merged;
    if (effective.length) byLength.set(length, effective);
  }
  return byLength;
}

function error(conceptCode, code, message, detail = null) {
  return { concept_code: conceptCode || null, code, message, detail };
}

function validateConcept(concept, index, seenCodes) {
  const errors = [];
  const label = concept && concept.code ? concept.code : `#${index + 1}`;
  const code = normalizeConceptCode(concept && concept.code);
  const name = String((concept && concept.name) || "").trim();
  const section = String((concept && concept.section) || "").trim().toLowerCase();
  const kind = String((concept && concept.kind) || "").trim().toLowerCase();
  const order = concept ? concept.order : undefined;

  if (!code) errors.push(error(label, "CONCEPT_CODE_REQUIRED", `El concepto ${index + 1} no tiene codigo.`));
  else if (!CONCEPT_CODE_RE.test(code)) errors.push(error(label, "CONCEPT_CODE_INVALID", `Codigo de concepto invalido "${code}": use letras mayusculas, numeros y guion bajo (max 60).`));
  else if (seenCodes.has(code)) errors.push(error(label, "CONCEPT_CODE_DUPLICATE", `El codigo ${code} esta repetido; los codigos deben ser unicos.`));
  if (code) seenCodes.add(code);

  if (!name) errors.push(error(code, "CONCEPT_NAME_REQUIRED", `El concepto ${code || index + 1} requiere nombre.`));
  else if (name.length > MAX_NAME_LENGTH) errors.push(error(code, "CONCEPT_NAME_TOO_LONG", `El nombre de ${code} excede ${MAX_NAME_LENGTH} caracteres.`));

  if (!KINDS.has(kind)) errors.push(error(code, "CONCEPT_KIND_INVALID", `Tipo invalido para ${code}: ${[...KINDS].join(", ")}.`));
  if (!SECTIONS.has(section)) errors.push(error(code, "CONCEPT_SECTION_INVALID", `Seccion invalida para ${code}: ${[...SECTIONS].join(", ")}.`));
  if (KINDS.has(kind) && SECTIONS.has(section) && !KIND_SECTIONS[kind].includes(section)) {
    errors.push(error(code, "CONCEPT_KIND_SECTION_MISMATCH", `El tipo ${kind} no es coherente con la seccion ${section} en ${code}.`));
  }

  if (!Number.isInteger(order) || order <= 0) {
    errors.push(error(code, "CONCEPT_ORDER_INVALID", `El orden de ${code} debe ser un entero positivo.`));
  }

  const ranges = Array.isArray(concept && concept.ranges) ? concept.ranges : [];
  const exclusions = Array.isArray(concept && concept.exclusions) ? concept.exclusions : [];

  if (SUBTOTAL_KINDS.has(kind)) {
    if (ranges.length || exclusions.length) {
      errors.push(error(code, "SUBTOTAL_WITH_RANGES", `El subtotal ${code} esta protegido: no se le pueden asociar cuentas ni exclusiones.`));
    }
  } else {
    const seenRanges = new Set();
    ranges.forEach((range, rangeIndex) => {
      const start = normalizeAccountCode(range && range.start);
      const end = normalizeAccountCode(range && range.end);
      if (!validAccountCode(start)) errors.push(error(code, "RANGE_START_INVALID", `Rango ${rangeIndex + 1} de ${code}: inicio "${start}" no es un codigo PUC valido (${ACCOUNT_LENGTH_HINT})`));
      if (!validAccountCode(end)) errors.push(error(code, "RANGE_END_INVALID", `Rango ${rangeIndex + 1} de ${code}: fin "${end}" no es un codigo PUC valido (${ACCOUNT_LENGTH_HINT})`));
      if (validAccountCode(start) && validAccountCode(end)) {
        if (start.length !== end.length) errors.push(error(code, "RANGE_LENGTH_MISMATCH", `Rango ${rangeIndex + 1} de ${code}: inicio y fin deben tener la misma longitud (${start} vs ${end}).`));
        else if (parseAccountNumber(start) > parseAccountNumber(end)) errors.push(error(code, "RANGE_INVERTED", `Rango ${rangeIndex + 1} de ${code} invertido: ${start} > ${end}.`));
        else {
          const key = `${start}|${end}`;
          if (seenRanges.has(key)) errors.push(error(code, "RANGE_DUPLICATE", `Rango duplicado ${start}..${end} en ${code}.`));
          seenRanges.add(key);
        }
        if (!PYG_CLASS_RE.test(start) || !PYG_CLASS_RE.test(end)) {
          errors.push(error(code, "RANGE_CLASS_NOT_PYG", `Rango ${rangeIndex + 1} de ${code} (${start}..${end}) fuera del PYG: ${PUC_CLASS_HINT}`));
        }
      }
    });

    const seenExclusions = new Set();
    exclusions.forEach((range, exclusionIndex) => {
      const start = normalizeAccountCode(range && range.start);
      const end = normalizeAccountCode(range && range.end);
      if (!validAccountCode(start)) errors.push(error(code, "EXCLUSION_START_INVALID", `Exclusion ${exclusionIndex + 1} de ${code}: inicio "${start}" no es un codigo PUC valido.`));
      if (!validAccountCode(end)) errors.push(error(code, "EXCLUSION_END_INVALID", `Exclusion ${exclusionIndex + 1} de ${code}: fin "${end}" no es un codigo PUC valido.`));
      if (validAccountCode(start) && validAccountCode(end)) {
        if (start.length !== end.length) errors.push(error(code, "EXCLUSION_LENGTH_MISMATCH", `Exclusion ${exclusionIndex + 1} de ${code}: inicio y fin deben tener la misma longitud.`));
        else if (parseAccountNumber(start) > parseAccountNumber(end)) errors.push(error(code, "EXCLUSION_INVERTED", `Exclusion ${exclusionIndex + 1} de ${code} invertida: ${start} > ${end}.`));
        else {
          const key = `${start}|${end}`;
          if (seenExclusions.has(key)) errors.push(error(code, "EXCLUSION_DUPLICATE", `Exclusion duplicada ${start}..${end} en ${code}.`));
          seenExclusions.add(key);
        }
        if (!PYG_CLASS_RE.test(start) || !PYG_CLASS_RE.test(end)) {
          errors.push(error(code, "EXCLUSION_CLASS_NOT_PYG", `Exclusion ${exclusionIndex + 1} de ${code} (${start}..${end}) fuera del PYG: ${PUC_CLASS_HINT}`));
        }
      }
    });

    // Toda exclusion debe caer dentro de algun rango del mismo concepto.
    exclusions.forEach((range, exclusionIndex) => {
      const start = normalizeAccountCode(range && range.start);
      const end = normalizeAccountCode(range && range.end);
      if (!validAccountCode(start) || !validAccountCode(end) || start.length !== end.length) return;
      if (parseAccountNumber(start) > parseAccountNumber(end)) return;
      const length = start.length;
      const covered = (ranges || []).some((candidate) => {
        const candidateStart = normalizeAccountCode(candidate && candidate.start);
        const candidateEnd = normalizeAccountCode(candidate && candidate.end);
        if (!validAccountCode(candidateStart) || !validAccountCode(candidateEnd)) return false;
        if (candidateStart.length !== length || candidateEnd.length !== length) return false;
        return parseAccountNumber(candidateStart) <= parseAccountNumber(start) && parseAccountNumber(end) <= parseAccountNumber(candidateEnd);
      });
      if (!covered) errors.push(error(code, "EXCLUSION_OUTSIDE_RANGE", `Exclusion ${exclusionIndex + 1} de ${code} (${start}..${end}) esta fuera de sus rangos.`));
    });
  }

  return { errors, normalized: { code, name, section, kind, order, ranges, exclusions } };
}

// Solape efectivo entre conceptos (rangos menos exclusiones) por longitud:
// se compara con aritmetica entera inclusiva, incluyendo cuentas que aun no
// existen en el plan. Sin prioridad silenciosa: el usuario debe desambiguar
// con exclusiones.
function overlapIssues(concepts) {
  const issues = [];
  const withIntervals = concepts
    .map((concept) => ({
      code: concept.code,
      ranges: concept.ranges || [],
      exclusions: concept.exclusions || [],
      byLength: effectiveIntervals(concept)
    }))
    .filter((concept) => concept.ranges.length > 0);

  for (let i = 0; i < withIntervals.length; i += 1) {
    for (let j = i + 1; j < withIntervals.length; j += 1) {
      const left = withIntervals[i];
      const right = withIntervals[j];
      for (const [length, leftIntervals] of left.byLength) {
        const rightIntervals = right.byLength.get(length);
        if (!rightIntervals) continue;
        const overlap = intervalsOverlap(leftIntervals, rightIntervals);
        if (overlap) {
          issues.push({
            code: "CONCEPT_OVERLAP",
            message: `Los conceptos ${left.code} y ${right.code} se solapan en las cuentas ${String(overlap[0]).padStart(length, "0")}..${String(overlap[1]).padStart(length, "0")} (longitud ${length}); use exclusiones para desambiguar.`,
            detail: { a: left.code, b: right.code, length, overlap }
          });
        }
      }
    }
  }
  return issues;
}

// Validacion completa del PUT. Devuelve { ok, errors, normalized } con todos
// los errores acumulados (nunca falla en el primero).
function validateAccountConfig(input) {
  const errors = [];
  const source = String((input && input.source) || "").trim().toLowerCase();
  if (source !== "accounting") {
    errors.push(error(null, "SOURCE_INVALID", "La fuente debe ser accounting."));
  }
  const rawConcepts = input && Array.isArray(input.concepts) ? input.concepts : [];
  if (source === "accounting" && !rawConcepts.length) errors.push(error(null, "CONCEPTS_REQUIRED", "Debe enviar al menos un concepto."));
  if (rawConcepts.length > MAX_CONCEPTS) errors.push(error(null, "CONCEPTS_TOO_MANY", `Maximo ${MAX_CONCEPTS} conceptos.`));

  const seenCodes = new Set();
  const normalizedConcepts = [];
  for (const [index, concept] of rawConcepts.entries()) {
    const result = validateConcept(concept, index, seenCodes);
    errors.push(...result.errors);
    normalizedConcepts.push(result.normalized);
  }

  if (!errors.some((item) => item.code.startsWith("CONCEPT_"))) {
    const overlaps = overlapIssues(normalizedConcepts);
    errors.push(...overlaps);
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    normalized: ok ? { source, concepts: orderConcepts(normalizedConcepts) } : null
  };
}

// Orden estable: order ascendente y empate por codigo (permite reordenar sin
// exigir ordenes unicos).
function orderConcepts(concepts) {
  return [...concepts].sort((a, b) => {
    const orderDiff = Number(a.order || 0) - Number(b.order || 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.code).localeCompare(String(b.code));
  });
}

function buildMatcher(concepts) {
  const mappable = [];
  for (const concept of orderConcepts(concepts || [])) {
    if (SUBTOTAL_KINDS.has(concept.kind)) continue;
    if (!Array.isArray(concept.ranges) || !concept.ranges.length) continue;
    mappable.push({ code: concept.code, kind: concept.kind, byLength: effectiveIntervals(concept) });
  }
  return mappable;
}

// Coincidencia por longitud exacta del codigo de cuenta: solo se compara con
// intervalos de la misma longitud y aritmetica numerica inclusiva.
function matchAccountCode(accountCode, concepts) {
  const code = normalizeAccountCode(accountCode);
  if (!validAccountCode(code)) return null;
  const value = parseAccountNumber(code);
  const length = code.length;
  for (const concept of buildMatcher(concepts)) {
    const intervals = concept.byLength.get(length);
    if (!intervals) continue;
    for (const [start, end] of intervals) {
      if (value >= start && value <= end) return concept.code;
    }
  }
  return null;
}

function isSubtotalKind(kind) {
  return SUBTOTAL_KINDS.has(kind);
}

function conceptHasAccounts(concept) {
  return Array.isArray(concept.ranges) && concept.ranges.length > 0;
}

module.exports = {
  ACCOUNT_CODE_LENGTHS,
  ACCOUNT_LENGTH_HINT,
  EXCEL_PROPOSAL,
  KINDS,
  SECTIONS,
  KIND_SECTIONS,
  SUBTOTAL_KINDS,
  UNCLASSIFIED_INCOME_CONCEPT,
  UNCLASSIFIED_EXPENSE_CONCEPT,
  PENDING_MESSAGE,
  cloneProposal,
  normalizeConceptCode,
  normalizeAccountCode,
  validAccountCode,
  compareAccountCodes,
  mergeIntervals,
  subtractIntervals,
  effectiveIntervals,
  intervalsOverlap,
  validateConcept,
  validateAccountConfig,
  overlapIssues,
  orderConcepts,
  buildMatcher,
  matchAccountCode,
  isSubtotalKind,
  conceptHasAccounts
};
