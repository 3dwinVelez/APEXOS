const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const { ingestOnce, collectZipParts } = require("../src/modules/mailbox/imap-mail-ingest");
const { readImapConfig, resolveTransport } = require("../src/modules/mailbox/config");

const ZIP_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("contenido-zip")]);

const BASE_CONFIG = {
  transport: "imap",
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  user: "buzon@gmail.com",
  password: "no-se-usa-en-pruebas",
  mailbox: "APEXOS-ZIP",
  markSeen: false,
  tenantId: "tenant-alpha",
  bucket: "mailbox-ingest",
  lookbackDays: 7,
  maxBytes: 1024 * 1024,
  maxAttachments: 10,
  localDir: null,
  enabled: true,
  intervalMinutes: 15
};

function memoryStorage() {
  const objects = new Map();
  return {
    objects,
    async exists(key) { return objects.has(key); },
    async put(key, bytes, contentType) { objects.set(key, { bytes: Buffer.from(bytes), contentType }); }
  };
}

function zipPart(overrides = {}) {
  return {
    part: "2",
    type: "application/zip",
    size: ZIP_BYTES.length,
    disposition: "attachment",
    dispositionParameters: { filename: "facturas.zip" },
    ...overrides
  };
}

function message(overrides = {}) {
  return {
    uid: 7,
    internalDate: new Date("2026-10-28T09:00:00Z"),
    envelope: {
      messageId: "<abc123@mail.gmail.com>",
      subject: "Facturas del proveedor",
      from: [{ address: "proveedor@example.com", name: "Proveedor" }],
      date: new Date("2026-10-28T09:00:00Z")
    },
    bodyStructure: { type: "multipart/mixed", childNodes: [{ part: "1", type: "text/plain", size: 12 }, zipPart()] },
    ...overrides
  };
}

function fakeClient({ messages = [], bytes = ZIP_BYTES } = {}) {
  const state = { downloads: 0, flags: [], released: 0, loggedOut: false, searched: 0 };
  return {
    state,
    async connect() { state.connected = true; },
    async getMailboxLock(mailbox) {
      state.mailbox = mailbox;
      return { release() { state.released += 1; } };
    },
    async search() {
      state.searched += 1;
      return messages.map((entry) => entry.uid);
    },
    async fetchOne(uid) { return messages.find((entry) => entry.uid === uid) || null; },
    async download() {
      state.downloads += 1;
      return { content: Readable.from([typeof bytes === "function" ? bytes(state.downloads) : bytes]) };
    },
    async messageFlagsAdd(uid, flags) { state.flags.push({ uid, flags }); return true; },
    async logout() { state.loggedOut = true; }
  };
}

function run(config = {}, overrides = {}) {
  const client = overrides.client || fakeClient(overrides.clientOptions);
  const storage = overrides.storage || memoryStorage();
  return ingestOnce({
    config: { ...BASE_CONFIG, ...config },
    client,
    storage,
    now: () => new Date("2026-10-28T12:00:00Z"),
    env: {}
  }).then((summary) => ({ summary, storage, client }));
}

test("collectZipParts recorre MIME anidado y descarta imagenes inline", () => {
  const structure = {
    type: "multipart/mixed",
    childNodes: [
      { part: "1", type: "multipart/alternative", childNodes: [{ part: "1.1", type: "text/plain", size: 10 }] },
      { part: "2", type: "application/zip", size: 20, disposition: "attachment", dispositionParameters: { filename: "uno.zip" } },
      { part: "3", type: "image/png", size: 30, disposition: "inline", parameters: { name: "logo.zip" } },
      { part: "4", type: "application/pdf", size: 40, disposition: "attachment", dispositionParameters: { filename: "factura.pdf" } }
    ]
  };
  const parts = collectZipParts(structure);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].part, "2");
  assert.equal(parts[0].fileName, "uno.zip");
});

test("sube el .zip del correo con manifiesto y no lo repite en la segunda pasada", async () => {
  const storage = memoryStorage();
  const first = await run({}, { storage, clientOptions: { messages: [message()] } });
  assert.equal(first.summary.uploaded, 1);
  assert.equal(first.summary.failed, 0);
  assert.equal(first.client.state.mailbox, "APEXOS-ZIP");
  assert.equal(first.client.state.released, 1);

  const keys = [...storage.objects.keys()];
  const zipKey = keys.find((key) => key.endsWith(".zip"));
  const manifestKey = keys.find((key) => key.endsWith(".zip.json"));
  assert.ok(zipKey);
  assert.ok(manifestKey);
  assert.equal(storage.objects.get(zipKey).contentType, "application/zip");
  const manifest = JSON.parse(storage.objects.get(manifestKey).bytes.toString("utf8"));
  assert.equal(manifest.source, "imap");
  assert.equal(manifest.sender, "proveedor@example.com");
  assert.equal(manifest.message_id, "<abc123@mail.gmail.com>");
  assert.equal(manifest.folder, "APEXOS-ZIP");

  const second = await run({}, { storage, clientOptions: { messages: [message()] } });
  assert.equal(second.summary.uploaded, 0);
  assert.equal(second.summary.skipped, 1);
  assert.equal(second.client.state.downloads, 1);
});

test("rechaza un .zip falso y no sube nada", async () => {
  const { summary, storage } = await run({}, {
    clientOptions: { messages: [message()], bytes: Buffer.from("no soy zip") }
  });
  assert.equal(summary.uploaded, 0);
  assert.equal(summary.failed, 1);
  assert.equal(summary.results[0].reason, "not_a_zip");
  assert.equal(storage.objects.size, 0);
});

test("corta por tamano declarado antes de descargar", async () => {
  const big = message({ bodyStructure: { type: "multipart/mixed", childNodes: [zipPart({ size: 5 * 1024 * 1024 })] } });
  const { summary, client } = await run({ maxBytes: 1024 * 1024 }, { clientOptions: { messages: [big] } });
  assert.equal(summary.failed, 1);
  assert.equal(summary.results[0].reason, "size_limit");
  assert.equal(client.state.downloads, 0);
});

test("corta por tamano real del stream aunque la estructura mienta", async () => {
  const small = message({ bodyStructure: { type: "multipart/mixed", childNodes: [zipPart({ size: 10 })] } });
  const { summary } = await run({ maxBytes: 1024 }, {
    clientOptions: { messages: [small], bytes: Buffer.concat([ZIP_BYTES, Buffer.alloc(2048)]) }
  });
  assert.equal(summary.failed, 1);
  assert.equal(summary.results[0].reason, "size_limit");
});

test("marca como leido solo cuando no hubo fallos y esta habilitado", async () => {
  const ok = await run({ markSeen: true }, { clientOptions: { messages: [message()] } });
  assert.equal(ok.client.state.flags.length, 1);
  assert.deepEqual(ok.client.state.flags[0].flags, ["\\Seen"]);

  const failed = await run({ markSeen: true }, { clientOptions: { messages: [message()], bytes: Buffer.from("roto") } });
  assert.equal(failed.client.state.flags.length, 0);
});

test("no descarga nada cuando el correo no trae zip", async () => {
  const plain = message({ bodyStructure: { type: "multipart/mixed", childNodes: [{ part: "1", type: "text/plain", size: 10 }] } });
  const { summary, client } = await run({}, { clientOptions: { messages: [plain] } });
  assert.equal(summary.candidates, 0);
  assert.equal(client.state.downloads, 0);
});

test("la configuracion IMAP exige usuario y app password", () => {
  assert.throws(
    () => readImapConfig({ MAILBOX_INGEST_TENANT_ID: "tenant-alpha" }),
    /MAILBOX_IMAP_USER/
  );
  assert.throws(
    () => readImapConfig({ MAILBOX_INGEST_TENANT_ID: "tenant-alpha", MAILBOX_IMAP_USER: "buzon@gmail.com" }),
    /MAILBOX_IMAP_PASSWORD/
  );
  const config = readImapConfig({ MAILBOX_INGEST_TENANT_ID: "tenant-alpha", MAILBOX_IMAP_USER: "buzon@gmail.com", MAILBOX_IMAP_PASSWORD: "x" });
  assert.equal(config.host, "imap.gmail.com");
  assert.equal(config.port, 993);
  assert.equal(config.secure, true);
  assert.equal(config.mailbox, "INBOX");
  assert.equal(config.markSeen, false);
});

test("el transporte se elige por configuracion explicita o por credencial presente", () => {
  assert.throws(() => resolveTransport({}), /MAILBOX_IMAP_USER o MAILBOX_GRAPH_CLIENT_ID/);
  assert.equal(resolveTransport({ MAILBOX_IMAP_USER: "buzon@gmail.com" }), "imap");
  assert.equal(resolveTransport({ MAILBOX_GRAPH_CLIENT_ID: "abc" }), "graph");
  assert.equal(resolveTransport({ MAILBOX_TRANSPORT: "imap", MAILBOX_GRAPH_CLIENT_ID: "abc" }), "imap");
  assert.throws(() => resolveTransport({ MAILBOX_TRANSPORT: "ftp" }), /MAILBOX_TRANSPORT/);
});
