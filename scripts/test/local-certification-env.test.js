const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const helper = path.resolve(__dirname, '../certifications/local-certification-env.cjs');
// Do not inherit the developer's database, service URLs, preload flags or credentials.
const runtimeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(SystemRoot|WINDIR|PATH|TEMP|TMP|HOME|USERPROFILE|ELECTRON_RUN_AS_NODE)$/i.test(key)));
const valid = {
  CERT_DATABASE_NAME: 'apexos_cert_unit_123',
  DATABASE_URL: 'postgresql://cert:unit_test_password@127.0.0.1:55432/apexos_cert_unit_123?schema=public',
  CERT_API_URL: 'http://127.0.0.1:3100',
  CERT_WEB_URL: 'http://localhost:3101/'
};
const probe = `
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const readFileSync = fs.readFileSync;
  fs.readFileSync = function(file, ...args) {
    assert.ok(!/^\\.env(?:\\.|$)/.test(path.basename(String(file))), 'implicit .env read');
    return readFileSync.call(this, file, ...args);
  };
  const load = require('node:module')._load;
  require('node:module')._load = function(id, ...args) {
    assert.ok(id === ${JSON.stringify(helper)} || id === 'node:assert/strict', 'unexpected dependency: ' + id);
    return load.call(this, id, ...args);
  };
  const before = JSON.stringify(process.env);
  const config = require(${JSON.stringify(helper)});
  assert.equal(JSON.stringify(process.env), before, 'helper must not mutate caller environment');
  console.log(JSON.stringify({ apiBase: config.apiBase, webBase: config.webBase, target: config.target,
    env: Object.fromEntries(['CERT_DATABASE_NAME', 'DATABASE_URL', 'DIRECT_URL', 'CERT_API_URL', 'CERT_WEB_URL'].map(key => [key, config.certEnv[key]])) }));
`;

function exercise(overrides = {}, source = probe) {
  const env = Object.fromEntries(Object.entries({ ...runtimeEnv, ...valid, ...overrides }).filter(([, value]) => value !== undefined));
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: path.dirname(helper), env, encoding: 'utf8', timeout: 10000, windowsHide: true
  });
  assert.ifError(result.error);
  return result;
}

function accepted(overrides) {
  const result = exercise(overrides);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function rejected(overrides, label) {
  const result = exercise(overrides);
  assert.notEqual(result.status, 0, 'unsafe environment accepted');
  assert.ok(result.stderr.includes(label), result.stderr);
  assert.ok(!result.stderr.includes('unit_test_password'), 'validation must not leak credentials');
}

test('explicit isolated targets export sanitized metadata and pin child DB environment without .env or I/O dependencies', () => {
  const result = accepted();
  assert.equal(result.apiBase, 'http://127.0.0.1:3100');
  assert.equal(result.webBase, 'http://localhost:3101');
  assert.deepEqual(result.target, {
    database: { name: valid.CERT_DATABASE_NAME, host: '127.0.0.1', port: 55432 },
    api: { origin: result.apiBase, host: '127.0.0.1', port: 3100 },
    web: { origin: result.webBase, host: 'localhost', port: 3101 }
  });
  assert.deepEqual(result.env, { ...valid, DIRECT_URL: valid.DATABASE_URL });
  assert.ok(!JSON.stringify(result.target).includes('unit_test_password'));
});

test('both loopback host spellings and postgres schemes address the same isolated DB', () => {
  const direct = 'postgres://cert:unit_test_password@localhost:55432/apexos_cert_unit_123';
  const result = accepted({ DIRECT_URL: direct, CERT_API_URL: 'http://localhost:3100/', CERT_WEB_URL: 'http://127.0.0.1:3101' });
  assert.equal(result.env.DIRECT_URL, direct);
  assert.equal(accepted({ DATABASE_URL: direct }).target.database.host, 'localhost');
});

test('safe database identifiers are bounded by PostgreSQL identifier length', () => {
  const name = 'apexos_cert_'.padEnd(63, 'a');
  assert.equal(accepted({ CERT_DATABASE_NAME: name, DATABASE_URL: 'postgresql://localhost:55432/' + name }).target.database.name, name);
});

for (const key of Object.keys(valid)) {
  test(`${key} is required explicitly (no root .env fallback)`, () => rejected({ [key]: undefined }, key));
}

const invalidNames = ['', 'apexos', 'apexos_cert_', 'other_cert_db', 'apexos_cert_a-b', 'apexos_cert_a/b', 'apexos_cert_a;drop', 'apexos_cert_á', 'apexos_cert_a\n', ' apexos_cert_a', 'apexos_cert_'.padEnd(64, 'a')];
for (const [index, name] of invalidNames.entries()) {
  test(`reject unsafe database identifier ${index + 1}`, () => rejected({ CERT_DATABASE_NAME: name }, 'CERT_DATABASE_NAME'));
}

const invalidDatabases = [
  '', 'not-a-url', 'http://127.0.0.1:55432/apexos_cert_unit_123',
  'postgresql://remote.example:55432/apexos_cert_unit_123',
  'postgresql://127.0.0.1.remote.example:55432/apexos_cert_unit_123',
  'postgresql://localhost:unit_test_password@remote.example:55432/apexos_cert_unit_123',
  'postgresql://[::1]:55432/apexos_cert_unit_123',
  'postgresql://127.1:55432/apexos_cert_unit_123',
  'postgresql://localhost/apexos_cert_unit_123',
  'postgresql://localhost:5432/apexos_cert_unit_123',
  'postgresql://localhost:54320/apexos_cert_unit_123',
  'postgresql://localhost:055432/apexos_cert_unit_123',
  'postgresql://localhost:55432/apexos',
  'postgresql://localhost:55432/apexos_cert_other',
  'postgresql://localhost:55432/',
  'postgresql://localhost:55432/apexos_cert_unit_123/',
  'postgresql://localhost:55432/apexos_cert_other/../apexos_cert_unit_123',
  'postgresql://localhost:55432/%61pexos_cert_unit_123',
  valid.DATABASE_URL + '#fragment', valid.DATABASE_URL + '\n',
  valid.DATABASE_URL + '&host=remote.example', valid.DATABASE_URL + '&hostaddr=1.2.3.4',
  valid.DATABASE_URL + '&port=54320', valid.DATABASE_URL + '&dbname=apexos',
  valid.DATABASE_URL + '&service=usual', valid.DATABASE_URL + '&options=unsafe',
  valid.DATABASE_URL + '&%68ost=remote.example'
];
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  for (const [index, value] of invalidDatabases.entries()) {
    test(`${key} rejects unsafe or mismatched target ${index + 1}`, () => rejected({ [key]: value }, key));
  }
}

const invalidOrigins = [
  '', 'not-a-url', 'https://localhost:3100', 'http://remote.example:3100',
  'http://localhost.remote.example:3100', 'http://[::1]:3100', 'http://127.1:3100',
  'http://2130706433:3100', 'http://0x7f000001:3100', 'http://localhost.:3100',
  'http://localhost', 'http://localhost:0', 'http://localhost:65536',
  'http://localhost:3000', 'http://127.0.0.1:3001', 'http://localhost:54320',
  'http://localhost:03000', 'http://localhost:03100', 'http://localhost:3100/path',
  'http://localhost:3100/../', 'http://localhost:3100//', 'http://localhost:3100?x=1',
  'http://localhost:3100?', 'http://localhost:3100/#x', 'http://localhost:3100#',
  'http://user:unit_test_password@localhost:3100', 'http://@localhost:3100',
  ' http://localhost:3100', 'http://localhost:3100\n', 'http://local\thost:3100',
  'http://localhost:3100\\', '//localhost:3100'
];
for (const key of ['CERT_API_URL', 'CERT_WEB_URL']) {
  for (const [index, value] of invalidOrigins.entries()) {
    test(`${key} rejects unsafe origin ${index + 1}`, () => rejected({ [key]: value }, key));
  }
}

test('browser API argument accepts ephemeral loopback ports but never usual services or implicit defaults', () => {
  const result = exercise({}, `
    const assert = require('node:assert/strict');
    const { localOrigin } = require(${JSON.stringify(helper)});
    assert.equal(localOrigin('http://127.0.0.1:49152/', 'browser API base'), 'http://127.0.0.1:49152');
    for (const value of [undefined, '', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:54320', 'http://remote.example:49152']) {
      assert.throws(() => localOrigin(value, 'browser API base'), /browser API base/);
    }
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('the idle watcher ignores cached dev chunks and only releases when API requests close', () => {
  const result = exercise({}, `
    const assert = require('node:assert/strict');
    const { EventEmitter } = require('node:events');
    const { createApiIdleWatcher } = require(${JSON.stringify(helper)});
    const page = new EventEmitter();
    const watcher = createApiIdleWatcher(page, 250);
    const api = { url: () => 'http://127.0.0.1:3310/api/v1/transport/vehicles?include_retired=true' };
    const chunk = { url: () => 'http://127.0.0.1:3311/_next/static/chunks/main-app.js' };
    (async () => {
      page.emit('request', chunk);
      await watcher.wait();
      page.emit('request', api);
      let settled = false;
      watcher.wait().then(() => { settled = true; }, () => {});
      await new Promise(resolve => setTimeout(resolve, 600));
      assert.equal(settled, false, 'una peticion de API abierta debe mantener la pagina ocupada');
      page.emit('requestfailed', api);
      await watcher.wait();
      console.log('idle watcher ok');
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /idle watcher ok/);
});

test('the shared navigation helper waits for API traffic and passes the response through', () => {
  const result = exercise({}, `
    const assert = require('node:assert/strict');
    const { EventEmitter } = require('node:events');
    const { gotoLocalAppPage } = require(${JSON.stringify(helper)});
    class FakePage extends EventEmitter {
      constructor() { super(); this.calls = []; this.bypasses = 0; }
      setBypassServiceWorker(value) { this.bypasses += value === true ? 1 : 0; return Promise.resolve(); }
      goto(url, options) {
        this.calls.push({ url, options });
        const api = { url: () => 'http://127.0.0.1:3310/api/v1/auth/me' };
        this.emit('request', api);
        setTimeout(() => this.emit('requestfinished', api), 200);
        return Promise.resolve({ status: () => 200, url });
      }
    }
    (async () => {
      const page = new FakePage();
      const response = await gotoLocalAppPage(page, 'http://127.0.0.1:3311/dashboard/compras');
      assert.deepEqual(page.calls[0].options, { waitUntil: 'domcontentloaded', timeout: 120000 });
      assert.equal(response.status(), 200, 'la navegacion debe conservar la respuesta para las aserciones HTTP');
      await gotoLocalAppPage(page, 'http://127.0.0.1:3311/login');
      assert.equal(page.listenerCount('request'), 1, 'un unico observador por pagina');
      assert.equal(page.bypasses, 1, 'el esquiva el service worker una sola vez por pagina');
      console.log('navigation helper ok');
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /navigation helper ok/);
});

test('the shared navigation helper retries one killed navigation without duplicating its watcher', () => {
  const result = exercise({}, `
    const assert = require('node:assert/strict');
    const { EventEmitter } = require('node:events');
    const { gotoLocalAppPage } = require(${JSON.stringify(helper)});
    class FlakyPage extends EventEmitter {
      constructor(failures) { super(); this.failures = failures; this.calls = []; }
      setBypassServiceWorker() { return Promise.resolve(); }
      goto(url, options) {
        this.calls.push({ url, options });
        if (this.calls.length <= this.failures) {
          this.emit('request', { url: () => 'http://127.0.0.1:3310/api/v1/never-closed' });
          return Promise.reject(new Error('net::ERR_ABORTED'));
        }
        const api = { url: () => 'http://127.0.0.1:3310/api/v1/auth/me' };
        this.emit('request', api);
        setTimeout(() => this.emit('requestfinished', api), 200);
        return Promise.resolve({ status: () => 200, url });
      }
    }
    (async () => {
      const recovered = new FlakyPage(1);
      const response = await gotoLocalAppPage(recovered, 'http://127.0.0.1:3311/dashboard/inventario/reportes');
      assert.equal(recovered.calls.length, 2, 'la navegacion abortada se reintenta una vez');
      assert.equal(response.status(), 200);
      assert.equal(recovered.listenerCount('request'), 1, 'el reintento no acumula observadores');

      const exhausted = new FlakyPage(9);
      await assert.rejects(() => gotoLocalAppPage(exhausted, 'http://127.0.0.1:3311/login'), /ERR_ABORTED/);
      assert.equal(exhausted.calls.length, 2, 'no se reintenta indefinidamente un fallo persistente');
      console.log('navigation retry ok');
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /navigation retry ok/);
});
