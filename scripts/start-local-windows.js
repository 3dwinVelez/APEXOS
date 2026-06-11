const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const logsDir = path.join(root, "logs");
const localDir = path.join(root, ".local");
const pgData = path.join(localDir, "postgres");
const envPath = path.join(root, ".env");
const envExamplePath = path.join(root, ".env.example");
const localPostgresPort = Number(process.env.APEX_LOCAL_POSTGRES_PORT || 54320);

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function log(message) {
  console.log(`[apex-local] ${message}`);
}

function baseEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (process.platform === "win32") {
    const pathValue = env.Path || env.PATH || env.path;
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === "path") delete env[key];
    }
    if (pathValue) env.PATH = pathValue;
  }
  return env;
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: baseEnv(options.env),
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
    encoding: "utf8",
    stdio: "pipe",
    timeout: options.timeoutMs
  });

  if (!options.quiet) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (options.allowFailure) return result;
  if (result.status !== 0) {
    if (result.error) console.error(result.error);
    console.error(`status=${result.status} signal=${result.signal || ""}`);
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
  return result;
}

function ensureEnv() {
  if (!fs.existsSync(envPath)) {
    if (!fs.existsSync(envExamplePath)) throw new Error("Missing .env and .env.example.");
    fs.copyFileSync(envExamplePath, envPath);
    log("Created .env from .env.example");
  }

  const env = fs.readFileSync(envPath, "utf8");
  const required = {
    DATABASE_URL: `postgresql://apex:apex_dev_password@localhost:${localPostgresPort}/apexos`,
    REDIS_URL: "redis://localhost:6379",
    DISABLE_REDIS: "1",
    NEXT_PUBLIC_API_URL: "http://127.0.0.1:3000"
  };

  let next = env;
  for (const [key, value] of Object.entries(required)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    next = pattern.test(next) ? next.replace(pattern, line) : `${next.trimEnd()}\n${line}\n`;
    process.env[key] = value;
  }

  if (next !== env) {
    fs.writeFileSync(envPath, next);
    log("Updated .env for local Windows startup");
  }
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = net.connect({ port, host });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`Timed out waiting for ${host}:${port}`));
        else setTimeout(attempt, 500);
      });
    }
    attempt();
  });
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function ensurePostgres() {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(localDir, { recursive: true });

  if (!fs.existsSync(path.join(pgData, "PG_VERSION"))) {
    run("initdb", ["-D", pgData, "-U", "apex", "-A", "trust", "--encoding=UTF8"]);
  }

  if (!(await isPortOpen(localPostgresPort))) {
    const pidFile = path.join(pgData, "postmaster.pid");
    if (fs.existsSync(pidFile)) {
      fs.rmSync(pidFile, { force: true });
      log("Removed stale Postgres pid file");
    }

    const pgStart = run("pg_ctl", [
      "-D",
      pgData,
      "-o",
      `-p ${localPostgresPort}`,
      "-l",
      path.join(logsDir, "postgres-local.log"),
      "start"
    ], { allowFailure: true });

    if (pgStart.status !== 0) {
      log("pg_ctl failed; starting postgres.exe directly");
      const out = fs.openSync(path.join(logsDir, "postgres-local.log"), "a");
      const err = fs.openSync(path.join(logsDir, "postgres-local.err.log"), "a");
      const child = spawn("postgres", ["-D", pgData, "-p", String(localPostgresPort)], {
        detached: true,
        stdio: ["ignore", out, err],
        windowsHide: true,
        shell: false,
        env: baseEnv()
      });
      child.unref();
      log(`postgres pid ${child.pid}`);
    }

    await waitForPort(localPostgresPort);
  }

  run("createdb", ["-h", "localhost", "-p", String(localPostgresPort), "-U", "apex", "apexos"], { allowFailure: true, quiet: true, timeoutMs: 10000 });
}

function ensureDependencies() {
  if (!fs.existsSync(path.join(root, "node_modules"))) {
    run(npmCmd, ["install"]);
  }
}

function startProcess(name, args, stdoutFile, stderrFile) {
  const out = fs.openSync(path.join(logsDir, stdoutFile), "w");
  const err = fs.openSync(path.join(logsDir, stderrFile), "w");
  let command = npmCmd;
  let commandArgs = args;
  let cwd = root;
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const nodemonBin = path.join(root, "node_modules", "nodemon", "bin", "nodemon.js");

  if (process.platform === "win32" && args.join(" ").includes("apps/api")) {
    command = "C:\\Program Files\\nodejs\\node.exe";
    commandArgs = [nodemonBin, "--watch", "src", "--watch", "server.js", "--ext", "js,json", "server.js"];
    cwd = path.join(root, "apps", "api");
  } else if (process.platform === "win32" && args.join(" ").includes("apps/web")) {
    command = "C:\\Program Files\\nodejs\\node.exe";
    commandArgs = [nextBin, "dev", "-H", "127.0.0.1", "-p", "3001"];
    cwd = path.join(root, "apps", "web");
  }

  const child = spawn(command, commandArgs, {
    cwd,
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: true,
    shell: false,
    env: {
      ...baseEnv({
        DISABLE_REDIS: "1",
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:3000",
        NEXT_DIST_DIR: ".next-dev",
        WEB_HOST: "127.0.0.1"
      })
    }
  });
  child.unref();
  log(`${name} pid ${child.pid}`);
}

function stopApexNodeProcesses() {
  if (process.platform !== "win32") return;
  const escapedRoot = root.replace(/'/g, "''");
  const script = `$repo = '${escapedRoot}'; $current = ${process.pid}; ` +
    `Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | ` +
    `Where-Object { $_.ProcessId -ne $current -and ($_.CommandLine -like "*$repo*" -or $_.CommandLine -like '*--workspace apps/web*' -or $_.CommandLine -like '*--workspace apps/api*') } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { allowFailure: true, quiet: true });
}

function stopConflictingDockerServices() {
  run("docker", ["compose", "-f", "infra/docker-compose.yml", "stop", "api", "web", "nginx"], { allowFailure: true, quiet: true, timeoutMs: 30000 });
}

async function main() {
  const restart = process.argv.includes("--restart");
  ensureEnv();
  ensureDependencies();
  await ensurePostgres();
  stopConflictingDockerServices();
  if (restart) stopApexNodeProcesses();

  const apiWasRunning = await isPortOpen(3000);
  if (restart || !apiWasRunning) {
    run(npmCmd, ["run", "prisma:generate"]);
    run(npmCmd, ["run", "db:push"]);
    run(npmCmd, ["run", "seed:demo"]);
  } else {
    log("API already running; skipped Prisma generate/db push/seed");
  }

  if (!(await isPortOpen(3000))) {
    startProcess("api", ["--workspace", "apps/api", "run", "dev"], "api-dev.out.log", "api-dev.err.log");
    await waitForPort(3000);
  }

  if (!(await isPortOpen(3001))) {
    startProcess("web", ["--workspace", "apps/web", "run", "dev"], "web-dev.out.log", "web-dev.err.log");
    await waitForPort(3001);
  }

  run("node", ["scripts/ensure-web-css.js", "--url", "http://localhost:3001/dashboard"], { allowFailure: true });

  log("Ready");
  log("Web: http://localhost:3001");
  log("API: http://localhost:3000/health");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
