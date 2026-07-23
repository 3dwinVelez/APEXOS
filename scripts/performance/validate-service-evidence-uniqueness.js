const fs = require("node:fs");

const env = {};
const envFileArg = process.argv.find((value) => value.startsWith("--env-file="));
const envFile = envFileArg?.slice("--env-file=".length) || process.env.PERF_ENV_FILE || ".env";
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const baseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  if (!baseUrl || !serviceRole) throw new Error("Supabase server-side no configurado.");
  const response = await fetch(`${baseUrl}/rest/v1/service_evidence?select=id,order_id,evidence_type,metadata,created_at&limit=10000`, {
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
  const rows = await response.json();
  const captures = new Map();
  for (const row of rows) {
    const originalType = String(row.metadata?.original_type || row.evidence_type || "");
    const partId = originalType === "pieza_averiada" ? String(row.metadata?.part_id || "") : "";
    const key = `${row.order_id}:${originalType}:${partId}`;
    captures.set(key, (captures.get(key) || 0) + 1);
  }
  const duplicates = [...captures.entries()].filter(([, count]) => count > 1);
  const extraRows = duplicates.reduce((total, [, count]) => total + count - 1, 0);
  console.log(`[evidence] env=${envFile} rows=${rows.length} duplicate_groups=${duplicates.length} extra_rows=${extraRows}`);
  if (duplicates.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
