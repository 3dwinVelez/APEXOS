#!/usr/bin/env node
/**
 * ci-audit-gate.js — Gate de dependencias bloqueante para CI.
 *
 * Falla si npm audit reporta advisories critical/high que NO estén en
 * scripts/security/audit-allowlist.json (con motivo y vencimiento vigentes).
 * Sustituye el `continue-on-error: true` que dejaba pasar todo en verde.
 *
 * Uso: node scripts/security/ci-audit-gate.js
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const ALLOWLIST = path.join(ROOT, "scripts/security/audit-allowlist.json");
const BLOCKING_LEVELS = new Set(["critical", "high"]);

function runAudit() {
  // Run npm's own CLI script through node: no shell, no .cmd spawning (blocked
  // on Windows). npm_execpath is set by `npm run` and by CI.
  const npmCli = process.env.npm_execpath;
  const options = { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd: ROOT };
  try {
    const out = npmCli && /npm-cli\.js$|npm-cli\.cjs$/.test(npmCli)
      ? execFileSync(process.execPath, [npmCli, "audit", "--json"], options)
      : execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--json"], {
          ...options,
          shell: process.platform === "win32",
        });
    return out;
  } catch (err) {
    // npm audit exits non-zero when findings exist; stdout carries the JSON.
    if (err.stdout) return err.stdout.toString();
    throw new Error(`npm audit no disponible: ${err.message}`);
  }
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST)) return [];
  const raw = JSON.parse(fs.readFileSync(ALLOWLIST, "utf8"));
  return Array.isArray(raw.allow) ? raw.allow : [];
}

function isAllowed(entry, allowlist, today) {
  return allowlist.some((item) => {
    if (item.package !== entry.name) return false;
    if (item.advisory && item.advisory !== "*" && !entry.range.includes(item.advisory)) return false;
    if (!item.expires) return true;
    return new Date(item.expires) >= today;
  });
}

function main() {
  const today = new Date();
  const allowlist = loadAllowlist();
  const raw = runAudit();

  let audit;
  try {
    audit = JSON.parse(raw);
  } catch {
    console.error("[ci-audit] No se pudo parsear la salida de npm audit.");
    process.exit(1);
  }

  const vulns = Object.values(audit.vulnerabilities || {}).filter((v) =>
    BLOCKING_LEVELS.has(v.severity)
  );

  const blocked = [];
  const tolerated = [];

  for (const entry of vulns) {
    const name = entry.name;
    const severity = entry.severity;
    if (isAllowed({ name, range: entry.range || "" }, allowlist, today)) {
      tolerated.push(`${name} (${severity})`);
    } else {
      blocked.push(`${name} (${severity}, rango ${entry.range || "?"})`);
    }
  }

  if (tolerated.length) {
    console.log(`[ci-audit] Tolerados por allowlist vigente (${tolerated.length}): ${tolerated.join(", ")}`);
  }

  if (blocked.length) {
    console.error(`[ci-audit] BLOQUEADO: ${blocked.length} advisory(s) critical/high sin allowlist vigente:`);
    blocked.forEach((b) => console.error(`  - ${b}`));
    console.error("[ci-audit] Agrega una entrada con motivo y vencimiento en scripts/security/audit-allowlist.json o corrige la dependencia.");
    process.exit(1);
  }

  console.log(`[ci-audit] OK: 0 advisories critical/high fuera de allowlist.`);
  process.exit(0);
}

main();
