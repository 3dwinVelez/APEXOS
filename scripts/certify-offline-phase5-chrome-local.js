const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const WEB = "http://127.0.0.1:3001";
const API = "http://127.0.0.1:3100";
const STATE = path.resolve("config/offline-phase3-certification.env");
const PROFILE = path.join(os.tmpdir(), "apexos-offline-phase5-chrome");
const EVIDENCE = path.resolve("docs/offline/evidence/phase5");

function readState() {
  return Object.fromEntries(
    fs.readFileSync(STATE, "utf8").split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: PROFILE,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync"
    ]
  });
}

async function clickText(page, label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((item) =>
      (item.textContent || "").trim().startsWith(text)
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);
  assert.equal(clicked, true, `No se encontro el boton ${label}.`);
}

async function login(page, email, password) {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle0" });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await clickText(page, "Entrar");
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 15_000 });
}

async function offlineDatabase(page) {
  return page.evaluate(async () => {
    const selected = (await indexedDB.databases()).find((item) =>
      item.name?.startsWith("apexos-offline-v2-")
    );
    if (!selected?.name) return null;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(selected.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return { name: selected.name, stores: Array.from(db.objectStoreNames) };
  });
}

async function seedOperation(page, status = "PENDING") {
  return page.evaluate(async (requestedStatus) => {
    const selected = (await indexedDB.databases()).find((item) =>
      item.name?.startsWith("apexos-offline-v2-")
    );
    if (!selected?.name) throw new Error("OFFLINE_DATABASE_MISSING");
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(selected.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const schemaTx = db.transaction(["offlineSchemaState", "offlineMetadata"], "readonly");
    const read = (store, key) => new Promise((resolve, reject) => {
      const request = schemaTx.objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [installation, metadata] = await Promise.all([
      read("offlineSchemaState", "installation"),
      read("offlineMetadata", "snapshot")
    ]);
    const now = new Date();
    const operationId = crypto.randomUUID();
    const operation = {
      operationId,
      idempotencyKey: `phase5-browser:${operationId}`,
      environmentId: metadata.environmentId,
      companyId: metadata.companyId,
      userId: metadata.userId,
      installationId: installation.installationId,
      entityType: "test_fixture",
      entityId: "phase5-browser",
      operationType: "TEST_OPERATION",
      payload: { marker: "phase5-browser-certification" },
      baseVersion: 0,
      sequence: now.getTime(),
      createdAtDevice: now.toISOString(),
      createdAtLocal: now.toISOString(),
      updatedAtLocal: now.toISOString(),
      status: requestedStatus,
      retryCount: 0,
      nextRetryAt: null,
      lastAttemptAt:
        requestedStatus === "PROCESSING"
          ? new Date(now.getTime() - 10 * 60 * 1000).toISOString()
          : null,
      lastErrorCode: null,
      lastErrorCategory: null,
      dependsOn: [],
      schemaVersion: 1
    };
    const tx = db.transaction(["offlineOperations"], "readwrite");
    await new Promise((resolve, reject) => {
      const request = tx.objectStore("offlineOperations").put(operation);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    db.close();
    return operation;
  }, status);
}

async function operationStatus(page, operationId) {
  return page.evaluate(async (id) => {
    const selected = (await indexedDB.databases()).find((item) =>
      item.name?.startsWith("apexos-offline-v2-")
    );
    if (!selected?.name) return "DATABASE_MISSING";
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(selected.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["offlineOperations"], "readonly");
    const value = await new Promise((resolve, reject) => {
      const request = tx.objectStore("offlineOperations").get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value?.status || "MISSING";
  }, operationId);
}

async function waitForStatus(page, operationId, expected) {
  await page.waitForFunction(
    async (id, status) => {
      const selected = (await indexedDB.databases()).find((item) =>
        item.name?.startsWith("apexos-offline-v2-")
      );
      if (!selected?.name) return false;
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(selected.name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(["offlineOperations"], "readonly");
      const value = await new Promise((resolve, reject) => {
        const request = tx.objectStore("offlineOperations").get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value?.status === status;
    },
    { timeout: 15_000 },
    operationId,
    expected
  );
}

async function openServices(page) {
  await page.goto(`${WEB}/dashboard/servicios`, { waitUntil: "networkidle0" });
  await page.waitForSelector("body");
}

function receiptCount(operationId) {
  assert.match(operationId, /^[0-9a-f-]{36}$/);
  return Number(execFileSync(
    "docker",
    [
      "exec",
      "infra-offline-cert-postgres-1",
      "psql",
      "-U",
      "apex_offline_cert",
      "-d",
      "apexos_offline_cert_local",
      "-Atc",
      `SELECT count(*) FROM "OfflineSyncReceipt" WHERE "operation_id"='${operationId}'`
    ],
    { encoding: "utf8" }
  ).trim());
}

async function main() {
  assert.ok(fs.existsSync(CHROME), "Google Chrome no esta instalado.");
  const resolvedProfile = path.resolve(PROFILE);
  assert.ok(resolvedProfile.startsWith(path.resolve(os.tmpdir())));
  fs.rmSync(resolvedProfile, { recursive: true, force: true });
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const credentials = readState();
  const result = {
    certified: false,
    browser: "Google Chrome",
    profile: "temporary-isolated",
    database: "local-54320",
    operations: {}
  };

  let browser = await launch();
  let page = await browser.newPage();
  await login(page, credentials.TECHNICIAN_EMAIL, credentials.TECHNICIAN_PASSWORD);
  await openServices(page);
  await clickText(page, "Preparar");
  await page.waitForFunction(() =>
    document.body.innerText.includes("Informacion almacenada en este dispositivo.")
  );
  assert.ok(await offlineDatabase(page));
  console.log("phase5-browser: snapshot-ready");

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().startsWith(API)) request.abort();
    else request.continue();
  });
  const pending = await seedOperation(page);
  assert.equal(await operationStatus(page, pending.operationId), "PENDING");
  await page.screenshot({ path: path.join(EVIDENCE, "01-pending-offline.png"), fullPage: true });
  await browser.close();
  console.log("phase5-browser: pending-persisted");

  browser = await launch();
  page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().startsWith(API)) request.abort();
    else request.continue();
  });
  await openServices(page);
  assert.equal(await operationStatus(page, pending.operationId), "PENDING");
  await browser.close();

  browser = await launch();
  page = await browser.newPage();
  await openServices(page);
  await clickText(page, "Sincronizar");
  await waitForStatus(page, pending.operationId, "CONFIRMED");
  await page.screenshot({ path: path.join(EVIDENCE, "02-confirmed.png"), fullPage: true });

  const replay = await page.evaluate(async (api, operation) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${api}/api/v1/offline/sync/push`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        installationId: operation.installationId,
        operations: [{
          operationId: operation.operationId,
          idempotencyKey: operation.idempotencyKey,
          operationType: operation.operationType,
          payload: operation.payload,
          baseVersion: operation.baseVersion,
          createdAtDevice: operation.createdAtDevice
        }]
      })
    });
    return { status: response.status, body: await response.json() };
  }, API, pending);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.results[0].status, "ALREADY_APPLIED");
  console.log("phase5-browser: applied-and-replayed");

  const interrupted = await seedOperation(page, "PROCESSING");
  await browser.close();
  browser = await launch();
  page = await browser.newPage();
  await openServices(page);
  await clickText(page, "Sincronizar");
  await waitForStatus(page, interrupted.operationId, "CONFIRMED");
  await page.screenshot({ path: path.join(EVIDENCE, "03-recovered.png"), fullPage: true });

  assert.equal(receiptCount(pending.operationId), 1);
  assert.equal(receiptCount(interrupted.operationId), 1);
  console.log("phase5-browser: interruption-recovered");

  const logoutLabel = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((item) =>
      (item.textContent || "").trim().startsWith("Cerrar sesion")
    )
      ? "Cerrar sesion"
      : "Salir"
  );
  await clickText(page, logoutLabel);
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 10_000 });
  await page.waitForFunction(async () =>
    !(await indexedDB.databases()).some((item) =>
      item.name?.startsWith("apexos-offline-v2-")
    )
  );
  await page.screenshot({ path: path.join(EVIDENCE, "04-after-logout.png"), fullPage: true });

  result.certified = true;
  result.operations = {
    persistedAcrossRestart: "PENDING",
    first: "APPLIED",
    localAfterSync: "CONFIRMED",
    replay: "ALREADY_APPLIED",
    interruptedRecovery: "CONFIRMED",
    receiptCountPerOperation: 1,
    logoutDatabase: "DELETED"
  };
  fs.writeFileSync(
    path.join(EVIDENCE, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`
  );
  await browser.close();
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
