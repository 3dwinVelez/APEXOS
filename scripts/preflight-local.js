const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
require("./doctor-node");

function fail(message, details = []) {
  console.error(`\nAPEX local start check failed:\n${message}`);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}

if (!fs.existsSync(path.resolve(__dirname, "..", ".env"))) {
  fail("No existe .env.", ["Ejecuta: copy .env.example .env"]);
}

try {
  execSync("docker info", { stdio: "ignore" });
} catch {
  fail("Docker Desktop no está corriendo o no responde.", [
    "Abre Docker Desktop y espera a que el engine esté listo.",
    "Luego ejecuta de nuevo: npm run setup:local o npm run start:local"
  ]);
}

console.log("APEX local preflight ok");
