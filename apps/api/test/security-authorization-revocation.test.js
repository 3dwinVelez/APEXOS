const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { authorizationDecision } = require("../src/security/authorizationState");

const future = new Date(Date.now() + 60000);
const user = { id: 7, active: true, authorization_version: 3 };
const tenant = { active: true, authorization_version: 5 };
const payload = { id: 7, sid: "session-a", uv: 3, tv: 5 };

test("acepta una sesion y versiones vigentes", () => {
  assert.equal(authorizationDecision(payload, user, tenant, { user_id: 7, revoked_at: null, expires_at: future }), "");
});

test("revocacion selectiva no invalida otra sesion", () => {
  const revoked = { user_id: 7, revoked_at: new Date(), expires_at: future };
  assert.equal(authorizationDecision(payload, user, tenant, revoked), "SESSION_REVOKED");
  assert.equal(authorizationDecision({ ...payload, sid: "session-b" }, user, tenant, { user_id: 7, revoked_at: null, expires_at: future }), "");
});

test("incrementar version revoca globalmente tokens anteriores", () => {
  assert.equal(authorizationDecision(payload, { ...user, authorization_version: 4 }, tenant, { user_id: 7, revoked_at: null, expires_at: future }), "USER_VERSION_STALE");
});

test("el calculo local de decision tiene sobrecosto despreciable", () => {
  const session = { user_id: 7, revoked_at: null, expires_at: future };
  const started = performance.now();
  for (let index = 0; index < 100000; index += 1) authorizationDecision(payload, user, tenant, session);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 250, `100000 decisiones tardaron ${elapsed.toFixed(2)} ms`);
});
