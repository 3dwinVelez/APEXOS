const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "apps", "web");
const node = process.execPath;
const nextBin = require.resolve("next/dist/bin/next", { paths: [webDir] });
const ensureCss = path.join(root, "scripts", "ensure-web-css.js");
const envPath = path.join(root, ".env");
const webPort = Number(process.env.WEB_PORT || process.argv[2] || 3001);
const webHost = process.env.WEB_HOST || "127.0.0.1";
const webUrl = `http://${webHost}:${webPort}`;

function rootEnv() {
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
    }));
}

const devEnv = {
  ...rootEnv(),
  ...process.env,
  NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-dev",
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000"
};

function log(message) {
  console.log(`[apex-web] ${message}`);
}

function isReady() {
  return new Promise((resolve) => {
    const req = http.get(`${webUrl}/dashboard`, (res) => {
      res.resume();
      resolve((res.statusCode || 0) < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForWeb() {
  const started = Date.now();
  while (Date.now() - started < 60000) {
    if (await isReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureCssAfterBoot() {
  if (!(await waitForWeb())) {
    log("Web did not respond in time for CSS validation.");
    return;
  }
  const result = spawnSync(node, [ensureCss, "--url", `${webUrl}/dashboard`], {
    cwd: root,
    env: devEnv,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) log("CSS validation failed; check logs above.");
}

const child = spawn(node, [nextBin, "dev", "-H", webHost, "-p", String(webPort)], {
  cwd: webDir,
  stdio: "inherit",
  env: devEnv
});

ensureCssAfterBoot().catch((error) => log(error.message));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code || 0);
});
