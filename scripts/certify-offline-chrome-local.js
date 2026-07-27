const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const WEB = "http://127.0.0.1:3001";
const API_ORIGIN = "http://127.0.0.1:3100";
const STATE = path.resolve("config/offline-phase3-certification.env");
const PROFILE = path.join(os.tmpdir(), "apexos-offline-phase3-4-chrome");
const EVIDENCE = path.resolve("docs/offline/evidence/phase3-4");
let activeBrowser = null;

function offlineChunkName() {
  const chunkDirectory = path.resolve("apps/web/.next/static/chunks");
  const match = fs.readdirSync(chunkDirectory)
    .filter((name) => name.endsWith(".js"))
    .find((name) =>
      fs.readFileSync(path.join(chunkDirectory, name), "utf8").includes("DexieOfflineStorageAdapter")
    );
  assert.ok(match, "No se encontro el chunk offline diferido.");
  return match;
}

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
      "--disable-sync",
      "--disable-features=Translate,MediaRouter"
    ]
  });
}

function captureOfflineDiagnostics(page, target) {
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("[offline]")) target.push(text);
  });
}

async function databaseState(page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const selected = databases.find((item) => item.name?.startsWith("apexos-offline-v2-"));
    if (!selected?.name) return { databases: databases.map((item) => item.name), selected: null };
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(selected.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = Array.from(db.objectStoreNames);
    const tx = db.transaction(stores, "readonly");
    const counts = {};
    for (const store of stores) {
      counts[store] = await new Promise((resolve, reject) => {
        const request = tx.objectStore(store).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    const metadata = stores.includes("offlineMetadata")
      ? await new Promise((resolve, reject) => {
          const request = tx.objectStore("offlineMetadata").getAll();
          request.onsuccess = () => resolve(request.result[0] || null);
          request.onerror = () => reject(request.error);
        })
      : null;
    const installation = stores.includes("offlineSchemaState")
      ? await new Promise((resolve, reject) => {
          const request = tx.objectStore("offlineSchemaState").get("installation");
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        })
      : null;
    db.close();
    return {
      databases: databases.map((item) => item.name),
      selected: {
        derivedName: /^apexos-offline-v2-(?:[a-f0-9]{24}-){2}[a-f0-9]{24}$/.test(selected.name),
        stores,
        counts,
        metadata: metadata ? {
          schemaVersion: metadata.schemaVersion,
          generatedAt: metadata.generatedAt,
          expiresAt: metadata.expiresAt,
          hasInstallationId: Boolean(installation?.installationId),
          hasSnapshotId: Boolean(metadata.snapshotId),
          hasServerCheckpoint: Boolean(metadata.serverCheckpoint)
        } : null
      }
    };
  });
}

async function clickText(page, text) {
  const clicked = await page.evaluate((label) => {
    const element = [...document.querySelectorAll("button")].find(
      (candidate) => {
        const text = candidate.textContent?.trim() || "";
        return text === label || text.startsWith(label);
      }
    );
    if (!element) return false;
    element.click();
    return true;
  }, text);
  assert.equal(clicked, true, `No se encontro el boton ${text}`);
}

async function login(page, email, password) {
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Entrar"
    );
    return button && !button.disabled;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await clickText(page, "Entrar");
  try {
    await page.waitForFunction(() => location.pathname !== "/login", { timeout: 10_000 });
  } catch {
    const state = await page.evaluate(() => ({
      path: location.pathname,
      text: document.body.innerText.slice(0, 800),
      emailLength: document.querySelector('input[name="email"]')?.value.length || 0,
      passwordLength: document.querySelector('input[name="password"]')?.value.length || 0
    }));
    throw new Error(`LOGIN_DID_NOT_NAVIGATE ${JSON.stringify(state)}`);
  }
}

async function visibleState(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const writeLabels = [
      "Iniciar servicio", "Finalizar servicio", "Completar actividad",
      "Editar checklist", "Agregar observacion", "Agregar evidencia",
      "Tomar fotografia", "Registrar ubicacion"
    ];
    return {
      url: location.pathname,
      offlineIndicator: text.includes("Sin conexion - estas consultando datos guardados"),
      localReadOnly: text.includes("Consulta local de solo lectura"),
      lastUpdated: text.includes("Ultima actualizacion:"),
      activeOrder: text.includes("OFF-QA-ACTIVE"),
      futureOrder: text.includes("OFF-QA-FUTURE"),
      otherTechnicianOrder: text.includes("OFF-QA-OTHER-TECH"),
      outsideWindowOrder: text.includes("OFF-QA-OUTSIDE"),
      activities: text.toLowerCase().includes("actividades"),
      checklist: text.toLowerCase().includes("checklist"),
      expiredWarning: text.includes("informacion guardada esta desactualizada"),
      writeControls: writeLabels.filter((label) => text.includes(label))
    };
  });
}

async function expireSnapshot(page) {
  return page.evaluate(async () => {
    const selected = (await indexedDB.databases()).find(
      (item) => item.name?.startsWith("apexos-offline-v2-")
    );
    if (!selected?.name) return false;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(selected.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["offlineMetadata"], "readwrite");
    const store = tx.objectStore("offlineMetadata");
    const rows = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = rows[0];
    row.expiresAt = new Date(Date.now() - 60_000).toISOString();
    store.put(row);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  });
}

async function staleVersionSummary(page) {
  return page.evaluate(async (apiOrigin) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${apiOrigin}/api/v1/offline/bootstrap`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const snapshot = await response.json();
    const selected = (await indexedDB.databases()).find(
      (item) => item.name?.startsWith("apexos-offline-v2-")
    );
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(selected.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const definitions = [
      ["orders", "offlineOrders"],
      ["activities", "offlineActivities"],
      ["checklists", "offlineChecklists"],
      ["catalogs", "offlineCatalogs"]
    ];
    const summary = {};
    for (const [field, storeName] of definitions) {
      const tx = db.transaction([storeName], "readonly");
      const stored = await new Promise((resolve, reject) => {
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const versions = new Map(stored.map((item) => [item.serverId, item.serverVersion]));
      summary[field] = {
        stored: stored.length,
        incoming: snapshot[field].length,
        lower: snapshot[field].filter(
          (item) => versions.has(item.serverId) && item.serverVersion < versions.get(item.serverId)
        ).length
      };
    }
    db.close();
    return summary;
  }, API_ORIGIN);
}

async function main() {
  assert.ok(fs.existsSync(CHROME), "Chrome real no esta instalado.");
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const credentials = readState();
  const result = {
    browser: "Google Chrome",
    version: "",
    profile: "temporary-isolated",
    steps: {},
    defects: []
  };
  const offlineChunk = offlineChunkName();

  let browser = await launch();
  activeBrowser = browser;
  console.log("STEP chrome-launched");
  result.version = await browser.version();
  let page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`BROWSER_ERROR ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    console.log(`REQUEST_FAILED ${request.url()} ${request.failure()?.errorText || ""}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) console.log(`HTTP_${response.status()} ${response.url()}`);
  });
  const diagnostics = [];
  captureOfflineDiagnostics(page, diagnostics);
  await page.setViewport({ width: 1440, height: 1000 });
  const requests = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/offline/")) {
      requests.push({ path: new URL(response.url()).pathname, status: response.status() });
    }
  });

  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  console.log("STEP initial-page");
  result.steps.initial = {
    indexedDb: await databaseState(page),
    serviceWorkers: await page.evaluate(async () =>
      (await navigator.serviceWorker?.getRegistrations?.() || []).length
    )
  };
  assert.equal(result.steps.initial.indexedDb.selected, null);
  assert.equal(result.steps.initial.serviceWorkers, 0);

  await login(page, credentials.TECHNICIAN_EMAIL, credentials.TECHNICIAN_PASSWORD);
  console.log("STEP login");
  assert.ok(page.url().endsWith("/dashboard/servicios"));
  await page.waitForFunction(() => document.body.innerText.includes("Preparar trabajo sin conexion"));
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent?.trim() === "Preparar"
    )
  );
  result.steps.login = { path: new URL(page.url()).pathname, panel: true };

  const hydrationStarted = performance.now();
  await clickText(page, "Preparar");
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes("Informacion almacenada en este dispositivo.") ||
      text.includes("No fue posible preparar los datos.");
  });
  const hydrationMessage = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes("Informacion almacenada en este dispositivo.")
      ? "stored"
      : "degraded";
  });
  if (hydrationMessage !== "stored") {
    throw new Error(`HYDRATION_DEGRADED ${JSON.stringify(await databaseState(page))}`);
  }
  console.log("STEP hydrated");
  result.steps.hydration = {
    durationMs: Number((performance.now() - hydrationStarted).toFixed(2)),
    requests,
    indexedDb: await databaseState(page)
  };
  const hydrated = result.steps.hydration.indexedDb.selected;
  assert.equal(hydrated.derivedName, true);
  assert.equal(hydrated.counts.offlineOrders, 2);
  assert.equal(hydrated.counts.offlineActivities, 6);
  assert.equal(hydrated.counts.offlineChecklists, 4);
  assert.equal(hydrated.metadata.hasInstallationId, true);
  assert.equal(hydrated.metadata.hasSnapshotId, true);
  assert.equal(hydrated.metadata.hasServerCheckpoint, true);
  for (const forbidden of ["operations", "evidence", "conflicts", "uploads"]) {
    assert.equal(hydrated.stores.some((store) => store.toLowerCase().includes(forbidden)), false);
  }
  await page.screenshot({ path: path.join(EVIDENCE, "01-prepared.png") });

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().startsWith(API_ORIGIN)) request.abort("failed");
    else request.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForFunction(() => document.body.innerText.includes("Sin conexion"));
  console.log("STEP offline-indicator");
  await page.reload({ waitUntil: "domcontentloaded" });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const reloadText = await page.evaluate(() => document.body.innerText);
  if (!page.url().endsWith("/dashboard/servicios")) {
    throw new Error(`OFFLINE_RELOAD_REDIRECTED ${new URL(page.url()).pathname}`);
  }
  if (!reloadText.toLowerCase().includes("consulta local de solo lectura")) {
    const localSession = await page.evaluate(() => {
      const context = localStorage.getItem("apex_offline_authorized_context_v1");
      const token = localStorage.getItem("token");
      return {
        hasContext: Boolean(context),
        hasToken: Boolean(token),
        contextParseable: (() => {
          try { return Boolean(JSON.parse(context || "null")); } catch { return false; }
        })()
      };
    });
    throw new Error(
      `OFFLINE_RELOAD_NO_LOCAL_VIEW ${JSON.stringify({
        text: reloadText.slice(0, 1600),
        localSession,
        indexedDb: await databaseState(page)
      })}`
    );
  }
  console.log("STEP offline-reload");
  await clickText(page, "OFF-QA-ACTIVE");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const detailDebug = await page.evaluate(() => ({
    texts: [...document.querySelectorAll("button")]
      .filter((button) => button.textContent?.includes("OFF-QA-"))
      .map((button) => ({
        text: button.textContent?.trim().slice(0, 100),
        expanded: button.getAttribute("aria-expanded")
      })),
    hasActivities: document.body.innerText.toLowerCase().includes("actividades"),
    hasChecklist: document.body.innerText.toLowerCase().includes("checklist")
  }));
  if (!detailDebug.hasActivities || !detailDebug.hasChecklist) {
    throw new Error(`OFFLINE_DETAIL_NOT_OPEN ${JSON.stringify(detailDebug)}`);
  }
  console.log("STEP offline-detail");
  result.steps.offline = await visibleState(page);
  assert.equal(result.steps.offline.activeOrder, true);
  assert.equal(result.steps.offline.futureOrder, true);
  assert.equal(result.steps.offline.otherTechnicianOrder, false);
  assert.equal(result.steps.offline.outsideWindowOrder, false);
  assert.equal(result.steps.offline.activities, true);
  assert.equal(result.steps.offline.checklist, true);
  assert.deepEqual(result.steps.offline.writeControls, []);
  await page.screenshot({ path: path.join(EVIDENCE, "02-offline-detail.png") });

  await browser.close();
  console.log("STEP browser-closed");
  browser = await launch();
  activeBrowser = browser;
  page = await browser.newPage();
  captureOfflineDiagnostics(page, diagnostics);
  await page.setRequestInterception(true);
  const blockApiAfterReopen = (request) => {
    if (request.url().startsWith(API_ORIGIN)) request.abort("failed");
    else request.continue();
  };
  page.on("request", blockApiAfterReopen);
  await page.goto(`${WEB}/dashboard/servicios`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    document.body.innerText.toLowerCase().includes("consulta local de solo lectura")
  );
  result.steps.reopen = {
    indexedDb: await databaseState(page),
    visible: await visibleState(page)
  };
  assert.equal(result.steps.reopen.indexedDb.selected.counts.offlineOrders, 2);
  assert.equal(result.steps.reopen.visible.activeOrder, true);
  await clickText(page, "OFF-QA-ACTIVE");
  await page.waitForFunction(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes("actividades") && text.includes("checklist");
  });
  result.steps.reopen.detail = await visibleState(page);
  assert.equal(result.steps.reopen.detail.activities, true);
  assert.equal(result.steps.reopen.detail.checklist, true);
  assert.deepEqual(result.steps.reopen.detail.writeControls, []);
  console.log("STEP reopened");

  assert.equal(await expireSnapshot(page), true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("desactualizada"));
  result.steps.ttl = await visibleState(page);
  assert.equal(result.steps.ttl.expiredWarning, true);
  console.log("STEP ttl");
  await page.screenshot({ path: path.join(EVIDENCE, "03-expired.png") });

  page.off("request", blockApiAfterReopen);
  await page.setRequestInterception(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const refreshLabel = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("button")]
      .map((button) => button.textContent?.trim());
    if (labels.includes("Actualizar descarga")) return "Actualizar descarga";
    if (labels.includes("Preparar")) return "Preparar";
    return "";
  });
  if (!refreshLabel) {
    throw new Error(`REFRESH_CONTROL_MISSING ${new URL(page.url()).pathname}`);
  }
  await clickText(page, refreshLabel);
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes("Informacion almacenada en este dispositivo.") ||
      text.includes("No fue posible preparar los datos.");
  });
  const refreshText = await page.evaluate(() => document.body.innerText);
  if (!refreshText.includes("Informacion almacenada en este dispositivo.")) {
    throw new Error(
      `REFRESH_DEGRADED ${diagnostics.at(-1) || "NO_CODE"} ` +
      JSON.stringify(await staleVersionSummary(page))
    );
  }
  result.steps.refresh = await databaseState(page);
  assert.equal(result.steps.refresh.selected.counts.offlineOrders, 2);
  console.log("STEP refreshed");

  const logoutBefore = await databaseState(page);
  const logoutButton = await page.$('button[aria-label="Cerrar sesion"]');
  assert.ok(logoutButton, "No se encontro el control accesible de cierre de sesion");
  await logoutButton.click();
  await page.waitForFunction(() => location.pathname === "/login");
  const logoutAfter = await databaseState(page);
  result.steps.logout = {
    existedBefore: Boolean(logoutBefore.selected),
    existsAfter: Boolean(logoutAfter.selected)
  };
  assert.equal(result.steps.logout.existedBefore, true);
  assert.equal(result.steps.logout.existsAfter, false);
  console.log("STEP logout");
  await page.screenshot({ path: path.join(EVIDENCE, "04-after-logout.png") });

  await browser.close();
  browser = await launch();
  activeBrowser = browser;
  page = await browser.newPage();
  await page.setCacheEnabled(false);
  captureOfflineDiagnostics(page, diagnostics);
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  result.steps.afterReopenLogout = await databaseState(page);
  assert.equal(result.steps.afterReopenLogout.selected, null);
  console.log("STEP logout-reopen");

  const isolatedRequests = [];
  page.on("response", (response) => {
    isolatedRequests.push(response.url());
  });
  await login(page, credentials.EXCLUSION_EMAIL, credentials.EXCLUSION_PASSWORD);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  result.steps.exclusionUser = {
    panel: (await page.$$('text/Preparar trabajo sin conexion')).length > 0,
    indexedDb: await databaseState(page),
    requestedBootstrap: isolatedRequests.some((url) => url.includes("/api/v1/offline/bootstrap")),
    downloadedOfflineChunk: isolatedRequests.some((url) => url.includes(offlineChunk))
  };
  assert.equal(result.steps.exclusionUser.panel, false);
  assert.equal(result.steps.exclusionUser.indexedDb.selected, null);
  assert.equal(result.steps.exclusionUser.requestedBootstrap, false);
  assert.equal(result.steps.exclusionUser.downloadedOfflineChunk, false);
  await page.screenshot({ path: path.join(EVIDENCE, "05-exclusion-user.png") });
  console.log("STEP exclusion-user");

  const exclusionLogout = await page.$('button[aria-label="Cerrar sesion"]');
  assert.ok(exclusionLogout);
  await exclusionLogout.click();
  await page.waitForFunction(() => location.pathname === "/login");

  const unauthorizedRequests = [];
  page.on("response", (response) => {
    unauthorizedRequests.push(response.url());
  });
  await login(page, credentials.UNAUTHORIZED_EMAIL, credentials.UNAUTHORIZED_PASSWORD);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  result.steps.unauthorizedUser = {
    panel: (await page.$$('text/Preparar trabajo sin conexion')).length > 0,
    indexedDb: await databaseState(page),
    requestedBootstrap: unauthorizedRequests.some((url) => url.includes("/api/v1/offline/bootstrap")),
    downloadedOfflineChunk: unauthorizedRequests.some((url) => url.includes(offlineChunk))
  };
  assert.equal(result.steps.unauthorizedUser.panel, false);
  assert.equal(result.steps.unauthorizedUser.indexedDb.selected, null);
  assert.equal(result.steps.unauthorizedUser.requestedBootstrap, false);
  assert.equal(result.steps.unauthorizedUser.downloadedOfflineChunk, false);
  console.log("STEP unauthorized-user");

  await browser.close();
  activeBrowser = null;

  result.result = "APROBADO";
  fs.writeFileSync(
    path.join(EVIDENCE, "result.json"),
    JSON.stringify(result, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch(async (error) => {
  await activeBrowser?.close().catch(() => undefined);
  console.error(JSON.stringify({
    result: "NO_APROBADO",
    error: error.message,
    stack: error.stack?.split("\n").slice(0, 5)
  }, null, 2));
  process.exitCode = 1;
});
