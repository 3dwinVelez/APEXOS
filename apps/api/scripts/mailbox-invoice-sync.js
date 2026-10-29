/**
 * Sincroniza facturas electronicas desde una carpeta hacia la base de datos de APEX.
 * Escanea MAILBOX_INVOICE_SYNC_DIR (zips y xml, recursivo), extrae los datos del XML
 * e inserta filas en invoice_received (modelo ReceivedInvoice), sin duplicados.
 * Uso: npm run mail:invoice-sync
 */
require("../src/core/loadEnv")();
const { readSyncConfig, syncFolder } = require("../src/modules/mailbox/invoice-folder-sync");

syncFolder({ log: (message, detail) => console.error(message, detail) })
  .then((summary) => {
    const { failed, ...totals } = summary;
    console.log(JSON.stringify(totals, null, 2));
    for (const entry of failed) {
      console.log(`FALLIDO ${entry.file} -> ${entry.error}`);
    }
  })
  .catch((error) => {
    console.error(`Sincronización fallida: ${error.message}`);
    process.exit(1);
  });
