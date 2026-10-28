const { resolveTransport, isIngestEnabled } = require("./config");

function transportModule(transport) {
  return transport === "imap" ? require("./imap-mail-ingest") : require("./graph-mail-ingest");
}

async function runIngest(options = {}) {
  const env = options.env || process.env;
  const transport = options.transport || resolveTransport(env);
  return transportModule(transport).ingestOnce({ ...options, env });
}

async function runScheduled(env = process.env) {
  if (!isIngestEnabled(env)) return null;
  const transport = resolveTransport(env);
  const summary = await runIngest({ env, transport });
  console.info(`[mailbox] ingesta programada (${transport}): ${summary.uploaded} subidos, ${summary.skipped} omitidos, ${summary.failed} fallidos`);
  return summary;
}

module.exports = { runIngest, runScheduled };
