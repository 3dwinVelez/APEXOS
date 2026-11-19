// Fase C.1 — rescate de evidencia HR inline (base64) hacia Supabase Storage.
// No borra nada: sube el objeto, verifica SHA-256 y marca la fila como rescatada.
// El paso C.2 (purga del base64) es un script aparte y solo toca filas rescatadas.
//
// Uso:
//   node scripts/hr-rescue-inline-base64-to-storage.js --env qa|prod --dry-run
//   node scripts/hr-rescue-inline-base64-to-storage.js --env qa|prod --execute
//   --limit N   detenerse tras N rescates (muestreo)
//
// Protecciones (regla 12 de apexos-db-nube):
//   * Aborta sin conectar si SUPABASE_URL no contiene el project ref esperado.
//   * Nunca imprime la service role key.
//   * Idempotente: objeto ya existente con el mismo SHA-256 se omite.

const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const ENV = argValue("--env");
const MODE = process.argv.includes("--execute") ? "execute" : "dry";
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : Infinity;

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

if (!ENV || !["qa", "prod"].includes(ENV)) {
  console.error("ERROR: falta --env qa|prod");
  process.exit(2);
}

const EXPECTED_REF = {
  qa: "jbirkghkekuifgfsgquq",
  prod: "jzbwzmkidfthknsohhnr"
}[ENV];

const envFile = path.join(ROOT, "config", ENV === "qa" ? "qa.env" : "production.env");
const conf = parseEnv(fs.readFileSync(envFile, "utf8"));

const SUPABASE_URL = (conf.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = conf.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SERVICE_KEY) {
  console.error("ERROR: falta SUPABASE_SERVICE_ROLE_KEY en el env");
  process.exit(2);
}
if (!SUPABASE_URL.includes(EXPECTED_REF)) {
  console.error(`ERROR: SUPABASE_URL no contiene el project ref esperado (${EXPECTED_REF}). Aborto sin conectar.`);
  process.exit(2);
}

// Bucket destino: operational-evidence ya existe en los 3 ambientes, es privado,
// y su limite por archivo (10 MB) cubre el maximo medido (2.8 MB).
const BUCKET = "operational-evidence";

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers,
        timeout: 120000
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, body: buf, headers: res.headers });
        });
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "TIMEOUT" })));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const jsonHeaders = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
  "Content-Type": "application/json",
  Accept: "application/json"
};

async function restGet(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await request("GET", url, { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, Accept: "application/json" });
  if (res.status >= 300) throw new Error(`GET ${table} -> ${res.status}: ${res.body.toString().slice(0, 300)}`);
  return JSON.parse(res.body.toString());
}

async function restPatch(table, id, payload) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
  const res = await request("PATCH", url, { ...jsonHeaders, "Prefer": "return=minimal" }, Buffer.from(JSON.stringify(payload)));
  if (res.status >= 300) throw new Error(`PATCH ${table} id=${id} -> ${res.status}: ${res.body.toString().slice(0, 200)}`);
  return res.status;
}

async function storageHead(bucket, objectPath) {
  const url = `${SUPABASE_URL}/storage/v1/object/info/${bucket}/${encodeURIComponent(objectPath)}`;
  const res = await request("GET", url, { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, Accept: "application/json" });
  if (res.status === 400 || res.status === 404 || res.status === 403) return null;
  if (res.status >= 300) throw new Error(`storage info ${objectPath} -> ${res.status}`);
  try {
    return JSON.parse(res.body.toString());
  } catch {
    return null;
  }
}

async function storageGet(bucket, objectPath) {
  const url = `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const res = await request("GET", url, { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY });
  if (res.status >= 300) return { status: res.status, sha256: null };
  return { status: res.status, sha256: sha256(res.body) };
}

async function storageUpload(bucket, objectPath, mime, bytes) {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const res = await request("POST", url, {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
    "Content-Type": mime,
    "x-upsert": "true"
  }, bytes);
  if (res.status >= 300 && res.status !== 409) {
    throw new Error(`upload ${objectPath} -> ${res.status}: ${res.body.toString().slice(0, 200)}`);
  }
  return res.status;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function decodeDataUrl(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^data:([^;]+);base64,(.*)$/is);
  if (m) return { mime: m[1].toLowerCase(), buf: Buffer.from(m[2], "base64") };
  return { mime: "image/jpeg", buf: Buffer.from(s, "base64") };
}

function sanitizeName(name) {
  return String(name || "evidencia.jpg").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

// Supabase Storage rechaza claves con caracteres no ASCII (medido en QA 2026-11-18: "Invalid key" por la ñ).
function safeKey(p) {
  return String(p).split("/").map((seg) => seg.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_")).join("/");
}

function buildPath(rowPath, tenantId, entity, id, fileName) {
  if (rowPath && /^company\//.test(rowPath)) return safeKey(rowPath);
  // ruta determinista: dos corridas del rescate apuntan al mismo objeto
  return `company/${tenantId}/hr/${entity}/${id}/${sanitizeName(fileName)}`;
}

const FLAG_EXTRA = "hr_evidence_rescue_extra";
const FLAG_IDENTITY = "hr_evidence_rescue_identity";
const FLAG_ACTIVITY = "hr_evidence_rescue";

function rescueFlag(meta, flagKey, entity) {
  if (meta[flagKey] && meta[flagKey].status === "rescued") return true;
  // compatibilidad con corridas previas que usaron la bandera unica
  if (meta[FLAG_ACTIVITY] && meta[FLAG_ACTIVITY].status === "rescued") {
    if (flagKey === FLAG_ACTIVITY) return true;
    const sp = String(meta[FLAG_ACTIVITY].storage_path || "");
    if (entity === "identity-photos" && sp.includes("identity")) return true;
    if (entity === "extra-evidence" && !sp.includes("identity")) return true;
  }
  return false;
}

// devuelve {action, mark?} — mark se aplica en un PATCH combinado por fila
async function stageEvidence({ meta, base64Raw, fileName, declaredPath, mimeHint, entity, id, tenantId, flagKey }) {
  if (rescueFlag(meta, flagKey, entity)) return { action: "omitido (ya rescatado)" };
  if (!base64Raw || String(base64Raw).trim().length < 100) return { action: "sin base64 real" };

  const { mime, buf } = decodeDataUrl(base64Raw);
  if (buf.length < 100) return { action: "decode fallo (placeholder)" };
  const wantSha = sha256(buf);
  const objectPath = buildPath(declaredPath, tenantId, entity, id, fileName || "evidencia.jpg");

  const existing = await storageHead(BUCKET, objectPath);
  if (existing) {
    const check = await storageGet(BUCKET, objectPath);
    if (check.sha256 === wantSha) {
      return { action: "objeto existente verificado", objectPath, bytes: buf.length, mark: { flagKey, storage_path: objectPath, sha256: wantSha, mime, bytes: buf.length, via: "existente" } };
    }
  }

  if (MODE === "dry") {
    return { action: "dry: subira", objectPath, bytes: buf.length, mime: mimeHint || mime };
  }

  await storageUpload(BUCKET, objectPath, mimeHint || mime, buf);
  const verify = await storageGet(BUCKET, objectPath);
  if (verify.sha256 !== wantSha) throw new Error(`SHA-256 post-upload NO coincide (id=${id}, esperado=${wantSha.slice(0, 12)}, leido=${String(verify.sha256).slice(0, 12)})`);
  return { action: "subido y verificado", objectPath, bytes: buf.length, mark: { flagKey, storage_path: objectPath, sha256: wantSha, mime, bytes: buf.length, via: "subido" } };
}

async function fetchPage(table, selectQ, from, to) {
  const q = `select=${encodeURIComponent(selectQ)}&order=id.asc&limit=${to - from}&offset=${from}`;
  return restGet(table, q);
}

async function fetchAll(table, selectQ, size = 100) {
  const out = [];
  let from = 0;
  for (;;) {
    const page = await fetchPage(table, selectQ, from, from + size);
    out.push(...page);
    if (page.length < size) break;
    from += size;
  }
  return out;
}

// main
(async () => {
  const report = { env: ENV, ref: EXPECTED_REF, mode: MODE, started_at: new Date().toISOString(), items: [], counts: {} };
  console.log(`[rescue] env=${ENV} ref=${EXPECTED_REF} modo=${MODE} bucket=${BUCKET}`);

  const punches = await fetchAll("TimePunch", "id,tenant_id,metadata,extra_evidence");
  report.counts.timepunch_rows = punches.length;
  let done = 0;
  let marked = 0;
  let errors = 0;

  for (const p of punches) {
    if (done >= LIMIT) break;
    try {
    const meta = p.metadata && typeof p.metadata === "object" ? p.metadata : {};
    const ev = p.extra_evidence && typeof p.extra_evidence === "object" ? p.extra_evidence : null;
    const marks = [];

    if (ev && ev.base64_data) {
      const r = await stageEvidence({
        meta, id: p.id, tenantId: p.tenant_id,
        base64Raw: ev.base64_data,
        fileName: ev.name || ev.file_name || "evidencia.jpg",
        declaredPath: ev.storage_path,
        mimeHint: ev.type || ev.mime_type,
        entity: "extra-evidence",
        flagKey: FLAG_EXTRA
      });
      if (r.mark) marks.push(r.mark);
      report.items.push({ table: "TimePunch", kind: "extra_evidence", id: p.id, action: r.action, objectPath: r.objectPath, bytes: r.bytes });
      done++;
    }

    const photo = meta.identity_photo;
    if (photo && typeof photo === "object" && photo.base64_data) {
      const r = await stageEvidence({
        meta, id: p.id, tenantId: p.tenant_id,
        base64Raw: photo.base64_data,
        fileName: photo.name || "identidad.jpg",
        declaredPath: photo.storage_path,
        mimeHint: photo.type || photo.mime_type,
        entity: "identity-photos",
        flagKey: FLAG_IDENTITY
      });
      if (r.mark) marks.push(r.mark);
      report.items.push({ table: "TimePunch", kind: "identity_photo", id: p.id, action: r.action, objectPath: r.objectPath, bytes: r.bytes });
      done++;
    }

    if (MODE === "execute" && marks.length) {
      const nextMeta = { ...meta };
      for (const m of marks) {
        nextMeta[m.flagKey] = { status: "rescued", bucket: BUCKET, storage_path: m.storage_path, sha256: m.sha256, mime: m.mime, bytes: m.bytes, via: m.via, rescued_at: new Date().toISOString() };
      }
      await restPatch("TimePunch", p.id, { metadata: nextMeta });
      marked++;
    }
    } catch (e) {
      errors++;
      report.items.push({ table: "TimePunch", id: p.id, action: `ERROR: ${String(e.message).slice(0, 180)}` });
    }
  }

  // Produccion murio dos veces aqui (57014 statement timeout): paginas de 100 filas
  // arrastrando base64_data de hasta 2,5 MB por fila. El indice sale ligero porque no
  // pide la columna tostada, y el base64 se recupera fila por fila solo para las
  // candidatas sin bandera de rescate (las ya marcadas ni descargan bytes).
  const acts = await fetchAll("ActivityEvidence", "id,tenant_id,metadata,storage_path,file_name,mime_type", 200);
  report.counts.activity_rows = acts.length;
  const actCandidates = acts.filter((a) => {
    const meta = a.metadata && typeof a.metadata === "object" ? a.metadata : {};
    return !rescueFlag(meta, FLAG_ACTIVITY, "activity-evidence");
  });
  report.counts.activity_candidates = actCandidates.length;
  for (const a of actCandidates) {
    if (done >= LIMIT) break;
    try {
    const withBytes = await restGet("ActivityEvidence", `select=base64_data&id=eq.${encodeURIComponent(a.id)}`);
    const base64Raw = withBytes.length ? withBytes[0].base64_data : null;
    if (!base64Raw || String(base64Raw).trim().length < 100) {
      report.items.push({ table: "ActivityEvidence", kind: "base64_data", id: a.id, action: "sin base64 real" });
      continue;
    }
    const meta = a.metadata && typeof a.metadata === "object" ? a.metadata : {};
    const r = await stageEvidence({
      meta, id: a.id, tenantId: a.tenant_id,
      base64Raw,
      fileName: a.file_name || "evidencia.jpg",
      declaredPath: a.storage_path,
      mimeHint: a.mime_type,
      entity: "activity-evidence",
      flagKey: FLAG_ACTIVITY
    });
    if (MODE === "execute" && r.mark) {
      const nextMeta = {
        ...meta,
        [FLAG_ACTIVITY]: { status: "rescued", bucket: BUCKET, storage_path: r.mark.storage_path, sha256: r.mark.sha256, mime: r.mark.mime, bytes: r.mark.bytes, via: r.mark.via, rescued_at: new Date().toISOString() }
      };
      await restPatch("ActivityEvidence", a.id, { metadata: nextMeta });
      marked++;
    }
    report.items.push({ table: "ActivityEvidence", kind: "base64_data", id: a.id, action: r.action, objectPath: r.objectPath, bytes: r.bytes });
    done++;
    } catch (e) {
      errors++;
      report.items.push({ table: "ActivityEvidence", id: a.id, action: `ERROR: ${String(e.message).slice(0, 180)}` });
    }
  }

  report.counts.processed = done;
  report.counts.marked = marked;
  report.counts.errors = errors;
  report.finished_at = new Date().toISOString();

  const byAction = {};
  for (const it of report.items) byAction[it.action] = (byAction[it.action] || 0) + 1;
  console.log("[rescue] resumen por accion:", JSON.stringify(byAction, null, 2));
  console.log(`[rescue] filas marcadas: ${marked} · errores: ${errors}`);

  const evidenceDir = path.join(ROOT, "docs", "qa", "evidence", "hr-evidence-rescue-20261118");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, `rescue-${ENV}-${MODE}-${Date.now()}.json`), JSON.stringify(report, null, 2));
  console.log(`[rescue] evidencia escrita en ${evidenceDir}`);
  if (errors > 0) process.exit(1);
})().catch((e) => {
  console.error(`[rescue] FALLO: ${e.message}`);
  process.exit(1);
});
