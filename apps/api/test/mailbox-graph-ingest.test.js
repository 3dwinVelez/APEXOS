const test = require("node:test");
const assert = require("node:assert/strict");

const { ingestOnce } = require("../src/modules/mailbox/graph-mail-ingest");
const { objectKey, looksLikeZip, safeFileName } = require("../src/modules/mailbox/mailbox-objects");
const { readGraphConfig } = require("../src/modules/mailbox/config");

const ZIP_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("contenido-zip")]);

const BASE_CONFIG = {
  clientId: "client-id",
  account: "apexosdc@outlook.com",
  folder: "INBOX",
  tokenFile: "unused-in-tests",
  tenantId: "tenant-alpha",
  bucket: "mailbox-ingest",
  lookbackDays: 7,
  maxBytes: 1024 * 1024,
  maxAttachments: 10,
  localDir: null,
  enabled: true,
  intervalMinutes: 15
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
    async arrayBuffer() { return new ArrayBuffer(0); }
  };
}

function binaryResponse(bytes, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() { return {}; },
    async text() { return ""; },
    async arrayBuffer() {
      const buffer = Buffer.from(bytes);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  };
}

function memoryStorage() {
  const objects = new Map();
  return {
    objects,
    async exists(key) { return objects.has(key); },
    async put(key, bytes, contentType) { objects.set(key, { bytes: Buffer.from(bytes), contentType }); }
  };
}

function fakeGraph({ messages = [], attachments = [], bytes = ZIP_BYTES } = {}) {
  const state = { downloads: 0, listCalls: 0 };
  async function fetchImpl(url) {
    const target = String(url);
    if (target.includes("/$value")) {
      state.downloads += 1;
      const payload = typeof bytes === "function" ? bytes(target, state.downloads) : bytes;
      if (payload instanceof Error) throw payload;
      return binaryResponse(payload);
    }
    if (target.endsWith("/attachments")) return jsonResponse({ value: attachments });
    if (target.includes("/messages?")) {
      state.listCalls += 1;
      return jsonResponse({ value: messages });
    }
    throw new Error(`URL inesperada en la prueba: ${target}`);
  }
  return { fetchImpl, state };
}

function message(overrides = {}) {
  return {
    id: "msg-1",
    subject: "Facturas del proveedor",
    from: { emailAddress: { address: "proveedor@example.com", name: "Proveedor" } },
    receivedDateTime: "2026-10-28T09:00:00Z",
    ...overrides
  };
}

function zipAttachment(overrides = {}) {
  return {
    id: "att-1",
    name: "facturas.zip",
    contentType: "application/zip",
    size: ZIP_BYTES.length,
    isInline: false,
    "@odata.type": "#microsoft.graph.fileAttachment",
    ...overrides
  };
}

function run(config = {}, overrides = {}) {
  const graph = fakeGraph(overrides.graph);
  const storage = overrides.storage || memoryStorage();
  return ingestOnce({
    config: { ...BASE_CONFIG, ...config },
    storage,
    fetchImpl: graph.fetchImpl,
    accessToken: "token-de-prueba",
    sleep: async () => {},
    now: () => new Date("2026-10-28T12:00:00Z"),
    env: {}
  }).then((summary) => ({ summary, storage, graph }));
}

test("objectKey es determinista y no permite escaparse del prefijo", () => {
  const input = {
    tenantId: "tenant-alpha",
    folder: "INBOX",
    receivedAt: "2026-10-28T10:00:00Z",
    messageId: "msg-1",
    attachmentId: "att-1",
    fileName: "../../etc/passwd.zip"
  };
  const first = objectKey(input);
  const second = objectKey(input);
  assert.equal(first, second);
  assert.ok(first.startsWith("tenant-alpha/mailbox/inbox/2026/10/28/"));
  assert.ok(!first.includes("/../"));
  assert.ok(!first.includes("\\"));
  assert.ok(first.endsWith(".zip"));
});

test("safeFileName conserva un nombre legible y quita separadores de ruta", () => {
  assert.equal(safeFileName("reporte.zip"), "reporte.zip");
  assert.ok(!safeFileName("C:\\tmp\\reporte.zip").includes("\\"));
  assert.ok(!safeFileName("../../reporte.zip").includes("/"));
  assert.equal(safeFileName(""), "adjunto.zip");
});

test("looksLikeZip solo acepta la firma real de un archivo zip", () => {
  assert.equal(looksLikeZip(ZIP_BYTES), true);
  assert.equal(looksLikeZip(Buffer.from("no soy un zip")), false);
  assert.equal(looksLikeZip(Buffer.from([0x50, 0x4b])), false);
  assert.equal(looksLikeZip(Buffer.alloc(0)), false);
});

test("sube el .zip con su manifiesto y no lo duplica en una segunda pasada", async () => {
  const storage = memoryStorage();
  const graph = fakeGraph({ messages: [message()], attachments: [zipAttachment()] });
  const runIngest = () => ingestOnce({
    config: BASE_CONFIG,
    storage,
    fetchImpl: graph.fetchImpl,
    accessToken: "token-de-prueba",
    sleep: async () => {},
    now: () => new Date("2026-10-28T12:00:00Z"),
    env: {}
  });

  const first = await runIngest();
  assert.equal(first.uploaded, 1);
  assert.equal(first.failed, 0);
  const keys = [...storage.objects.keys()];
  const zipKey = keys.find((key) => key.endsWith(".zip"));
  const manifestKey = keys.find((key) => key.endsWith(".zip.json"));
  assert.ok(zipKey);
  assert.ok(manifestKey);
  assert.equal(storage.objects.get(zipKey).contentType, "application/zip");

  const manifest = JSON.parse(storage.objects.get(manifestKey).bytes.toString("utf8"));
  assert.equal(manifest.sender, "proveedor@example.com");
  assert.equal(manifest.message_id, "msg-1");
  assert.equal(manifest.subject, "Facturas del proveedor");
  assert.equal(manifest.folder, "INBOX");

  const second = await runIngest();
  assert.equal(second.uploaded, 0);
  assert.equal(second.skipped, 1);
  assert.equal(graph.state.downloads, 1);
});

test("rechaza un adjunto .zip cuyo contenido no es un zip", async () => {
  const { summary, storage } = await run({}, {
    graph: { messages: [message()], attachments: [zipAttachment()], bytes: Buffer.from("contenido falso") }
  });
  assert.equal(summary.uploaded, 0);
  assert.equal(summary.failed, 1);
  assert.equal(summary.results[0].reason, "not_a_zip");
  assert.equal(storage.objects.size, 0);
});

test("respeta el limite de tamano sin descargar el adjunto", async () => {
  const graph = fakeGraph({
    messages: [message()],
    attachments: [zipAttachment({ size: 5 * 1024 * 1024 })]
  });
  const summary = await ingestOnce({
    config: { ...BASE_CONFIG, maxBytes: 1024 * 1024 },
    storage: memoryStorage(),
    fetchImpl: graph.fetchImpl,
    accessToken: "token-de-prueba",
    sleep: async () => {},
    now: () => new Date("2026-10-28T12:00:00Z"),
    env: {}
  });
  assert.equal(summary.failed, 1);
  assert.equal(summary.results[0].reason, "size_limit");
  assert.equal(graph.state.downloads, 0);
});

test("ignora adjuntos que no son .zip o que no son archivos reales", async () => {
  const { summary, graph } = await run({}, {
    graph: {
      messages: [message()],
      attachments: [
        zipAttachment({ id: "att-img", name: "foto.png", contentType: "image/png" }),
        zipAttachment({ id: "att-link", name: "enlace.zip", "@odata.type": "#microsoft.graph.referenceAttachment" }),
        zipAttachment({ id: "att-inline", name: "firma.zip", isInline: true })
      ]
    }
  });
  assert.equal(summary.candidates, 0);
  assert.equal(summary.uploaded, 0);
  assert.equal(graph.state.downloads, 0);
});

test("un fallo de descarga no detiene el resto del mensaje", async () => {
  const { summary } = await run({}, {
    graph: {
      messages: [message()],
      attachments: [zipAttachment({ id: "att-bad", name: "roto.zip" }), zipAttachment({ id: "att-ok", name: "bueno.zip" })],
      bytes: (url, download) => (download === 1 ? new Error("Graph respondio 500.") : ZIP_BYTES)
    }
  });
  assert.equal(summary.uploaded, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.results.length, 2);
  assert.equal(summary.results[0].reason, "Graph respondio 500.");
});

test("la configuracion exige client ID y tenant antes de tocar el buzon", () => {
  assert.throws(() => readGraphConfig({}), /MAILBOX_INGEST_TENANT_ID/);
  assert.throws(
    () => readGraphConfig({ MAILBOX_INGEST_TENANT_ID: "tenant-alpha" }),
    /MAILBOX_GRAPH_CLIENT_ID/
  );
  const config = readGraphConfig({ MAILBOX_GRAPH_CLIENT_ID: "abc", MAILBOX_INGEST_TENANT_ID: "tenant-alpha" });
  assert.equal(config.folder, "INBOX");
  assert.equal(config.bucket, "mailbox-ingest");
  assert.equal(config.enabled, false);
  assert.ok(config.tokenFile.endsWith("graph-mail-token.json"));
});
