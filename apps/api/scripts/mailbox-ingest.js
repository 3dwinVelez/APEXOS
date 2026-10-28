/**
 * Descarga una vez los adjuntos .zip del buzon y los guarda en almacenamiento.
 * Uso: npm run mail:ingest [-- --transport=imap|graph]
 */
require("../src/core/loadEnv")();
const { runIngest } = require("../src/modules/mailbox/ingest-runner");

const flag = process.argv.find((argument) => argument.startsWith("--transport="));
const transport = flag ? flag.slice("--transport=".length).trim().toLowerCase() : undefined;

runIngest({ transport, log: (message, detail) => console.error(message, detail) })
  .then((summary) => {
    const { results, ...totals } = summary;
    console.log(JSON.stringify(totals, null, 2));
    for (const entry of results) {
      console.log(`${entry.status.toUpperCase()} ${entry.attachment || "(sin nombre)"} -> ${entry.reason || entry.key || ""}`);
    }
  })
  .catch((error) => {
    console.error(`Ingesta fallida: ${error.message}`);
    process.exit(1);
  });
