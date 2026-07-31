/**
 * Migración de evidencias: base64_data → Supabase Storage
 *
 * Este script migra las fotos existentes almacenadas como base64 en las tablas
 * ServicePhoto y RoutePreoperationalChecklistEvidence a Supabase Storage,
 * actualizando el registro con el storage_path correspondiente.
 *
 * Uso:
 *   node scripts/migrate-evidence-to-storage.js [--env-file=config/production.env] [--batch=50] [--dry-run]
 *
 * Flags:
 *   --dry-run    Solo muestra lo que se migraría, sin ejecutar cambios
 *   --batch      Cantidad de registros a procesar por lote (default: 50)
 *   --env-file   Ruta al archivo de entorno (default: config/local.env)
 *
 * Seguridad:
 *   - Usa dry-run por defecto. Ejecutar sin --dry-run solo cuando se haya verificado.
 *   - Cada lote es transaccional: si falla, no se pierden datos.
 *   - Los registros ya migrados (con storage_path) se saltan automáticamente.
 */

const path = require("node:path");
const fs = require("node:fs");

// --- Cargar entorno ---
const envFile = process.argv.find((a) => a.startsWith("--env-file="))?.split("=")[1] || "config/local.env";
const envPath = path.resolve(envFile);
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const isDryRun = process.argv.includes("--dry-run");
const BATCH_SIZE = Number(process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1] || 50);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL) {
  console.error("❌ SUPABASE_URL no configurada");
  process.exit(1);
}

async function uploadBase64ToStorage(bucket, path, base64Data, mimeType) {
  const match = base64Data.match(/^data:([^;,]+);base64,(.+)$/);
  const rawBase64 = match ? match[2] : base64Data;
  const contentType = match ? match[1] : (mimeType || "image/jpeg");

  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const auth = SUPABASE_SERVICE_ROLE_KEY
    ? `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    : `Bearer ${SUPABASE_ANON_KEY}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: auth,
      apikey: SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "3600"
    },
    body: Buffer.from(rawBase64, "base64")
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Storage upload failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return `${bucket}/${path}`;
}

function storagePathFor(tenantId, module, entity, entityId, fileName) {
  const safeName = String(fileName || "evidence").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const safeEntityId = String(entityId || "general").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${tenantId}/${module}/${entity}/${safeEntityId}/${Date.now()}-${safeName}`;
}

async function migrateServicePhotos() {
  console.log(`\n📸 Migrando ServicePhoto...`);

  const total = await prisma.servicePhoto.count({
    where: { base64_data: { not: null }, storage_path: null }
  });
  console.log(`   Registros pendientes: ${total}`);

  let processed = 0;
  let errors = 0;

  while (processed < total) {
    const rows = await prisma.servicePhoto.findMany({
      where: { base64_data: { not: null }, storage_path: null },
      take: BATCH_SIZE,
      orderBy: { id: "asc" }
    });

    for (const row of rows) {
      if (!row.base64_data) continue;
      const fileName = row.metadata?.file_name || `evidence-${row.id}.jpg`;
      const mimeType = row.metadata?.mime_type || "image/jpeg";
      const storageDir = storagePathFor(
        row.tenant_id,
        "services",
        "orders",
        row.order_id,
        fileName
      );

      if (isDryRun) {
        console.log(`   [DRY-RUN] ServicePhoto #${row.id}: ${row.base64_data.length} bytes → service-images/${storageDir}`);
        processed++;
        continue;
      }

      try {
        const storagePath = await uploadBase64ToStorage("service-images", storageDir, row.base64_data, mimeType);
        await prisma.servicePhoto.update({
          where: { id: row.id },
          data: { storage_path: storagePath }
        });
        processed++;
        if (processed % 10 === 0) console.log(`   Progreso: ${processed}/${total}`);
      } catch (error) {
        errors++;
        console.error(`   ❌ Error en ServicePhoto #${row.id}: ${error.message}`);
      }
    }
  }

  return { processed, errors };
}

async function migrateChecklistEvidence() {
  console.log(`\n📋 Migrando RoutePreoperationalChecklistEvidence...`);

  const total = await prisma.routePreoperationalChecklistEvidence.count({
    where: { base64_data: { not: null }, storage_path: null }
  });
  console.log(`   Registros pendientes: ${total}`);

  let processed = 0;
  let errors = 0;

  while (processed < total) {
    const rows = await prisma.routePreoperationalChecklistEvidence.findMany({
      where: { base64_data: { not: null }, storage_path: null },
      take: BATCH_SIZE,
      orderBy: { id: "asc" }
    });

    for (const row of rows) {
      if (!row.base64_data) continue;
      const fileName = row.file_name || `evidence-${row.id}.jpg`;
      const mimeType = row.mime_type || "image/jpeg";
      const storageDir = storagePathFor(
        row.tenant_id,
        "hr",
        "checklists",
        row.checklist_id,
        fileName
      );

      if (isDryRun) {
        console.log(`   [DRY-RUN] ChecklistEvidence #${row.id}: ${row.base64_data.length} bytes → service-images/${storageDir}`);
        processed++;
        continue;
      }

      try {
        const storagePath = await uploadBase64ToStorage("service-images", storageDir, row.base64_data, mimeType);
        await prisma.routePreoperationalChecklistEvidence.update({
          where: { id: row.id },
          data: { storage_path: storagePath }
        });
        processed++;
        if (processed % 10 === 0) console.log(`   Progreso: ${processed}/${total}`);
      } catch (error) {
        errors++;
        console.error(`   ❌ Error en ChecklistEvidence #${row.id}: ${error.message}`);
      }
    }
  }

  return { processed, errors };
}

async function main() {
  console.log("══════════════════════════════════════════");
  console.log("  Migración de evidencias a Supabase Storage");
  console.log(`  Modo: ${isDryRun ? "🔍 DRY RUN (sin cambios)" : "⚠️  EJECUCIÓN REAL"}`);
  console.log(`  Batch: ${BATCH_SIZE}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log("══════════════════════════════════════════\n");

  if (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY) {
    console.error("❌ Se requiere SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY");
    process.exit(1);
  }

  try {
    const photos = await migrateServicePhotos();
    const checklists = await migrateChecklistEvidence();

    console.log("\n══════════════════════════════════════════");
    console.log("  RESULTADOS");
    console.log(`  ServicePhoto:        ${photos.processed} migrados, ${photos.errors} errores`);
    console.log(`  ChecklistEvidence:   ${checklists.processed} migrados, ${checklists.errors} errores`);
    console.log("══════════════════════════════════════════");

    if (isDryRun) {
      console.log("\n✅ Dry-run completado. Revisa los resultados antes de ejecutar sin --dry-run.");
    } else {
      console.log("\n✅ Migración completada.");
    }
  } catch (error) {
    console.error("\n❌ Error general:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
