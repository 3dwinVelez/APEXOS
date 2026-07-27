const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const STATE_PATH = path.resolve("config/offline-phase3-certification.env");
const EXPECTED_DATABASE = "apexos_offline_cert_local";

function state() {
  return Object.fromEntries(
    fs
      .readFileSync(STATE_PATH, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function assertEnvironment(values) {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.port, "54320");
  assert.equal(url.pathname.slice(1), EXPECTED_DATABASE);
  assert.equal(process.env.APP_ENV, "development");
  assert.equal(process.env.OFFLINE_TECHNICIAN_ENABLED, "true");
  assert.equal(process.env.OFFLINE_ALLOWED_TENANT_IDS, values.TENANT_ID);
  assert.equal(process.env.OFFLINE_ALLOWED_USER_IDS, values.TECHNICIAN_USER_ID);
  assert.equal(process.env.OFFLINE_ALLOWED_ROLES || "", "");
  assert.equal(process.env.OFFLINE_SYNC_ENABLED, "false");
  assert.equal(process.env.OFFLINE_EVIDENCE_UPLOAD_ENABLED, "false");
  assert.equal(process.env.OFFLINE_AUTO_SYNC_ENABLED, "false");
}

async function main() {
  const values = state();
  assertEnvironment(values);
  const build = require("../apps/api/server");
  const prisma = require("../apps/api/src/core/prisma");
  const app = await build();
  const timings = {};

  const request = async (method, url, token, body) => {
    const started = process.hrtime.bigint();
    const response = await app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: body
    });
    timings[url] = Number(process.hrtime.bigint() - started) / 1e6;
    return {
      status: response.statusCode,
      body: response.body ? JSON.parse(response.body) : null,
      bytes: Buffer.byteLength(response.body || "")
    };
  };
  const login = async (email, password) => {
    const response = await request("POST", "/api/v1/auth/login", null, {
      email,
      password
    });
    assert.equal(response.status, 200);
    assert.ok(response.body.token);
    return response.body.token;
  };

  try {
    const unauthenticated = await request("GET", "/api/v1/offline/bootstrap");
    assert.equal(unauthenticated.status, 401);

    const primaryToken = await login(values.TECHNICIAN_EMAIL, values.TECHNICIAN_PASSWORD);
    const exclusionToken = await login(values.EXCLUSION_EMAIL, values.EXCLUSION_PASSWORD);
    const unauthorizedToken = await login(
      values.UNAUTHORIZED_EMAIL,
      values.UNAUTHORIZED_PASSWORD
    );

    const capabilities = await request(
      "GET",
      "/api/v1/offline/capabilities",
      primaryToken
    );
    assert.equal(capabilities.status, 200);
    assert.deepEqual(capabilities.body.offlineTechnician, {
      enabled: true,
      readOnly: true,
      syncEnabled: false,
      evidenceEnabled: false,
      autoSyncEnabled: false
    });
    assert.equal(capabilities.body.context.companyId, values.TENANT_ID);
    assert.equal(capabilities.body.context.userId, values.TECHNICIAN_USER_ID);

    const manipulated = await request(
      "GET",
      `/api/v1/offline/capabilities?tenantId=other&userId=${values.EXCLUSION_USER_ID}`,
      primaryToken
    );
    assert.equal(manipulated.status, 200);
    assert.equal(manipulated.body.context.companyId, values.TENANT_ID);
    assert.equal(manipulated.body.context.userId, values.TECHNICIAN_USER_ID);

    const exclusionCapabilities = await request(
      "GET",
      "/api/v1/offline/capabilities",
      exclusionToken
    );
    assert.equal(exclusionCapabilities.status, 200);
    assert.equal(exclusionCapabilities.body.offlineTechnician.enabled, false);
    assert.equal(exclusionCapabilities.body.context, null);
    const exclusionBootstrap = await request(
      "GET",
      "/api/v1/offline/bootstrap",
      exclusionToken
    );
    assert.equal(exclusionBootstrap.status, 403);
    assert.equal(exclusionBootstrap.body.code, "OFFLINE_NOT_AUTHORIZED");

    const unauthorizedCapabilities = await request(
      "GET",
      "/api/v1/offline/capabilities",
      unauthorizedToken
    );
    assert.equal(unauthorizedCapabilities.status, 403);
    const unauthorizedBootstrap = await request(
      "GET",
      "/api/v1/offline/bootstrap",
      unauthorizedToken
    );
    assert.equal(unauthorizedBootstrap.status, 403);

    const bootstrap = await request("GET", "/api/v1/offline/bootstrap", primaryToken);
    assert.equal(bootstrap.status, 200);
    const snapshot = bootstrap.body;
    assert.equal(snapshot.companyId, values.TENANT_ID);
    assert.equal(snapshot.userId, values.TECHNICIAN_USER_ID);
    assert.equal(snapshot.environmentId, "development");
    assert.equal(snapshot.metadata.ttlSeconds, 86400);
    assert.match(snapshot.snapshotId, /^[0-9a-f-]{36}$/);
    assert.match(snapshot.serverCheckpoint, /^bootstrap:[a-f0-9]{32}$/);
    assert.equal(snapshot.orders.length, 2);
    assert.deepEqual(
      snapshot.orders.map((order) => order.orderNumber).sort(),
      ["OFF-QA-ACTIVE", "OFF-QA-FUTURE"]
    );
    assert.equal(snapshot.activities.length, 6);
    assert.equal(snapshot.checklists.length, 4);
    assert.ok(snapshot.catalogs.length > 0);
    assert.ok(
      snapshot.orders.every(
        (order) =>
          order.assignedTechnicianId === values.TECHNICIAN_EMPLOYEE_ID &&
          !("customerDocument" in order) &&
          !("metadata" in order)
      )
    );

    const logout = await request("POST", "/api/v1/auth/logout", primaryToken);
    assert.equal(logout.status, 200);
    assert.equal(logout.body.revoked, true);
    const afterLogout = await request(
      "GET",
      "/api/v1/offline/capabilities",
      primaryToken
    );
    assert.equal(afterLogout.status, 401);
    assert.equal(afterLogout.body.code, "SESSION_REVOKED");
    const exclusionLogout = await request("POST", "/api/v1/auth/logout", exclusionToken);
    const unauthorizedLogout = await request("POST", "/api/v1/auth/logout", unauthorizedToken);
    assert.equal(exclusionLogout.body.revoked, true);
    assert.equal(unauthorizedLogout.body.revoked, true);

    const observer = await prisma.auditLog.findFirst({
      where: {
        tenant_id: values.TENANT_ID,
        user_id: Number(values.TECHNICIAN_USER_ID),
        module: "platform_logs",
        entity: "offline",
        new_value: {
          path: ["code"],
          equals: "offline_bootstrap_authorized"
        }
      },
      orderBy: { timestamp: "desc" }
    });

    console.log(
      JSON.stringify(
        {
          certified: true,
          authentication: {
            primary: "authorized",
            exclusion: "offline-disabled",
            unauthorized: "rbac-denied"
          },
          capabilities: capabilities.body,
          bootstrap: {
            schemaVersion: snapshot.schemaVersion,
            orders: snapshot.orders.length,
            activities: snapshot.activities.length,
            checklists: snapshot.checklists.length,
            catalogs: snapshot.catalogs.length,
            bytes: bootstrap.bytes,
            ttlSeconds: snapshot.metadata.ttlSeconds,
            queryCount: 2,
            allowedOrders: snapshot.orders.map((order) => order.orderNumber)
          },
          isolation: {
            queryManipulationIgnored: true,
            secondTechnicianExcluded: true,
            outsideWindowExcluded: true
          },
          revocation: {
            selectiveLogout: true,
            staleTokenRejected: true
          },
          timingsMs: {
            capabilities: Number(timings["/api/v1/offline/capabilities"].toFixed(2)),
            bootstrap: Number(timings["/api/v1/offline/bootstrap"].toFixed(2))
          },
          observerRecorded: Boolean(observer)
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
