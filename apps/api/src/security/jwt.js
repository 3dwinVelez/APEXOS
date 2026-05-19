const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function parseDuration(value = "8h") {
  const match = String(value).match(/^(\d+)([mhd])$/);
  if (!match) return 8 * 60 * 60;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 60 * 60;
  return amount * 24 * 60 * 60;
}

function sign(payload, options = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 24) throw new Error("JWT_SECRET debe tener al menos 24 caracteres.");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    iat: now,
    exp: now + parseDuration(options.expiresIn || "8h")
  };
  const encoded = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verify(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 24) throw new Error("JWT_SECRET debe tener al menos 24 caracteres.");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Token invalido");
  const [encodedHeader, encodedBody, signature] = parts;
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  if (header.alg !== "HS256") throw new Error("Algoritmo no permitido");
  const expected = crypto.createHmac("sha256", secret).update(`${encodedHeader}.${encodedBody}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Firma invalida");
  const payload = JSON.parse(Buffer.from(encodedBody, "base64url").toString("utf8"));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expirado");
  return payload;
}

module.exports = { sign, verify };
