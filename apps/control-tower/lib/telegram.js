"use strict";

const https = require("node:https");
const crypto = require("node:crypto");
const { createRateLimiter, redact, sanitizeText } = require("./security");
const { LEVELS } = require("./jobs");

const MAX_MESSAGE = 3900;

function telegramCall(token, method, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
        timeout: timeoutMs
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            reject(new Error(`Telegram ${method}: respuesta invalida`));
            return;
          }
          if (!parsed.ok) {
            reject(new Error(`Telegram ${method}: ${redact(parsed.description || "error")}`));
            return;
          }
          resolve(parsed.result);
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error(`Telegram ${method}: timeout`)));
    request.on("error", (error) => reject(new Error(redact(String(error.message || error)))));
    request.write(body);
    request.end();
  });
}

function chunkText(text) {
  const value = String(text || "");
  if (value.length <= MAX_MESSAGE) return [value];
  const chunks = [];
  for (let index = 0; index < value.length; index += MAX_MESSAGE) chunks.push(value.slice(index, index + MAX_MESSAGE));
  return chunks.slice(0, 4);
}

function severityTag(alert) {
  return `[${String(alert.severity || "info").toUpperCase()}]`;
}

class TelegramChannel {
  constructor({ config, jobs, alerts, store, getSnapshot, getGit, getBridgeStatus, onEvent = null, now = () => Date.now() }) {
    this.config = config;
    this.jobs = jobs;
    this.alerts = alerts;
    this.store = store;
    this.getSnapshot = getSnapshot || (() => null);
    this.getGit = getGit || (() => null);
    this.getBridgeStatus = getBridgeStatus || (() => null);
    this.onEvent = onEvent;
    this.now = now;
    this.mode = config.telegram.mode;
    this.allowedChatIds = new Set(config.telegram.allowedChatIds);
    this.outbox = [];
    this.running = false;
    this.loop = null;
    this.offset = 0;
    this.pairingCode = null;
    this.pairingExpiresAt = 0;
    this.limiter = createRateLimiter({ limit: config.telegram.rateLimitPerMin, windowMs: 60000, now });
    this.lastSendAt = new Map();
    this.events = [];
    this.restoreAllowlist();
  }

  restoreAllowlist() {
    const persisted = this.store ? this.store.readAux("telegram-allowlist", null) : null;
    if (Array.isArray(persisted)) {
      for (const id of persisted) {
        if (typeof id === "string" || typeof id === "number") this.allowedChatIds.add(String(id));
      }
    }
  }

  persistAllowlist() {
    if (this.store) this.store.writeAux("telegram-allowlist", [...this.allowedChatIds]);
  }

  isAllowed(chatId) {
    return this.allowedChatIds.has(String(chatId));
  }

  start() {
    if (this.mode !== "polling" || this.running) return { started: false, mode: this.mode };
    this.running = true;
    this.loop = this.poll();
    return { started: true, mode: this.mode };
  }

  stop() {
    this.running = false;
    if (this.loop) this.loop.catch(() => {});
    this.loop = null;
  }

  async poll() {
    let backoffMs = 3000;
    while (this.running) {
      try {
        const updates = await telegramCall(
          this.config.telegram.token,
          "getUpdates",
          { offset: this.offset, timeout: this.config.telegram.pollTimeoutS, allowed_updates: ["message", "callback_query"] },
          (this.config.telegram.pollTimeoutS + 10) * 1000
        );
        backoffMs = 3000;
        for (const update of updates || []) {
          this.offset = Math.max(this.offset, Number(update.update_id) + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        this.record({ kind: "telegram.poll_error", message: redact(String(error.message || error)) });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 30000);
      }
    }
  }

  createPairingCode() {
    this.pairingCode = String(crypto.randomInt(100000, 999999));
    this.pairingExpiresAt = this.now() + this.config.telegram.pairingTtlMs;
    return { code: this.pairingCode, expiresAt: new Date(this.pairingExpiresAt).toISOString(), ttlMs: this.config.telegram.pairingTtlMs };
  }

  pairingState() {
    if (!this.pairingCode || this.now() > this.pairingExpiresAt) return { active: false, expiresAt: null };
    return { active: true, code: this.pairingCode, expiresAt: new Date(this.pairingExpiresAt).toISOString() };
  }

  pair(chatId, code) {
    if (!this.pairingCode || this.now() > this.pairingExpiresAt) return { ok: false, reason: "Codigo de emparejamiento vencido" };
    if (String(code).trim() !== this.pairingCode) return { ok: false, reason: "Codigo incorrecto" };
    this.allowedChatIds.add(String(chatId));
    this.persistAllowlist();
    this.pairingCode = null;
    this.pairingExpiresAt = 0;
    return { ok: true };
  }

  record(entry) {
    const event = { at: new Date(this.now()).toISOString(), ...entry };
    this.events.unshift(event);
    if (this.events.length > 100) this.events.length = 100;
    if (this.store) this.store.addEvent({ id: `EVT-${crypto.randomBytes(3).toString("hex")}`, ...event });
    if (this.onEvent) this.onEvent(event);
    return event;
  }

  async send(chatId, text, { keyboard = null } = {}) {
    const payload = { chat_id: String(chatId), text: String(text || "").slice(0, MAX_MESSAGE), disable_web_page_preview: true };
    if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
    if (this.mode === "off" || (!this.config.telegram.token && this.mode !== "dry-run")) {
      return { ok: false, reason: "telegram_off" };
    }
    if (this.mode === "dry-run") {
      this.outbox.unshift({ at: new Date(this.now()).toISOString(), chatId: String(chatId), text: payload.text, keyboard, dryRun: true });
      if (this.outbox.length > 200) this.outbox.length = 200;
      return { ok: true, dryRun: true };
    }
    const previous = this.lastSendAt.get(String(chatId)) || 0;
    const wait = 1000 - (this.now() - previous);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const chunks = chunkText(payload.text);
      let last = null;
      for (let index = 0; index < chunks.length; index += 1) {
        const part = { ...payload, text: chunks[index] };
        if (index < chunks.length - 1) delete part.reply_markup;
        last = await telegramCall(this.config.telegram.token, "sendMessage", part);
      }
      this.lastSendAt.set(String(chatId), this.now());
      this.record({ kind: "telegram.out", chatId: String(chatId), message: payload.text.slice(0, 400) });
      return { ok: true, messageId: last && last.message_id };
    } catch (error) {
      this.record({ kind: "telegram.send_error", chatId: String(chatId), message: redact(String(error.message || error)) });
      return { ok: false, reason: "send_failed" };
    }
  }

  async notifyAlert(alert, kind = "opened") {
    if (!["polling", "dry-run"].includes(this.mode)) return [];
    const header = kind === "resolved" ? "[RECUPERADO]" : severityTag(alert);
    const text = [
      `${header} ${alert.title || alert.component}`,
      alert.message ? String(alert.message).slice(0, 500) : "",
      kind === "resolved" ? `Motivo: ${alert.resolvedReason || "componente estable"}` : "",
      `Hora: ${new Date(alert.at).toLocaleString("es-CO")}`,
      kind === "opened" ? "Reconocer: /ack " + alert.id : ""
    ].filter(Boolean).join("\n");
    const results = [];
    for (const chatId of this.allowedChatIds) {
      results.push(await this.send(chatId, text, {
        keyboard: kind === "opened" ? [[{ text: "Reconocer", callback_data: `ack:${alert.id}` }]] : null
      }));
    }
    return results;
  }

  async handleUpdate(update) {
    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }
    if (!update.message) return;
    const message = update.message;
    const chatId = message.chat && message.chat.id;
    const text = sanitizeText(message.text || "", 4000);
    if (!chatId || !text) return;

    if (!this.isAllowed(chatId)) {
      const pairMatch = /^\/pair\s+(\d{6})$/i.exec(text);
      if (pairMatch) {
        const result = this.pair(chatId, pairMatch[1]);
        await this.send(chatId, result.ok ? "Emparejamiento exitoso. Ya puedes enviar instrucciones." : `No se pudo emparejar: ${result.reason}`);
        this.record({ kind: "telegram.pair", chatId: String(chatId), message: result.ok ? "ok" : "fallido" });
      } else {
        await this.send(chatId, "Chat no autorizado. Envia /pair <codigo> usando el codigo que muestra APEX Control Tower en tu equipo local.");
      }
      return;
    }

    const limit = this.limiter.check(String(chatId));
    if (!limit.ok) {
      await this.send(chatId, "Demasiados mensajes seguidos. Espera un momento.");
      return;
    }

    this.record({ kind: "telegram.in", chatId: String(chatId), message: text.slice(0, 400) });

    if (!text.startsWith("/")) {
      const created = this.jobs.create({
        instruction: text,
        level: "N1",
        requestedBy: { channel: "telegram", chatId: String(chatId) },
        context: { snapshotAt: this.snapshotAt(), overall: this.overall() }
      });
      if (!created.ok) {
        await this.send(chatId, `No se pudo crear el trabajo: ${created.code}`);
        return;
      }
      await this.send(chatId, `Instruccion registrada como analisis (N1).\nID: ${created.job.id}\nLa torre la entregara al puente de Qoder.\n\nPara implementar usa /impl <instruccion>.`, {
        keyboard: [[{ text: "Cancelar", callback_data: `cancel:${created.job.id}` }]]
      });
      return;
    }

    const [rawCommand, ...rest] = text.split(/\s+/);
    const command = rawCommand.replace(/@[\w_]+$/, "").toLowerCase();
    const argument = rest.join(" ").trim();

    switch (command) {
      case "/start":
      case "/ayuda":
      case "/help":
        await this.send(chatId, this.helpText());
        break;
      case "/estado":
      case "/status":
        await this.send(chatId, this.statusText());
        break;
      case "/ramas":
      case "/branches":
        await this.send(chatId, this.branchesText());
        break;
      case "/alertas":
      case "/alerts":
        await this.send(chatId, this.alertsText());
        break;
      case "/trabajos":
      case "/jobs":
        await this.send(chatId, this.jobsText());
        break;
      case "/puente":
      case "/bridge":
        await this.send(chatId, this.bridgeText());
        break;
      case "/obs":
      case "/analiza":
        await this.createFromTelegram(chatId, "N0", argument, ["que paso", "revisa el estado", "diagnostico"]);
        break;
      case "/impl":
      case "/implementa":
        await this.createFromTelegram(chatId, "N2", argument, ["implementa", "corrige", "agrega", "ajusta"]);
        break;
      case "/qa":
      case "/certifica":
        await this.createFromTelegram(chatId, "N3", argument, ["certifica", "qa", "preqa"]);
        break;
      case "/aprobar":
      case "/approve":
        await this.jobAction(chatId, argument, "approve");
        break;
      case "/rechazar":
      case "/reject":
        await this.jobAction(chatId, argument, "reject");
        break;
      case "/cancelar":
      case "/cancel":
        await this.jobAction(chatId, argument, "cancel");
        break;
      case "/ack":
        await this.ackAction(chatId, argument);
        break;
      case "/pair":
        await this.send(chatId, "Este chat ya esta emparejado.");
        break;
      default:
        await this.send(chatId, `Comando no reconocido: ${command}\n\n${this.helpText()}`);
    }
  }

  async handleCallback(query) {
    const chatId = query.message && query.message.chat ? query.message.chat.id : null;
    const data = String(query.data || "");
    if (!chatId || !this.isAllowed(chatId)) {
      await this.answerCallback(query.id, "No autorizado");
      return;
    }
    const [action, id] = data.split(":");
    if (action === "approve" && id) {
      const result = this.jobs.approve(id, { approvedBy: `telegram:${chatId}`, note: "Aprobado desde Telegram" });
      await this.answerCallback(query.id, result.ok ? "Aprobado" : "No se pudo aprobar");
      if (result.ok) await this.send(chatId, `Trabajo ${id} aprobado y en cola.`);
    } else if (action === "reject" && id) {
      const result = this.jobs.reject(id, { rejectedBy: `telegram:${chatId}`, note: "Rechazado desde Telegram" });
      await this.answerCallback(query.id, result.ok ? "Rechazado" : "No se pudo rechazar");
      if (result.ok) await this.send(chatId, `Trabajo ${id} rechazado.`);
    } else if (action === "cancel" && id) {
      const result = this.jobs.cancel(id, { by: `telegram:${chatId}`, note: "Cancelado desde Telegram" });
      await this.answerCallback(query.id, result.ok ? "Cancelado" : "No se pudo cancelar");
    } else if (action === "ack" && id) {
      const alert = this.alerts.acknowledge(id, { by: `telegram:${chatId}` });
      await this.answerCallback(query.id, alert ? "Alerta reconocida" : "Alerta no encontrada");
    } else {
      await this.answerCallback(query.id, "Accion no valida");
    }
  }

  async answerCallback(callbackId, text) {
    if (this.mode !== "polling") return;
    try {
      await telegramCall(this.config.telegram.token, "answerCallbackQuery", { callback_query_id: callbackId, text: String(text).slice(0, 180) }, 10000);
    } catch {
      // silencioso: no rompe el bucle
    }
  }

  async createFromTelegram(chatId, level, instruction, hints) {
    if (!instruction) {
      await this.send(chatId, `Falta la instruccion. Ejemplo: /${level === "N2" ? "impl" : level === "N3" ? "qa" : "obs"} revisa el estado de las colas`);
      return;
    }
    const created = this.jobs.create({
      instruction,
      level,
      requestedBy: { channel: "telegram", chatId: String(chatId) },
      context: { snapshotAt: this.snapshotAt(), overall: this.overall(), notes: Array.isArray(hints) ? hints.join(", ") : null }
    });
    if (!created.ok) {
      await this.send(chatId, `No se pudo crear el trabajo: ${created.code}`);
      return;
    }
    const job = created.job;
    const config = LEVELS[job.level];
    if (job.status === "awaiting_approval") {
      await this.send(chatId, `Trabajo ${job.id} (${config.label}) requiere aprobacion.\n\n${job.instruction}\n\nDestino: ${job.target.branch}\n\nResponde /aprobar ${job.id} o usa los botones.`, {
        keyboard: [[{ text: "Aprobar", callback_data: `approve:${job.id}` }, { text: "Rechazar", callback_data: `reject:${job.id}` }]]
      });
    } else {
      await this.send(chatId, `Trabajo ${job.id} (${config.label}) en cola para el puente de Qoder.`);
    }
  }

  async jobAction(chatId, argument, action) {
    const id = argument.split(/\s+/)[0];
    if (!id) {
      await this.send(chatId, `Falta el ID. Ejemplo: /${action === "approve" ? "aprobar" : action === "reject" ? "rechazar" : "cancelar"} JOB-...`);
      return;
    }
    const result = action === "approve"
      ? this.jobs.approve(id, { approvedBy: `telegram:${chatId}` })
      : action === "reject"
        ? this.jobs.reject(id, { rejectedBy: `telegram:${chatId}` })
        : this.jobs.cancel(id, { by: `telegram:${chatId}` });
    if (!result.ok) {
      await this.send(chatId, `No se pudo ejecutar la accion (${result.code}).`);
      return;
    }
    const label = action === "approve" ? "aprobado y en cola" : action === "reject" ? "rechazado" : "cancelado";
    await this.send(chatId, `Trabajo ${id} ${label}.`);
  }

  async ackAction(chatId, argument) {
    const id = argument.split(/\s+/)[0];
    if (!id) {
      const open = this.alerts.list({ onlyOpen: true, limit: 10 });
      await this.send(chatId, open.length ? open.map((alert) => `${alert.id} ${alert.title}`).join("\n") : "No hay alertas abiertas.");
      return;
    }
    const alert = this.alerts.acknowledge(id, { by: `telegram:${chatId}` });
    await this.send(chatId, alert ? `Alerta ${id} reconocida.` : "Alerta no encontrada.");
  }

  snapshotAt() {
    const snapshot = this.getSnapshot();
    return snapshot ? snapshot.at : null;
  }

  overall() {
    const snapshot = this.getSnapshot();
    return snapshot ? snapshot.overall : null;
  }

  helpText() {
    return [
      "APEX Control Tower - comandos",
      "/estado - salud actual de APEX",
      "/ramas - estado de desarrollo, develop y main",
      "/alertas - alertas recientes",
      "/trabajos - cola de la fabrica",
      "/puente - estado del puente Qoder",
      "/obs <texto> - diagnostico N0",
      "/impl <texto> - implementar en desarrollo (N2, requiere aprobacion)",
      "/qa <texto> - certificar (N3, requiere aprobacion)",
      "/aprobar <id> /rechazar <id> /cancelar <id>",
      "/ack <id> - reconocer alerta",
      "",
      "Texto libre se registra como analisis N1.",
      "N4 (push, merge, deploy) nunca se ejecuta desde la torre."
    ].join("\n");
  }

  statusText() {
    const snapshot = this.getSnapshot();
    if (!snapshot) return "Sin lecturas todavia. La torre esta arrancando.";
    const lines = [
      `Estado: ${snapshot.overall.toUpperCase()} (${snapshot.summary.ok}/${snapshot.summary.total} ok)`,
      `Lectura: ${new Date(snapshot.at).toLocaleString("es-CO")}`,
      ""
    ];
    for (const check of snapshot.checks) lines.push(`${check.label}: ${check.status}`);
    const open = this.alerts.list({ onlyOpen: true, limit: 5 });
    lines.push("", `Alertas abiertas: ${open.length}`);
    return lines.join("\n");
  }

  branchesText() {
    const git = this.getGit();
    if (!git) return "Sin lectura de ramas todavia.";
    const lines = [`Repositorio: ${git.repoRoot}`, `Remoto: ${git.remote}${git.remoteError ? " (no disponible)" : ""}`, ""];
    for (const branch of git.branches) {
      const sha = branch.localSha ? branch.localSha.slice(0, 8) : "sin local";
      lines.push(`${branch.name}: ${branch.relation} (${sha})${branch.current ? " [actual]" : ""}`);
      if (branch.ahead != null && branch.behind != null) lines.push(`  adelante ${branch.ahead} / atras ${branch.behind}`);
    }
    lines.push("", `Flujo main -> develop -> desarrollo: ${git.flowOk ? "correcto" : "con divergencias"}`);
    for (const warning of git.warnings) lines.push(`Aviso: ${warning}`);
    return lines.join("\n");
  }

  alertsText() {
    const alerts = this.alerts.list({ limit: 10 });
    if (!alerts.length) return "Sin alertas registradas.";
    return alerts
      .map((alert) => `${alert.resolvedAt ? "[resuelta]" : `[${alert.severity}]`} ${alert.id} ${alert.title}${alert.acknowledged ? " (reconocida)" : ""}`)
      .join("\n");
  }

  jobsText() {
    const jobs = this.jobs.list({ limit: 10 });
    if (!jobs.length) return "Sin trabajos registrados.";
    return jobs.map((job) => `${job.id} ${job.level} ${job.status} - ${job.instruction.slice(0, 70)}`).join("\n");
  }

  bridgeText() {
    const bridge = this.getBridgeStatus ? this.getBridgeStatus() : null;
    if (!bridge) return "Puente Qoder sin configurar.";
    return [
      `Puente: ${bridge.online ? "en linea" : "fuera de linea"}`,
      `Ultimo latido: ${bridge.lastSeenAt ? new Date(bridge.lastSeenAt).toLocaleString("es-CO") : "nunca"}`,
      `Trabajo activo: ${bridge.activeJobId || "ninguno"}`,
      `Pendientes: ${bridge.queued || 0}`
    ].join("\n");
  }

  simulate(text, { chatId = "dry-run-chat", kind = "message" } = {}) {
    if (kind === "callback") {
      return this.handleUpdate({ callback_query: { id: `sim-${Date.now()}`, data: text, message: { chat: { id: chatId } } } });
    }
    return this.handleUpdate({
      message: {
        message_id: Date.now(),
        chat: { id: chatId },
        from: { id: chatId },
        text
      }
    });
  }

  status() {
    return {
      mode: this.mode,
      configured: Boolean(this.config.telegram.token),
      allowedCount: this.allowedChatIds.size,
      running: this.running,
      outbox: this.outbox.length,
      pairing: this.pairingState(),
      lastEvent: this.events[0] || null
    };
  }
}

module.exports = { TelegramChannel, telegramCall, chunkText };
