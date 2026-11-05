"use strict";

const STATUS_LABEL = { ok: "Operativo", degraded: "Requiere atención", down: "Caído", unknown: "Sin dato" };
const STATUS_MEANING = {
  ok: "Responde dentro del objetivo.",
  degraded: "Responde, pero fuera del objetivo: datos viejos, una dependencia lenta o un servicio con alerta.",
  down: "No responde o falla una dependencia crítica.",
  unknown: "No se pudo medir; el indicador no premia ni castiga."
};
const PRIORITY_LABEL = { alta: "Alta", media: "Media", baja: "Baja" };
const PRIORITY_TONE = { alta: "down", media: "degraded", baja: "unknown" };
const RELATION_LABEL = {
  in_sync: "Sincronizada",
  ahead: "Adelantada",
  behind: "Atrasada",
  diverged: "Divergida",
  local_only: "Solo local",
  remote_only: "Solo remoto",
  missing: "Sin rama",
  unknown: "Sin comparar"
};
const JOB_STATUS_LABEL = {
  queued: "En cola",
  awaiting_approval: "Requiere aprobación",
  claimed: "Tomado",
  running: "Ejecutando",
  completed: "Completado",
  failed: "Falló",
  blocked: "Bloqueado",
  rejected: "Rechazado",
  cancelled: "Cancelado"
};
const MODE_LABEL = { polling: "Polling activo", "dry-run": "Dry-run", off: "Apagado" };
const GROUP_LABEL = {
  Operacion: "Operación",
  Finanzas: "Finanzas",
  Comercial: "Comercial",
  Talento: "Talento humano",
  Inteligencia: "Inteligencia",
  Plataforma: "Plataforma"
};
const METRIC_LABEL = {
  deployments: "Despliegues (muestra)",
  services: "Servicios",
  environments: "Ambientes",
  failed: "Fallidos",
  ready: "Listos",
  last_age_minutes: "Último (min)",
  avg_duration_ms: "Duración media",
  healthy: "Sanos",
  unhealthy: "Con falla",
  last_status: "Último estado"
};
const TENANT_REASON = {
  CROSS_TENANT_DESHABILITADO: "La lectura entre empresas está deshabilitada en este ambiente. La vista solo muestra la empresa del token; habilita APEX_CONTROL_CROSS_TENANT con autorización explícita para ver todas.",
  PERMISO_DENEGADO: "El token de la torre no tiene el permiso explícito apex-control:read_all_tenants.",
  MODULO_NO_HABILITADO: "APEX Control no está habilitado para la empresa del token.",
  NO_DISPONIBLE: "El ambiente no expone la vista por empresa.",
  SIN_CONEXION: "Sin conexión con la API para leer las empresas.",
  SIN_TOKEN: "El ambiente no tiene token de lectura; la vista por empresa queda sin datos."
};
const TENANT_STATUS_LABEL = { ok: "Activa", degraded: "Sin señal", unknown: "Inactiva" };
const ACTIVITY_REASON = {
  SIN_TOKEN: "Este ambiente no tiene token de lectura de APEX Control; la actividad y las conexiones quedan sin dato.",
  TOKEN_INVALIDO: "El token de la torre fue rechazado por la API; la actividad queda sin dato.",
  NO_DISPONIBLE: "La API del ambiente no expone actividad por empresa.",
  MODULO_NO_DESPLEGADO: "El build desplegado no incluye el módulo apex-control; la actividad y las empresas quedan sin dato hasta desplegar un build que lo contenga.",
  SIN_CONEXION: "Sin conexión con la API para leer actividad.",
  SIMULACION: "Simulación activa: la actividad se omite."
};

const BAND_LABEL = { optimal: "Óptimo", risk: "En riesgo", critical: "Crítico", unknown: "Sin dato", informational: "Informativo" };const BAND_TONE = { optimal: "ok", risk: "degraded", critical: "down", unknown: "unknown", informational: "unknown" };
const BAND_RANGE = { optimal: "85–100", risk: "60–84", critical: "0–59", unknown: "sin medición" };
const BAND_ORDER = ["optimal", "risk", "critical", "unknown"];
const HEALTH_REASON = {
  SIN_TOKEN: (environment) => `Sin ENV_${String(environment.id).toUpperCase()}_APEX_TOKEN la torre no puede leer módulos, actividad ni empresas. El ambiente queda en "Sin dato" hasta configurar un JWT propio de ese ambiente en apps/control-tower/.env.local.`,
  TOKEN_INVALIDO: () => "El token de este ambiente fue rechazado por la API. Renuévalo y reinicia la torre; el token local nunca se reutiliza en QA ni en PROD.",
  SIN_CONEXION: () => "No hay conexión con la API del ambiente. Revisa la URL y la red antes de confiar en el indicador.",
  NO_DISPONIBLE: () => "La API del ambiente no expone salud por módulo.",
  MODULO_NO_DESPLEGADO: (environment) => {
    const build = environment && environment.deployed && environment.deployed.commit
      ? ` El build desplegado es ${String(environment.deployed.commit).slice(0, 7)}.`
      : "";
    return `La API de este ambiente no incluye el módulo apex-control, así que no puede entregar salud por módulo ni actividad.${build} Hay que desplegar un build que lo contenga; la conexión ya está configurada y no falta token.`;
  },
  SIMULACION: () => "La torre está en simulación; la salud real por módulo se omite.",
  CROSS_TENANT_DESHABILITADO: () => "La lectura entre empresas está deshabilitada en este ambiente.",
  PERMISO_DENEGADO: () => "El token de la torre no tiene el permiso apex-control:read_all_tenants.",
  EMPRESA_FUERA_DE_ALCANCE: () => "La empresa está fuera de la allowlist autorizada.",
  EMPRESA_NO_ENCONTRADA: () => "La empresa ya no aparece en la lectura vigente.",
  EMPRESA_ID_INVALIDO: () => "El identificador de empresa no es válido.",
  VISTA_EMPRESAS_NO_DISPONIBLE: () => "La lectura por empresa no está disponible en este ambiente.",
  AMBIENTE_DESACTIVADO: () => "El ambiente está desactivado en la torre."
};
const DATA_STATE_LABEL = {
  fresh: "Fresco",
  stale: "Datos viejos",
  empty: "Sin registros",
  unavailable: "No disponible",
  declared: "Declarado sin modelo"
};

// Vistas del panel, en el orden en que se ofrecen. Cada una responde una pregunta
// operativa del propietario; ninguna muestra "todos los datos a la vez".
const VIEW_ORDER = ["resumen", "latencia", "api", "modulos", "datos", "nube", "operacion"];
const VIEW_QUESTION = {
  resumen: "¿Cómo está APEXOS ahora mismo?",
  latencia: "¿Cómo está la latencia?",
  api: "¿El API responde bien con la carga que tiene?",
  modulos: "¿Los módulos están óptimos y al día?",
  datos: "¿La base está rápida y con datos reales?",
  nube: "¿Los servicios de la nube están bien?",
  operacion: "¿Qué se está haciendo y qué falta?"
};

const state = {
  data: null,
  telegram: null,
  token: sessionStorage.getItem("towerToken") || "",
  environment: localStorage.getItem("towerEnvironment") || "local",
  moduleFilter: localStorage.getItem("towerModuleFilter") || "all",
  healthBand: null,
  company: null,
  view: localStorage.getItem("towerView") || "resumen",
  source: null,
  loading: false,
  pending: false,
  failures: 0
};

const urlToken = new URLSearchParams(window.location.search).get("token");
if (urlToken) {
  state.token = urlToken;
  sessionStorage.setItem("towerToken", urlToken);
  const clean = new URL(window.location.href);
  clean.searchParams.delete("token");
  window.history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortSha(sha) {
  return sha ? String(sha).slice(0, 10) : "—";
}

function formatTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-CO", { hour12: false, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function relative(iso) {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  if (ms < 5000) return "ahora";
  if (ms < 60000) return `hace ${Math.round(ms / 1000)} s`;
  if (ms < 3600000) return `hace ${Math.round(ms / 60000)} min`;
  return `hace ${Math.round(ms / 3600000)} h`;
}

function detailText(detail) {
  if (detail == null) return "";
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function activeEnvironment() {
  const data = state.data;
  const environments = data && data.snapshot && data.snapshot.environments ? data.snapshot.environments : {};
  if (environments[state.environment]) return environments[state.environment];
  const first = Object.keys(environments)[0];
  if (first) return environments[first];
  return null;
}

function environmentChecks(snapshot, environment) {
  if (!snapshot || !Array.isArray(snapshot.checks)) return [];
  if (!environment) return snapshot.checks;
  return snapshot.checks.filter((check) => (check.environment || "local") === environment.id);
}

function environmentAlerts(alerts, environmentId) {
  return (alerts || []).filter((alert) => (alert.environment || "local") === environmentId);
}

function technicalBlock(technical) {
  if (!technical) return "";
  let text = "";
  try {
    text = JSON.stringify(technical, null, 2);
  } catch {
    text = String(technical);
  }
  return `<pre class="tech-body">${escapeHtml(text)}</pre>`;
}

function performanceData(environment) {
  if (environment && environment.performance) return environment.performance;
  const all = state.data && state.data.performance ? state.data.performance : {};
  return (environment && all[environment.id]) || null;
}

function sparkline(series) {
  const points = Array.isArray(series) ? series : [];
  if (points.length < 2) {
    return '<p class="perf-sub">Se necesitan al menos 2 muestras para dibujar la serie.</p>';
  }
  const width = 320;
  const height = 64;
  const pad = 6;
  const values = points.map((sample) => Math.max(0, Number(sample.ms) || 0));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const step = (width - pad * 2) / (values.length - 1);
  const coords = values.map((value, index) => ({
    x: pad + index * step,
    y: height - pad - ((value - min) / span) * (height - pad * 2)
  }));
  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const failures = coords
    .map((point, index) => (points[index].ok === false ? `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.6" class="spark-fail" />` : ""))
    .join("");
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Serie de latencia de la API">
      <polygon class="spark-area" points="${area}" />
      <polyline points="${line}" />
      ${failures}
    </svg>`;
}

// Grafico de latencia con los topes dibujados. La escala siempre incluye el tope
// de riesgo, aunque ninguna muestra lo alcance: si el techo del grafico fuera el
// maximo medido, una serie pegada al limite pareceria plana y el ojo perderia la
// unica referencia que responde a "Estamos dentro o fuera del tope?".
function latencyChart(series, entry) {
  const points = Array.isArray(series) ? series : [];
  if (!entry || !entry.limits || points.length < 2) {
    return sparkline(points);
  }
  const optimal = Number(entry.limits.optimal);
  const risk = Number(entry.limits.risk);
  if (!Number.isFinite(risk) || risk <= 0) return sparkline(points);
  const width = 620;
  const height = 180;
  const pad = 10;
  const values = points.map((sample) => Math.max(0, Number(sample.ms) || 0));
  const ceiling = Math.max(risk * 1.25, ...values);
  const step = (width - pad * 2) / (values.length - 1);
  const y = (value) => height - pad - (Math.min(value, ceiling) / ceiling) * (height - pad * 2);
  const coords = values.map((value, index) => ({ x: pad + index * step, y: y(value), value }));
  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const riskY = y(risk).toFixed(1);
  const optimalY = Number.isFinite(optimal) ? y(optimal).toFixed(1) : null;
  const over = coords
    .map((point, index) => {
      const beyond = point.value > risk;
      const failed = points[index].ok === false;
      if (!beyond && !failed) return "";
      return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.4" class="${beyond ? "spark-over" : "spark-fail"}" />`;
    })
    .join("");
  return `
    <svg class="latency-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Latencia de la sonda con su tope de ${formatNumber(risk)} ms dibujado">
      ${optimalY ? `<line class="chart-optimal" x1="${pad}" y1="${optimalY}" x2="${width - pad}" y2="${optimalY}" /><text class="chart-label" x="${width - pad - 2}" y="${Number(optimalY) - 3}" text-anchor="end">óptimo ${formatNumber(optimal)} ms</text>` : ""}
      <line class="chart-risk" x1="${pad}" y1="${riskY}" x2="${width - pad}" y2="${riskY}" />
      <text class="chart-label risk" x="${width - pad - 2}" y="${Number(riskY) - 3}" text-anchor="end">tope ${formatNumber(risk)} ms</text>
      <polygon class="spark-area" points="${area}" />
      <polyline class="chart-line" points="${line}" />
      ${over}
    </svg>`;
}

const CLOUD_PROVIDERS = [
  { key: "railway", label: "Railway", hint: "RAILWAY_TOKEN + ENV_<AMBIENTE>_RAILWAY_PROJECT_ID" },
  { key: "supabase", label: "Supabase", hint: "SUPABASE_ACCESS_TOKEN + ENV_<AMBIENTE>_SUPABASE_REF" },
  { key: "vercel", label: "Vercel", hint: "VERCEL_TOKEN + ENV_<AMBIENTE>_VERCEL_PROJECT_ID" }
];

function formatMetric(key, value) {
  if (key === "avg_duration_ms" && Number.isFinite(Number(value))) return `${Math.round(Number(value) / 1000)} s`;
  if (key === "last_age_minutes" && Number.isFinite(Number(value))) return `${value} min`;
  return String(value);
}

function renderCloudMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") return "";
  const entries = Object.entries(metrics).filter(([, value]) => value != null && value !== "");
  if (!entries.length) return "";
  return `<div class="cloud-metrics">${entries.map(([key, value]) => `
    <div class="cloud-metric">
      <span>${escapeHtml(METRIC_LABEL[key] || key)}</span>
      <strong>${escapeHtml(formatMetric(key, value))}</strong>
    </div>`).join("")}</div>`;
}

function renderCloudCard(provider, data, compact = false) {
  const status = data && data.configured === false ? "unknown" : pillClass(data && data.status ? data.status : "unknown");
  const statusLabel = data && data.configured === false ? "Sin credenciales" : (STATUS_LABEL[status] || status);
  const services = data && Array.isArray(data.services) ? data.services : [];
  const deployments = data && Array.isArray(data.deployments) ? data.deployments : [];
  const health = data && Array.isArray(data.health) ? data.health : [];
  const projectName = data && data.project ? (data.project.name || data.project.id) : null;
  const region = data && data.project && data.project.region ? ` · ${data.project.region}` : "";
  const engine = data && data.project && data.project.database ? ` · PG ${data.project.database.version || data.project.database.engine || "—"}` : "";
  const deploymentItems = deployments
    .slice(0, 3)
    .map((deployment) => {
      const state = deployment.status || deployment.state || "sin estado";
      const environment = deployment.environment ? `${deployment.environment}: ` : "";
      const target = deployment.target ? ` (${deployment.target})` : "";
      const duration = deployment.durationMs ? ` · ${Math.round(deployment.durationMs / 1000)} s` : "";
      return `<li>${escapeHtml(environment)}${escapeHtml(state)}${escapeHtml(target)}${escapeHtml(duration)}</li>`;
    })
    .join("");
  const healthChips = health
    .slice(0, 6)
    .map((item) => `<span class="service-dot status-${item.healthy ? "ok" : "down"}" title="${escapeHtml(item.status || "")}">${escapeHtml(item.service)}</span>`)
    .join("");
  return `
    <article class="cloud-card status-${status}">
      <div class="cloud-head">
        <div>
          <p class="cloud-provider">${escapeHtml(provider.label)}</p>
          <h3>${escapeHtml(projectName || "Sin proyecto")}</h3>
        </div>
        <span class="pill ${status}">${escapeHtml(statusLabel)}</span>
      </div>
      <p class="cloud-detail">${escapeHtml(data && data.detail ? data.detail : "Sin datos del proveedor.")}</p>
      ${renderCloudMetrics(data && data.metrics)}
      ${projectName ? `<p class="cloud-detail">Servicios: ${services.length}${escapeHtml(region)}${escapeHtml(engine)}</p>` : ""}
      ${!compact && services.length ? `<ul class="cloud-list">${services.slice(0, 4).map((service) => `<li>${escapeHtml(service.name || service.id)}</li>`).join("")}</ul>` : ""}
      ${healthChips ? `<div class="cloud-service-health">${healthChips}</div>` : ""}
      ${!compact && deploymentItems ? `<ul class="cloud-list">${deploymentItems}</ul>` : ""}
      ${data && data.error ? `<p class="cloud-detail">${escapeHtml(data.error)}</p>` : ""}
      ${data && data.healthError ? `<p class="cloud-detail">Salud: ${escapeHtml(data.healthError)}</p>` : ""}
      ${data && data.configured === false ? `<p class="cloud-hint">Configura ${escapeHtml(provider.hint)}.</p>` : ""}
    </article>`;
}

async function api(path, options = {}, retried = false) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 && !retried) {
    const token = window.prompt("TOWER_UI_TOKEN requerido:");
    if (token) {
      state.token = token.trim();
      sessionStorage.setItem("towerToken", state.token);
      if (state.source) connectEvents();
      return api(path, options, true);
    }
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body && body.error ? body.error : `HTTP ${response.status}`;
    const error = new Error(message);
    if (body && body.code) error.code = body.code;
    if (body && body.recommendation) error.recommendation = body.recommendation;
    throw error;
  }
  return body;
}

function toast(message, kind = "") {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.className = `toast show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    element.className = "toast";
  }, 4200);
}

function pillClass(status) {
  return ["ok", "degraded", "down", "unknown"].includes(status) ? status : "unknown";
}

function bandCounts(health) {
  const counts = { optimal: 0, risk: 0, critical: 0, unknown: 0 };
  for (const entry of (health && Array.isArray(health.entries) ? health.entries : [])) {
    const band = BAND_ORDER.includes(entry.band) ? entry.band : "unknown";
    counts[band] += 1;
  }
  return counts;
}

// Un solo lector de datos para el ambiente activo y para la empresa abierta:
// ambos alimentan el mismo indicador oficial.
function blockData(scope) {
  const environment = activeEnvironment();
  if (scope === "company") {
    const company = state.company;
    const data = company && company.data ? company.data : null;
    return {
      environment,
      payload: data,
      health: data && data.ok ? data.health : null,
      modules: data && data.ok && Array.isArray(data.modules) ? data.modules : [],
      tenant: data && data.tenant ? data.tenant : null
    };
  }
  const payload = environment && environment.modules ? environment.modules : null;
  return {
    environment,
    payload,
    health: environment ? environment.health : null,
    modules: payload && Array.isArray(payload.modules) ? payload.modules : [],
    tenant: payload && payload.tenant ? payload.tenant : null
  };
}

function gaugeSvg(health) {
  const score = Number.isFinite(health.score) ? Math.max(0, Math.min(100, Math.round(health.score))) : null;
  const band = BAND_ORDER.includes(health.band) ? health.band : "unknown";
  const thresholds = health.thresholds || { risk: 60, optimal: 85 };
  const risk = Number(thresholds.risk) || 60;
  const optimal = Number(thresholds.optimal) || 85;
  const arc = "M 20 106 A 80 80 0 0 1 180 106";
  const segments = [
    { cls: "critical", start: 0, size: risk },
    { cls: "risk", start: risk, size: Math.max(0, optimal - risk) },
    { cls: "optimal", start: optimal, size: Math.max(0, 100 - optimal) }
  ];
  const ticks = [risk, optimal]
    .map((value) => {
      const angle = Math.PI * (1 - value / 100);
      const x = 100 + 80 * Math.cos(angle);
      const y = 106 - 80 * Math.sin(angle);
      return `<circle class="gauge-tick" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" />`;
    })
    .join("");
  return `
    <svg class="gauge" viewBox="0 0 200 136" role="img" aria-label="${escapeHtml(score == null ? "Salud sin medición" : `Salud ${score} de 100, ${BAND_LABEL[band]}`)}">
      <path class="gauge-track" d="${arc}" pathLength="100" />
      ${segments.map((segment) => `<path class="gauge-band ${segment.cls}" d="${arc}" pathLength="100" stroke-dasharray="${segment.size} ${Math.max(0, 100 - segment.size)}" stroke-dashoffset="${-segment.start}" />`).join("")}
      ${score == null ? "" : `<path class="gauge-progress ${band}" d="${arc}" pathLength="100" stroke-dasharray="${score} ${Math.max(0, 100 - score)}" />`}
      ${ticks}
      <text class="gauge-score" x="100" y="92" text-anchor="middle">${score == null ? "—" : escapeHtml(score)}</text>
      <text class="gauge-unit" x="100" y="110" text-anchor="middle">${score == null ? "sin medición" : "de 100"}</text>
      <text class="gauge-band-label ${band}" x="100" y="132" text-anchor="middle">${escapeHtml(BAND_LABEL[band])}</text>
    </svg>`;
}

function thresholdScale(health) {
  const thresholds = health.thresholds || { risk: 60, optimal: 85 };
  const risk = Number(thresholds.risk) || 60;
  const optimal = Number(thresholds.optimal) || 85;
  const score = Number.isFinite(health.score) ? Math.max(0, Math.min(100, Math.round(health.score))) : null;
  return `
    <div class="threshold">
      <div class="threshold-head">
        <span>Umbrales oficiales</span>
        <span>${score == null ? "sin puntaje" : `puntaje ${score}`}</span>
      </div>
      <div class="threshold-track" aria-hidden="true">
        <span class="seg critical" style="width:${risk}%"></span>
        <span class="seg risk" style="width:${Math.max(0, optimal - risk)}%"></span>
        <span class="seg optimal" style="width:${Math.max(0, 100 - optimal)}%"></span>
        ${score == null ? "" : `<span class="threshold-marker" style="left:${score}%"></span>`}
      </div>
      <div class="threshold-labels">
        <span>0 · Crítico</span>
        <span>${risk} · En riesgo</span>
        <span>${optimal} · Óptimo</span>
        <span>100</span>
      </div>
    </div>`;
}

function bandCards(health) {
  const counts = bandCounts(health);
  return `
    <div class="band-cards" role="group" aria-label="Filtrar módulos por banda">
      ${BAND_ORDER.map((band) => {
        const active = state.healthBand === band;
        return `
          <button class="band-card tone-${BAND_TONE[band]}${active ? " active" : ""}" type="button" data-band-filter="${band}" aria-pressed="${active ? "true" : "false"}">
            <span class="band-name">${escapeHtml(BAND_LABEL[band])}</span>
            <span class="band-count">${escapeHtml(formatNumber(counts[band]))}</span>
            <span class="band-range">${escapeHtml(BAND_RANGE[band])}</span>
          </button>`;
      }).join("")}
    </div>`;
}

function moduleRow(module, scope) {
  const band = BAND_ORDER.includes(module.band) ? module.band : "unknown";
  const tone = BAND_TONE[band];
  const status = pillClass(module.status);
  const score = Number.isFinite(module.score) ? module.score : null;
  const width = score == null ? 0 : Math.max(2, Math.min(100, score));
  return `
    <button class="module-row band-${band}" type="button" data-module="${escapeHtml(module.key)}" data-scope="${scope}" title="${escapeHtml(`${module.name} · ${STATUS_LABEL[module.status] || module.status} · ${BAND_LABEL[band]}`)}">
      <span class="row-name">
        <span class="dot status-${status}" aria-hidden="true"></span>
        <span class="row-text">${escapeHtml(module.name)}<small>${escapeHtml(GROUP_LABEL[module.group] || module.group || "")}</small></span>
      </span>
      <span class="row-track" aria-hidden="true">${score == null ? '<span class="row-none">sin medición</span>' : `<span class="row-fill" style="width:${width}%"></span>`}</span>
      <span class="row-score">${score == null ? "—" : escapeHtml(score)}</span>
      <span class="band-pill ${tone}">${escapeHtml(BAND_LABEL[band])}</span>
    </button>`;
}

function moduleChart(scope) {
  const { modules } = blockData(scope);
  if (!modules.length) return "";
  const order = { critical: 0, risk: 1, unknown: 2, optimal: 3 };
  const filtered = state.healthBand ? modules.filter((module) => (module.band || "unknown") === state.healthBand) : modules;
  const sorted = [...filtered].sort((left, right) => {
    const byBand = (order[left.band] ?? 4) - (order[right.band] ?? 4);
    if (byBand !== 0) return byBand;
    const leftScore = Number.isFinite(left.score) ? left.score : 101;
    const rightScore = Number.isFinite(right.score) ? right.score : 101;
    if (leftScore !== rightScore) return leftScore - rightScore;
    return String(left.name || left.key).localeCompare(String(right.name || right.key), "es");
  });
  const limit = sorted.length;
  const visible = sorted.slice(0, limit);
  const filterLabel = state.healthBand ? ` · ${BAND_LABEL[state.healthBand]}` : "";
  return `
    <section class="module-chart" aria-label="Salud por módulo">
      <div class="chart-head">
        <h3>Salud por módulo</h3>
        <span class="muted small">${escapeHtml(`${filtered.length}/${modules.length}${filterLabel}`)}${sorted.length > visible.length ? " · peores primero" : ""}</span>
        ${state.healthBand ? '<button class="link" type="button" data-band-filter="all">Ver todos</button>' : ""}
      </div>
      ${visible.length
        ? `<div class="module-rows">${visible.map((module) => moduleRow(module, scope)).join("")}</div>`
        : `<p class="empty">Ningún módulo en ${escapeHtml(BAND_LABEL[state.healthBand] || "la banda")}.</p>`}
    </section>`;
}

// Capa de medición. El servidor ya publicó el valor, su banda y los límites que
// la produjeron (lib/metrics.js); aquí solo se pinta. Ningún umbral vive en el
// navegador, así que cambiar el presupuesto de rendimiento rebanda el panel
// entero sin tocar una línea de UI.
function gaugeOf(environment, key) {
  const gauges = environment && Array.isArray(environment.gauges) ? environment.gauges : [];
  return gauges.find((entry) => entry.key === key) || null;
}

// Estado que las tarjetas numéricas todavía usan, derivado del mismo medidor.
function measureStatus(environment, key) {
  const entry = gaugeOf(environment, key);
  return entry ? BAND_TONE[entry.band] || "unknown" : "unknown";
}

// El panel no decide umbrales: cuando hay que resumir dos mediciones distintas se
// muestra la peor banda medida, nunca un promedio que suavice un rojo.
const TONE_RANK = { unknown: 0, ok: 1, degraded: 2, down: 3 };

function worstTone(...tones) {
  const measured = tones.filter((tone) => tone && tone !== "unknown");
  if (!measured.length) return "unknown";
  return measured.reduce((worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst), measured[0]);
}

function humanDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 90) return `${total} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round((total / 3600) * 10) / 10;
  if (hours < 72) return `${hours} h`;
  return `${Math.round((total / 86400) * 10) / 10} d`;
}

function measureValue(entry) {
  if (!entry || entry.value == null) return "—";
  if (entry.key === "uptime") return humanDuration(entry.value);
  return formatNumber(Math.round(entry.value * 10) / 10);
}

function measureUnit(entry) {
  if (!entry || entry.value == null) return "";
  return entry.key === "uptime" ? "" : entry.unit;
}

// Geometría de la escala: tres tramos (verde / ámbar / rojo) y el marcador del
// valor medido. `higher` premia los valores altos, así que invierte el orden.
// Un medidor informativo no tiene cortes: pintarle una escala inventada lo
// haría parecer un diagnóstico que el servidor nunca publicó.
function scaleGeometry(entry) {
  if (!entry || entry.direction === "informational") return null;
  const optimal = Number(entry.limits && entry.limits.optimal);
  const risk = Number(entry.limits && entry.limits.risk);
  if (!Number.isFinite(optimal) || !Number.isFinite(risk)) return null;
  if (entry.limits.optimal === null || entry.limits.risk === null) return null;
  const higher = entry.direction === "higher";
  const span = higher ? Math.max(optimal * 2, 100) : (risk > 0 ? risk * 1.5 : Math.max(optimal, 1) * 3);
  if (!(span > 0)) return null;
  const pct = (value) => Math.max(0, Math.min(100, (value / span) * 100));
  const marker = entry.value == null ? null : pct(entry.value);
  const segments = higher
    ? [
        { cls: "critical", width: pct(risk) },
        { cls: "risk", width: pct(optimal) - pct(risk) },
        { cls: "optimal", width: 100 - pct(optimal) }
      ]
    : [
        { cls: "optimal", width: pct(optimal) },
        { cls: "risk", width: pct(risk) - pct(optimal) },
        { cls: "critical", width: 100 - pct(risk) }
      ];
  return { segments, marker, overflow: marker === 100 && entry.value != null && entry.value > span };
}

function measureLimits(entry) {
  if (!scaleGeometry(entry)) return "contexto del proceso, no diagnóstico";
  const unit = entry.unit ? ` ${entry.unit}` : "";
  const optimal = `${formatNumber(entry.limits.optimal)}${unit}`;
  const risk = `${formatNumber(entry.limits.risk)}${unit}`;
  return entry.direction === "higher"
    ? `óptimo ≥ ${optimal} · en riesgo ≥ ${risk}`
    : `óptimo ≤ ${optimal} · en riesgo ≤ ${risk}`;
}

function measureFoot(entry, environment) {
  const performance = performanceData(environment) || {};
  const deployed = environment ? environment.deployed : null;
  if (entry.key === "p95") {
    return performance.samples
      ? `${formatNumber(performance.samples)} muestras · p50 ${performance.p50 == null ? "—" : performance.p50} ms`
      : "sin muestras de este ambiente";
  }
  if (entry.key === "errorRate") {
    return performance.samples
      ? `${formatNumber(performance.failures || 0)} de ${formatNumber(performance.samples)} sondas /health fallaron`
      : "sin sondas registradas";
  }
  if (entry.key === "memoryRss") {
    return deployed && deployed.memory
      ? `heap ${formatNumber(deployed.memory.heapUsed)}/${formatNumber(deployed.memory.heapTotal)} MB`
      : "el build desplegado no expone memoria";
  }
  if (entry.key === "dataCoverage") {
    const summary = environment && environment.activity && environment.activity.tenants
      ? environment.activity.tenants.summary
      : null;
    return summary
      ? `${formatNumber(summary.with_activity || 0)} de ${formatNumber(summary.active || 0)} empresas activas con actividad`
      : "sin lectura por empresa en este ambiente";
  }
  if (entry.key === "freshness") {
    return entry.value == null ? "ningún módulo publica fecha medida" : "peor ratio edad/esperado entre los módulos";
  }
  if (entry.key === "slowQueries") return "acumuladas desde el arranque del proceso";
  if (entry.key === "requests") {
    return deployed && deployed.usage
      ? `5xx ${formatNumber((deployed.usage.byStatus && deployed.usage.byStatus["5xx"]) || 0)}`
      : "el build desplegado no expone uso";
  }
  return entry.source;
}

function microSparkline(series) {
  const points = (Array.isArray(series) ? series : []).slice(-24);
  if (points.length < 2) return "";
  const width = 148;
  const height = 26;
  const values = points.map((sample) => Math.max(0, Number(sample.ms) || 0));
  const max = Math.max(...values);
  const step = width / (values.length - 1);
  const line = values
    .map((value, index) => `${(index * step).toFixed(1)},${(height - 2 - (value / Math.max(1, max)) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return `<svg class="measure-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${line}" /></svg>`;
}

function measureCard(entry, environment, { series = null } = {}) {
  const tone = BAND_TONE[entry.band] || "unknown";
  const geometry = scaleGeometry(entry);
  const scale = geometry
    ? `<div class="measure-scale" aria-hidden="true">
        ${geometry.segments.map((segment) => `<span class="seg ${segment.cls}" style="width:${Math.max(0, segment.width).toFixed(1)}%"></span>`).join("")}
        ${geometry.marker == null ? "" : `<span class="measure-marker ${entry.band}" style="left:${geometry.marker.toFixed(1)}%"></span>`}
      </div>`
    : '<div class="measure-scale idle" aria-hidden="true"><span class="seg flat" style="width:100%"></span></div>';
  const spark = entry.key === "p95" ? microSparkline(series) : "";
  const verdict = entry.key === "p95" ? latencyVerdictText(environment) : "";
  const reading = `${entry.label}: ${measureValue(entry)}${measureUnit(entry) ? ` ${measureUnit(entry)}` : ""}. ${BAND_LABEL[entry.band] || "Sin dato"}. ${measureLimits(entry)}.`;
  const link = entry.view
    ? `<button class="measure-link" type="button" data-view="${escapeHtml(entry.view)}">Ver evidencia</button>`
    : "";
  return `
    <article class="measure-card band-${entry.band}${geometry && geometry.overflow ? " overflow" : ""}" aria-label="${escapeHtml(reading)}" title="${escapeHtml(`${reading} Fuente: ${entry.source}`)}">
      ${entry.question ? `<p class="measure-question">${escapeHtml(entry.question)}</p>` : ""}
      <div class="measure-head">
        <p class="measure-label">${escapeHtml(entry.label)}</p>
        <span class="band-pill ${tone}">${escapeHtml(BAND_LABEL[entry.band] || "Sin dato")}</span>
      </div>
      <p class="measure-value">${escapeHtml(measureValue(entry))}<span class="measure-unit">${escapeHtml(measureUnit(entry))}</span></p>
      ${scale}
      <p class="measure-limits">${escapeHtml(measureLimits(entry))}</p>
      ${spark}
      ${verdict ? `<p class="measure-verdict tone-${escapeHtml(verdict.tone)}">${escapeHtml(verdict.text)}</p>` : ""}
      <p class="measure-foot">${escapeHtml(measureFoot(entry, environment))}</p>
      ${link}
    </article>`;
}

// El veredicto lo firma el servidor (lib/metrics.js latencyVerdict) sobre las
// muestras medidas. Aqui solo se traduce a una linea: el panel no decide si un
// pico es evento o si ya es un problema que atender.
function latencyVerdictText(environment) {
  const verdict = environment ? environment.latency : null;
  if (!verdict || verdict.state === "unknown") return null;
  const cap = verdict.cap == null ? "—" : formatNumber(verdict.cap);
  const text = verdict.state === "optimal"
    ? `Dentro del tope de ${cap} ms`
    : `${verdict.label_text} · ${verdict.over}/${verdict.samples} muestras sobre ${cap} ms · racha máxima ${verdict.longest_run}`;
  const tone = verdict.state === "optimal" ? "ok" : verdict.state === "sustained" ? "down" : "degraded";
  return { text, tone };
}

// Tarjeta de resumen de la vista: la pregunta, la cifra, el tope y el semaforo.
function renderGauges(environment) {
  const container = document.getElementById("gauges");
  const meta = document.getElementById("gaugesMeta");
  if (!container || !meta) return;
  const gauges = environment && Array.isArray(environment.gauges) ? environment.gauges : [];
  if (!gauges.length) {
    meta.textContent = "Sin medidores";
    container.innerHTML = '<p class="empty">La torre aún no publicó los umbrales de este ambiente.</p>';
    return;
  }
  const scored = gauges.filter((entry) => entry.direction !== "informational");
  const critical = scored.filter((entry) => entry.band === "critical").length;
  const risky = scored.filter((entry) => entry.band === "risk").length;
  meta.textContent = `${scored.length} medidores con umbral · ${critical} en rojo · ${risky} en riesgo`;
  const performance = performanceData(environment) || {};
  container.innerHTML = gauges.map((entry) => measureCard(entry, environment, { series: performance.series })).join("");
}

// Altura de un tick: manda la frescura medida (ratio edad/esperado). Un módulo sin
// fecha medida usa la altura base de su banda; nunca se pinta una altura inventada.
const TICK_BASE_HEIGHT = { optimal: 30, risk: 58, critical: 86, unknown: 6 };

function tickHeight(tick) {
  if (!tick) return TICK_BASE_HEIGHT.unknown;
  if (Number.isFinite(tick.ratio) && tick.ratio > 0) {
    return Math.max(24, Math.min(100, 24 + (Math.min(tick.ratio, 4) / 4) * 72));
  }
  return TICK_BASE_HEIGHT[tick.band] || TICK_BASE_HEIGHT.unknown;
}

function moduleMapRows(environment, history) {
  const payload = environment && environment.modules ? environment.modules : null;
  const modules = payload && Array.isArray(payload.modules) ? payload.modules : [];
  const order = { critical: 0, risk: 1, unknown: 2, optimal: 3 };
  return [...modules].sort((left, right) => {
    const byBand = (order[left.band] ?? 4) - (order[right.band] ?? 4);
    if (byBand !== 0) return byBand;
    return String(left.name || left.key).localeCompare(String(right.name || right.key), "es");
  }).map((module) => ({
    module,
    cells: history.map((sample) => (sample.ticks ? sample.ticks[module.key] : null) || null),
    band: BAND_ORDER.includes(module.band) ? module.band : "unknown"
  }));
}

function mapTick(band, height, title) {
  const safe = BAND_ORDER.includes(band) ? band : "unknown";
  return `<i class="map-tick band-${safe}" style="height:${Math.max(4, Math.min(100, height)).toFixed(0)}%" title="${escapeHtml(title)}"></i>`;
}

function renderModuleMap(environment) {
  const container = document.getElementById("moduleMap");
  const meta = document.getElementById("moduleMapMeta");
  if (!container || !meta) return;
  const history = environment && Array.isArray(environment.moduleHistory) ? environment.moduleHistory : [];
  const rows = environment ? moduleMapRows(environment, history) : [];
  if (!rows.length || !history.length) {
    meta.textContent = history.length ? `${history.length} sondeos · sin módulos medidos` : "Sin sondeos";
    container.innerHTML = `<p class="empty">${escapeHtml(
      environment && !environment.enabled
        ? "Este ambiente está desactivado en la torre."
        : "El mapa necesita un sondeo con módulos medidos. Mientras la API del ambiente no publique la salud por módulo, aquí no hay nada que dibujar."
    )}</p>`;
    return;
  }
  const p95Gauge = gaugeOf(environment, "p95");
  const riskCut = p95Gauge && p95Gauge.limits ? Number(p95Gauge.limits.risk) : 1000;
  const columns = history.length;
  const first = formatTime(history[0].at);
  const last = formatTime(history[history.length - 1].at);
  meta.textContent = `${columns} sondeos · ${first} → ${last} · altura = frescura medida`;

  const moduleRows = rows.map(({ module, cells, band }) => `
    <button class="map-row band-${band}" type="button" data-module="${escapeHtml(module.key)}" title="${escapeHtml(`${module.name} · ${BAND_LABEL[band]} · clic para ver el detalle`)}">
      <span class="map-name"><span class="dot status-${BAND_TONE[band]}" aria-hidden="true"></span>${escapeHtml(module.name)}</span>
      <span class="map-strip" aria-hidden="true">${cells.map((tick) => mapTick(
        tick ? tick.band : "unknown",
        tickHeight(tick),
        `${module.name} · ${tick ? BAND_LABEL[tick.band] : "sin sondeo"}${tick && tick.ratio != null ? ` · frescura ${tick.ratio}x` : ""}${tick && tick.records != null ? ` · ${formatNumber(tick.records)} registros` : ""}`
      )).join("")}</span>
      <span class="map-now"><span class="band-pill ${BAND_TONE[band]}">${escapeHtml(BAND_LABEL[band])}</span></span>
    </button>`).join("");

  const apiCells = history.map((sample) => sample.api || null);
  const lastApi = apiCells[apiCells.length - 1];
  const apiRow = `
    <div class="map-row api-row band-${lastApi && BAND_ORDER.includes(lastApi.band) ? lastApi.band : "unknown"}">
      <span class="map-name"><span class="dot status-accent" aria-hidden="true"></span>API /health</span>
      <span class="map-strip" aria-hidden="true">${apiCells.map((cell) => cell
        ? mapTick(cell.band, cell.ms == null ? 14 : Math.max(10, Math.min(100, (cell.ms / (riskCut * 1.5)) * 100)), `Sonda /health ${cell.ms == null ? "sin medición" : `${cell.ms} ms`} · objetivo ≤ ${riskCut} ms`)
        : mapTick("unknown", 12, "Sondeo sin lectura de la API"))}</span>
      <span class="map-now"><small>${lastApi && lastApi.ms != null ? escapeHtml(`${lastApi.ms} ms`) : "sin sonda"}</small></span>
    </div>`;

  container.innerHTML = `
    <div class="map-legend">
      ${BAND_ORDER.map((band) => `<span class="legend-chip band-${band}"><i class="swatch" aria-hidden="true"></i>${escapeHtml(BAND_LABEL[band])}</span>`).join("")}
      <span class="muted small">Cada marca es un sondeo real de la torre. La altura sale de la frescura medida; un módulo sin fecha medida usa la altura base de su banda.</span>
    </div>
    <div class="map-body">${moduleRows}${apiRow}</div>
    <div class="map-axis"><span></span><span>${escapeHtml(first)}</span><span>${escapeHtml(last)}</span></div>`;
}

function payloadNotice(payload, environment, { scope = "environment" } = {}) {
  if (!payload) return "";
  const reason = payload.reason || payload.code || "SIN_DATO";
  const resolver = HEALTH_REASON[reason];
  const message = resolver ? resolver(environment || {}) : (payload.detail || "La torre no pudo medir la salud por módulo.");
  const tone = ["SIN_TOKEN", "SIMULACION"].includes(reason) ? "info" : "warn";
  const target = scope === "company" ? "de esta empresa" : "de este ambiente";
  const detail = payload.detail && payload.detail !== message
    ? `<p class="notice-detail">${escapeHtml(payload.detail)}</p>`
    : "";
  const actions = scope === "company" ? companyActions() : environmentActions();
  return `
    <div class="health-notice ${tone}" role="status">
      <div class="notice-head">
        <span class="pill ${tone === "info" ? "unknown" : "degraded"}">${escapeHtml(reason)}</span>
        <strong>Sin datos por módulo ${escapeHtml(target)}</strong>
      </div>
      <p>${escapeHtml(message)}</p>
      ${detail}
    </div>
    ${actionList(actions, { title: `Cómo destrabar "${reason}"` })}`;
}

function healthBlock(scope) {
  const { health, payload, environment } = blockData(scope);
  if (!health) return payloadNotice(payload, environment, { scope }) || '<p class="empty">Sin lectura de salud.</p>';
  const notice = payload && payload.source && payload.source !== "api" ? payloadNotice(payload, environment, { scope }) : "";
  const modulesHealth = health.modules || {};
  const infraHealth = health.infra || {};
  const weight = modulesHealth.score != null && infraHealth.score != null
    ? "70% módulos · 30% infraestructura"
    : modulesHealth.score != null
      ? "solo módulos (sin sondas de infraestructura)"
      : "solo infraestructura (sin datos por módulo)";
  return `
    <div class="health-top">
      <article class="gauge-card">
        ${gaugeSvg(health)}
        <div class="gauge-stats">
          <div><span>Módulos</span><strong>${modulesHealth.score == null ? "—" : escapeHtml(modulesHealth.score)}</strong><small>${escapeHtml(`${modulesHealth.measurable || 0}/${modulesHealth.total || 0} medibles`)}</small></div>
          <div><span>Infraestructura</span><strong>${infraHealth.score == null ? "—" : escapeHtml(infraHealth.score)}</strong><small>${escapeHtml(`${infraHealth.measurable || 0}/${infraHealth.total || 0} sondas`)}</small></div>
        </div>
        <p class="gauge-weight">${escapeHtml(weight)}</p>
        <button class="link" type="button" data-health-detail>Umbrales y fórmula</button>
      </article>
      <div class="health-side">
        ${notice}
        ${bandCards(health)}
        ${thresholdScale(health)}
      </div>
    </div>
    ${moduleChart(scope)}
    ${notice ? "" : actionList(scope === "company" ? companyActions() : environmentActions(), { title: "Acciones sugeridas", empty: "Sin acciones pendientes: el alcance medido opera dentro del objetivo." })}`;
}

function renderHealth(environment) {
  const container = document.getElementById("health");
  const meta = document.getElementById("healthMeta");
  if (!environment) {
    meta.textContent = "Sin ambiente";
    container.innerHTML = '<p class="empty">La torre aún no tiene ambientes configurados.</p>';
    return;
  }
  if (!environment.health) {
    meta.textContent = environment.enabled ? "Sin lectura" : "Ambiente desactivado";
    container.innerHTML = `<p class="empty">${environment.enabled ? "Esperando la primera lectura de salud." : "Este ambiente está desactivado en la torre."}</p>`;
    return;
  }
  const health = environment.health;
  const score = Number.isFinite(health.score) ? health.score : null;
  const thresholds = health.thresholds || { optimal: 85, risk: 60 };
  const deployed = environment.deployed;
  const build = deployed && deployed.commit
    ? ` · build ${escapeHtml(String(deployed.commit).slice(0, 7))}${deployed.modules != null ? ` (${escapeHtml(deployed.modules)} módulos)` : ""}`
    : "";
  meta.innerHTML = `<span class="band-pill ${BAND_TONE[health.band] || "unknown"}">${escapeHtml(BAND_LABEL[health.band] || "Sin dato")}</span> ${escapeHtml(score == null ? "sin puntaje" : `${score}/100`)} · umbrales ${escapeHtml(thresholds.optimal)} / ${escapeHtml(thresholds.risk)} · ${escapeHtml(environment.label)}${build}`;
  container.innerHTML = healthBlock("environment");
}

function companyRow(tenantId) {
  const environment = activeEnvironment();
  const payload = environment && environment.activity ? environment.activity.tenants : null;
  const rows = payload && Array.isArray(payload.tenants) ? payload.tenants : [];
  return rows.find((row) => String(row.tenant_id) === String(tenantId)) || null;
}

function companyTiles(data) {
  const environment = activeEnvironment();
  const deployed = environment ? environment.deployed : null;
  const activity = companyRow(data.tenant ? data.tenant.id : state.company.id);
  const summary = data.summary || {};
  const health = data.health || {};
  const score = Number.isFinite(health.score) ? health.score : null;
  const band = BAND_ORDER.includes(health.band) ? health.band : "unknown";
  const errorStatuses = (deployed && deployed.usage && deployed.usage.byStatus) || {};
  return [
    {
      label: "Estado operativo",
      value: score == null ? "—" : String(score),
      unit: score == null ? "" : "/100",
      foot: `${BAND_LABEL[band]} · ${summary.ok || 0}/${summary.total || 0} módulos operativos`,
      status: BAND_TONE[band]
    },
    {
      label: "Carga de datos",
      value: Number.isFinite(summary.records) ? formatNumber(summary.records) : "—",
      foot: `${summary.ok || 0}/${summary.total || 0} módulos con datos · ${summary.down || 0} caídos · ${summary.unknown || 0} sin medir`,
      status: summary.down ? "down" : summary.records ? "ok" : "unknown"
    },
    {
      label: "Actividad de la empresa",
      value: activity ? formatNumber(activity.activity_period || 0) : "—",
      foot: activity
        ? `${formatNumber(activity.sessions_active || 0)} sesiones · ${formatNumber(activity.gps_period || 0)} GPS · ${activity.last_activity_at ? relative(activity.last_activity_at) : "sin señal"}`
        : "La empresa no aparece en la lectura de actividad",
      status: activity && activity.activity_period ? "ok" : "unknown"
    },
    {
      label: "Memoria del API",
      value: deployed && deployed.memory ? formatNumber(deployed.memory.rss) : "—",
      unit: deployed && deployed.memory ? "MB" : "",
      foot: memoryFoot(deployed) || "El build desplegado no expone memoria",
      status: deployed && deployed.memory ? measureStatus(environment, "memoryRss") : "unknown"
    },
    {
      label: "Uso del API",
      value: deployed && deployed.usage ? formatNumber(deployed.usage.requestsTotal) : "—",
      unit: deployed && deployed.usage ? "req" : "",
      foot: usageFoot(deployed) || "El build desplegado no expone uso",
      status: deployed && deployed.usage ? (errorStatuses["5xx"] ? "degraded" : "ok") : "unknown"
    },
    {
      label: "Rendimiento p95",
      value: (() => {
        const performance = performanceData(environment);
        return performance && performance.p95 != null ? String(performance.p95) : "—";
      })(),
      unit: "ms",
      foot: uptimeFoot(deployed) || "Proceso sin uptime reportado",
      status: measureStatus(environment, "p95")
    }
  ];
}

function renderCompany() {
  const panel = document.getElementById("companyPanel");
  const title = document.getElementById("companyTitle");
  const meta = document.getElementById("companyMeta");
  const container = document.getElementById("companyHealth");
  const kpiContainer = document.getElementById("companyKpis");
  const company = state.company;
  if (!company) {
    panel.hidden = true;
    container.innerHTML = "";
    if (kpiContainer) kpiContainer.innerHTML = "";
    meta.textContent = "";
    return;
  }
  panel.hidden = false;
  const environment = activeEnvironment();
  title.textContent = `${company.name || company.id} · estado por módulo`;
  if (company.loading) {
    meta.textContent = `${company.id} · consultando ${environment ? environment.short : "ambiente"}…`;
    container.innerHTML = '<p class="empty">Cargando módulos de la empresa…</p>';
    if (kpiContainer) kpiContainer.innerHTML = "";
    return;
  }
  if (company.error) {
    meta.textContent = `${company.id} · sin datos`;
    if (kpiContainer) kpiContainer.innerHTML = "";
    const reason = company.errorCode || "";
    const resolver = HEALTH_REASON[reason];
    const message = resolver ? resolver(environment || {}) : company.error;
    container.innerHTML = `
      <div class="health-notice warn" role="status">
        <div class="notice-head">
          <span class="pill degraded">${escapeHtml(reason || "ERROR")}</span>
          <strong>No se pudo leer la empresa</strong>
        </div>
        <p>${escapeHtml(message)}</p>
      </div>
      ${actionList(companyActions(), { title: `Cómo destrabar "${reason || "ERROR"}"` })}`;
    return;
  }
  const data = company.data || {};
  meta.textContent = [
    company.id,
    environment ? environment.short : null,
    environment && environment.branch ? `rama ${environment.branch}` : null,
    data.generated_at ? `datos ${formatTime(data.generated_at)}` : null,
    data.checkedAt ? `lectura ${relative(data.checkedAt)}` : null
  ].filter(Boolean).join(" · ");
  if (kpiContainer) kpiContainer.innerHTML = companyTiles(data).map((entry) => tile(entry)).join("");
  container.innerHTML = data.ok
    ? healthBlock("company")
    : payloadNotice(data, environment, { scope: "company" });
}

async function loadCompany(tenantId, name, { scroll = true } = {}) {
  state.company = { id: tenantId, name, loading: true, data: null, error: null, errorCode: null, errorAction: null };
  renderCompany();
  try {
    const payload = await api(`/api/tenants/${encodeURIComponent(tenantId)}/modules?environment=${encodeURIComponent(state.environment)}`);
    if (!state.company || state.company.id !== tenantId) return;
    state.company = {
      id: tenantId,
      name: (payload && payload.tenant && payload.tenant.name) || name,
      loading: false,
      data: payload,
      error: null,
      errorCode: null,
      errorAction: null
    };
  } catch (error) {
    if (!state.company || state.company.id !== tenantId) return;
    state.company = {
      id: tenantId,
      name,
      loading: false,
      data: null,
      error: error.message,
      errorCode: error.code || null,
      errorAction: error.recommendation || null
    };
  }
  renderCompany();
  if (scroll) {
    const panel = document.getElementById("companyPanel");
    if (panel && typeof panel.scrollIntoView === "function") panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function refreshCompany() {
  if (!state.company || state.company.loading) return Promise.resolve();
  return loadCompany(state.company.id, state.company.name, { scroll: false });
}

function openDialog({ eyebrow, title, body }) {
  const dialog = document.getElementById("detailDialog");
  document.getElementById("detailEyebrow").textContent = eyebrow;
  document.getElementById("detailTitle").textContent = title;
  document.getElementById("detailBody").innerHTML = body;
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog() {
  const dialog = document.getElementById("detailDialog");
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

function moduleDetailBody(module) {
  const band = BAND_ORDER.includes(module.band) ? module.band : "unknown";
  const status = pillClass(module.status);
  const data = module.data || {};
  const services = Array.isArray(module.services) ? module.services : [];
  const alerts = Array.isArray(module.alerts) ? module.alerts : [];
  const metrics = [
    ["Puntaje", Number.isFinite(module.score) ? `${module.score}/100` : "sin medición"],
    ["Banda", BAND_LABEL[band]],
    ["Registros", Number.isFinite(data.records) ? formatNumber(data.records) : "—"],
    ["Estado del dato", DATA_STATE_LABEL[data.state] || "—"],
    ["Última actividad", data.last_activity_at ? `${formatTime(data.last_activity_at)} · ${relative(data.last_activity_at)}` : "sin registro"],
    ["Ventana esperada", Number.isFinite(data.expected_minutes) ? `${data.expected_minutes} min` : "—"],
    ["Antigüedad", Number.isFinite(data.age_minutes) ? `${data.age_minutes} min` : "—"],
    ["Modelo", module.declared === false ? "Sin modelo operativo" : "Declarado"]
  ];
  return `
    <div class="dialog-summary">
      <span class="pill ${status}">${escapeHtml(STATUS_LABEL[module.status] || module.status)}</span>
      <span class="band-pill ${BAND_TONE[band]}">${escapeHtml(BAND_LABEL[band])}</span>
      <span class="muted small">${escapeHtml(GROUP_LABEL[module.group] || module.group || "")}</span>
    </div>
    <p class="dialog-meaning">${escapeHtml(STATUS_MEANING[status] || "")}</p>
    <p class="dialog-detail">${escapeHtml(module.detail || "Sin detalle adicional.")}</p>
    <div class="dialog-grid">
      ${metrics.map(([label, value]) => `<div class="dialog-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    </div>
    <div class="dialog-section">
      <h3>Servicios de dependencia</h3>
      ${services.length
        ? `<div class="module-services">${services.map((service) => `<span class="service-dot status-${pillClass(service.status)}">${escapeHtml(service.label || service.key)} · ${escapeHtml(STATUS_LABEL[service.status] || service.status)}</span>`).join("")}</div>`
        : '<p class="muted small">El módulo no declara servicios.</p>'}
    </div>
    <div class="dialog-section">
      <h3>Alertas abiertas</h3>
      ${alerts.length
        ? `<ul class="dialog-alerts">${alerts.map((alert) => `<li>${escapeHtml(alert.title || alert.component || "Alerta")} <span class="muted small">${escapeHtml(alert.severity || "")}</span></li>`).join("")}</ul>`
        : '<p class="muted small">Sin alertas abiertas para sus dependencias.</p>'}
    </div>
    <details class="tech" open><summary>Detalle técnico</summary>${technicalBlock({
      key: module.key,
      status: module.status,
      band,
      score: module.score,
      declared: module.declared,
      data: module.data || null,
      services,
      alerts
    })}</details>`;
}

function openModuleDetail(key, scope) {
  const { modules, environment } = blockData(scope);
  const module = modules.find((item) => item.key === key);
  if (!module) {
    toast("El módulo ya no aparece en la lectura vigente.", "error");
    return;
  }
  const context = scope === "company"
    ? (state.company && state.company.name) || "Empresa"
    : `${environment ? environment.label : "Ambiente"}${environment && environment.branch ? ` · ${environment.branch}` : ""}`;
  openDialog({
    eyebrow: `Módulo · ${context}`,
    title: module.name,
    body: moduleDetailBody(module)
  });
}

function openMethodDialog() {
  const environment = activeEnvironment();
  const health = environment ? environment.health : null;
  const thresholds = (health && health.thresholds) || { optimal: 85, risk: 60 };
  const risk = Number(thresholds.risk) || 60;
  const optimal = Number(thresholds.optimal) || 85;
  const counts = health ? bandCounts(health) : { optimal: 0, risk: 0, critical: 0, unknown: 0 };
  const source = environment && environment.modules ? environment.modules.source : null;
  const rows = [
    ["optimal", `≥ ${optimal}`, "Opera con datos frescos y servicios sanos.", counts.optimal],
    ["risk", `${risk}–${optimal - 1}`, "Responde, pero con datos viejos, una dependencia lenta o un servicio con alerta.", counts.risk],
    ["critical", `< ${risk}`, "Módulos caídos o dependencias vitales sin servicio.", counts.critical],
    ["unknown", "sin medición", "La API no pudo medir el módulo; no se premia ni se castiga.", counts.unknown]
  ];
  openDialog({
    eyebrow: "Indicador oficial",
    title: "Umbrales y fórmula de salud",
    body: `
      <div class="band-table">
        ${rows.map(([band, range, detail, count]) => `
          <div class="band-row">
            <span class="band-pill ${BAND_TONE[band]}">${escapeHtml(BAND_LABEL[band])}</span>
            <span class="band-row-range">${escapeHtml(range)}</span>
            <span class="band-row-count">${escapeHtml(formatNumber(count))} módulos</span>
            <p>${escapeHtml(detail)}</p>
          </div>`).join("")}
      </div>
      <div class="dialog-section">
        <h3>Cómo se calcula</h3>
        <ul class="method-list">
          <li>Cada módulo aporta 100 puntos si está operativo, 55 si responde fuera del objetivo (dato viejo, dependencia lenta o servicio con alerta) y 10 si está caído. Un módulo sin dato no puntúa.</li>
          <li>Un módulo sano que consume más del 75% de su ventana de frescura pierde hasta 25 puntos: sigue arriba, pero entra en riesgo.</li>
          <li>El puntaje general combina 70% módulos y 30% infraestructura cuando ambas fuentes se miden; si solo hay una, se usa esa sin inventar la otra.</li>
          <li>Las sondas informativas (módulos y actividad) no puntúan dos veces: solo cuentan los servicios de infraestructura y los módulos operativos.</li>
        </ul>
      </div>
      <p class="muted small">${escapeHtml(source === "api" ? "Los módulos de este ambiente provienen de la API de APEX Control." : "Este ambiente no entrega datos por módulo: el puntaje se deriva de las dependencias sondeadas.")}</p>`
  });
}

// Las vistas se eligen por pregunta, no por "resumen/detalle": cada seccion del
// HTML declara en data-views en cuales aparece y aqui solo se enciende la activa.
const LEGACY_VIEWS = { summary: "resumen", detail: "api" };

function normalizeView(view) {
  const wanted = LEGACY_VIEWS[view] || view;
  return VIEW_ORDER.includes(wanted) ? wanted : "resumen";
}

function applyView() {
  const view = normalizeView(state.view);
  if (view !== state.view) {
    state.view = view;
    localStorage.setItem("towerView", view);
  }
  document.querySelectorAll("[data-views]").forEach((section) => {
    const views = String(section.dataset.views || "").split(/\s+/).filter(Boolean);
    section.hidden = !views.includes(view);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function tile({ label, value, unit = "", foot = "", status = "unknown" }) {
  return `
    <article class="metric-tile status-${pillClass(status)}">
      <p class="tile-label">${escapeHtml(label)}</p>
      <p class="tile-value">${escapeHtml(value)}<span class="tile-unit">${escapeHtml(unit)}</span></p>
      <p class="tile-foot">${escapeHtml(foot)}</p>
    </article>`;
}

function actionItem(item) {
  const tone = PRIORITY_TONE[item.priority] || "unknown";
  const command = item.command ? `<code class="action-command">${escapeHtml(item.command)}</code>` : "";
  return `
    <li class="action-item tone-${tone}">
      <span class="action-priority pill ${tone}">${escapeHtml(PRIORITY_LABEL[item.priority] || item.priority || "Media")}</span>
      <div class="action-body">
        <p class="action-title">${escapeHtml(item.title || "Acción sugerida")}</p>
        <p class="action-text">${escapeHtml(item.action || "")}</p>
        <p class="action-meta"><span class="action-owner">${escapeHtml(item.owner || "equipo-apexos")}</span>${command}</p>
      </div>
    </li>`;
}

function actionList(items, { title = "Acciones sugeridas", empty = "" } = {}) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!list.length) {
    return empty ? `<p class="action-empty">${escapeHtml(empty)}</p>` : "";
  }
  return `
    <div class="action-list">
      <div class="action-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="muted small">${escapeHtml(list.length === 1 ? "1 acción" : `${list.length} acciones`)} · cada una con responsable y siguiente paso</span>
      </div>
      <ul class="action-stack">${list.map(actionItem).join("")}</ul>
    </div>`;
}

function environmentActions() {
  const environment = activeEnvironment();
  return environment && Array.isArray(environment.recommendations) ? environment.recommendations : [];
}

function companyActions() {
  const company = state.company;
  const data = company && company.data ? company.data : null;
  if (data) {
    if (Array.isArray(data.recommendations)) return data.recommendations;
    return data.recommendation ? [data.recommendation] : [];
  }
  if (!company || !company.error) return [];
  // La lectura de la empresa falló: la torre ya devolvió la acción concreta y,
  // si no la devolvió, se usan las acciones del ambiente que explican la causa.
  if (company.errorAction) return [company.errorAction];
  return environmentActions();
}

function memoryFoot(deployed) {
  if (!deployed || !deployed.memory) return null;
  const memory = deployed.memory;
  return `heap ${formatNumber(memory.heapUsed)}/${formatNumber(memory.heapTotal)} MB`;
}

function usageFoot(deployed) {
  if (!deployed || !deployed.usage) return null;
  const usage = deployed.usage;
  const status = usage.byStatus || {};
  const errors = (Number(status["4xx"]) || 0) + (Number(status["5xx"]) || 0);
  return `${formatNumber(usage.requestsTotal)} peticiones · ${formatNumber(errors)} con error · ${formatNumber(usage.slowQueries)} consultas lentas`;
}

function uptimeFoot(deployed) {
  if (!deployed || !Number.isFinite(deployed.uptimeSeconds)) return null;
  const minutes = Math.floor(deployed.uptimeSeconds / 60);
  if (minutes < 60) return `${minutes} min encendido`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min encendido`;
  return `${Math.floor(hours / 24)} días encendido`;
}

function activityBars(daily) {
  const rows = Array.isArray(daily) ? daily : [];
  if (!rows.length) return "";
  const max = Math.max(1, ...rows.map((row) => Number(row.total) || 0));
  return `
    <div class="activity-bars" role="img" aria-label="Actividad diaria">
      ${rows.map((row) => {
        const height = Math.max(4, Math.round(((Number(row.total) || 0) / max) * 100));
        return `
          <div class="activity-bar" title="${escapeHtml(`${row.date}: ${row.total} actividades`)}">
            <span class="bar-value">${escapeHtml(row.total)}</span>
            <span class="bar-track"><span class="bar-fill" style="height:${height}%"></span></span>
            <span class="bar-label">${escapeHtml(String(row.date).slice(5))}</span>
          </div>`;
      }).join("")}
    </div>`;
}

function dataTable(headers, rows, emptyText) {
  if (!rows.length) return `<p class="empty">${escapeHtml(emptyText)}</p>`;
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderActivity(environment) {
  const kpis = document.getElementById("activityKpis");
  const body = document.getElementById("activityBody");
  const meta = document.getElementById("activityMeta");
  const payload = environment && environment.activity ? environment.activity : null;
  const activity = payload && payload.activity ? payload.activity : null;

  if (!activity) {
    meta.textContent = environment && !environment.enabled ? "Ambiente desactivado" : "Sin datos";
    kpis.innerHTML = "";
    body.innerHTML = `<p class="empty">${escapeHtml(ACTIVITY_REASON[payload && payload.reason] || "La torre aún no tiene actividad para este ambiente.")}</p>`;
    return;
  }

  const connections = activity.connections || {};
  const gps = connections.gps || {};
  const websocket = connections.websocket || {};
  const daily = Array.isArray(activity.daily) ? activity.daily : [];
  const company = activity.tenant && activity.tenant.name ? activity.tenant.name : "Empresa del token";

  meta.textContent = `${company} · últimos ${activity.days} días · ${formatTime(payload.checkedAt)}`;
  kpis.innerHTML = [
    {
      label: "Actividad hoy",
      value: formatNumber(activity.activity.today),
      foot: `${formatNumber(activity.activity.period)} en la ventana`,
      status: activity.activity.today ? "ok" : "unknown"
    },
    {
      label: "Usuarios activos",
      value: formatNumber(activity.activity.active_users || 0),
      foot: `${formatNumber(connections.distinct_users || 0)} con sesión abierta`,
      status: activity.activity.active_users ? "ok" : "unknown"
    },
    {
      label: "Sesiones activas",
      value: formatNumber(connections.active_sessions || 0),
      foot: connections.last_seen_at ? `última señal ${relative(connections.last_seen_at)}` : "sin señal",
      status: connections.active_sessions ? "ok" : "unknown"
    },
    {
      label: "WebSocket",
      value: formatNumber(websocket.clients || 0),
      foot: `${formatNumber(websocket.tenants || 0)} empresas · proceso`,
      status: websocket.clients ? "ok" : "unknown"
    },
    {
      label: "Pings GPS",
      value: formatNumber(gps.pings_period || 0),
      foot: gps.last_ping_at ? `último ${relative(gps.last_ping_at)}` : "sin pings",
      status: gps.pings_period ? "ok" : "unknown"
    },
    {
      label: "Última actividad",
      value: activity.activity.last_activity_at ? relative(activity.activity.last_activity_at) : "nunca",
      foot: activity.activity.last_activity_at ? formatTime(activity.activity.last_activity_at) : "sin auditoría ni eventos",
      status: activity.activity.last_activity_at ? "ok" : "unknown"
    }
  ].map((entry) => tile(entry)).join("");

  const connectionRows = [
    ["Sesiones vigentes", `<b>${escapeHtml(formatNumber(connections.active_sessions || 0))}</b>`, escapeHtml(connections.last_seen_at ? formatTime(connections.last_seen_at) : "—")],
    ["Usuarios distintos", escapeHtml(formatNumber(connections.distinct_users || 0)), escapeHtml(formatNumber(activity.activity.active_users || 0))],
    ["WebSocket (proceso)", escapeHtml(formatNumber(websocket.clients || 0)), escapeHtml(`${formatNumber(websocket.tenants || 0)} empresas`)],
    ["GPS en la ventana", escapeHtml(formatNumber(gps.pings_period || 0)), escapeHtml(gps.last_ping_at ? formatTime(gps.last_ping_at) : "—")]
  ];

  body.innerHTML = `
    <div class="activity-chart">
      <div class="chart-head">
        <h3>Actividad diaria</h3>
        <span class="muted small">auditoría + eventos · ${escapeHtml(formatNumber(activity.activity.period))} total</span>
      </div>
      ${activityBars(daily) || '<p class="empty">Sin actividad en la ventana.</p>'}
    </div>
    <div class="activity-detail">
      ${dataTable(["Conexión", "Valor", "Referencia"], connectionRows, "Sin conexiones registradas.")}
      ${dataTable(
        ["Día", "Auditoría", "Eventos", "Total"],
        daily.map((row) => [
          escapeHtml(row.date),
          escapeHtml(formatNumber(row.audit || 0)),
          escapeHtml(formatNumber(row.events || 0)),
          `<b>${escapeHtml(formatNumber(row.total || 0))}</b>`
        ]),
        "Sin días en la ventana."
      )}
    </div>`;
}

function tenantRows(tenantsPayload) {
  const rows = tenantsPayload && Array.isArray(tenantsPayload.tenants) ? tenantsPayload.tenants : [];
  const rank = { ok: 0, degraded: 1, unknown: 2, down: 0 };
  return [...rows].sort((left, right) => {
    const toneLeft = rank[pillClass(left.status)] ?? 3;
    const toneRight = rank[pillClass(right.status)] ?? 3;
    if (toneLeft !== toneRight) return toneLeft - toneRight;
    return (Number(right.activity_period) || 0) - (Number(left.activity_period) || 0);
  });
}

// Consolidado del ambiente: todas las empresas y el consumo real del proceso
// (memoria, uso de API y rendimiento) en una sola lectura.
function consolidatedTiles(environment) {
  const tenantsPayload = environment && environment.activity ? environment.activity.tenants : null;
  const summary = tenantsPayload ? tenantsPayload.summary || {} : null;
  const rows = tenantsPayload ? tenantRows(tenantsPayload) : [];
  const totals = rows.reduce((acc, row) => {
    acc.activity += Number(row.activity_period) || 0;
    acc.gps += Number(row.gps_period) || 0;
    acc.sessions += Number(row.sessions_active) || 0;
    acc.users += Number(row.users_active) || 0;
    return acc;
  }, { activity: 0, gps: 0, sessions: 0, users: 0 });
  const deployed = environment ? environment.deployed : null;
  const performance = performanceData(environment);
  const modulePayload = environment && environment.modules ? environment.modules : null;
  const moduleSummary = modulePayload && modulePayload.summary ? modulePayload.summary : null;
  const withoutSignal = rows.filter((row) => pillClass(row.status) !== "ok").length;

  const tiles = [
    {
      label: "Empresas activas",
      value: summary ? `${formatNumber(summary.active || 0)}/${formatNumber(summary.total || 0)}` : "—",
      foot: summary ? `${formatNumber(summary.with_activity || 0)} con actividad · ${formatNumber(summary.with_sessions || 0)} con sesión` : "Vista por empresa no disponible",
      status: summary ? (summary.active ? "ok" : "degraded") : "unknown"
    },
    {
      label: "Carga de datos",
      value: moduleSummary && Number.isFinite(moduleSummary.records) ? formatNumber(moduleSummary.records) : "—",
      foot: moduleSummary ? `${moduleSummary.ok || 0}/${moduleSummary.total || 0} módulos medibles en el ambiente` : "Sin lectura por módulo",
      status: moduleSummary ? (moduleSummary.down ? "down" : "ok") : "unknown"
    },
    {
      label: "Actividad acumulada",
      value: summary ? formatNumber(totals.activity) : "—",
      foot: summary ? `${formatNumber(totals.gps)} pings GPS · ${formatNumber(totals.users)} usuarios · ${formatNumber(totals.sessions)} sesiones` : "Sin datos de actividad",
      status: summary && totals.activity ? "ok" : "unknown"
    },
    {
      label: "Empresas sin señal",
      value: summary ? formatNumber(withoutSignal) : "—",
      foot: summary ? "estado inactivo o sin actividad en la ventana medida" : "Sin lectura de empresas",
      status: summary ? (withoutSignal ? "degraded" : "ok") : "unknown"
    },
    {
      label: "Memoria del API",
      value: deployed && deployed.memory ? formatNumber(deployed.memory.rss) : "—",
      unit: deployed && deployed.memory ? "MB" : "",
      foot: deployed && deployed.memory
        ? `heap ${formatNumber(deployed.memory.heapUsed)}/${formatNumber(deployed.memory.heapTotal)} MB`
        : "El build desplegado no expone memoria",
      status: deployed && deployed.memory ? measureStatus(environment, "memoryRss") : "unknown"
    },
    {
      label: "Uso del API",
      value: deployed && deployed.usage ? formatNumber(deployed.usage.requestsTotal) : "—",
      unit: deployed && deployed.usage ? "req" : "",
      foot: usageFoot(deployed) || "El build desplegado no expone uso",
      status: deployed && deployed.usage ? ((deployed.usage.byStatus && deployed.usage.byStatus["5xx"]) ? "degraded" : "ok") : "unknown"
    },
    {
      label: "Rendimiento p95",
      value: performance && performance.p95 != null ? String(performance.p95) : "—",
      unit: performance && performance.p95 != null ? "ms" : "",
      foot: performance && performance.samples
        ? `${performance.samples} muestras · ${performance.errorRate || 0}% errores · ${uptimeFoot(deployed) || "sin uptime"}`
        : "Sin muestras de este ambiente",
      status: measureStatus(environment, "p95")
    }
  ];
  return tiles;
}

function pickerHint(environment, tenantsPayload) {
  if (tenantsPayload) {
    const notes = [
      tenantsPayload.restricted ? "alcance limitado por allowlist" : null,
      tenantsPayload.days ? `ventana ${tenantsPayload.days} días` : null,
      environment && environment.branch ? `rama ${environment.branch}` : null
    ].filter(Boolean);
    return notes.length ? notes.join(" · ") : "Lectura completa disponible";
  }
  const reason = environment && environment.activity ? environment.activity.tenantsReason : null;
  return TENANT_REASON[reason] || "La vista por empresa no está disponible en este ambiente.";
}

// Acciones que explican por qué la vista por empresa está bloqueada. Se filtran
// de las del ambiente para no repetir en el monitor lo que ya muestra la salud.
const TENANT_BLOCK_CODES = new Set([
  "MODULO_NO_DESPLEGADO",
  "SIN_TOKEN",
  "TOKEN_INVALIDO",
  "SIN_CONEXION",
  "CROSS_TENANT_DESHABILITADO",
  "PERMISO_DENEGADO",
  "MODULO_NO_HABILITADO",
  "EMPRESA_FUERA_DE_ALCANCE",
  "EMPRESA_NO_ENCONTRADA"
]);

function tenantBlockActions(reason) {
  const all = environmentActions();
  const matched = all.filter((item) => TENANT_BLOCK_CODES.has(item.code));
  if (matched.length) return matched;
  return reason ? all.slice(0, 1) : [];
}

function renderCompanyPicker(environment, tenantsPayload) {
  const select = document.getElementById("companySelect");
  const hint = document.getElementById("pickerHint");
  const rows = tenantsPayload ? tenantRows(tenantsPayload) : [];
  if (select) {
    const selectedId = state.company ? state.company.id : "";
    select.innerHTML = `<option value="">${rows.length ? "Selecciona una empresa…" : "Sin empresas disponibles"}</option>`
      + rows.map((row) => {
        const label = `${row.name || row.tenant_id} · ${TENANT_STATUS_LABEL[pillClass(row.status)] || row.status} · ${formatNumber(row.activity_period || 0)} activ.`;
        return `<option value="${escapeHtml(row.tenant_id)}" data-name="${escapeHtml(row.name || row.tenant_id)}"${selectedId === String(row.tenant_id) ? " selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("");
    select.disabled = !rows.length;
  }
  if (hint) hint.textContent = pickerHint(environment, tenantsPayload);
}

function renderTenants(environment) {
  const container = document.getElementById("tenants");
  const meta = document.getElementById("tenantsMeta");
  const summaryContainer = document.getElementById("companySummary");
  const payload = environment && environment.activity ? environment.activity : null;
  const tenants = payload && payload.tenants ? payload.tenants : null;

  if (summaryContainer) {
    summaryContainer.innerHTML = `<div class="tile-grid">${consolidatedTiles(environment).map((entry) => tile(entry)).join("")}</div>`;
  }
  renderCompanyPicker(environment, tenants);

  if (!tenants) {
    const reason = payload && payload.tenantsReason;
    meta.textContent = reason ? "Lectura restringida" : "Sin datos";
    container.innerHTML = `<p class="empty">${escapeHtml(TENANT_REASON[reason] || "La vista por empresa no está disponible en este ambiente.")}</p>`
      + actionList(tenantBlockActions(reason), { title: `Qué falta para leer las empresas de ${environment ? environment.short : "este ambiente"}` });
    return;
  }

  const summary = tenants.summary || {};
  meta.textContent = [
    `${formatNumber(summary.total || 0)} empresas`,
    `${formatNumber(summary.active || 0)} activas`,
    `${formatNumber(summary.with_sessions || 0)} con sesión`,
    tenants.restricted ? "alcance limitado por allowlist" : null,
    formatTime(tenants.generated_at)
  ].filter(Boolean).join(" · ");

  const headers = ["Empresa", "Estado", "Plan", "Usuarios", "Sesiones", "Actividad", "Última actividad", "GPS", "Último ping", "Módulos", "Acción"];
  const all = tenantRows(tenants);
  const rows = all.map((tenant) => {
    const status = pillClass(tenant.status);
    const isSelected = state.company && String(state.company.id) === String(tenant.tenant_id);
    const action = `<button class="btn mini ${isSelected ? "" : "ghost"}" type="button" data-tenant-id="${escapeHtml(tenant.tenant_id)}" data-tenant-name="${escapeHtml(tenant.name || tenant.tenant_id)}">${isSelected ? "Seleccionada" : "Ver módulos"}</button>`;
    const cells = [
      `<span class="tenant-name">${escapeHtml(tenant.name || tenant.tenant_id)}</span><code class="tenant-id">${escapeHtml(tenant.tenant_id)}</code>`,
      `<span class="pill ${status}" title="${escapeHtml(STATUS_MEANING[status] || "")}">${escapeHtml(TENANT_STATUS_LABEL[status] || tenant.status)}</span>`,
      escapeHtml(formatNumber(tenant.users_active || 0)),
      escapeHtml(formatNumber(tenant.sessions_active || 0)),
      escapeHtml(formatNumber(tenant.activity_period || 0)),
      escapeHtml(formatNumber(tenant.gps_period || 0)),
      escapeHtml(formatNumber(tenant.modules || 0))
    ];
    return [
      cells[0],
      cells[1],
      escapeHtml(tenant.plan || "—"),
      cells[2],
      cells[3],
      cells[4],
      escapeHtml(tenant.last_activity_at ? relative(tenant.last_activity_at) : "sin señal"),
      cells[5],
      escapeHtml(tenant.last_ping_at ? relative(tenant.last_ping_at) : "sin pings"),
      cells[6],
      action
    ];
  });

  container.innerHTML = dataTable(headers, rows, "Sin empresas para mostrar.");
}


function renderCredentials(credentials) {
  const container = document.getElementById("credentials");
  const meta = document.getElementById("credentialsMeta");
  if (!Array.isArray(credentials) || !credentials.length) {
    meta.textContent = "Sin reporte";
    container.innerHTML = '<p class="empty">La torre no reporta credenciales cloud.</p>';
    return;
  }
  const ready = credentials.filter((entry) => entry.configured).length;
  meta.textContent = `${ready}/${credentials.length} listas · solo se muestran nombres de variables, nunca valores`;
  container.innerHTML = credentials.map((entry) => {
    const status = entry.configured ? "ok" : "unknown";
    const environments = entry.environments || {};
    const envChips = ["develop", "main"].map((id) => {
      const value = environments[id];
      const tone = value === true ? "ok" : "unknown";
      return `<span class="pill ${tone}">${escapeHtml(id)}: ${value === true ? "configurado" : "pendiente"}</span>`;
    }).join("");
    return `
      <article class="credential-card status-${status}">
        <div class="credential-head">
          <h3>${escapeHtml(entry.label || entry.provider)}</h3>
          <span class="pill ${status}">${entry.configured ? "Listo" : entry.tokenConfigured ? "Parcial" : "Sin token"}</span>
        </div>
        <p class="credential-detail">${entry.tokenConfigured ? "Token de proveedor configurado." : "Token de proveedor sin configurar en la torre."}</p>
        <div class="credential-envs">${envChips}</div>
        ${entry.missing && entry.missing.length
          ? `<p class="credential-missing">Falta: ${entry.missing.map((name) => `<code>${escapeHtml(name)}</code>`).join(", ")}</p>`
          : '<p class="credential-ok">Todas las variables requeridas están presentes.</p>'}
      </article>`;
  }).join("");
}

function renderStatusLegend() {
  const legend = document.getElementById("statusLegend");
  if (!legend) return;
  const environment = activeEnvironment();
  const items = ["ok", "degraded", "down", "unknown"].map((status) => `
    <span class="legend-item">
      <span class="pill ${status}">${escapeHtml(STATUS_LABEL[status])}</span>
      <small>${escapeHtml(STATUS_MEANING[status])}</small>
    </span>`).join("");
  legend.innerHTML = `<span class="legend-title">Cómo se leen los estados${environment ? ` en ${escapeHtml(environment.short)}` : ""}</span>${items}`;
}

function render() {
  const data = state.data;
  if (!data) return;
  applyView();
  const snapshot = data.snapshot;
  const git = data.git;
  const telegram = data.telegram || {};
  const environment = activeEnvironment();
  const environmentId = environment ? environment.id : "local";
  const alerts = environmentAlerts(data.alerts || [], environmentId);
  const openAlerts = alerts.filter((alert) => !alert.resolvedAt);

  renderEnvironmentTabs(snapshot, environment);
  renderStatusLegend();
  renderHealth(environment);
  renderGauges(environment);
  renderModuleMap(environment);

  const overallPill = document.getElementById("overallPill");
  const overall = environment ? environment.overall : snapshot ? snapshot.overall : "unknown";
  overallPill.className = `pill ${pillClass(overall)}`;
  overallPill.textContent = environment
    ? `${environment.short} ${STATUS_LABEL[overall] || overall}`
    : snapshot ? `Sistema ${STATUS_LABEL[overall] || overall}` : "Sin lecturas";
  document.getElementById("lastUpdate").textContent = snapshot ? `Lectura ${relative(snapshot.at)} · ${formatTime(snapshot.at)}` : "Sin lecturas";

  renderKpis(environment, data, git, openAlerts);
  renderModules(environment);
  renderActivity(environment);
  renderTenants(environment);
  renderCompany();
  renderChecks(snapshot, environment);
  renderPerformance(environment);
  renderComponents(environment);
  renderDatabase(environment);
  renderCloud(environment);
  renderGit(git, data, environment);
  renderAlerts(alerts);
  renderCredentials(data.config && data.config.cloud ? data.config.cloud.credentials : null);
  renderJobs(data.jobsList || [], data.jobs);
  renderTelegram(telegram, state.telegram);
  renderEvents(data.events || []);

  document.getElementById("livePill").className = `pill ${state.source && state.source.readyState === 1 ? "ok" : "degraded"}`;
  document.getElementById("livePill").textContent = state.source && state.source.readyState === 1 ? "SSE en vivo" : "SSE reconectando";

  document.getElementById("footerMeta").textContent = [
    `Torre v${data.version}`,
    `Repositorio: ${data.config.repoRoot}`,
    `Ambiente: ${environment ? environment.label : "—"}`,
    `Ciclo: ${Math.round(data.config.pollMs / 1000)} s`,
    data.config.simulation ? "Simulación activa" : null
  ].filter(Boolean).join(" · ");
}

function renderEnvironmentTabs(snapshot, selected) {
  const container = document.getElementById("envTabs");
  const environments = snapshot && snapshot.environments ? snapshot.environments : {};
  const order = ["local", "develop", "main"];
  const entries = order.filter((id) => environments[id]).map((id) => environments[id]);
  if (!entries.length) {
    container.innerHTML = '<p class="empty">La torre aún no tiene ambientes configurados.</p>';
    return;
  }
  container.innerHTML = entries.map((environment) => {
    const health = environment.health;
    const score = health && Number.isFinite(health.score) ? health.score : null;
    const band = health && BAND_ORDER.includes(health.band) ? health.band : "unknown";
    const summary = environment.summary || { ok: 0, total: 0 };
    const build = environment.deployed && environment.deployed.commit ? String(environment.deployed.commit).slice(0, 7) : null;
    const meta = [environment.branch, score == null ? "sin puntaje" : `${score}/100`, build].filter(Boolean).join(" · ");
    const label = environment.enabled ? (score == null ? "Sin dato" : BAND_LABEL[band]) : "Desactivado";
    const tone = environment.enabled && score != null ? BAND_TONE[band] : "unknown";
    return `
      <button class="env-tab ${selected && selected.id === environment.id ? "active" : ""}" type="button" data-env="${escapeHtml(environment.id)}" aria-pressed="${selected && selected.id === environment.id ? "true" : "false"}">
        <span class="dot status-${tone}" aria-hidden="true"></span>
        <span class="env-tab-body">
          <span class="env-tab-label">${escapeHtml(environment.label)}</span>
          <span class="env-tab-meta">${escapeHtml(meta)} · ${summary.ok || 0}/${summary.total || 0} sondas</span>
        </span>
        <span class="env-tab-status status-text-${tone}">${escapeHtml(label)}</span>
      </button>`;
  }).join("");
}

function renderKpis(environment, data, git, openAlerts) {
  const summary = environment && environment.summary ? environment.summary : { ok: 0, total: 0, down: 0, degraded: 0, unknown: 0 };
  const performance = environment && environment.performance ? environment.performance : {};
  const branch = git && git.branches ? git.branches.find((item) => item.name === (environment && environment.branch)) : null;
  const relation = branch ? branch.relation : "unknown";
  const modulePayload = environment && environment.modules ? environment.modules : null;
  const moduleSummary = modulePayload && modulePayload.summary ? modulePayload.summary : null;
  const activityPayload = environment && environment.activity ? environment.activity : null;
  const activity = activityPayload && activityPayload.activity ? activityPayload.activity : null;
  const connections = activity ? activity.connections || {} : {};
  const websocket = connections.websocket || {};
  const tenantsSummary = activityPayload && activityPayload.tenants ? activityPayload.tenants.summary : null;
  const health = environment ? environment.health : null;
  const healthScore = health && Number.isFinite(health.score) ? health.score : null;
  const healthBand = health && BAND_ORDER.includes(health.band) ? health.band : "unknown";

  const tiles = [
    {
      label: `Salud ${environment ? environment.short : "general"}`,
      value: healthScore == null ? "—" : String(healthScore),
      unit: healthScore == null ? "" : "/100",
      foot: health
        ? `${BAND_LABEL[healthBand]} · módulos ${health.modules && health.modules.score != null ? health.modules.score : "—"} · infra ${health.infra && health.infra.score != null ? health.infra.score : "—"}`
        : "Sin lectura de salud",
      status: health ? BAND_TONE[healthBand] : "unknown"
    },
    {
      label: "Módulos",
      value: moduleSummary ? `${moduleSummary.ok || 0}/${moduleSummary.total || 0}` : "—",
      foot: moduleSummary ? `${moduleSummary.degraded || 0} requieren atención · ${moduleSummary.down || 0} caídos` : "Sin datos por módulo",
      status: moduleSummary ? (moduleSummary.down ? "down" : moduleSummary.degraded ? "degraded" : "ok") : "unknown"
    },
    {
      label: "Registros",
      value: moduleSummary && Number.isFinite(moduleSummary.records) ? formatNumber(moduleSummary.records) : "—",
      foot: "medidos en los módulos",
      status: "unknown"
    },
    {
      label: "Actividad hoy",
      value: activity ? formatNumber(activity.activity.today) : "—",
      foot: activity ? `${formatNumber(activity.activity.period)} en ${activity.days} días` : "Sin datos de actividad",
      status: activity && activity.activity.today ? "ok" : "unknown"
    },
    {
      label: "Conexiones",
      value: activity ? formatNumber(connections.active_sessions || 0) : "—",
      foot: activity ? `${formatNumber(connections.distinct_users || 0)} usuarios · ${formatNumber(websocket.clients || 0)} WS` : "Sin datos de sesiones",
      status: activity && connections.active_sessions ? "ok" : "unknown"
    },
    {
      label: "Empresas",
      value: tenantsSummary ? `${formatNumber(tenantsSummary.active || 0)}/${formatNumber(tenantsSummary.total || 0)}` : "—",
      foot: tenantsSummary ? `${formatNumber(tenantsSummary.with_sessions || 0)} con sesión · ${formatNumber(tenantsSummary.with_gps || 0)} con GPS` : "Vista por empresa restringida",
      status: tenantsSummary ? (tenantsSummary.active ? "ok" : "degraded") : "unknown"
    },
    {
      label: "Servicios caídos",
      value: String(summary.down || 0),
      foot: `${summary.degraded || 0} requieren atención · ${summary.unknown || 0} sin dato`,
      status: summary.down ? "down" : "ok"
    },
    {
      label: "Alertas abiertas",
      value: String(openAlerts.length),
      foot: openAlerts.length ? openAlerts[0].title : "Sin incidentes abiertos",
      status: openAlerts.some((alert) => ["critical", "high"].includes(alert.severity)) ? "down" : openAlerts.length ? "degraded" : "ok"
    },
    {
      label: "API p95",
      value: performance.p95 != null ? `${performance.p95} ms` : "—",
      foot: performance.samples ? `${performance.samples} muestras · ${performance.errorRate || 0}% errores` : "Sin muestras",
      status: measureStatus(environment, "p95")
    },
    {
      label: `Rama ${environment ? environment.branch : "—"}`,
      value: RELATION_LABEL[relation] || relation,
      foot: branch ? `adelante ${branch.ahead ?? "—"} · atrás ${branch.behind ?? "—"}` : "Sin lectura git",
      status: relation === "in_sync" ? "ok" : relation === "unknown" ? "unknown" : "degraded"
    },
    {
      label: "Fábrica Qoder",
      value: `${data.jobs ? data.jobs.active : 0} activos`,
      foot: `${data.jobs ? data.jobs.counts.awaiting_approval : 0} por aprobar · ${data.jobs ? data.jobs.total : 0} históricos`,
      status: data.jobs && data.jobs.counts.awaiting_approval ? "degraded" : "ok"
    }
  ];

  document.getElementById("kpis").innerHTML = tiles.map((entry) => tile(entry)).join("");
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("es-CO").format(Number(value));
}

function moduleCard(module) {
  const status = pillClass(module.status);
  const data = module.data || null;
  const records = data && data.records != null ? `<span><b>${escapeHtml(formatNumber(data.records))}</b> registros</span>` : "<span>Sin medición de datos</span>";
  const activity = data && data.last_activity_at
    ? `<span>Última actividad <b>${escapeHtml(relative(data.last_activity_at))}</b></span>`
    : data && data.state === "declared" ? "<span>Módulo declarado sin modelo</span>" : "<span>Sin actividad registrada</span>";
  const expected = data && data.expected_minutes != null ? `<span>Esperado ≤ ${escapeHtml(data.expected_minutes)} min</span>` : "";
  const services = (module.services || [])
    .map((service) => `<span class="service-dot status-${pillClass(service.status)}" title="${escapeHtml(service.key)}: ${escapeHtml(service.status)}">${escapeHtml(service.label || service.key)}</span>`)
    .join("");
  const alerts = Array.isArray(module.alerts) && module.alerts.length
    ? `<p class="module-alert">${escapeHtml(module.alerts.length)} alerta(s) · ${escapeHtml(module.alerts[0].title)}</p>`
    : "";
  const technical = {
    declared: module.declared,
    data,
    services: module.services,
    alerts: module.alerts
  };
  return `
    <article class="module-card status-${status}">
      <div class="module-top">
        <span class="dot status-${status}" aria-hidden="true"></span>
        <h4>${escapeHtml(module.name)}</h4>
        <span class="pill ${status}">${escapeHtml(STATUS_LABEL[module.status] || module.status)}</span>
      </div>
      <p class="module-detail">${escapeHtml(module.detail || "")}</p>
      <p class="module-metrics">${records}${activity}${expected}</p>
      ${services ? `<div class="module-services">${services}</div>` : ""}
      ${alerts}
      <details class="tech"><summary>Detalle técnico</summary>${technicalBlock(technical)}</details>
    </article>`;
}

function renderModules(environment) {
  const container = document.getElementById("modules");
  const summaryEl = document.getElementById("moduleSummary");
  const meta = document.getElementById("moduleMeta");
  const filterButton = document.getElementById("btnModuleFilter");
  const payload = environment && environment.modules ? environment.modules : null;

  filterButton.setAttribute("aria-pressed", state.moduleFilter === "issues" ? "true" : "false");
  filterButton.textContent = state.moduleFilter === "issues" ? "Ver todos" : "Solo problemas";

  if (!payload) {
    meta.textContent = environment && !environment.enabled ? "Ambiente desactivado" : "Sin datos";
    summaryEl.innerHTML = "";
    container.innerHTML = `<p class="empty">${environment && !environment.enabled ? "Este ambiente está desactivado." : "La torre aún no tiene salud por módulo."}</p>`;
    return;
  }

  const modules = Array.isArray(payload.modules) ? payload.modules : [];
  const summary = payload.summary || {};
  const issues = modules.filter((module) => module.status === "down" || module.status === "degraded");
  const visible = state.moduleFilter === "issues" ? issues : modules;
  const notice = payload.source !== "api" ? payloadNotice(payload, environment) : "";

  meta.textContent = `${payload.source === "api" ? "Datos APEX Control" : `Solo servicios · ${payload.reason || "sin dato"}`} · ${formatTime(payload.generated_at)}`;
  const chips = [
    { label: "Módulos", value: summary.total != null ? summary.total : modules.length, status: "unknown" },
    { label: "Operativos", value: summary.ok || 0, status: "ok" },
    { label: "Requieren atención", value: summary.degraded || 0, status: "degraded" },
    { label: "Caídos", value: summary.down || 0, status: "down" },
    { label: "Sin dato", value: summary.unknown || 0, status: "unknown" }
  ];
  if (Number.isFinite(summary.records)) chips.push({ label: "Registros", value: formatNumber(summary.records), status: "unknown" });
  summaryEl.innerHTML = chips
    .map((chip) => `<span class="module-chip"><span class="dot status-${pillClass(chip.status)}" aria-hidden="true"></span>${escapeHtml(chip.label)} <strong>${escapeHtml(chip.value)}</strong></span>`)
    .join("");

  if (!visible.length) {
    container.innerHTML = notice + (state.moduleFilter === "issues"
      ? '<p class="empty">Ningún módulo con problemas.</p>'
      : '<p class="empty">Sin módulos configurados.</p>');
    return;
  }

  const groups = new Map();
  for (const module of visible) {
    const group = module.group || "Operacion";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(module);
  }
  container.innerHTML = notice + Array.from(groups.entries())
    .map(([group, list]) => `
      <section class="module-group">
        <h3>${escapeHtml(GROUP_LABEL[group] || group)}</h3>
        <div class="module-grid">${list.map(moduleCard).join("")}</div>
      </section>`)
    .join("");
}

function renderChecks(snapshot, environment) {
  const container = document.getElementById("checks");
  const checks = environmentChecks(snapshot, environment).filter((check) => check.source !== "modules");
  document.getElementById("probeMeta").textContent = snapshot
    ? `${checks.length} sondas · ${snapshot.durationMs} ms · ${formatTime(snapshot.at)}`
    : "Sin datos";
  if (!snapshot) {
    container.innerHTML = '<p class="empty">La torre aún no completa su primera lectura.</p>';
    return;
  }
  if (!checks.length) {
    container.innerHTML = `<p class="empty">Sin sondas para ${escapeHtml(environment ? environment.label : "el ambiente")}.</p>`;
    return;
  }
  container.innerHTML = checks
    .map((check) => {
      const detail = detailText(check.detail);
      return `
        <article class="check status-${pillClass(check.status)}" title="${escapeHtml(check.source || "tower")}">
          <div class="check-top">
            <span class="dot" aria-hidden="true"></span>
            <h3>${escapeHtml(check.label)}</h3>
            <span class="latency">${check.durationMs ? `${check.durationMs} ms` : ""}</span>
          </div>
          <p class="check-status">${escapeHtml(STATUS_LABEL[check.status] || check.status)}${check.critical ? " · crítico" : ""}${check.optional ? " · opcional" : ""}</p>
          <p class="check-detail">${escapeHtml(detail || "Sin detalle")}</p>
          ${check.functional ? `<p class="check-impact">${escapeHtml(check.functional)}</p>` : ""}
          ${check.action ? `<p class="check-action">Acción: ${escapeHtml(check.action)}</p>` : ""}
          ${check.technical ? `<details class="tech"><summary>Detalle técnico</summary>${technicalBlock(check.technical)}</details>` : ""}
        </article>`;
    })
    .join("");
}

function renderPerformance(environment) {
  const container = document.getElementById("performance");
  const meta = document.getElementById("perfMeta");
  renderLatencyVerdict(environment);
  const performance = performanceData(environment);
  const label = environment ? environment.short : "LOCAL";
  if (!performance || !performance.samples) {
    meta.textContent = "Sin muestras";
    container.innerHTML = `<p class="empty">Aún no hay muestras de rendimiento para ${escapeHtml(label)}.</p>`;
    return;
  }
  const errorRate = performance.errorRate == null ? 0 : performance.errorRate;
  const p95 = performance.p95;
  const p95Entry = gaugeOf(environment, "p95");
  const errorEntry = gaugeOf(environment, "errorRate");
  const latencyTone = BAND_TONE[p95Entry ? p95Entry.band : "unknown"] || "unknown";
  const failureTone = BAND_TONE[errorEntry ? errorEntry.band : "unknown"] || "unknown";
  const tone = worstTone(latencyTone, failureTone);
  const memoryTone = measureStatus(environment, "memoryRss");
  const slowTone = measureStatus(environment, "slowQueries");
  const limitText = p95Entry && p95Entry.limits
    ? `óptimo ≤ ${formatNumber(p95Entry.limits.optimal)} ms · tope ${formatNumber(p95Entry.limits.risk)} ms`
    : "umbral del presupuesto no publicado";
  meta.textContent = `${performance.samples} muestras · ${formatTime(performance.last && performance.last.at)}`;
  const stats = [
    { label: "p50", value: performance.p50, unit: "ms" },
    { label: "p95", value: p95, unit: "ms", tone },
    { label: "Promedio", value: performance.avg, unit: "ms" },
    { label: "Mínimo", value: performance.min, unit: "ms" },
    { label: "Máximo", value: performance.max, unit: "ms" },
    { label: "Errores", value: performance.failures, unit: "", tone: failureTone },
    { label: "Tasa error", value: errorRate, unit: "%", tone: failureTone },
    { label: "Muestras", value: performance.samples, unit: "" }
  ];
  const deployed = environment ? environment.deployed : null;
  if (deployed && deployed.memory) {
    stats.push(
      { label: "Memoria RSS", value: formatNumber(deployed.memory.rss), unit: " MB", tone: memoryTone },
      { label: "Heap usado", value: formatNumber(deployed.memory.heapUsed), unit: " MB" },
      { label: "Heap total", value: formatNumber(deployed.memory.heapTotal), unit: " MB" }
    );
  }
  if (deployed && deployed.usage) {
    const byStatus = deployed.usage.byStatus || {};
    stats.push(
      { label: "Peticiones", value: formatNumber(deployed.usage.requestsTotal), unit: "" },
      { label: "2xx", value: formatNumber(byStatus["2xx"] || 0), unit: "" },
      { label: "4xx", value: formatNumber(byStatus["4xx"] || 0), unit: "", tone: byStatus["4xx"] ? "degraded" : "ok" },
      { label: "5xx", value: formatNumber(byStatus["5xx"] || 0), unit: "", tone: byStatus["5xx"] ? "down" : "ok" },
      { label: "Consultas lentas", value: formatNumber(deployed.usage.slowQueries), unit: "", tone: slowTone }
    );
  }
  if (deployed && Number.isFinite(deployed.uptimeSeconds)) {
    stats.push({ label: "Uptime del proceso", value: uptimeFoot(deployed).replace(" encendido", ""), unit: "" });
  }
  const runtimeMissing = !deployed || (!deployed.memory && !deployed.usage);
  container.innerHTML = `
    <div class="perf-head">
      <div>
        <p class="perf-value">${p95 != null ? escapeHtml(p95) : "—"}<small>ms p95 · ${escapeHtml(label)}</small></p>
        <p class="perf-sub">${escapeHtml(limitText)} · ${performance.avg != null ? `promedio ${escapeHtml(performance.avg)} ms` : "sin promedio"}</p>
      </div>
      <div class="perf-badges">
        <span class="band-pill ${latencyTone}" title="Banda del p95 contra el presupuesto de sonda de este ambiente">latencia · ${escapeHtml(p95Entry ? BAND_LABEL[p95Entry.band] : "Sin dato")}</span>
        <span class="band-pill ${failureTone}" title="Porcentaje de sondas /health de la torre que fallaron, no de peticiones de usuarios">sondas · ${escapeHtml(errorEntry ? BAND_LABEL[errorEntry.band] : "Sin dato")}</span>
      </div>
    </div>
    ${latencyChart(performance.series, p95Entry)}
    <p class="perf-note-inline">${escapeHtml(p95Entry && p95Entry.source ? p95Entry.source : "")} · «sondas» mide los sondeos que la torre hace a /health y fallaron; «4xx/5xx» de abajo mide las peticiones reales de los usuarios. No son la misma señal.</p>
    <div class="perf-grid">
      ${stats.map((stat) => `
        <div class="perf-stat ${stat.tone || ""}">
          <span>${escapeHtml(stat.label)}</span>
          <strong>${stat.value == null ? "—" : escapeHtml(stat.value)}${escapeHtml(stat.unit)}</strong>
        </div>`).join("")}
    </div>
    ${runtimeMissing ? `<p class="muted small perf-note">El build desplegado ${deployed && deployed.commit ? `(${String(deployed.commit).slice(0, 7)}) ` : ""}aún no expone memoria ni uso del API. Esta vista aparecerá completa cuando el ambiente corra un build con esas métricas.</p>` : ""}`;
}

// Franja de veredicto de la vista Latencia: una linea que dice si hay que atender
// o solo vigilar el evento, con la regla que lo produjo debajo.
function renderLatencyVerdict(environment) {
  const band = document.getElementById("latencyVerdict");
  if (!band) return;
  const verdict = environment ? environment.latency : null;
  if (!verdict || verdict.state === "unknown") {
    band.innerHTML = '<p class="verdict-empty">Sin muestras suficientes para firmar un veredicto de latencia.</p>';
    return;
  }
  const tone = verdict.state === "optimal" ? "ok" : verdict.state === "sustained" ? "down" : "degraded";
  band.innerHTML = `
    <div class="verdict tone-${tone}">
      <span class="dot status-${tone}" aria-hidden="true"></span>
      <p class="verdict-text">${escapeHtml(verdict.label_text)} · tope ${formatNumber(verdict.cap)} ms</p>
      <p class="verdict-rule">${escapeHtml(verdict.rule || "")}</p>
    </div>`;
}

// Vista API: lo que el propio servidor dice de sus componentes. Es la unica
// lectura "de adentro" que existe hoy (histogramas por ruta requieren el token de
// /metrics), asi que la torre muestra latencia y estado declarados por la API y
// no inventa percentiles que no midio.
// "No se midio" no es cero: Number(null) vale 0, asi que un dato ausente puede
// colarse como medicion y el panel contaria registros o latencias que nunca se
// midieron.
function measuredNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function renderComponents(environment) {
  const container = document.getElementById("components");
  const meta = document.getElementById("componentsMeta");
  if (!container || !meta) return;
  const components = environment && Array.isArray(environment.components) ? environment.components : [];
  if (!components.length) {
    meta.textContent = "Sin componentes leidos";
    container.innerHTML = `<p class="empty">${escapeHtml(
      environment && environment.modules && environment.modules.reason
        ? `La API de ${environment.short} no devolvió la lista de componentes (motivo: ${environment.modules.reason}). Despliegue un build con apex-control para leerlos.`
        : `La API de ${environment ? environment.short : "este ambiente"} no expone /api/v1/apex-control/status: sin ese endpoint no hay latencias por componente que mostrar.`
    )}</p>`;
    return;
  }
  const attention = components.filter((component) => component.band === "critical" || component.band === "risk");
  const withLatency = components.filter((component) => measuredNumber(component.latencyMs) !== null);
  meta.textContent = `${components.length} componentes · ${withLatency.length} con latencia medida · ${attention.length} requieren atención`;
  container.innerHTML = `
    <div class="component-list">
      ${components.map((component) => {
        const tone = component.tone || "unknown";
        const latencyMs = measuredNumber(component.latencyMs);
        const score = measuredNumber(component.score);
        const latency = latencyMs !== null ? `${formatNumber(latencyMs)} ms` : "sin medición";
        const scoreText = score !== null ? `${score}/100` : null;
        return `
          <div class="component-row band-${component.band || "unknown"}">
            <span class="component-dot dot status-${tone}" aria-hidden="true"></span>
            <div class="component-main">
              <p class="component-name">${escapeHtml(component.name || component.key)}</p>
              <p class="component-sub">${escapeHtml(component.kind || "componente")}${component.criticality ? ` · ${escapeHtml(component.criticality)}` : ""}${component.enabled === false ? " · deshabilitado" : ""}</p>
            </div>
            <p class="component-latency">${escapeHtml(latency)}</p>
            ${scoreText ? `<p class="component-score">${escapeHtml(scoreText)}</p>` : '<p class="component-score">—</p>'}
            <span class="band-pill ${tone}">${escapeHtml(component.label_text || BAND_LABEL[component.band] || "Sin dato")}</span>
            ${component.detail ? `<p class="component-detail">${escapeHtml(String(component.detail).slice(0, 160))}</p>` : ""}
          </div>`;
      }).join("")}
    </div>`;
}

// Vista Base de datos: rapidez medida desde adentro del API, volumen real de
// registros y cobertura de empresas. El tope de la base lo pone el propio API:
// 100 ms es el objetivo que pidio el propietario y 300 ms es lo que el API ya
// cataloga como consulta lenta.
function renderDatabase(environment) {
  const verdictBand = document.getElementById("databaseVerdict");
  const kpis = document.getElementById("databaseKpis");
  const volume = document.getElementById("databaseVolume");
  const meta = document.getElementById("databaseMeta");
  if (!verdictBand || !kpis || !volume || !meta) return;
  const db = gaugeOf(environment, "dbLatency");
  const slow = gaugeOf(environment, "slowQueries");
  const dataVolume = gaugeOf(environment, "dataVolume");
  const coverage = gaugeOf(environment, "dataCoverage");
  const freshness = gaugeOf(environment, "freshness");
  const deployed = environment ? environment.deployed : null;
  const tone = worstTone(
    db ? BAND_TONE[db.band] : "unknown",
    slow ? BAND_TONE[slow.band] : "unknown"
  );
  const modules = environment && environment.modules && Array.isArray(environment.modules.modules)
    ? environment.modules.modules
    : [];
  const withRecords = modules.filter((module) => measuredNumber(module.data ? module.data.records : null) !== null);

  if (!modules.length && !db) {
    meta.textContent = "Sin lectura de la base";
    verdictBand.innerHTML = "";
    kpis.innerHTML = "";
    volume.innerHTML = `<p class="empty">Este ambiente no entrega ni el componente de base de datos ni el conteo de registros: la API aún no publica /api/v1/apex-control/status o no hay token de lectura configurado.</p>`;
    return;
  }
  const cap = db && db.limits ? `óptimo ≤ ${formatNumber(db.limits.optimal)} ms · en riesgo ≤ ${formatNumber(db.limits.risk)} ms` : "sin umbral publicado";
  const dbText = db && db.value != null
    ? `La base responde en ${formatNumber(db.value)} ms (medido por el propio API). ${BAND_LABEL[db.band]} · ${cap}.`
    : `No hay lectura del componente de base de datos en este ambiente. ${cap}.`;
  const volumeText = dataVolume && dataVolume.value != null
    ? `Hay ${formatNumber(dataVolume.value)} registros medidos en ${withRecords.length} módulos con conteo.`
    : "Ningún módulo publicó conteo de registros.";
  verdictBand.innerHTML = `
    <div class="verdict tone-${tone}">
      <span class="dot status-${tone}" aria-hidden="true"></span>
      <p class="verdict-text">${escapeHtml(dbText)}</p>
      <p class="verdict-rule">${escapeHtml(volumeText)}</p>
    </div>`;
  meta.textContent = `${withRecords.length} módulos con conteo · ${formatNumber(modules.length)} módulos leídos`;
  kpis.innerHTML = [
    tile({
      label: "Latencia de la base",
      value: db && db.value != null ? formatNumber(db.value) : "—",
      unit: db && db.value != null ? "ms" : "",
      foot: cap,
      status: db ? BAND_TONE[db.band] : "unknown"
    }),
    tile({
      label: "Consultas lentas",
      value: slow && slow.value != null ? formatNumber(slow.value) : "—",
      foot: slow && slow.limits ? `óptimo ≤ ${slow.limits.optimal} · en riesgo ≤ ${slow.limits.risk} · acumuladas desde el arranque` : "sin umbral publicado",
      status: slow ? BAND_TONE[slow.band] : "unknown"
    }),
    tile({
      label: "Registros medidos",
      value: dataVolume && dataVolume.value != null ? formatNumber(dataVolume.value) : "—",
      foot: "suma de records por módulo publicados por la API",
      status: "unknown"
    }),
    tile({
      label: "Empresas con actividad",
      value: coverage && coverage.value != null ? `${formatNumber(coverage.value)} %` : "—",
      foot: coverage && coverage.limits ? `óptimo ≥ ${formatNumber(coverage.limits.optimal)} %` : "sin lectura por empresa",
      status: coverage ? BAND_TONE[coverage.band] : "unknown"
    }),
    tile({
      label: "Frescura peor",
      value: freshness && freshness.value != null ? `${formatNumber(freshness.value)}x` : "—",
      foot: freshness && freshness.limits ? `óptimo ≤ ${freshness.limits.optimal}x · en riesgo ≤ ${freshness.limits.risk}x` : "sin módulos medidos",
      status: freshness ? BAND_TONE[freshness.band] : "unknown"
    }),
    tile({
      label: "Memoria del API",
      value: deployed && deployed.memory ? formatNumber(deployed.memory.rss) : "—",
      unit: deployed && deployed.memory ? "MB" : "",
      foot: memoryFoot(deployed) || "el build desplegado no expone memoria",
      status: measureStatus(environment, "memoryRss")
    })
  ].join("");
  const rows = modules
    .filter((module) => measuredNumber(module.data ? module.data.records : null) !== null)
    .sort((left, right) => Number(right.data.records || 0) - Number(left.data.records || 0))
    .map((module) => {
      const data = module.data || {};
      const records = measuredNumber(data.records);
      const age = measuredNumber(data.age_minutes);
      const expected = measuredNumber(data.expected_minutes);
      const ratio = age !== null && expected !== null && expected > 0
        ? `${Math.round((age / expected) * 100) / 100}x`
        : "—";
      return [
        module.name || module.key,
        records !== null ? formatNumber(records) : "—",
        age !== null ? `${age} min` : "—",
        expected !== null ? `${expected} min` : "—",
        ratio,
        BAND_LABEL[module.band] || "Sin dato"
      ];
    });
  const motivo = environment && environment.modules && environment.modules.reason
    ? ` (motivo: ${environment.modules.reason}).`
    : ".";
  volume.innerHTML = rows.length
    ? dataTable(["Módulo", "Registros", "Edad medida", "Esperado", "Frescura", "Estado"], rows, "")
    : `<p class="empty">${escapeHtml(`Ningún módulo devolvió conteo de registros en este ambiente${motivo}`)}</p>`;
}

function renderCloud(environment) {
  const container = document.getElementById("cloud");
  const meta = document.getElementById("cloudMeta");
  const cloud = environment && environment.cloud ? environment.cloud : null;
  if (!cloud) {
    meta.textContent = environment ? `${environment.label} · sin integración cloud` : "Sin datos";
    container.innerHTML = '<p class="empty">Railway, Supabase y Vercel se consultan en los ambientes QA y PROD. Cambia de ambiente para ver su estado en vivo.</p>';
    return;
  }
  const entries = CLOUD_PROVIDERS.map((provider) => ({ provider, data: cloud[provider.key] || null }));
  const configured = entries.filter((entry) => entry.data && entry.data.configured).length;
  const checkedAt = entries.map((entry) => entry.data && entry.data.checkedAt).filter(Boolean)[0] || null;
  meta.textContent = `${configured}/${entries.length} integraciones con credenciales${checkedAt ? ` · ${formatTime(checkedAt)}` : ""}`;
  const compact = false;
  container.innerHTML = entries.map((entry) => renderCloudCard(entry.provider, entry.data, compact)).join("");
}

function renderGit(git, data, environment) {
  const flow = document.getElementById("flow");
  const branches = document.getElementById("branches");
  const warnings = document.getElementById("gitWarnings");
  const meta = document.getElementById("gitMeta");

  if (!git) {
    meta.textContent = "Sin lectura";
    flow.innerHTML = "";
    branches.innerHTML = '<p class="empty">Aún no hay lectura del repositorio.</p>';
    warnings.innerHTML = "";
    return;
  }

  const selectedBranch = environment ? environment.branch : null;
  meta.textContent = `${git.remote}${git.remoteError ? " · remoto no disponible" : ""} · ${formatTime(git.at)}${selectedBranch ? ` · rama ${selectedBranch}` : ""}`;

  const ordered = [];
  for (const pair of git.flow || []) {
    if (!ordered.includes(pair.from)) ordered.push(pair.from);
    if (!ordered.includes(pair.to)) ordered.push(pair.to);
  }
  const flowParts = [];
  for (const pair of git.flow || []) {
    if (flowParts.length === 0) flowParts.push(`<span class="flow-node ${pair.ok ? "ok" : "warn"}">${escapeHtml(pair.from)}</span>`);
    flowParts.push(`<span class="flow-arrow ${pair.ok ? "" : "bad"}">${pair.ok ? "→ ancestro →" : "→ divergen →"}</span>`);
    flowParts.push(`<span class="flow-node ${pair.ok ? "ok" : "warn"}">${escapeHtml(pair.to)}</span>`);
  }
  flow.innerHTML = flowParts.length ? flowParts.join("") : '<span class="muted small">Sin pares de ramas configurados.</span>';

  branches.innerHTML = (git.branches || [])
    .map((branch) => {
      const relationClass = branch.relation === "in_sync" ? "ok" : branch.relation === "diverged" ? "warn" : "unknown";
      const ahead = branch.ahead != null ? branch.ahead : "—";
      const behind = branch.behind != null ? branch.behind : "—";
      const selected = selectedBranch && branch.name === selectedBranch;
      return `
        <article class="branch ${branch.current ? "current" : ""} ${selected ? "selected" : ""}">
          <p class="branch-name">
            <span>${escapeHtml(branch.name)}</span>
            <span class="pill ${relationClass}">${escapeHtml(RELATION_LABEL[branch.relation] || branch.relation)}</span>
          </p>
          <p class="branch-shas">local ${escapeHtml(shortSha(branch.localSha))}<br />remoto ${escapeHtml(shortSha(branch.remoteSha || branch.trackingSha))}</p>
          <p class="branch-meta">adelante ${escapeHtml(ahead)} · atrás ${escapeHtml(behind)}${branch.remoteMoved ? " · remoto movido" : ""}${selected ? " · en vigilancia" : ""}</p>
        </article>`;
    })
    .join("");

  const worktree = git.worktree || {};
  const allWarnings = [...(git.warnings || [])];
  if (worktree.changes && worktree.changes.total === 0) allWarnings.push("Árbol de trabajo limpio.");
  warnings.innerHTML = allWarnings.map((warning) => `<p class="warning">${escapeHtml(warning)}</p>`).join("");
}

function renderAlerts(alerts) {
  const container = document.getElementById("alerts");
  const open = alerts.filter((alert) => !alert.resolvedAt).length;
  document.getElementById("btnAckAll").style.display = open ? "inline" : "none";
  if (!alerts.length) {
    container.innerHTML = '<p class="empty">Sin alertas registradas.</p>';
    return;
  }
  container.innerHTML = alerts
    .slice(0, 20)
    .map((alert) => `
      <article class="alert ${escapeHtml(alert.severity)} ${alert.resolvedAt ? "resolved" : ""}">
        <div class="alert-head">
          <p class="alert-title">${escapeHtml(alert.title || alert.component)}</p>
          <span class="pill ${alert.resolvedAt ? "ok" : pillClass(alert.status)}">${alert.resolvedAt ? "resuelta" : escapeHtml(STATUS_LABEL[alert.status] || alert.status)}</span>
        </div>
        <p class="alert-meta">${escapeHtml(formatTime(alert.at))}${alert.environment ? ` · ${escapeHtml(alert.environment)}` : ""}${alert.message ? ` · ${escapeHtml(alert.message)}` : ""}${alert.acknowledged ? " · reconocida" : ""}</p>
        ${alert.functional ? `<p class="alert-impact">${escapeHtml(alert.functional)}</p>` : ""}
        ${alert.action ? `<p class="alert-action">Acción: ${escapeHtml(alert.action)}</p>` : ""}
        ${alert.technical ? `<details class="tech"><summary>Detalle técnico</summary>${technicalBlock(alert.technical)}</details>` : ""}
        ${!alert.resolvedAt && !alert.acknowledged ? `<div class="alert-actions"><button class="btn mini ghost" type="button" data-ack="${escapeHtml(alert.id)}">Reconocer</button></div>` : ""}
      </article>`)
    .join("");
}

function renderJobs(jobs, stats) {
  const container = document.getElementById("jobs");
  const bridge = state.data && state.data.bridge ? state.data.bridge : {};
  const bridgePill = document.getElementById("bridgePill");
  bridgePill.className = `pill ${bridge.online ? "ok" : "unknown"}`;
  bridgePill.textContent = bridge.online ? "Puente en línea" : "Puente fuera de línea";

  if (!jobs.length) {
    container.innerHTML = '<p class="empty">Sin trabajos. Envía una instrucción o escríbela por Telegram.</p>';
    return;
  }
  container.innerHTML = jobs
    .map((job) => {
      const actions = [];
      if (job.status === "awaiting_approval") {
        actions.push(`<button class="btn mini primary" type="button" data-job-action="approve" data-job="${escapeHtml(job.id)}">Aprobar</button>`);
        actions.push(`<button class="btn mini danger" type="button" data-job-action="reject" data-job="${escapeHtml(job.id)}">Rechazar</button>`);
      } else if (["queued", "claimed", "running"].includes(job.status)) {
        actions.push(`<button class="btn mini danger" type="button" data-job-action="cancel" data-job="${escapeHtml(job.id)}">Cancelar</button>`);
      }
      const result = job.result ? `<p class="job-result">${escapeHtml(job.result.summary || job.result.note || job.result.status)}${job.result.evidence && job.result.evidence.length ? ` · evidencia: ${escapeHtml(job.result.evidence.join(", "))}` : ""}</p>` : "";
      return `
        <article class="job">
          <div class="job-head">
            <span class="job-level">${escapeHtml(job.level)}</span>
            <span class="job-id">${escapeHtml(job.id)}</span>
            <span class="status-chip ${escapeHtml(job.status)}">${escapeHtml(JOB_STATUS_LABEL[job.status] || job.status)}</span>
          </div>
          <p class="job-text">${escapeHtml(job.instruction)}</p>
          <p class="job-meta">${escapeHtml(formatTime(job.at))} · ${escapeHtml(job.requestedBy.channel)}${job.target.branch ? ` · ${escapeHtml(job.target.branch)}` : ""}${job.approval.approvedBy ? ` · aprobado por ${escapeHtml(job.approval.approvedBy)}` : ""}</p>
          ${result}
          ${actions.length ? `<div class="job-actions">${actions.join("")}</div>` : ""}
        </article>`;
    })
    .join("");
}

function renderTelegram(telegram, payload) {
  const mode = telegram.mode || "off";
  const pill = document.getElementById("telegramPill");
  pill.className = `pill ${mode === "polling" ? "ok" : mode === "dry-run" ? "degraded" : "unknown"}`;
  pill.textContent = MODE_LABEL[mode] || mode;

  const pairing = telegram.pairing || {};
  document.getElementById("telegramInfo").innerHTML = [
    `Modo: ${escapeHtml(MODE_LABEL[mode] || mode)}`,
    `Token: ${telegram.configured ? "configurado" : "no configurado"}`,
    `Chats autorizados: ${escapeHtml(telegram.allowedCount)}`,
    pairing.active ? `Código activo hasta ${escapeHtml(formatTime(pairing.expiresAt))}` : "Sin código activo"
  ].join("<br />");

  const code = document.getElementById("pairingCode");
  code.textContent = pairing.active ? pairing.code : "";

  const outbox = payload && Array.isArray(payload.outbox) ? payload.outbox : [];
  document.getElementById("outbox").innerHTML = outbox.length
    ? outbox
        .map((message) => `<div class="out">${escapeHtml(formatTime(message.at))} · ${escapeHtml(message.chatId)}${message.dryRun ? " · dry-run" : ""}\n${escapeHtml(message.text)}</div>`)
        .join("")
    : '<p class="empty">Sin mensajes salientes todavía.</p>';
}

function renderEvents(events) {
  const container = document.getElementById("events");
  if (!events.length) {
    container.innerHTML = '<li class="muted small">Sin eventos registrados.</li>';
    return;
  }
  container.innerHTML = events
    .slice(0, 40)
    .map((event) => `
      <li>
        <span class="event-time">${escapeHtml(formatTime(event.at))}</span>
        <span class="event-kind">${escapeHtml(event.kind || "evento")}</span>
        <span class="event-msg">${escapeHtml(event.message || event.component || "")}</span>
      </li>`)
    .join("");
}

async function load() {
  if (state.loading) {
    state.pending = true;
    return;
  }
  state.loading = true;
  try {
    const [status, telegram] = await Promise.all([
      api("/api/status"),
      api("/api/telegram").catch(() => null)
    ]);
    state.data = status;
    state.telegram = telegram;
    const environments = status.snapshot && status.snapshot.environments ? status.snapshot.environments : {};
    if (!environments[state.environment]) {
      state.environment = environments.local ? "local" : Object.keys(environments)[0] || "local";
      localStorage.setItem("towerEnvironment", state.environment);
    }
    state.failures = 0;
    render();
    refreshCompany().catch(() => {});
  } catch (error) {
    state.failures += 1;
    if (state.failures === 1 || state.failures % 10 === 0) toast(`No se pudo consultar la torre: ${error.message}`, "error");
  } finally {
    state.loading = false;
    if (state.pending) {
      state.pending = false;
      setTimeout(load, 200);
    }
  }
}

function scheduleLoad(delay = 350) {
  clearTimeout(scheduleLoad.timer);
  scheduleLoad.timer = setTimeout(load, delay);
}

function connectEvents() {
  if (state.source) state.source.close();
  const suffix = state.token ? `?token=${encodeURIComponent(state.token)}` : "";
  const source = new EventSource(`/api/events${suffix}`);
  state.source = source;
  source.onopen = () => {
    document.getElementById("livePill").className = "pill ok";
    document.getElementById("livePill").textContent = "SSE en vivo";
  };
  source.onerror = () => {
    document.getElementById("livePill").className = "pill degraded";
    document.getElementById("livePill").textContent = "SSE reconectando";
  };
  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data);
      if (event.type === "ready") return;
      scheduleLoad(500);
    } catch {
      scheduleLoad(800);
    }
  };
}

async function action(button, task) {
  if (button) button.disabled = true;
  try {
    await task();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    const view = viewButton.dataset.view;
    if (view && view !== state.view) {
      state.view = view;
      localStorage.setItem("towerView", view);
      render();
    }
    return;
  }
  const environmentButton = event.target.closest("[data-env]");
  if (environmentButton) {
    const id = environmentButton.dataset.env;
    if (id && id !== state.environment) {
      state.environment = id;
      localStorage.setItem("towerEnvironment", id);
      // La empresa seleccionada pertenece al ambiente anterior: cambiar de rama
      // deselecciona en vez de consultarla contra otro ambiente.
      state.company = null;
      render();
    }
    return;
  }
  const bandButton = event.target.closest("[data-band-filter]");
  if (bandButton) {
    const band = bandButton.dataset.bandFilter;
    state.healthBand = band === "all" || state.healthBand === band ? null : band;
    render();
    return;
  }
  const healthDetail = event.target.closest("[data-health-detail]");
  if (healthDetail) {
    openMethodDialog();
    return;
  }
  const moduleButton = event.target.closest("[data-module]");
  if (moduleButton) {
    openModuleDetail(moduleButton.dataset.module, moduleButton.dataset.scope || "environment");
    return;
  }
  const tenantButton = event.target.closest("[data-tenant-id]");
  if (tenantButton) {
    loadCompany(tenantButton.dataset.tenantId, tenantButton.dataset.tenantName);
    return;
  }
  const ack = event.target.closest("[data-ack]");
  if (ack) {
    action(ack, async () => {
      await api(`/api/alerts/${encodeURIComponent(ack.dataset.ack)}/ack`, { method: "POST", body: "{}" });
      toast("Alerta reconocida.", "ok");
      scheduleLoad(100);
    });
    return;
  }
  const jobButton = event.target.closest("[data-job-action]");
  if (jobButton) {
    const id = jobButton.dataset.job;
    const verb = jobButton.dataset.jobAction;
    action(jobButton, async () => {
      await api(`/api/jobs/${encodeURIComponent(id)}/${verb}`, { method: "POST", body: "{}" });
      toast(`Trabajo ${id}: ${verb === "approve" ? "aprobado" : verb === "reject" ? "rechazado" : "cancelado"}.`, "ok");
      scheduleLoad(100);
    });
  }
});

document.getElementById("btnModuleFilter").addEventListener("click", () => {
  state.moduleFilter = state.moduleFilter === "issues" ? "all" : "issues";
  localStorage.setItem("towerModuleFilter", state.moduleFilter);
  render();
});

document.getElementById("btnCompanyClose").addEventListener("click", () => {
  state.company = null;
  renderCompany();
  renderTenants(activeEnvironment());
});

document.getElementById("companySelect").addEventListener("change", (event) => {
  const select = event.currentTarget;
  const tenantId = select.value;
  if (!tenantId) {
    state.company = null;
    renderCompany();
    renderTenants(activeEnvironment());
    return;
  }
  const option = select.options[select.selectedIndex];
  loadCompany(tenantId, option && option.dataset.name ? option.dataset.name : tenantId);
});

document.getElementById("btnCompanyRefresh").addEventListener("click", (event) => {
  action(event.currentTarget, async () => {
    await load();
    await refreshCompany();
    toast("Lectura de empresas actualizada.", "ok");
  });
});

document.getElementById("btnDialogClose").addEventListener("click", closeDialog);

document.getElementById("detailDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeDialog();
});

document.getElementById("btnAckAll").addEventListener("click", (event) => {
  action(event.currentTarget, async () => {
    const result = await api("/api/alerts/ack-all", { method: "POST", body: "{}" });
    toast(`${result.acknowledged} alerta(s) reconocidas.`, "ok");
    scheduleLoad(100);
  });
});

document.getElementById("btnRefresh").addEventListener("click", (event) => {
  action(event.currentTarget, async () => {
    await api("/api/probe", { method: "POST", body: "{}" });
    toast("Lecturas actualizadas.", "ok");
    scheduleLoad(100);
  });
});

document.getElementById("btnFetch").addEventListener("click", (event) => {
  const confirmed = window.confirm("Se ejecutará git fetch sobre el remoto configurado. No modifica ramas locales ni hace push. ¿Continuar?");
  if (!confirmed) return;
  action(event.currentTarget, async () => {
    const result = await api("/api/actions/fetch", { method: "POST", body: JSON.stringify({ confirm: true }) });
    toast(result.ok ? "Ramas sincronizadas con el remoto." : "git fetch falló; revisa la salida.", result.ok ? "ok" : "error");
    scheduleLoad(100);
  });
});

document.getElementById("jobForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const instruction = document.getElementById("jobInstruction").value.trim();
  const level = document.getElementById("jobLevel").value;
  if (instruction.length < 8) {
    toast("La instrucción debe tener al menos 8 caracteres.", "error");
    return;
  }
  const button = event.currentTarget.querySelector("button[type=submit]");
  action(button, async () => {
    const result = await api("/api/jobs", { method: "POST", body: JSON.stringify({ instruction, level }) });
    document.getElementById("jobInstruction").value = "";
    toast(`Trabajo ${result.job.id} creado${result.job.status === "awaiting_approval" ? " y pendiente de aprobación." : "."}`, "ok");
    scheduleLoad(100);
  });
});

document.getElementById("jobInstruction").addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    document.getElementById("jobForm").requestSubmit();
  }
});

document.getElementById("btnPairing").addEventListener("click", (event) => {
  action(event.currentTarget, async () => {
    const result = await api("/api/telegram/pairing-code", { method: "POST", body: "{}" });
    document.getElementById("pairingCode").textContent = result.pairing.code;
    toast(`Código ${result.pairing.code}. Envía /pair ${result.pairing.code} al bot.`, "ok");
    scheduleLoad(100);
  });
});

async function simulate() {
  const input = document.getElementById("simText");
  const text = input.value.trim();
  if (!text) {
    toast("Escribe un mensaje para simular.", "error");
    return;
  }
  const button = document.getElementById("btnSimulate");
  await action(button, async () => {
    await api("/api/telegram/simulate", {
      method: "POST",
      body: JSON.stringify({ text, chatId: "panel-dry-run" })
    });
    input.value = "";
    toast("Mensaje simulado.", "ok");
    scheduleLoad(100);
  });
}

document.getElementById("btnSimulate").addEventListener("click", simulate);
document.getElementById("simText").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    simulate();
  }
});

load();
connectEvents();
setInterval(load, 20000);
