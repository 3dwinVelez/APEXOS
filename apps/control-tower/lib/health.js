"use strict";

// Umbrales oficiales del panel. Un indicador sin estos cortes es decorativo:
// la torre publica el score, la banda y los limites que lo produjeron.
const THRESHOLDS = Object.freeze({ optimal: 85, risk: 60 });

const BANDS = Object.freeze({
  optimal: { key: "optimal", label: "Óptimo", tone: "ok", min: 85 },
  risk: { key: "risk", label: "En riesgo", tone: "degraded", min: 60 },
  critical: { key: "critical", label: "Crítico", tone: "down", min: 0 },
  unknown: { key: "unknown", label: "Sin dato", tone: "unknown", min: null }
});

// Puntaje base por estado medido. `unknown` no puntua: no se premia ni se
// castiga lo que la API no pudo medir. Un servicio degradado sigue respondiendo,
// por eso cae en "En riesgo" (65) y no en "Critico"; solo `down` es critico.
const STATUS_SCORE = Object.freeze({ ok: 100, degraded: 65, down: 10 });

function bandFor(score) {
  if (!Number.isFinite(score)) return BANDS.unknown;
  if (score >= THRESHOLDS.optimal) return BANDS.optimal;
  if (score >= THRESHOLDS.risk) return BANDS.risk;
  return BANDS.critical;
}

function scoreForStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_SCORE, status) ? STATUS_SCORE[status] : null;
}

function moduleScore(module) {
  if (!module || module.status === "unknown") return { score: null, band: BANDS.unknown.key };
  // Un modulo declarado sin modelo no tiene dato operativo que medir.
  if (module.data && module.data.state === "declared") return { score: null, band: BANDS.unknown.key };
  const base = scoreForStatus(module.status);
  if (base == null) return { score: null, band: BANDS.unknown.key };

  let score = base;
  if (
    module.status === "ok"
    && module.data
    && Number.isFinite(module.data.age_minutes)
    && Number.isFinite(module.data.expected_minutes)
    && module.data.expected_minutes > 0
  ) {
    // Un modulo "sano" que ya consumio tres cuartas partes de su ventana de
    // frescura pierde hasta 25 puntos: sigue operativo, pero entra en riesgo.
    const ratio = module.data.age_minutes / module.data.expected_minutes;
    if (ratio > 0.75) score = Math.max(70, Math.round(100 - Math.min(25, (ratio - 0.75) * 100)));
  }
  return { score, band: bandFor(score).key };
}

function aggregate(entries) {
  const measurable = entries.filter((entry) => Number.isFinite(entry.score));
  if (!measurable.length) {
    return { score: null, band: BANDS.unknown.key, measurable: 0, total: entries.length };
  }
  const score = Math.round(measurable.reduce((sum, entry) => sum + entry.score, 0) / measurable.length);
  return { score, band: bandFor(score).key, measurable: measurable.length, total: entries.length };
}

function moduleEntries(modules) {
  return (Array.isArray(modules) ? modules : []).map((module) => ({
    key: String(module.key || ""),
    name: module.name || module.key || "",
    group: module.group || "Operacion",
    status: module.status || "unknown",
    ...moduleScore(module)
  }));
}

function infraEntries(checks) {
  return (Array.isArray(checks) ? checks : [])
    .filter((check) => !check.informational)
    .filter((check) => !["modules", "activity"].includes(check.group) && !["modules", "activity"].includes(check.source))
    .filter((check) => ["ok", "degraded", "down"].includes(check.status))
    .map((check) => ({
      key: String(check.id || ""),
      label: check.label || check.id || "",
      status: check.status,
      score: scoreForStatus(check.status)
    }));
}

function countsOf(entries) {
  const counts = { total: entries.length, ok: 0, degraded: 0, down: 0, unknown: 0 };
  for (const entry of entries) {
    const key = ["ok", "degraded", "down"].includes(entry.status) ? entry.status : "unknown";
    counts[key] += 1;
  }
  return counts;
}

function computeHealth({ modules = [], checks = [] } = {}) {
  const entries = moduleEntries(modules);
  const modulesHealth = aggregate(entries);
  const infraHealth = aggregate(infraEntries(checks));
  const hasModules = modulesHealth.score != null;
  const hasInfra = infraHealth.score != null;

  // 70% modulos (lo que el usuario opera) y 30% infraestructura (lo que lo
  // sostiene). Si una de las dos no se puede medir, no se inventa su parte.
  const score = hasModules && hasInfra
    ? Math.round(modulesHealth.score * 0.7 + infraHealth.score * 0.3)
    : hasModules
      ? modulesHealth.score
      : hasInfra
        ? infraHealth.score
        : null;

  return {
    score,
    band: bandFor(score).key,
    thresholds: { optimal: THRESHOLDS.optimal, risk: THRESHOLDS.risk },
    modules: modulesHealth,
    infra: infraHealth,
    counts: countsOf(entries),
    entries
  };
}

function withModuleBands(modules, health) {
  const bands = new Map(((health && health.entries) || []).map((entry) => [entry.key, entry]));
  return (Array.isArray(modules) ? modules : []).map((module) => {
    const entry = bands.get(String(module.key || ""));
    return entry
      ? { ...module, score: entry.score, band: entry.band }
      : { ...module, score: null, band: BANDS.unknown.key };
  });
}

module.exports = {
  THRESHOLDS,
  BANDS,
  bandFor,
  scoreForStatus,
  moduleScore,
  computeHealth,
  withModuleBands
};
