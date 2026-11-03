"use strict";

const STATUS_LABEL = { ok: "Operativo", degraded: "Degradado", down: "Caído", unknown: "Sin dato" };
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

const state = {
  data: null,
  telegram: null,
  token: sessionStorage.getItem("towerToken") || "",
  environment: localStorage.getItem("towerEnvironment") || "local",
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
    .map((point, index) => (points[index].ok === false ? `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.6" fill="#ff6b6b" />` : ""))
    .join("");
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Serie de latencia de la API">
      <polygon class="spark-area" points="${area}" />
      <polyline points="${line}" />
      ${failures}
    </svg>`;
}

const CLOUD_PROVIDERS = [
  { key: "railway", label: "Railway", hint: "RAILWAY_TOKEN + ENV_<AMBIENTE>_RAILWAY_PROJECT_ID" },
  { key: "supabase", label: "Supabase", hint: "SUPABASE_ACCESS_TOKEN + ENV_<AMBIENTE>_SUPABASE_REF" },
  { key: "vercel", label: "Vercel", hint: "VERCEL_TOKEN + ENV_<AMBIENTE>_VERCEL_PROJECT_ID" }
];

function renderCloudCard(provider, data) {
  const status = data && data.configured === false ? "unknown" : pillClass(data && data.status ? data.status : "unknown");
  const statusLabel = data && data.configured === false ? "Sin credenciales" : (STATUS_LABEL[status] || status);
  const services = data && Array.isArray(data.services) ? data.services : [];
  const deployments = data && Array.isArray(data.deployments) ? data.deployments : [];
  const projectName = data && data.project ? (data.project.name || data.project.id) : null;
  const region = data && data.project && data.project.region ? ` · ${data.project.region}` : "";
  const deploymentItems = deployments
    .slice(0, 3)
    .map((deployment) => {
      const state = deployment.status || deployment.state || "sin estado";
      const environment = deployment.environment ? `${deployment.environment}: ` : "";
      const target = deployment.target ? ` (${deployment.target})` : "";
      return `<li>${escapeHtml(environment)}${escapeHtml(state)}${escapeHtml(target)}</li>`;
    })
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
      ${projectName ? `<p class="cloud-detail">Servicios: ${services.length}${escapeHtml(region)}</p>` : ""}
      ${services.length ? `<ul class="cloud-list">${services.slice(0, 4).map((service) => `<li>${escapeHtml(service.name || service.id)}</li>`).join("")}</ul>` : ""}
      ${deploymentItems ? `<ul class="cloud-list">${deploymentItems}</ul>` : ""}
      ${data && data.error ? `<p class="cloud-detail">${escapeHtml(data.error)}</p>` : ""}
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
    throw new Error(message);
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

function render() {
  const data = state.data;
  if (!data) return;
  const snapshot = data.snapshot;
  const git = data.git;
  const telegram = data.telegram || {};
  const environment = activeEnvironment();
  const environmentId = environment ? environment.id : "local";
  const alerts = environmentAlerts(data.alerts || [], environmentId);
  const openAlerts = alerts.filter((alert) => !alert.resolvedAt);

  renderEnvironmentTabs(snapshot, environment);

  const overallPill = document.getElementById("overallPill");
  const overall = environment ? environment.overall : snapshot ? snapshot.overall : "unknown";
  overallPill.className = `pill ${pillClass(overall)}`;
  overallPill.textContent = environment
    ? `${environment.short} ${STATUS_LABEL[overall] || overall}`
    : snapshot ? `Sistema ${STATUS_LABEL[overall] || overall}` : "Sin lecturas";
  document.getElementById("lastUpdate").textContent = snapshot ? `Lectura ${relative(snapshot.at)} · ${formatTime(snapshot.at)}` : "Sin lecturas";

  renderKpis(environment, data, git, openAlerts);
  renderChecks(snapshot, environment);
  renderPerformance(environment);
  renderCloud(environment);
  renderGit(git, data, environment);
  renderAlerts(alerts);
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
    const status = environment.enabled ? environment.overall : "unknown";
    const summary = environment.summary || { ok: 0, total: 0 };
    return `
      <button class="env-tab ${selected && selected.id === environment.id ? "active" : ""}" type="button" data-env="${escapeHtml(environment.id)}" aria-pressed="${selected && selected.id === environment.id ? "true" : "false"}">
        <span class="dot status-${pillClass(status)}" aria-hidden="true"></span>
        <span class="env-tab-body">
          <span class="env-tab-label">${escapeHtml(environment.label)}</span>
          <span class="env-tab-meta">${escapeHtml(environment.branch || "")} · ${summary.ok || 0}/${summary.total || 0} sondas</span>
        </span>
        <span class="env-tab-status status-text-${pillClass(status)}">${escapeHtml(environment.enabled ? (STATUS_LABEL[status] || status) : "Desactivado")}</span>
      </button>`;
  }).join("");
}

function renderKpis(environment, data, git, openAlerts) {
  const summary = environment && environment.summary ? environment.summary : { ok: 0, total: 0, down: 0, degraded: 0, unknown: 0 };
  const performance = environment && environment.performance ? environment.performance : {};
  const branch = git && git.branches ? git.branches.find((item) => item.name === (environment && environment.branch)) : null;
  const relation = branch ? branch.relation : "unknown";
  const tiles = [
    {
      label: `Salud ${environment ? environment.short : "general"}`,
      value: environment ? (STATUS_LABEL[environment.overall] || environment.overall) : "—",
      foot: environment ? `${summary.ok || 0}/${summary.total || 0} sondas operativas` : "Esperando primera sonda",
      status: environment ? environment.overall : "unknown"
    },
    {
      label: "Servicios caídos",
      value: String(summary.down || 0),
      foot: `${summary.degraded || 0} degradados · ${summary.unknown || 0} sin dato`,
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
      status: performance.p95 == null ? "unknown" : performance.p95 > 1500 ? "down" : performance.p95 > 600 ? "degraded" : "ok"
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

  document.getElementById("kpis").innerHTML = tiles
    .map((tile) => `
      <article class="kpi">
        <p class="kpi-label">${escapeHtml(tile.label)}</p>
        <p class="kpi-value status-text-${pillClass(tile.status)}">${escapeHtml(tile.value)}</p>
        <p class="kpi-foot">${escapeHtml(tile.foot)}</p>
      </article>`)
    .join("");
}

function renderChecks(snapshot, environment) {
  const container = document.getElementById("checks");
  const checks = environmentChecks(snapshot, environment);
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
  const performance = performanceData(environment);
  const label = environment ? environment.short : "LOCAL";
  if (!performance || !performance.samples) {
    meta.textContent = "Sin muestras";
    container.innerHTML = `<p class="empty">Aún no hay muestras de rendimiento para ${escapeHtml(label)}.</p>`;
    return;
  }
  const errorRate = performance.errorRate == null ? 0 : performance.errorRate;
  const p95 = performance.p95;
  const tone = p95 == null ? "unknown" : p95 > 1500 || errorRate > 5 ? "down" : p95 > 600 || errorRate > 0 ? "degraded" : "ok";
  meta.textContent = `${performance.samples} muestras · ${formatTime(performance.last && performance.last.at)}`;
  const stats = [
    { label: "p50", value: performance.p50, unit: "ms" },
    { label: "p95", value: p95, unit: "ms", tone },
    { label: "Promedio", value: performance.avg, unit: "ms" },
    { label: "Mínimo", value: performance.min, unit: "ms" },
    { label: "Máximo", value: performance.max, unit: "ms" },
    { label: "Errores", value: performance.failures, unit: "", tone: errorRate > 0 ? "down" : "ok" },
    { label: "Tasa error", value: errorRate, unit: "%", tone: errorRate > 0 ? "down" : "ok" },
    { label: "Muestras", value: performance.samples, unit: "" }
  ];
  container.innerHTML = `
    <div class="perf-head">
      <div>
        <p class="perf-value">${p95 != null ? escapeHtml(p95) : "—"}<small>ms p95 · ${escapeHtml(label)}</small></p>
        <p class="perf-sub">${performance.avg != null ? `promedio ${escapeHtml(performance.avg)} ms` : "sin promedio"} · ${escapeHtml(errorRate)}% errores</p>
      </div>
      <span class="pill ${tone}">${escapeHtml(STATUS_LABEL[tone] || tone)}</span>
    </div>
    ${sparkline(performance.series)}
    <div class="perf-grid">
      ${stats.map((stat) => `
        <div class="perf-stat ${stat.tone || ""}">
          <span>${escapeHtml(stat.label)}</span>
          <strong>${stat.value == null ? "—" : escapeHtml(stat.value)}${escapeHtml(stat.unit)}</strong>
        </div>`).join("")}
    </div>`;
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
  container.innerHTML = entries.map((entry) => renderCloudCard(entry.provider, entry.data)).join("");
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
  const environmentButton = event.target.closest("[data-env]");
  if (environmentButton) {
    const id = environmentButton.dataset.env;
    if (id && id !== state.environment) {
      state.environment = id;
      localStorage.setItem("towerEnvironment", id);
      render();
    }
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
