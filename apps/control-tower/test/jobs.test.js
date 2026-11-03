"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Jobs, LEVELS, envelopeFor } = require("../lib/jobs");

function makeStore() {
  return {
    jobs: [],
    setJobs(jobs) {
      this.jobs = jobs;
    }
  };
}

test("N1 entra en cola y N2 espera aprobacion", () => {
  const jobs = new Jobs({ store: makeStore() });
  const analyze = jobs.create({ instruction: "revisa el estado de las colas", level: "N1" });
  const implement = jobs.create({ instruction: "corrige el reintento de colas", level: "N2" });

  assert.equal(analyze.ok, true);
  assert.equal(analyze.job.status, "queued");
  assert.equal(implement.ok, true);
  assert.equal(implement.job.status, "awaiting_approval");
  assert.equal(implement.job.target.branch, "desarrollo");
});

test("N4 nunca se crea desde la torre", () => {
  const jobs = new Jobs({ store: makeStore() });
  const result = jobs.create({ instruction: "despliega a produccion ahora", level: "N4" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "NIVEL_HUMANO");
  assert.equal(LEVELS.N4.humanOnly, true);
});

test("aprobacion, reclamo y cierre con evidencia", () => {
  const jobs = new Jobs({ store: makeStore() });
  const created = jobs.create({ instruction: "agrega prueba de regresion al monitor", level: "N2" });
  const id = created.job.id;

  assert.equal(jobs.claim({ bridgeId: "bridge-1" }).ok, false);
  assert.equal(jobs.approve(id, { approvedBy: "telegram" }).ok, true);

  const claimed = jobs.claim({ bridgeId: "bridge-1" });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.job.status, "claimed");
  assert.equal(claimed.envelope.scope.branch, "desarrollo");
  assert.equal(claimed.envelope.scope.allowPush, false);
  assert.equal(claimed.envelope.scope.allowDeploy, false);
  assert.ok(claimed.envelope.rules.some((rule) => rule.includes("push")));

  assert.equal(jobs.claim({ bridgeId: "bridge-2" }).code, "TRABAJO_ACTIVO");
  assert.equal(jobs.heartbeat(id, "bridge-2").code, "NO_ASIGNADO");
  assert.equal(jobs.heartbeat(id, "bridge-1").ok, true);

  const completed = jobs.complete(id, "bridge-1", { status: "completed", summary: "Listo", evidence: ["docs/qa/evidencia.json"], tests: { passed: 3, failed: 0 } });
  assert.equal(completed.ok, true);
  assert.equal(completed.job.status, "completed");
  assert.deepEqual(completed.job.result.evidence, ["docs/qa/evidencia.json"]);
});

test("rechazo y cancelacion respetan estados", () => {
  const jobs = new Jobs({ store: makeStore() });
  const pending = jobs.create({ instruction: "ajusta el panel de control local", level: "N2" }).job;
  assert.equal(jobs.reject(pending.id, { rejectedBy: "telegram" }).ok, true);
  assert.equal(jobs.reject(pending.id, { rejectedBy: "telegram" }).code, "ESTADO_INVALIDO");

  const queued = jobs.create({ instruction: "analiza la salud de la api", level: "N1" }).job;
  assert.equal(jobs.cancel(queued.id, { by: "web" }).ok, true);
  assert.equal(jobs.cancel(queued.id, { by: "web" }).code, "ESTADO_INVALIDO");
});

test("reclamo vencido se detecta con el reloj inyectado", () => {
  let now = 1000000;
  const jobs = new Jobs({ store: makeStore(), now: () => now });
  const created = jobs.create({ instruction: "implementa el monitor de ramas", level: "N2" }).job;
  jobs.approve(created.id, { approvedBy: "test" });
  jobs.claim({ bridgeId: "bridge-x" });

  now += 31000;
  const stale = jobs.staleClaim({ offlineMs: 30000 });
  assert.equal(stale.id, created.id);

  jobs.heartbeat(created.id, "bridge-x");
  assert.equal(jobs.staleClaim({ offlineMs: 30000 }), null);
});

test("envelope de lectura no permite cambios", () => {
  const job = { id: "JOB-1", level: "N1", instruction: "observa", target: { repo: "APEXOS", branch: null } };
  const envelope = envelopeFor(job);
  assert.equal(envelope.scope.allowCodeChanges, false);
  assert.equal(envelope.scope.branch, "lectura");
});

test("cola limita trabajos abiertos", () => {
  const jobs = new Jobs({ store: makeStore() });
  for (let index = 0; index < 20; index += 1) {
    assert.equal(jobs.create({ instruction: `analisis numero ${index}`, level: "N1" }).ok, true);
  }
  assert.equal(jobs.create({ instruction: "analisis adicional bloqueado", level: "N1" }).code, "COLA_LLENA");
});
