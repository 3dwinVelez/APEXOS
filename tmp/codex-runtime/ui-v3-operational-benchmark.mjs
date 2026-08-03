import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const outDir = "C:/Users/mq1/Documents/Proyectos/APEXOS-worktrees/develop-login-visibility/tmp/codex-runtime/benchmark-ui-v3-operational";
fs.mkdirSync(outDir, { recursive: true });

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const repetitions = Number(process.env.BENCH_REPS || 5);
const versions = [
  { id: "main", label: "main", baseUrl: "http://127.0.0.1:3101", commit: "e14a8443616683eea3e468a95e59a0386efd4f33" },
  { id: "candidate", label: "codex/operational-ui-v3-local", baseUrl: "http://127.0.0.1:3102", commit: "dbdf90fd144dc1ff9a3c5b95eacc25ff7a3513d8" }
];

const profiles = [
  { id: "desktop-normal", viewport: { width: 1366, height: 768, isMobile: false }, cpu: 1, network: null },
  { id: "mobile-limited", viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }, cpu: 4, network: { latency: 40, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 } }
];

const routeSpecs = [
  {
    id: "login",
    path: "/login",
    auth: false,
    comparable: true,
    selectors: {
      t1: ["form", "input[name=email]"],
      t2: ["input[name=email]", "input[name=password]"],
      t3: ["form button[type=submit]", "button[type=submit]"],
      t4: ["button[type=submit]:not([disabled])"],
      allowTextReady: true
    }
  },
  {
    id: "dashboard",
    path: "/dashboard",
    auth: true,
    comparable: true,
    selectors: {
      t1: ["main", "h1"],
      t2: ["main h1", "h1"],
      t3: ["main a[href*='/dashboard/']", "main button", "main [role=link]"],
      t4: ["main a[href*='/dashboard/']", "main button:not([disabled])"]
    }
  },
  {
    id: "administracion",
    path: "/dashboard/administracion",
    auth: true,
    comparable: true,
    selectors: {
      t1: ["main", "h1"],
      t2: ["main h1", "h1"],
      t3: ["main a", "main button", "main input"],
      t4: ["main a[href*='/dashboard/administracion']", "main button:not([disabled])", "main input:not([disabled])"]
    }
  },
  {
    id: "administracion-suscripciones",
    path: "/dashboard/administracion/suscripciones",
    auth: true,
    comparable: true,
    selectors: {
      t1: ["main", "h1"],
      t2: ["main h1", "h1"],
      t3: ["main tr", "main [role=row]", "main input", "main button", "main a"],
      t4: ["main input:not([disabled])", "main button:not([disabled])", "main a[href*='/dashboard/administracion']"]
    }
  },
  {
    id: "servicios",
    path: "/dashboard/servicios",
    auth: true,
    comparable: true,
    selectors: {
      t1: ["main", "h1"],
      t2: ["main h1", "main input", "h1"],
      t3: ["main tr", "main [role=row]", "main a[href*='/dashboard/servicios/']", "main input", "main [data-testid]"],
      t4: ["main a[href*='/dashboard/servicios/nuevo']", "main input:not([disabled])", "main button:not([disabled])"]
    }
  },
  {
    id: "detalle-orden",
    path: "/dashboard/servicios/48",
    auth: true,
    comparable: true,
    selectors: {
      t1: ["main", "h1"],
      t2: ["main h1", "h1", "main button", "main a[href*='/dashboard/servicios']"],
      t3: ["main button", "main [role=tab]", "main section", "main form"],
      t4: ["main button:not([disabled])", "main [role=tab]", "main a[href*='/dashboard/servicios']"]
    }
  },
  {
    id: "proyectos",
    path: "/dashboard/proyectos",
    auth: true,
    comparable: true,
    selectors: {
      t1: ["main", "h1"],
      t2: ["main h1", "h1", "main select", "main button"],
      t3: ["main button", "main select", "main input", "main [aria-hidden='true']"],
      t4: ["main button:not([disabled])", "main select:not([disabled])", "main input:not([disabled])"]
    }
  }
];

async function getAuthPayload() {
  const response = await fetch("http://127.0.0.1:3000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@apex.local", password: "test1234" })
  });
  if (!response.ok) throw new Error(`Login API failed: ${response.status}`);
  return response.json();
}

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function median(values) {
  return percentile(values, 50);
}

function benefit(main, candidate) {
  if (!Number.isFinite(main) || !Number.isFinite(candidate) || Math.abs(main) < 1) return null;
  return ((main - candidate) / main) * 100;
}

async function contextFor(browser) {
  return browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext();
}

async function applyProfile(page, profile) {
  await page.setBypassCSP(true);
  await page.setViewport(profile.viewport);
  const cdp = await page.target().createCDPSession();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  if (profile.network) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.network.latency,
      downloadThroughput: profile.network.downloadThroughput,
      uploadThroughput: profile.network.uploadThroughput,
      connectionType: "cellular4g"
    });
  }
}

async function waitAny(page, selectors, timeout = 8000) {
  const start = Date.now();
  for (const selector of selectors) {
    const handle = await page.$(selector).catch(() => null);
    if (handle) {
      await handle.dispose();
      const at = Date.now();
      return { ok: true, selector, ms: at - start, at };
    }
  }
  const watchers = selectors.map((selector) =>
    page.waitForSelector(selector, { visible: true, timeout })
      .then((handle) => ({ ok: true, selector, handle, at: Date.now() }))
      .catch(() => null)
  );
  const winner = await Promise.race(watchers);
  if (winner?.handle) await winner.handle.dispose();
  return winner ? { ok: true, selector: winner.selector, ms: winner.at - start, at: winner.at } : { ok: false, selector: "", ms: Date.now() - start, at: null };
}

async function waitTextReady(page, timeout = 8000) {
  const start = Date.now();
  const ok = await page.waitForFunction(() => {
    const body = document.body?.innerText || "";
    return body.length > 80 || body.includes("No se") || body.includes("Error") || body.includes("Dashboard");
  }, { timeout }).then(() => true).catch(() => false);
  const at = Date.now();
  return { ok, ms: at - start, at };
}

async function login(page, version) {
  await page.goto(`${version.baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate((payload) => {
    localStorage.setItem("token", payload.token);
    if (payload.refresh) localStorage.setItem("refresh", payload.refresh);
    localStorage.setItem("auth_provider", "local");
    localStorage.setItem("user_email", "demo@apex.local");
    if (payload.tenant?.active_modules) localStorage.setItem("tenant_active_modules", JSON.stringify(payload.tenant.active_modules));
    if (payload.user?.role) localStorage.setItem("role_name", payload.user.role);
    if (Array.isArray(payload.user?.role_permissions)) localStorage.setItem("role_permissions", JSON.stringify(payload.user.role_permissions));
    if (payload.user?.role_metadata) localStorage.setItem("role_metadata", JSON.stringify(payload.user.role_metadata));
    localStorage.setItem("apexos_role_context_fetched_at", String(Date.now()));
  }, authPayload);
  await page.goto(`${version.baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const ok = await page.waitForSelector("main", { timeout: 30000 }).then(() => true).catch(() => false);
  if (!ok) throw new Error(`No fue posible preparar sesion ${version.id}: ${page.url()}`);
}

function classifyRequest(url, type) {
  if (url.includes("/_next/static/")) return { class: "bloqueo inicial", blocksContent: true, blocksInteraction: true, persistent: false };
  if (url.includes("/api/auth/") || url.includes("/auth/")) return { class: "sesion", blocksContent: true, blocksInteraction: true, persistent: false };
  if (url.includes("/api/v1/projects") || url.includes("/api/v1/service") || url.includes("/api/v1/orders")) return { class: "datos principales", blocksContent: true, blocksInteraction: false, persistent: false };
  if (url.includes("/api/")) return { class: "datos secundarios", blocksContent: false, blocksInteraction: false, persistent: false };
  if (type === "fetch" || type === "xhr") return { class: "datos secundarios", blocksContent: false, blocksInteraction: false, persistent: false };
  if (type === "script" || type === "stylesheet" || type === "document") return { class: "bloqueo inicial", blocksContent: true, blocksInteraction: true, persistent: false };
  return { class: "carga diferida", blocksContent: false, blocksInteraction: false, persistent: false };
}

async function measureRoute(page, version, profile, route, repetition, phase) {
  const requests = [];
  const failed = [];
  const onFinished = async (request) => {
    const response = request.response();
    const headers = response?.headers() || {};
    const info = classifyRequest(request.url(), request.resourceType());
    requests.push({
      url: request.url(),
      type: request.resourceType(),
      status: response?.status() || 0,
      bytes: Number(headers["content-length"] || 0),
      ...info
    });
  };
  const onFailed = (request) => {
    const info = classifyRequest(request.url(), request.resourceType());
    failed.push({ url: request.url(), type: request.resourceType(), error: request.failure()?.errorText || "failed", ...info });
  };

  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);
  await page.evaluateOnNewDocument(() => {
    window.__apexLongTasks = [];
    new PerformanceObserver((list) => {
      window.__apexLongTasks.push(...list.getEntries().map((entry) => ({ duration: entry.duration, startTime: entry.startTime })));
    }).observe({ type: "longtask", buffered: true });
  }).catch(() => null);

  const t0 = Date.now();
  let response = null;
  let navError = "";
  try {
    response = await page.goto(`${version.baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    navError = error.message;
  }
  const tDom = Date.now();
  const t1 = await waitAny(page, route.selectors.t1);
  const t2 = await waitAny(page, route.selectors.t2);
  const contentReady = await waitTextReady(page);
  const t3Selector = await waitAny(page, route.selectors.t3);
  const t4 = await waitAny(page, route.selectors.t4);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const snapshot = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]));
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0
    }));
    const all = Array.from(document.querySelectorAll("*"));
    let maxDepth = 0;
    for (const el of all) {
      let depth = 0;
      let current = el;
      while (current.parentElement) {
        depth += 1;
        current = current.parentElement;
      }
      maxDepth = Math.max(maxDepth, depth);
    }
    const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length;
    const bodyText = document.body?.innerText || "";
    return {
      nav: nav ? {
        ttfb: nav.responseStart - nav.requestStart,
        domContentLoaded: nav.domContentLoadedEventEnd,
        loadEventEnd: nav.loadEventEnd,
        duration: nav.duration,
        transferSize: nav.transferSize || 0
      } : null,
      fcp: paints["first-contentful-paint"] || null,
      resources,
      longTasks: window.__apexLongTasks || [],
      dom: {
        nodes: all.length,
        maxDepth,
        interactives: visible("a,button,input,select,textarea,[role=button],[tabindex]"),
        rows: visible("tr,[role=row]"),
        buttons: visible("button,a"),
        hiddenMounted: document.querySelectorAll("[hidden],.hidden,[aria-hidden='true']").length,
        mountedDialogs: document.querySelectorAll("dialog,[role=dialog]").length
      },
      heading: document.querySelector("main h1")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || "",
      textLength: bodyText.length,
      notFound: bodyText.includes("404") || bodyText.includes("This page could not be found")
    };
  }).catch((error) => ({ evaluateError: error.message, resources: [], longTasks: [], dom: {}, notFound: true, textLength: 0 }));

  page.off("requestfinished", onFinished);
  page.off("requestfailed", onFailed);

  const status = response?.status() || 0;
  const blockingRequests = requests.filter((request) => request.blocksContent || request.blocksInteraction).length;
  const secondaryRequests = requests.filter((request) => !request.blocksContent && !request.blocksInteraction).length;
  const jsBytes = (snapshot.resources || []).filter((entry) => entry.initiatorType === "script" || entry.name.includes(".js")).reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0);
  const cssBytes = (snapshot.resources || []).filter((entry) => entry.initiatorType === "css" || entry.name.includes(".css")).reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0);
  const transferBytes = (snapshot.resources || []).reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0) + (snapshot.nav?.transferSize || 0);
  const textAllowed = route.selectors.allowTextReady === true;
  const t3Ok = t3Selector.ok || (textAllowed && contentReady.ok);
  const t3At = t3Selector.ok ? t3Selector.at : textAllowed && contentReady.ok ? contentReady.at : null;
  const invalidReasons = [];
  if (navError) invalidReasons.push("navegacion incompleta");
  if (status >= 400 || status === 0) invalidReasons.push(status === 0 ? "error de API" : `HTTP ${status}`);
  if (snapshot.notFound) invalidReasons.push("dato no comparable");
  if (!t2.ok) invalidReasons.push("T2 no alcanzado");
  if (!t3Ok) invalidReasons.push("T3 no alcanzado");
  if (!t4.ok) invalidReasons.push("T4 no alcanzado");
  if (failed.some((request) => request.blocksContent || request.blocksInteraction)) invalidReasons.push("error de recurso bloqueante");

  return {
    version: version.id,
    branch: version.label,
    commit: version.commit,
    profile: profile.id,
    route: route.id,
    path: route.path,
    repetition,
    phase,
    comparable: route.comparable,
    excludeReason: route.excludeReason || "",
    valid: invalidReasons.length === 0,
    invalidReason: invalidReasons.join("; "),
    status,
    timingsMs: {
      domContentLoadedWall: tDom - t0,
      t1Feedback: t1.ok ? t1.at - t0 : null,
      t2Structure: t2.ok ? t2.at - t0 : null,
      t3UsefulContent: t3Ok ? t3At - t0 : null,
      t4Operative: t4.ok ? t4.at - t0 : null,
      ttfb: snapshot.nav?.ttfb ?? null,
      fcp: snapshot.fcp ?? null,
      loadEventEnd: snapshot.nav?.loadEventEnd ?? null
    },
    selectors: { t1, t2, t3Selector, contentReady, t4 },
    dom: snapshot.dom,
    network: {
      requests: requests.length,
      failedRequests: failed.length,
      blockingRequests,
      secondaryRequests,
      transferBytes,
      jsBytes,
      cssBytes,
      apiRequests: requests.filter((request) => request.url.includes(":3000/") || request.url.includes("/api/")).length,
      classes: requests.reduce((acc, request) => {
        acc[request.class] = (acc[request.class] || 0) + 1;
        return acc;
      }, {})
    },
    longTasks: {
      count: snapshot.longTasks?.length || 0,
      totalMs: (snapshot.longTasks || []).reduce((sum, task) => sum + task.duration, 0),
      maxMs: Math.max(0, ...(snapshot.longTasks || []).map((task) => task.duration || 0))
    },
    content: { heading: snapshot.heading, textLength: snapshot.textLength },
    requests: requests.slice(0, 80),
    failed: failed.slice(0, 20)
  };
}

const results = [];
const authPayload = await getAuthPayload();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-timer-throttling"]
});

try {
  for (const profile of profiles) {
    const contexts = {};
    const pages = {};
    for (const version of versions) {
      contexts[version.id] = await contextFor(browser);
      pages[version.id] = await contexts[version.id].newPage();
      await applyProfile(pages[version.id], profile);
      await pages[version.id].setCacheEnabled(true);
      await login(pages[version.id], version);
    }
    const profileRoutes = profile.id === "desktop-normal"
      ? routeSpecs
      : routeSpecs.filter((route) => ["servicios", "detalle-orden"].includes(route.id));
    for (const route of profileRoutes) {
      for (let repetition = 0; repetition <= repetitions; repetition += 1) {
        const order = repetition % 2 === 0 ? versions : [...versions].reverse();
        for (const version of order) {
          const row = await measureRoute(pages[version.id], version, profile, route, repetition, repetition === 0 ? "warmup" : "measured");
          results.push(row);
          fs.writeFileSync(path.join(outDir, "raw-in-progress.json"), JSON.stringify({ generatedAt: new Date().toISOString(), versions, profiles, routeSpecs, repetitions, results }, null, 2));
        }
      }
    }
    for (const context of Object.values(contexts)) await context.close().catch(() => null);
  }
} finally {
  await browser.close().catch(() => null);
}

const metricNames = [
  "ttfb",
  "fcp",
  "t1Feedback",
  "t2Structure",
  "t3UsefulContent",
  "t4Operative",
  "domNodes",
  "maxDepth",
  "interactives",
  "hiddenMounted",
  "requests",
  "blockingRequests",
  "secondaryRequests",
  "jsBytes",
  "cssBytes",
  "longTasksTotal"
];

function rowValue(row, metric) {
  if (metric === "domNodes") return row.dom?.nodes;
  if (metric === "maxDepth") return row.dom?.maxDepth;
  if (metric === "interactives") return row.dom?.interactives;
  if (metric === "hiddenMounted") return row.dom?.hiddenMounted;
  if (metric === "requests") return row.network?.requests;
  if (metric === "blockingRequests") return row.network?.blockingRequests;
  if (metric === "secondaryRequests") return row.network?.secondaryRequests;
  if (metric === "jsBytes") return row.network?.jsBytes;
  if (metric === "cssBytes") return row.network?.cssBytes;
  if (metric === "longTasksTotal") return row.longTasks?.totalMs;
  return row.timingsMs?.[metric];
}

const summaries = [];
for (const profile of profiles.map((item) => item.id)) {
  for (const route of routeSpecs.map((item) => item.id)) {
    for (const version of versions.map((item) => item.id)) {
      const rows = results.filter((row) => row.phase === "measured" && row.profile === profile && row.route === route && row.version === version);
      if (!rows.length) continue;
      const validRows = rows.filter((row) => row.valid);
      const metrics = {};
      for (const metric of metricNames) {
        const values = validRows.map((row) => rowValue(row, metric)).filter(Number.isFinite);
        metrics[metric] = { count: values.length, median: median(values), p95: percentile(values, 95), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
      }
      summaries.push({
        profile,
        route,
        version,
        measuredRows: rows.length,
        validRows: validRows.length,
        invalidRows: rows.length - validRows.length,
        invalidReasons: rows.filter((row) => !row.valid).reduce((acc, row) => {
          acc[row.invalidReason || "invalid"] = (acc[row.invalidReason || "invalid"] || 0) + 1;
          return acc;
        }, {}),
        comparable: rows[0]?.comparable,
        excludeReason: rows[0]?.excludeReason,
        metrics
      });
    }
  }
}

const comparisons = [];
for (const main of summaries.filter((row) => row.version === "main")) {
  const candidate = summaries.find((row) => row.version === "candidate" && row.profile === main.profile && row.route === main.route);
  if (!candidate) continue;
  const metrics = {};
  for (const metric of metricNames) {
    metrics[metric] = {
      mainMedian: main.metrics[metric]?.median ?? null,
      candidateMedian: candidate.metrics[metric]?.median ?? null,
      benefitPct: benefit(main.metrics[metric]?.median, candidate.metrics[metric]?.median),
      mainP95: main.metrics[metric]?.p95 ?? null,
      candidateP95: candidate.metrics[metric]?.p95 ?? null,
      p95BenefitPct: benefit(main.metrics[metric]?.p95, candidate.metrics[metric]?.p95)
    };
  }
  comparisons.push({
    profile: main.profile,
    route: main.route,
    comparable: main.comparable && candidate.comparable,
    excludeReason: main.excludeReason || candidate.excludeReason || "",
    mainValidRows: main.validRows,
    candidateValidRows: candidate.validRows,
    validForIndex: main.comparable && candidate.comparable && main.validRows >= 5 && candidate.validRows >= 5,
    metrics
  });
}

const payload = {
  generatedAt: new Date().toISOString(),
  methodology: {
    invalidated: ["network-idle como condicion principal", "timeouts convertidos a duracion", "perfiles incompletos", "indices parciales -566.6% y -1717.1%"],
    tSignals: {
      T1: "feedback inicial: main/form/heading/contenedor de destino visible",
      T2: "estructura visible: titulo y contenedor principal",
      T3: "contenido util: texto operativo, fila/control/formulario/estado disponible",
      T4: "pantalla operativa: accion o control principal habilitado"
    },
    note: "Network-idle no se usa para finalizar la pantalla operativa; las solicitudes se clasifican como bloqueo inicial, datos principales, secundarios, sesion o carga diferida."
  },
  versions,
  profiles,
  routeSpecs,
  repetitions,
  results,
  summaries,
  comparisons
};

fs.writeFileSync(path.join(outDir, "raw.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ outDir, rows: results.length, comparisons: comparisons.length, validComparisons: comparisons.filter((row) => row.validForIndex).length }, null, 2));
