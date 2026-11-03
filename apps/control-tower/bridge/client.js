#!/usr/bin/env node
"use strict";

const os = require("node:os");

const config = require("../lib/config");

function usage() {
  return [
    "Puente Qoder para APEX Control Tower",
    "",
    "Uso:",
    "  node bridge/client.js status",
    "  node bridge/client.js register",
    "  node bridge/client.js claim [--level N2]",
    "  node bridge/client.js heartbeat <jobId>",
    "  node bridge/client.js complete <jobId> --status completed --summary \"...\" --evidence ruta1,ruta2",
    "  node bridge/client.js release <jobId> [--note \"...\"]",
    "  node bridge/client.js watch [--level N2]",
    "",
    "Variables:",
    "  BRIDGE_TOKEN  token del puente (obligatorio, no se imprime)",
    "  TOWER_URL     URL de la torre (por defecto http://127.0.0.1:<TOWER_PORT>)",
    "  BRIDGE_ID     identificador estable del puente",
    "",
    "El puente solo transporta instrucciones y resultados. No ejecuta git, deploy ni migraciones.",
    "Los niveles N2/N3 los aprueba una persona desde Telegram o el panel."
  ].join("\n");
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        index += 1;
      }
    } else {
      args._.push(item);
    }
  }
  return args;
}

function bridgeId(args) {
  return String(args.id || process.env.BRIDGE_ID || `apex-bridge-${os.hostname().toLowerCase()}`).replace(/[^A-Za-z0-9._:-]/g, "-");
}

async function request(method, route, body) {
  const token = process.env.BRIDGE_TOKEN || config.loadConfig().bridge.token;
  if (!token) {
    throw new Error("BRIDGE_TOKEN no configurado. Define la variable o apps/control-tower/.env.local.");
  }
  const baseUrl = String(process.env.TOWER_URL || `http://127.0.0.1:${config.loadConfig().port}`).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(parsed && parsed.error ? parsed.error : `HTTP ${response.status}`);
    error.status = response.status;
    error.body = parsed;
    throw error;
  }
  return parsed;
}

function print(title, value) {
  console.log(`\n== ${title} ==`);
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const id = bridgeId(args);

  if (!command || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }

  if (command === "status") {
    print("Estado del puente", await request("GET", "/api/bridge/status"));
    return;
  }

  if (command === "register") {
    print("Registro", await request("POST", "/api/bridge/register", { bridgeId: id }));
    return;
  }

  if (command === "claim") {
    await request("POST", "/api/bridge/register", { bridgeId: id });
    const claimed = await request("POST", "/api/bridge/claim", { bridgeId: id, level: args.level || null });
    if (!claimed.job) {
      print("Sin trabajo", claimed.reason || "cola vacia");
      return;
    }
    print("Trabajo asignado", claimed.job);
    print("Envoltorio de ejecucion", claimed.envelope);
    console.log("\nSiguiente paso: ejecutar en la rama desarrollo y reportar con 'complete'.");
    return;
  }

  if (command === "heartbeat") {
    const jobId = args._[1];
    if (!jobId) throw new Error("Falta jobId");
    print("Latido", await request("POST", `/api/bridge/jobs/${encodeURIComponent(jobId)}/heartbeat`, { bridgeId: id }));
    return;
  }

  if (command === "release") {
    const jobId = args._[1];
    if (!jobId) throw new Error("Falta jobId");
    print("Liberado", await request("POST", `/api/bridge/jobs/${encodeURIComponent(jobId)}/release`, { bridgeId: id, note: args.note || "Liberado por el puente" }));
    return;
  }

  if (command === "complete") {
    const jobId = args._[1];
    if (!jobId) throw new Error("Falta jobId");
    const tests = args.tests ? parseTests(args.tests) : null;
    const payload = {
      bridgeId: id,
      status: args.status || "completed",
      summary: args.summary || "",
      evidence: args.evidence ? String(args.evidence).split(",").map((item) => item.trim()).filter(Boolean) : [],
      tests,
      note: args.note || ""
    };
    if (!payload.summary) throw new Error("Falta --summary");
    if (!["completed", "failed", "blocked"].includes(payload.status)) throw new Error("--status debe ser completed, failed o blocked");
    print("Resultado reportado", await request("POST", `/api/bridge/jobs/${encodeURIComponent(jobId)}/complete`, payload));
    return;
  }

  if (command === "watch") {
    await request("POST", "/api/bridge/register", { bridgeId: id });
    print("Puente en espera", { bridgeId: id, tower: process.env.TOWER_URL || "local" });
    let active = null;
    let running = true;
    process.on("SIGINT", () => {
      running = false;
    });
    while (running) {
      try {
        if (active) {
          await request("POST", `/api/bridge/jobs/${encodeURIComponent(active)}/heartbeat`, { bridgeId: id });
        } else {
          await request("POST", "/api/bridge/heartbeat", { bridgeId: id });
          const claimed = await request("POST", "/api/bridge/claim", { bridgeId: id, level: args.level || null });
          if (claimed.job) {
            active = claimed.job.id;
            print("Trabajo asignado", claimed.job);
            print("Envoltorio de ejecucion", claimed.envelope);
            console.log("\nCtrl+C para salir del bucle. Reporta con 'complete'.");
          }
        }
      } catch (error) {
        console.error(`[puente] ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
    return;
  }

  throw new Error(`Comando no reconocido: ${command}`);
}

function parseTests(value) {
  if (typeof value !== "string") return null;
  if (value.trim().startsWith("{")) {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }
  const result = {};
  for (const pair of value.split(",")) {
    const [key, rawValue] = pair.split("=");
    if (!key) continue;
    const number = Number(rawValue);
    result[key.trim()] = Number.isFinite(number) ? number : String(rawValue || "").trim();
  }
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[puente] ${error.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, parseTests };
