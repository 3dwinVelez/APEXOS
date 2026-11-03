"use strict";

const defaultPrisma = require("../../core/prisma");
const { computeOverall } = require("./pulse");
const { scoreFor } = require("./probes");

const REPORT_KIND = "daily";
const BOGOTA_TIMEZONE = "America/Bogota";
const DEFAULT_SAMPLE_RETENTION_DAYS = 7;
const DEFAULT_EVENT_RETENTION_DAYS = 30;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BOGOTA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const timeFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: BOGOTA_TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short"
});

function periodKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = dateFormatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function retentionDays(envKey, fallback) {
  const value = Number(process.env[envKey]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function reportRecipients() {
  return String(process.env.APEX_CONTROL_REPORT_RECIPIENTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] || "unknown");
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function statusLine(status) {
  if (status === "ok") return "Operativo";
  if (status === "degraded") return "Degradado";
  if (status === "down") return "Caido";
  return "Sin datos";
}

async function buildDailySummary(deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const now = deps.now instanceof Date ? deps.now : new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [components, openIncidents, openedIncidents, resolvedIncidents, events] = await Promise.all([
    db.apexComponent.findMany({
      orderBy: { key: "asc" },
      select: { key: true, name: true, criticality: true, last_status: true, last_checked_at: true }
    }),
    db.apexIncident.findMany({
      where: { status: { in: ["open", "acknowledged"] } },
      orderBy: { last_seen: "desc" },
      take: 20
    }),
    db.apexIncident.count({ where: { first_seen: { gte: from, lte: now } } }),
    db.apexIncident.count({ where: { resolved_at: { gte: from, lte: now } } }),
    db.apexEvent.findMany({
      where: { occurred_at: { gte: from, lte: now } },
      select: { kind: true, severity: true, component_key: true },
      take: 5000
    })
  ]);

  const normalized = components.map((component) => ({
    key: component.key,
    name: component.name,
    criticality: component.criticality,
    status: component.last_status || "unknown",
    score: scoreFor(component.last_status || "unknown"),
    last_checked_at: component.last_checked_at ? new Date(component.last_checked_at).toISOString() : null
  }));
  const overall = computeOverall(normalized);
  const degraded = normalized.filter((component) => component.status === "down" || component.status === "degraded");

  return {
    kind: REPORT_KIND,
    period_key: periodKey(now),
    generated_at: now.toISOString(),
    window: { from: from.toISOString(), to: now.toISOString() },
    overall,
    components: normalized,
    degraded_components: degraded,
    incidents: {
      active: openIncidents.length,
      opened_last_24h: openedIncidents,
      resolved_last_24h: resolvedIncidents,
      items: openIncidents.map((incident) => ({
        id: String(incident.id),
        component_key: incident.component_key,
        severity: incident.severity,
        status: incident.status,
        title: incident.title,
        summary: incident.summary,
        last_seen: new Date(incident.last_seen).toISOString()
      }))
    },
    events: {
      total: events.length,
      by_severity: countBy(events, "severity"),
      by_kind: countBy(events, "kind"),
      by_component: countBy(events, "component_key")
    },
    link: "/dashboard/apex-control"
  };
}

function renderHtml(summary) {
  const rows = summary.components
    .map((component) => `<tr><td>${component.name}</td><td>${statusLine(component.status)}</td><td>${component.score}</td></tr>`)
    .join("");
  const incidents = summary.incidents.items.length
    ? summary.incidents.items.map((incident) => `<li><strong>${incident.title}</strong> — ${incident.summary}</li>`).join("")
    : "<li>Sin incidentes activos.</li>";

  return [
    `<h2>Reporte diario APEX Control — ${summary.period_key}</h2>`,
    `<p>Estado global: <strong>${statusLine(summary.overall.status)}</strong> (score ${summary.overall.score}/100).</p>`,
    `<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Componente</th><th>Estado</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`,
    `<h3>Incidentes activos (${summary.incidents.active})</h3><ul>${incidents}</ul>`,
    `<p>Abiertos en 24 h: ${summary.incidents.opened_last_24h}. Resueltos en 24 h: ${summary.incidents.resolved_last_24h}. Eventos: ${summary.events.total}.</p>`,
    `<p><a href="${summary.link}">Abrir Torre de Control</a></p>`
  ].join("");
}

function renderText(summary) {
  const lines = [
    `Reporte diario APEX Control — ${summary.period_key}`,
    `Estado global: ${statusLine(summary.overall.status)} (${summary.overall.score}/100)`,
    "",
    ...summary.components.map((component) => `- ${component.name}: ${statusLine(component.status)} (${component.score})`),
    "",
    `Incidentes activos: ${summary.incidents.active}`,
    `Abiertos 24 h: ${summary.incidents.opened_last_24h} | Resueltos 24 h: ${summary.incidents.resolved_last_24h}`,
    `Eventos 24 h: ${summary.events.total}`,
    "",
    `Torre de Control: ${summary.link}`
  ];
  return lines.join("\n");
}

async function sendDailyBriefing(deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const queues = deps.queues || require("../../fabric/queues");
  const now = deps.now instanceof Date ? deps.now : new Date();
  const force = deps.force === true;
  const summary = await buildDailySummary({ ...deps, prisma: db, now });
  const emittedAt = timeFormatter.format(now);

  if (!force) {
    const existing = await db.apexReportRun.findUnique({
      where: { kind_period_key: { kind: REPORT_KIND, period_key: summary.period_key } }
    });
    if (existing?.sent_at) {
      return { ...summary, status: "skipped_already_sent", sent_at: new Date(existing.sent_at).toISOString() };
    }
  }

  const recipients = reportRecipients();
  let status = "queued";
  if (!recipients.length) {
    status = "skipped_no_recipients";
  } else if (!queues?.connection) {
    status = "queue_unavailable";
  } else {
    await queues.emailQueue.add("apex-control-daily-report", {
      to: recipients,
      subject: `APEX Control — reporte diario ${summary.period_key}`,
      html: renderHtml(summary),
      text: renderText(summary)
    });
  }

  const sentAt = status === "queued" ? new Date() : null;
  await db.apexReportRun.upsert({
    where: { kind_period_key: { kind: REPORT_KIND, period_key: summary.period_key } },
    create: {
      kind: REPORT_KIND,
      period_key: summary.period_key,
      status,
      recipients,
      summary,
      sent_at: sentAt
    },
    update: {
      status,
      recipients,
      summary,
      sent_at: sentAt
    }
  });

  return { ...summary, status, sent_at: sentAt ? sentAt.toISOString() : null, emitted_at: emittedAt };
}

async function cleanupRetention(deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const now = deps.now instanceof Date ? deps.now : new Date();
  const sampleDays = retentionDays("APEX_CONTROL_SAMPLE_RETENTION_DAYS", DEFAULT_SAMPLE_RETENTION_DAYS);
  const eventDays = retentionDays("APEX_CONTROL_EVENT_RETENTION_DAYS", DEFAULT_EVENT_RETENTION_DAYS);
  const sampleCutoff = new Date(now.getTime() - sampleDays * 86400000);
  const eventCutoff = new Date(now.getTime() - eventDays * 86400000);

  const [samples, events] = await Promise.all([
    db.apexHealthSample.deleteMany({ where: { sampled_at: { lt: sampleCutoff } } }),
    db.apexEvent.deleteMany({ where: { occurred_at: { lt: eventCutoff } } })
  ]);

  return {
    samples_deleted: samples.count,
    events_deleted: events.count,
    sample_cutoff: sampleCutoff.toISOString(),
    event_cutoff: eventCutoff.toISOString()
  };
}

module.exports = {
  REPORT_KIND,
  periodKey,
  buildDailySummary,
  renderHtml,
  renderText,
  sendDailyBriefing,
  cleanupRetention
};
