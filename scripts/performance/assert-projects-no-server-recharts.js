const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const projectsPage = path.join(repoRoot, "apps", "web", "app", "dashboard", "proyectos", "page.tsx");
const source = fs.readFileSync(projectsPage, "utf8");

const directRechartsImport = /from\s+["']recharts["']|import\s*\(["']recharts["']\)/;

if (directRechartsImport.test(source)) {
  console.error("ERROR: apps/web/app/dashboard/proyectos/page.tsx must not import recharts directly.");
  console.error("Keep charts isolated in a client component loaded with next/dynamic and ssr: false.");
  process.exit(1);
}

console.log("OK: projects server page does not import recharts directly.");
