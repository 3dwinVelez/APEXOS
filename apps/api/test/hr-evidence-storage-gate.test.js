'use strict';
// Fase D: la evidencia nueva se guarda en Storage antes de persistir la marcacion y las
// filas rescatadas+purgadas siguen devolviendo sus bytes por referencia. Sin red real:
// el almacen se stubbea sobre globalThis.fetch y Prisma sobre el cache de core/prisma.
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');

const evidenceStorage = require('../src/modules/hr/evidenceStorage');
const { punchPhotoItems, punchEvidenceCount } = require('../src/modules/hr/punchEvidence');

// JPEG minimo: firma FF D8 FF + relleno por encima del piso de 32 bytes de uploadInline.
const jpgBuf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64, 7)]);
const jpg = `data:image/jpeg;base64,${jpgBuf.toString('base64')}`;

function withEnv(vars, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
  const result = fn();
  if (result && typeof result.then === 'function') return result.then((v) => { restore(); return v; }, (e) => { restore(); throw e; });
  restore();
  return result;
}

function storageResponse(bytes, { status = 200, mime = 'image/jpeg' } = {}) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: async () => ab,
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? mime : null }
  };
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => handler(url, options);
  return () => { globalThis.fetch = original; };
}

test('la escritura y la lectura del almacen se activan por separado', () => {
  withEnv({ HR_EVIDENCE_STORAGE_ENABLED: undefined, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }, () => {
    assert.equal(evidenceStorage.writeEnabled(), false);
    assert.equal(evidenceStorage.readEnabled(), false);
  });
  withEnv({ HR_EVIDENCE_STORAGE_ENABLED: 'true', SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, () => {
    assert.equal(evidenceStorage.writeEnabled(), true);
    assert.equal(evidenceStorage.readEnabled(), true);
  });
  // lectura sin escritura: las filas rescatadas deben seguir visibles aunque el flag de
  // subida siga apagado (deploy del lector antes que el del escritor)
  withEnv({ HR_EVIDENCE_STORAGE_ENABLED: undefined, SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, () => {
    assert.equal(evidenceStorage.writeEnabled(), false);
    assert.equal(evidenceStorage.readEnabled(), true);
  });
});

test('pathForEvidence respeta la precedencia: bandera de rescate, legado, ruta declarada', () => {
  const flag = { hr_evidence_rescue_extra: { status: 'rescued', storage_path: 'company/t1/hr/extra-evidence/9/a.jpg' } };
  assert.equal(evidenceStorage.pathForEvidence({ storage_path: 'company/otro/x.jpg' }, flag, 'extra'), 'company/t1/hr/extra-evidence/9/a.jpg');
  const legacy = { hr_evidence_rescue: { status: 'rescued', storage_path: 'company/t1/hr/identity-photos/9/f.jpg' } };
  assert.equal(evidenceStorage.pathForEvidence(null, legacy, 'identity'), 'company/t1/hr/identity-photos/9/f.jpg');
  assert.equal(evidenceStorage.pathForEvidence(null, legacy, 'extra'), null);
  // la ruta declarada solo vale si es propia del producto y se sanea (Supabase rechaza no-ASCII)
  assert.equal(evidenceStorage.pathForEvidence({ storage_path: 'company/t1/hr/novedad/peña.jpg' }, {}, 'extra'), 'company/t1/hr/novedad/pe_a.jpg');
  assert.equal(evidenceStorage.pathForEvidence({ storage_path: 'https://externo.invalido/x.jpg' }, {}, 'extra'), null);
  assert.equal(evidenceStorage.pathForEvidence(null, null, 'extra'), null);
});

test('hasRescuedRef distingue identidad de evidencia extra por la bandera y el legado', () => {
  assert.equal(evidenceStorage.hasRescuedRef({ hr_evidence_rescue_extra: { status: 'rescued' } }, 'extra'), true);
  assert.equal(evidenceStorage.hasRescuedRef({ hr_evidence_rescue_extra: { status: 'rescued' } }, 'identity'), false);
  assert.equal(evidenceStorage.hasRescuedRef({ hr_evidence_rescue: { status: 'rescued', storage_path: 'x/identity-photos/f.jpg' } }, 'identity'), true);
  assert.equal(evidenceStorage.hasRescuedRef({ hr_evidence_rescue: { status: 'rescued', storage_path: 'x/identity-photos/f.jpg' } }, 'extra'), false);
  assert.equal(evidenceStorage.hasRescuedRef({}, 'extra'), false);
});

test('uploadInline sube por ruta declarada o content-addressed y toda falla es 503', async () => {
  await withEnv({ SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, async () => {
    const sha = crypto.createHash('sha256').update(jpgBuf).digest('hex');
    let called = null;
    const restore = stubFetch((url, options) => { called = { url, options }; return storageResponse(Buffer.alloc(0)); });
    try {
      const up = await evidenceStorage.uploadInline({ tenantId: 't1', entity: 'extra-evidence', fileName: '', base64Raw: jpg });
      // sin entityId la ruta es por contenido: dos reintentos apuntan al mismo objeto
      assert.equal(up.storage_path, `company/t1/hr/extra-evidence/${sha.slice(0, 32)}.jpg`);
      assert.equal(up.sha256, sha);
      assert.equal(up.bytes, jpgBuf.length);
      assert.match(called.url, /\/storage\/v1\/object\/operational-evidence\//);
      assert.equal(called.options.headers['x-upsert'], 'true');
      const declared = await evidenceStorage.uploadInline({ tenantId: 't1', entity: 'extra-evidence', fileName: 's.jpg', base64Raw: jpg, declaredPath: 'company/t1/hr/peña/s.jpg' });
      assert.equal(declared.storage_path, 'company/t1/hr/pe_a/s.jpg');
      await assert.rejects(evidenceStorage.uploadInline({ tenantId: 't1', entity: 'x', base64Raw: 'data:image/jpeg;base64,/9j/' }), (e) => e.statusCode === 400);
    } finally { restore(); }
    const failing = stubFetch(() => storageResponse(Buffer.alloc(0), { status: 502 }));
    try {
      await assert.rejects(evidenceStorage.uploadInline({ tenantId: 't1', entity: 'x', base64Raw: jpg }), (e) => e.statusCode === 503 && e.code === 'STORAGE_UPLOAD_FAILED');
    } finally { failing(); }
    const offline = stubFetch(() => { throw new Error('red caida'); });
    try {
      await assert.rejects(evidenceStorage.uploadInline({ tenantId: 't1', entity: 'x', base64Raw: jpg }), (e) => e.statusCode === 503 && e.code === 'STORAGE_UPLOAD_FAILED');
    } finally { offline(); }
  });
});

test('preparePunchEvidence cambia los bytes por referencias y con subida fallida la marcacion no se crea', async () => {
  await withEnv({ SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, async () => {
    const input = {
      type: 'ENTRADA',
      metadata: { identity_photo: { base64_data: jpg, name: 'selfie.jpg', type: 'image/jpeg', size: jpgBuf.length } },
      extra_evidence: { base64: jpg, name: 'soporte.jpg', type: 'image/jpeg', size: jpgBuf.length }
    };
    const restore = stubFetch(() => storageResponse(Buffer.alloc(0)));
    try {
      const next = await evidenceStorage.preparePunchEvidence({ tenantId: 't1', input });
      assert.equal(next.metadata.identity_photo.base64_data, '');
      assert.match(next.metadata.identity_photo.storage_path, /^company\/t1\/hr\/identity-photos\/[0-9a-f]{32}\.jpg$/);
      assert.equal(next.extra_evidence.base64, '');
      assert.match(next.extra_evidence.storage_path, /^company\/t1\/hr\/extra-evidence\/[0-9a-f]{32}\.jpg$/);
      // el input del llamador queda intacto: la transaccion persiste solo la copia
      assert.equal(input.metadata.identity_photo.base64_data, jpg);
      assert.equal(input.extra_evidence.base64, jpg);
    } finally { restore(); }
    const failing = stubFetch(() => storageResponse(Buffer.alloc(0), { status: 502 }));
    try {
      await assert.rejects(evidenceStorage.preparePunchEvidence({ tenantId: 't1', input }), (e) => e.statusCode === 503 && e.code === 'STORAGE_UPLOAD_FAILED');
    } finally { failing(); }
  });
});

test('la referencia purgada se anuncia sin bytes y cuenta una sola vez', () => {
  const onlyRef = { extra_evidence: { file_name: 'soporte.jpg', mime_type: 'image/jpeg', storage_path: 'company/t1/hr/extra-evidence/9/soporte.jpg' } };
  const items = punchPhotoItems(onlyRef);
  assert.equal(items.length, 1);
  assert.equal(items[0].base64_data, undefined);
  assert.equal(items[0].storage_path, 'company/t1/hr/extra-evidence/9/soporte.jpg');
  assert.equal(punchEvidenceCount(onlyRef), 1);
  const dup = { extra_evidence: [onlyRef.extra_evidence, onlyRef.extra_evidence], metadata: { extra_evidence: onlyRef.extra_evidence } };
  assert.equal(punchPhotoItems(dup).length, 1);
  assert.equal(punchEvidenceCount(dup), 1);
  // la cabecera huerfana (nombre sin bytes ni ruta) sigue anunciando soporte, una vez
  assert.equal(punchEvidenceCount({ extra_evidence: { file_name: 'viejo.jpg' } }), 1);
  assert.equal(punchEvidenceCount({ extra_evidence: { file_name: 'viejo.jpg', storage_path: 'company/t1/x.jpg' } }), 1);
});

test('una marcacion rescatada y purgada recupera sus bytes desde el almacen', async () => {
  process.env.REDIS_DISABLED = 'true';
  const prismaPath = require.resolve('../src/core/prisma');
  const servicePath = require.resolve('../src/modules/hr/service');
  const old = require.cache[prismaPath];
  const oldService = require.cache[servicePath];
  const rows = [
    {
      id: 7001, tenant_id: 't1', route_id: 5, type: 'ENTRADA', punched_at: new Date('2026-11-18T08:00:00Z'),
      metadata: { hr_evidence_rescue_extra: { status: 'rescued', storage_path: 'company/t1/hr/extra-evidence/7001/soporte.jpg' } },
      extra_evidence: { base64_data: '' }
    },
    {
      id: 7002, tenant_id: 't1', route_id: 5, type: 'SALIDA', punched_at: new Date('2026-11-18T09:00:00Z'),
      metadata: {
        identity_photo: { base64_data: '', storage_path: 'company/t1/hr/identity-photos/7002/selfie.jpg' },
        hr_evidence_rescue_identity: { status: 'rescued', storage_path: 'company/t1/hr/identity-photos/7002/selfie.jpg' }
      },
      extra_evidence: {}
    }
  ];
  const db = {
    runWithTenant: async (_tenant, fn) => fn(),
    timePunch: { findFirst: async ({ where }) => rows.find((r) => r.id === where.id && r.tenant_id === where.tenant_id) || null },
    activityEvidence: { findFirst: async () => null },
    workActivity: { findMany: async () => [] },
    $queryRaw: async () => []
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
  delete require.cache[servicePath];
  try {
    await withEnv({ SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, async () => {
      const service = require(servicePath);
      const requested = [];
      const restore = stubFetch((url) => { requested.push(String(url)); return storageResponse(jpgBuf); });
      try {
        const extra = await service.getMonitorEvidence('t1', 'punch', 7001);
        assert.equal(extra.base64_data, jpg);
        assert.equal(extra.available, true);
        const identity = await service.getMonitorEvidence('t1', 'identity', 7002);
        assert.equal(identity.base64_data, jpg);
        assert.equal(requested.length, 2);
        assert.ok(requested.every((u) => u.includes('/storage/v1/object/operational-evidence/company/t1/hr/')), 'la lectura no apunto al bucket de evidencia');
        // otro tenant: la fila ni siquiera existe para el, 404 sin leer el almacen
        await assert.rejects(service.getMonitorEvidence('t2', 'punch', 7001), (e) => e.statusCode === 404);
        // objeto ya no disponible: 404 educado, no un fallo tecnico
        const missing = stubFetch(() => storageResponse(Buffer.alloc(0), { status: 404 }));
        try {
          await assert.rejects(service.getMonitorEvidence('t1', 'punch', 7001), (e) => e.statusCode === 404 && e.code === 'EVIDENCIA_MONITOR_NO_ENCONTRADA');
        } finally { missing(); }
      } finally { restore(); }
    });
  } finally {
    if (old) require.cache[prismaPath] = old; else delete require.cache[prismaPath];
    if (oldService) require.cache[servicePath] = oldService; else delete require.cache[servicePath];
  }
});
