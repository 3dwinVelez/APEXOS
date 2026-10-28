/**
 * Autoriza el buzon de Outlook una sola vez con device code (OAuth2).
 * Uso: npm run mail:login
 * Guarda el refresh token fuera de git (MAILBOX_GRAPH_TOKEN_FILE).
 */
require("../src/core/loadEnv")();
const { resolveTokenFile } = require("../src/modules/mailbox/config");
const { deviceCodeLogin } = require("../src/modules/mailbox/graph-auth");

async function main() {
  const clientId = String(process.env.MAILBOX_GRAPH_CLIENT_ID || "").trim();
  if (!clientId) {
    console.error("Falta MAILBOX_GRAPH_CLIENT_ID. Registra la app en Entra y define la variable en .env.");
    process.exit(1);
  }
  const account = String(process.env.MAILBOX_GRAPH_ACCOUNT || "").trim() || null;
  const tokenFile = resolveTokenFile(process.env);
  console.log(`Autorizando ${account || "el buzon de Outlook"}`);
  console.log(`El refresh token se guardara en: ${tokenFile}`);
  await deviceCodeLogin({ clientId, account, tokenFile });
  console.log("Listo. Ya puedes ejecutar: npm run mail:ingest");
}

main().catch((error) => {
  console.error(`Autorizacion fallida: ${error.message}`);
  process.exit(1);
});
