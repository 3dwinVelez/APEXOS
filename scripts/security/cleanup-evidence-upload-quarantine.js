const path = require("node:path");
const { loadEnvFile } = require("../lib/load-env");

const envArg = process.argv.find((arg) => arg.startsWith("--env-file="));
if (envArg) loadEnvFile(path.resolve(envArg.slice("--env-file=".length)));

const prisma = require("../../apps/api/src/core/prisma");
const bucket = "service-images";

async function removeObject(storagePath) {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.");
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${storagePath}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!response.ok && response.status !== 404) throw new Error(`No se pudo limpiar ${storagePath}: ${response.status}`);
}

async function main() {
  const expired = await prisma.evidenceUploadAuthorization.findMany({
    where: { status: "authorized", expires_at: { lt: new Date() } },
    orderBy: { expires_at: "asc" },
    take: Math.min(Math.max(Number(process.env.EVIDENCE_CLEANUP_BATCH_SIZE || 100), 1), 500)
  });
  let cleaned = 0;
  for (const authorization of expired) {
    await removeObject(authorization.quarantine_path).catch((error) => console.warn(error.message));
    await prisma.evidenceUploadAuthorization.update({
      where: { id: authorization.id },
      data: { status: "cleaned", rejection_reason: "expired_before_confirmation" }
    });
    cleaned += 1;
  }
  console.log(JSON.stringify({ inspected: expired.length, cleaned }));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
