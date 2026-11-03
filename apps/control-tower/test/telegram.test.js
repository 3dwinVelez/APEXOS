"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Jobs } = require("../lib/jobs");
const { TelegramChannel } = require("../lib/telegram");

function makeStore() {
  return {
    jobs: [],
    alerts: [],
    events: [],
    allowlist: null,
    setJobs(jobs) {
      this.jobs = jobs;
    },
    addAlert(alert) {
      this.alerts.unshift(alert);
    },
    updateAlert(id, patch) {
      const index = this.alerts.findIndex((alert) => alert.id === id);
      if (index < 0) return null;
      this.alerts[index] = { ...this.alerts[index], ...patch };
      return this.alerts[index];
    },
    addEvent(event) {
      this.events.unshift(event);
    },
    readAux() {
      return this.allowlist;
    },
    writeAux(name, value) {
      this.allowlist = value;
      return true;
    }
  };
}

function makeChannel(store) {
  const config = {
    telegram: {
      token: "",
      mode: "dry-run",
      allowedChatIds: ["100"],
      pollTimeoutS: 1,
      rateLimitPerMin: 100,
      pairingTtlMs: 600000
    }
  };
  const jobs = new Jobs({ store });
  const alerts = {
    acknowledged: [],
    list: () => [],
    acknowledge(id, options) {
      this.acknowledged.push({ id, ...options });
      return { id };
    }
  };
  const channel = new TelegramChannel({
    config,
    jobs,
    alerts,
    store,
    getSnapshot: () => ({ at: new Date().toISOString(), overall: "ok", summary: { ok: 8, total: 8 }, checks: [] }),
    getGit: () => null,
    getBridgeStatus: () => ({ online: false, queued: 0 })
  });
  return { channel, jobs, alerts };
}

async function lastMessage(channel) {
  return channel.outbox[0] ? channel.outbox[0].text : "";
}

test("chat no autorizado solo puede emparejar", async () => {
  const store = makeStore();
  const { channel } = makeChannel(store);

  await channel.simulate("/estado", { chatId: "999" });
  assert.match(await lastMessage(channel), /no autorizado/i);

  const pairing = channel.createPairingCode();
  await channel.simulate(`/pair ${pairing.code}`, { chatId: "999" });
  assert.match(await lastMessage(channel), /Emparejamiento exitoso/);
  assert.equal(channel.isAllowed("999"), true);
  assert.deepEqual(store.allowlist, ["100", "999"]);
});

test("codigo de emparejamiento incorrecto no autoriza", async () => {
  const { channel } = makeChannel(makeStore());
  channel.createPairingCode();
  await channel.simulate("/pair 000000", { chatId: "999" });
  assert.equal(channel.isAllowed("999"), false);
  assert.match(await lastMessage(channel), /incorrecto|vencido/i);
});

test("/impl crea N2 con aprobacion y /aprobar lo encola", async () => {
  const { channel, jobs } = makeChannel(makeStore());
  await channel.simulate("/impl corrige el reintento de la cola de correo", { chatId: "100" });

  const job = jobs.jobs[0];
  assert.equal(job.level, "N2");
  assert.equal(job.status, "awaiting_approval");
  assert.equal(job.target.branch, "desarrollo");
  assert.match(await lastMessage(channel), /requiere aprobacion/i);

  await channel.simulate(`/aprobar ${job.id}`, { chatId: "100" });
  assert.equal(jobs.get(job.id).status, "queued");
  assert.match(await lastMessage(channel), /aprobado y en cola/);
});

test("texto libre se registra como N1 y /qa como N3", async () => {
  const { channel, jobs } = makeChannel(makeStore());
  await channel.simulate("revisa por que la api responde lento", { chatId: "100" });
  assert.equal(jobs.jobs[0].level, "N1");
  assert.equal(jobs.jobs[0].status, "queued");

  await channel.simulate("/qa certifica el flujo de facturas", { chatId: "100" });
  assert.equal(jobs.jobs[0].level, "N3");
  assert.equal(jobs.jobs[0].status, "awaiting_approval");
});

test("callback de aprobacion y reconocimiento de alerta", async () => {
  const { channel, jobs, alerts } = makeChannel(makeStore());
  const created = jobs.create({ instruction: "ajusta el panel de la torre local", level: "N2" }).job;

  await channel.handleUpdate({ callback_query: { id: "cb-1", data: `approve:${created.id}`, message: { chat: { id: 100 } } } });
  assert.equal(jobs.get(created.id).status, "queued");

  await channel.handleUpdate({ callback_query: { id: "cb-2", data: "ack:ALR-123", message: { chat: { id: 100 } } } });
  assert.deepEqual(alerts.acknowledged[0], { id: "ALR-123", by: "telegram:100" });
});

test("comandos N4 no existen y nivel invalido no crea trabajo", async () => {
  const { channel, jobs } = makeChannel(makeStore());
  await channel.simulate("/impl desplegar a produccion", { chatId: "100" });
  assert.equal(jobs.jobs.length, 1, "solo se acepta como N2 y requiere aprobacion");
  assert.equal(jobs.jobs[0].level, "N2");
});
