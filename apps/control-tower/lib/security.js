"use strict";

const crypto = require("node:crypto");

const SECRET_PATTERNS = [
  /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
  /\b(?:password|passwd|secret|token|apikey|api_key)\s*[:=]\s*["']?[^\s"',;]{6,}/gi
];

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    crypto.timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function redact(value) {
  if (value == null) return value;
  let text = typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[redactado]");
  return text;
}

function readToken(req) {
  const header = req.headers["authorization"];
  if (typeof header === "string" && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, "").trim();
  const direct = req.headers["x-tower-token"];
  return typeof direct === "string" ? direct.trim() : "";
}

function createAuthGuard(token) {
  return function guard(req) {
    if (!token) return { ok: false, status: 503, code: "TOKEN_NO_CONFIGURADO" };
    if (!safeEqual(readToken(req), token)) return { ok: false, status: 401, code: "NO_AUTORIZADO" };
    return { ok: true };
  };
}

function createRateLimiter({ limit = 20, windowMs = 60000, now = Date.now } = {}) {
  const buckets = new Map();
  return {
    check(key) {
      const current = now();
      const bucket = buckets.get(key);
      if (!bucket || current - bucket.startedAt >= windowMs) {
        buckets.set(key, { startedAt: current, count: 1 });
        return { ok: true, remaining: limit - 1 };
      }
      bucket.count += 1;
      if (bucket.count > limit) {
        return { ok: false, remaining: 0, retryAfterMs: windowMs - (current - bucket.startedAt) };
      }
      return { ok: true, remaining: limit - bucket.count };
    },
    reset() {
      buckets.clear();
    }
  };
}

function assertLoopback(host) {
  return ["127.0.0.1", "::1", "localhost"].includes(String(host).toLowerCase());
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeText(value, maxLength = 4000) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, maxLength);
}

module.exports = {
  safeEqual,
  redact,
  readToken,
  createAuthGuard,
  createRateLimiter,
  assertLoopback,
  isPlainObject,
  sanitizeText
};
