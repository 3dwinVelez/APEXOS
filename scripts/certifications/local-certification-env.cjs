// Certification-only guard. Environment must be supplied explicitly; never load .env here.
const assert = require('node:assert/strict');

const databaseName = process.env.CERT_DATABASE_NAME;
assert.ok(typeof databaseName === 'string' && databaseName === databaseName.trim() && /^apexos_cert_[A-Za-z0-9_]+$/.test(databaseName) && databaseName.length <= 63,
  'CERT_DATABASE_NAME must be a safe apexos_cert_ identifier (at most 63 characters)');

function databaseTarget(value, label) {
  const message = `${label} must target CERT_DATABASE_NAME on localhost or 127.0.0.1:55432`;
  assert.ok(typeof value === 'string' && !/[\s\\#]/.test(value), message);
  assert.ok(/^postgres(?:ql)?:\/\/(?:[^@/?#\s]+@)?(?:localhost|127\.0\.0\.1):55432\/[A-Za-z0-9_]+(?:\?[^#\s]*)?$/.test(value), message);
  let url;
  try { url = new URL(value); } catch { throw new Error(message); }
  assert.equal(url.pathname, '/' + databaseName, message);
  // Do not allow connection parameters to override the host, port or database.
  const allowed = new Set(['schema', 'sslmode', 'connection_limit', 'pool_timeout', 'connect_timeout', 'socket_timeout', 'pgbouncer']);
  for (const key of url.searchParams.keys()) assert.ok(allowed.has(key), `${label} has an unsupported connection parameter`);
  return { name: databaseName, host: url.hostname, port: 55432 };
}

function localOrigin(value, label) {
  const message = `${label} must be a plain loopback http origin with an explicit alternate port (not 3000, 3001 or 54320)`;
  assert.ok(typeof value === 'string' && !/\s/.test(value), message);
  const match = /^http:\/\/(localhost|127\.0\.0\.1):([1-9][0-9]{0,4})\/?$/.exec(value);
  assert.ok(match && Number(match[2]) <= 65535 && ![3000, 3001, 54320].includes(Number(match[2])), message);
  return new URL(value).origin;
}

const database = databaseTarget(process.env.DATABASE_URL, 'DATABASE_URL');
if (process.env.DIRECT_URL !== undefined) databaseTarget(process.env.DIRECT_URL, 'DIRECT_URL');
const apiBase = localOrigin(process.env.CERT_API_URL, 'CERT_API_URL');
const webBase = localOrigin(process.env.CERT_WEB_URL, 'CERT_WEB_URL');
const serviceTarget = origin => {
  const url = new URL(origin);
  return { origin, host: url.hostname, port: Number(url.port || 80) };
};
const target = { database, api: serviceTarget(apiBase), web: serviceTarget(webBase) };
// Pin both DB variables before application loaders or children can fill missing values from .env.
const certEnv = { ...process.env, DIRECT_URL: process.env.DIRECT_URL ?? process.env.DATABASE_URL };

module.exports = { apiBase, webBase, target, certEnv, localOrigin };
