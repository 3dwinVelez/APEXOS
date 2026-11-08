const net = require("node:net");

const HOP = /^[1-9][0-9]?$/;
const KEYWORDS = new Set(["loopback", "linklocal", "uniquelocal"]);

function isAddressRange(token) {
  const parts = token.split("/");
  if (parts.length > 2) return false;
  const [address, prefix] = parts;
  const family = net.isIP(address);
  if (!family) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 6 ? 128 : 32);
}

// Fastify con `trustProxy: true` toma la IP de X-Forwarded-For sin preguntar
// quien lo firmo: cualquier cliente elige su propia IP y esquiva el bloqueo de
// login por intentos. Aqui no hay confianza implicita: solo se acepta una lista
// de proxies o un numero de saltos declarados en TRUST_PROXY, y `true` se
// rechaza a proposito porque es justo el valor que abre el spoofing.
function resolveTrustProxy(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "false" || raw === "0") return false;
  const tokens = raw.split(",").map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) return false;
  const valid = tokens.every((token) => HOP.test(token) || isAddressRange(token) || KEYWORDS.has(token));
  if (!valid) return false;
  return tokens.length === 1 ? tokens[0] : tokens;
}

module.exports = { resolveTrustProxy };
