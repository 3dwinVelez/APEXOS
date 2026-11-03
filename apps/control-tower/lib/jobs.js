"use strict";

const crypto = require("node:crypto");

const OPEN_STATUSES = new Set(["queued", "awaiting_approval", "claimed", "running"]);

const LEVELS = {
  N0: {
    id: "N0",
    label: "Observar",
    description: "Lectura de estado, evidencia y diagnosticos. Sin cambios.",
    approvalRequired: false
  },
  N1: {
    id: "N1",
    label: "Analizar",
    description: "Analisis y propuesta de plan. Sin cambios en el repositorio.",
    approvalRequired: false
  },
  N2: {
    id: "N2",
    label: "Implementar en desarrollo",
    description: "Cambios de codigo solo en la rama desarrollo, con pruebas.",
    approvalRequired: true
  },
  N3: {
    id: "N3",
    label: "Certificar / pre-QA",
    description: "Certificacion local y manifiesto de alcance. No promueve ramas.",
    approvalRequired: true
  },
  N4: {
    id: "N4",
    label: "Promover / desplegar",
    description: "Exclusivo de una persona. La torre nunca ejecuta N4.",
    approvalRequired: true,
    humanOnly: true
  }
};

const STATUSES = ["queued", "awaiting_approval", "claimed", "running", "completed", "failed", "blocked", "rejected", "cancelled"];

class Jobs {
  constructor({ store, now = () => Date.now() }) {
    this.store = store;
    this.now = now;
    this.jobs = store ? store.jobs : [];
  }

  static normalizeLevel(level) {
    const key = String(level || "").toUpperCase();
    return LEVELS[key] ? LEVELS[key] : null;
  }

  create({ instruction, level, requestedBy = {}, target = {}, context = {} }) {
    const text = typeof instruction === "string" ? instruction.trim() : "";
    if (text.length < 8) return { ok: false, code: "INSTRUCCION_CORTA" };
    if (text.length > 4000) return { ok: false, code: "INSTRUCCION_LARGA" };
    const levelConfig = Jobs.normalizeLevel(level);
    if (!levelConfig) return { ok: false, code: "NIVEL_INVALIDO" };
    if (LEVELS[levelConfig.id].humanOnly) return { ok: false, code: "NIVEL_HUMANO" };
    if (this.jobs.filter((job) => OPEN_STATUSES.has(job.status)).length >= 20) {
      return { ok: false, code: "COLA_LLENA" };
    }

    const job = {
      id: this.nextId(),
      at: new Date(this.now()).toISOString(),
      updatedAt: new Date(this.now()).toISOString(),
      level: levelConfig.id,
      instruction: text,
      target: {
        repo: target.repo || "APEXOS",
        branch: levelConfig.id === "N2" || levelConfig.id === "N3" ? "desarrollo" : target.branch || null
      },
      requestedBy: {
        channel: requestedBy.channel || "web",
        chatId: requestedBy.chatId || null,
        name: requestedBy.name || null
      },
      context: {
        snapshotAt: context.snapshotAt || null,
        overall: context.overall || null,
        notes: context.notes || null
      },
      status: levelConfig.approvalRequired ? "awaiting_approval" : "queued",
      approval: {
        required: levelConfig.approvalRequired,
        approvedBy: null,
        approvedAt: null
      },
      assignment: { bridgeId: null, claimedAt: null, heartbeatAt: null },
      result: null,
      log: [{ at: new Date(this.now()).toISOString(), kind: "job.created", message: `Nivel ${levelConfig.id}` }]
    };
    this.jobs.unshift(job);
    this.persist();
    return { ok: true, job };
  }

  nextId() {
    const stamp = new Date(this.now());
    const pad = (value) => String(value).padStart(2, "0");
    const date = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}`;
    const time = `${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
    return `JOB-${date}-${time}-${crypto.randomBytes(2).toString("hex")}`;
  }

  get(id) {
    return this.jobs.find((job) => job.id === id) || null;
  }

  list({ status = null, limit = 50 } = {}) {
    const filtered = status ? this.jobs.filter((job) => job.status === status) : this.jobs;
    return filtered.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
  }

  approve(id, { approvedBy = "telegram", note = "" } = {}) {
    const job = this.get(id);
    if (!job) return { ok: false, code: "NO_EXISTE" };
    if (job.status !== "awaiting_approval") return { ok: false, code: "ESTADO_INVALIDO" };
    job.status = "queued";
    job.approval.approvedBy = approvedBy;
    job.approval.approvedAt = new Date(this.now()).toISOString();
    this.log(job, "job.approved", note || `Aprobado por ${approvedBy}`);
    this.persist();
    return { ok: true, job };
  }

  reject(id, { rejectedBy = "telegram", note = "" } = {}) {
    const job = this.get(id);
    if (!job) return { ok: false, code: "NO_EXISTE" };
    if (!["awaiting_approval", "queued"].includes(job.status)) return { ok: false, code: "ESTADO_INVALIDO" };
    job.status = "rejected";
    job.result = { status: "rejected", note, at: new Date(this.now()).toISOString() };
    this.log(job, "job.rejected", note || `Rechazado por ${rejectedBy}`);
    this.persist();
    return { ok: true, job };
  }

  cancel(id, { by = "telegram", note = "" } = {}) {
    const job = this.get(id);
    if (!job) return { ok: false, code: "NO_EXISTE" };
    if (!OPEN_STATUSES.has(job.status)) return { ok: false, code: "ESTADO_INVALIDO" };
    job.status = "cancelled";
    job.result = { status: "cancelled", note, at: new Date(this.now()).toISOString() };
    this.log(job, "job.cancelled", note || `Cancelado por ${by}`);
    this.persist();
    return { ok: true, job };
  }

  claim({ bridgeId, level = null } = {}) {
    if (!bridgeId) return { ok: false, code: "BRIDGE_ID_REQUERIDO" };
    const active = this.jobs.find((job) => ["claimed", "running"].includes(job.status));
    if (active) return { ok: false, code: "TRABAJO_ACTIVO", job: active };
    const candidate = this.jobs
      .filter((job) => job.status === "queued" && (!level || job.level === level))
      .slice()
      .reverse()[0];
    if (!candidate) return { ok: false, code: "SIN_TRABAJO" };
    candidate.status = "claimed";
    candidate.assignment = { bridgeId, claimedAt: new Date(this.now()).toISOString(), heartbeatAt: new Date(this.now()).toISOString() };
    this.log(candidate, "job.claimed", `Reclamado por ${bridgeId}`);
    this.persist();
    return { ok: true, job: candidate, envelope: envelopeFor(candidate) };
  }

  heartbeat(id, bridgeId) {
    const job = this.get(id);
    if (!job) return { ok: false, code: "NO_EXISTE" };
    if (job.assignment.bridgeId !== bridgeId) return { ok: false, code: "NO_ASIGNADO" };
    if (!["claimed", "running"].includes(job.status)) return { ok: false, code: "ESTADO_INVALIDO" };
    job.assignment.heartbeatAt = new Date(this.now()).toISOString();
    if (job.status === "claimed") {
      job.status = "running";
      this.log(job, "job.started", `En ejecucion por ${bridgeId}`);
    }
    this.persist();
    return { ok: true, job };
  }

  complete(id, bridgeId, { status = "completed", summary = "", evidence = [], tests = null, note = "" } = {}) {
    const job = this.get(id);
    if (!job) return { ok: false, code: "NO_EXISTE" };
    if (job.assignment.bridgeId !== bridgeId) return { ok: false, code: "NO_ASIGNADO" };
    if (!["claimed", "running"].includes(job.status)) return { ok: false, code: "ESTADO_INVALIDO" };
    if (!["completed", "failed", "blocked"].includes(status)) return { ok: false, code: "ESTADO_INVALIDO" };
    job.status = status;
    job.result = {
      status,
      summary: String(summary || "").slice(0, 4000),
      evidence: Array.isArray(evidence) ? evidence.slice(0, 50).map((item) => String(item).slice(0, 500)) : [],
      tests: tests && typeof tests === "object" ? tests : null,
      note: String(note || "").slice(0, 1000),
      at: new Date(this.now()).toISOString()
    };
    this.log(job, `job.${status}`, summary || status);
    this.persist();
    return { ok: true, job };
  }

  release(id, bridgeId, note = "") {
    const job = this.get(id);
    if (!job) return { ok: false, code: "NO_EXISTE" };
    if (job.assignment.bridgeId !== bridgeId) return { ok: false, code: "NO_ASIGNADO" };
    if (!["claimed", "running"].includes(job.status)) return { ok: false, code: "ESTADO_INVALIDO" };
    job.status = "queued";
    job.assignment = { bridgeId: null, claimedAt: null, heartbeatAt: null };
    this.log(job, "job.released", note || "Liberado por el puente");
    this.persist();
    return { ok: true, job };
  }

  staleClaim({ offlineMs }) {
    const active = this.jobs.find((job) => ["claimed", "running"].includes(job.status));
    if (!active) return null;
    const last = Date.parse(active.assignment.heartbeatAt || active.assignment.claimedAt || active.updatedAt);
    if (!Number.isFinite(last)) return null;
    return this.now() - last > offlineMs ? active : null;
  }

  log(job, kind, message) {
    job.updatedAt = new Date(this.now()).toISOString();
    job.log.push({ at: job.updatedAt, kind, message: String(message || "").slice(0, 1000) });
    if (job.log.length > 60) job.log.splice(0, job.log.length - 60);
  }

  persist() {
    if (this.store) this.store.setJobs(this.jobs);
  }

  stats() {
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const job of this.jobs) counts[job.status] = (counts[job.status] || 0) + 1;
    return {
      total: this.jobs.length,
      counts,
      active: this.jobs.filter((job) => OPEN_STATUSES.has(job.status)).length,
      lastJobAt: this.jobs[0] ? this.jobs[0].at : null
    };
  }
}

function envelopeFor(job) {
  return {
    jobId: job.id,
    level: job.level,
    instruction: job.instruction,
    target: job.target,
    scope: {
      branch: job.level === "N0" || job.level === "N1" ? "lectura" : "desarrollo",
      allowCodeChanges: job.level === "N2" || job.level === "N3",
      allowTests: true,
      allowCommit: false,
      allowPush: false,
      allowMerge: false,
      allowDeploy: false,
      allowRemoteMigrations: false
    },
    skills: job.level === "N0" || job.level === "N1" ? ["apexos-git-guardian"] : ["apexos-git-guardian", "apexos-backend", "apexos-frontend", "apexos-qa"],
    rules: [
      "Trabajar unicamente en la rama desarrollo.",
      "Nunca ejecutar push, merge, deploy ni migraciones remotas sin autorizacion explicita e independiente.",
      "Toda entrega requiere pruebas y evidencia versionada.",
      "Reportar el resultado por el puente con resumen y rutas de evidencia.",
      "No incluir secretos en codigo, briefs, eventos, logs ni transcripciones."
    ]
  };
}

module.exports = { Jobs, LEVELS, STATUSES, OPEN_STATUSES, envelopeFor };
