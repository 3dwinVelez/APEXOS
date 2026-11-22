const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.DISABLE_REDIS = "true";

const face = require("../src/modules/hr/face-identity");
const consent = require("../src/modules/hr/face-consent");

// Maestro de rostros: varios empleados marcan en el mismo celular y la persona se
// identifica comparando la selfie de la marcacion con el rostro registrado.

const CONFIG = { enabled: true, matchThreshold: 0.55, antispoofMin: 0, livenessMin: 0 };
const A = Array.from({ length: 8 }, (_, i) => (i % 2 ? 1 : 0.5));
const A_NEAR = A.map((v, i) => v + (i === 0 ? 0.1 : 0));
const B = Array.from({ length: 8 }, (_, i) => (i % 2 ? -1 : 0.7));
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
const jpegDataUrl = `data:image/jpeg;base64,${JPEG.toString("base64")}`;

function withDetector(result, fn) {
  face.setDetectorForTests(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return Promise.resolve(fn()).finally(() => face.setDetectorForTests(null));
}

// ------------------------------------------------------------------ logica pura

test("similitud coseno: identica 1, cercana alta, distinta baja, vectores invalidos 0", () => {
  assert.equal(face.similarity(A, A).toFixed(6), "1.000000");
  assert.ok(face.similarity(A, A_NEAR) > 0.95);
  assert.ok(face.similarity(A, B) < 0.2);
  assert.equal(face.similarity(A, [1, 2]), 0);
  assert.equal(face.similarity(null, A), 0);
});

test("registro exige exactamente un rostro legible", () => withDetector({ faces: [] }, async () => {
  assert.equal((await face.enrollmentFromImage(JPEG, CONFIG)).code, "ROSTRO_NO_DETECTADO");
  face.setDetectorForTests(async () => ({ faces: [{ embedding: A }, { embedding: B }] }));
  assert.equal((await face.enrollmentFromImage(JPEG, CONFIG)).code, "VARIOS_ROSTROS");
  face.setDetectorForTests(async () => ({ faces: [{ embedding: A, real: 0.9, live: 0.9 }] }));
  const ok = await face.enrollmentFromImage(JPEG, CONFIG);
  assert.equal(ok.ok, true);
  assert.equal(ok.embedding.length, A.length);
  assert.equal(ok.model, face.FACE_MODEL);
}));

test("antispoof solo bloquea si se configura un minimo (por defecto es informativo)", () => withDetector({ faces: [{ embedding: A, real: 0.2, live: 0.9 }] }, async () => {
  assert.equal((await face.enrollmentFromImage(JPEG, CONFIG)).ok, true);
  assert.equal((await face.enrollmentFromImage(JPEG, { ...CONFIG, antispoofMin: 0.5 })).code, "POSIBLE_SUPLANTACION");
  const r = await face.evaluateSelfie({ enrolledEmbedding: A, selfieBuffer: JPEG, config: { ...CONFIG, antispoofMin: 0.5 } });
  assert.equal(r.status, "suplantacion");
}));

test("la selfie se evalua: coincide / no_coincide / sin_rostro / varios_rostros", async () => {
  await withDetector({ faces: [{ embedding: A_NEAR, real: 0.8, live: 0.9 }] }, async () => {
    const r = await face.evaluateSelfie({ enrolledEmbedding: A, selfieBuffer: JPEG, config: CONFIG });
    assert.equal(r.status, "coincide");
    assert.ok(r.similarity > 0.95);
    assert.equal(r.threshold, 0.55);
  });
  await withDetector({ faces: [{ embedding: B }] }, async () => {
    assert.equal((await face.evaluateSelfie({ enrolledEmbedding: A, selfieBuffer: JPEG, config: CONFIG })).status, "no_coincide");
  });
  await withDetector({ faces: [] }, async () => {
    assert.equal((await face.evaluateSelfie({ enrolledEmbedding: A, selfieBuffer: JPEG, config: CONFIG })).status, "sin_rostro");
  });
  await withDetector({ faces: [{ embedding: A }, { embedding: A }] }, async () => {
    assert.equal((await face.evaluateSelfie({ enrolledEmbedding: A, selfieBuffer: JPEG, config: CONFIG })).status, "varios_rostros");
  });
});

test("si el motor falla o esta desactivado, el resultado es no_disponible (nunca lanza)", async () => {
  await withDetector(new Error("modelo no cargo"), async () => {
    const r = await face.evaluateSelfie({ enrolledEmbedding: A, selfieBuffer: JPEG, config: CONFIG });
    assert.equal(r.status, "no_disponible");
    assert.match(r.reason, /modelo no cargo/);
  });
  const off = await face.evaluateSelfie({ enrolledEmbedding: A, selfieBuffer: JPEG, config: { ...CONFIG, enabled: false } });
  assert.equal(off.status, "no_disponible");
});

test("la autorizacion de datos tiene version y hash del texto exacto", () => {
  assert.match(consent.FACE_CONSENT_VERSION, /^\d{4}-\d{2}-v\d+$/);
  assert.match(consent.FACE_CONSENT_SHA256, /^[0-9a-f]{64}$/);
  assert.match(consent.FACE_CONSENT_TEXT, /dato biometrico sensible/);
});

// ------------------------------------------------------------------ servicio

function loadHrService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const previousPrisma = require.cache[prismaPath];
  const previousService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
    }
  };
}

const TENANT = "tenant-qa";
const session = { id: 7, email: "tecnico@apexos.local", role: { name: "Operario" } };
const admin = { id: 1, email: "admin@apexos.local", role: { name: "APEX_ADMIN" } };
const employee = { id: 222, tenant_id: TENANT, user_id: 7, code: "EMP-222", user_type: "operario", active: true, metadata: { name: "Tecnico" }, user: { id: 7, name: "Tecnico", email: "tecnico@apexos.local" } };

function fakePrisma(capture, { enrolled = null } = {}) {
  const enrollments = enrolled ? [{ id: 1, tenant_id: TENANT, employee_id: 222, active: true, embedding: enrolled, model: face.FACE_MODEL, enrolled_at: new Date() }] : [];
  const tx = {
    employee: { findFirst: async () => employee },
    timeRoute: { findFirst: async () => null },
    routePreoperationalChecklist: { findFirst: async () => null },
    timePunch: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }) => { capture.punches.push(data); return { id: 91, ...data }; }
    },
    gpsPing: { create: async () => ({}) },
    workSession: { findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    $executeRaw: async () => {},
    $queryRaw: async (strings) => (String(strings?.join ? strings.join("") : strings).includes("pg_try_advisory_xact_lock") ? [{ acquired: true }] : [])
  };
  return {
    runWithTenant: (_t, cb) => cb(),
    $transaction: async (cb) => cb(tx),
    employee: { findFirst: async () => employee, findMany: async () => [employee] },
    hrFaceEnrollment: {
      findFirst: async ({ where }) => enrollments.find((e) => e.employee_id === where.employee_id && e.active === where.active) || null,
      findMany: async () => enrollments.filter((e) => e.active),
      create: async ({ data }) => { const row = { id: enrollments.length + 1, ...data }; enrollments.push(row); capture.created.push(row); return row; },
      update: async ({ where, data }) => { const row = enrollments.find((e) => e.id === where.id); Object.assign(row, data); capture.updated.push(data); return row; }
    },
    timePunch: { findFirst: async () => null },
    workSession: { findFirst: async () => null },
    timeRoute: { findFirst: async () => null, findMany: async () => [] }
  };
}

const newCapture = () => ({ punches: [], created: [], updated: [] });
const enrollBody = (extra = {}) => ({ consent_accepted: true, consent_version: consent.FACE_CONSENT_VERSION, photo: { base64: jpegDataUrl, name: "rostro.jpg", type: "image/jpeg", size: JPEG.length }, ...extra });

test("servicio: registrar el rostro exige aceptar la autorizacion vigente", async () => {
  const loaded = loadHrService(fakePrisma(newCapture()));
  try {
    await assert.rejects(loaded.service.enrollOwnFace(TENANT, session, enrollBody({ consent_accepted: false })), (e) => e.code === "CONSENTIMIENTO_REQUERIDO");
    await assert.rejects(loaded.service.enrollOwnFace(TENANT, session, enrollBody({ consent_version: "2020-01-v0" })), (e) => e.code === "CONSENTIMIENTO_REQUERIDO");
  } finally {
    loaded.restore();
  }
});

test("servicio: registro valido queda ACTIVO con hash de la autorizacion y foto de referencia", () => withDetector({ faces: [{ embedding: A, real: 0.8, live: 0.9 }] }, async () => {
  const capture = newCapture();
  const loaded = loadHrService(fakePrisma(capture));
  try {
    const r = await loaded.service.enrollOwnFace(TENANT, session, enrollBody());
    assert.equal(r.enrolled, true);
    assert.equal(r.embedding.length, A.length, "el celular recibe su embedding para comparar sin senal");
    const row = capture.created[0];
    assert.equal(row.employee_id, 222);
    assert.equal(row.active, true);
    assert.equal(row.consent_text_sha256, consent.FACE_CONSENT_SHA256);
    assert.match(row.reference_photo.base64_data, /^data:image\/jpeg;base64,/);
  } finally {
    loaded.restore();
  }
}));

test("servicio: sin rostro en la foto responde 422 y no guarda", () => withDetector({ faces: [] }, async () => {
  const capture = newCapture();
  const loaded = loadHrService(fakePrisma(capture));
  try {
    await assert.rejects(loaded.service.enrollOwnFace(TENANT, session, enrollBody()), (e) => e.code === "ROSTRO_NO_DETECTADO" && e.statusCode === 422);
    assert.equal(capture.created.length, 0);
  } finally {
    loaded.restore();
  }
}));

test("servicio: con un rostro activo no se puede re-registrar (409) y solo un admin restablece", () => withDetector({ faces: [{ embedding: A }] }, async () => {
  const capture = newCapture();
  const loaded = loadHrService(fakePrisma(capture, { enrolled: A }));
  try {
    await assert.rejects(loaded.service.enrollOwnFace(TENANT, session, enrollBody()), (e) => e.code === "ROSTRO_YA_REGISTRADO" && e.statusCode === 409);
    await assert.rejects(loaded.service.resetEmployeeFace(TENANT, session, 222, {}), (e) => e.code === "ROSTRO_RESTABLECER_DENEGADO");
    const r = await loaded.service.resetEmployeeFace(TENANT, admin, 222, { reason: "cambio de aspecto" });
    assert.equal(r.ok, true);
    assert.equal(capture.updated[0].active, false);
    assert.equal(capture.updated[0].revoke_reason, "cambio de aspecto");
  } finally {
    loaded.restore();
  }
}));

function webPunch() {
  return {
    user_name: "EMP-222",
    type: "entrada",
    punched_at: new Date().toISOString(),
    idempotency_key: `uuid-face-${Math.random().toString(36).slice(2)}`,
    identity_photo: { base64: jpegDataUrl, name: "selfie.jpg", type: "image/jpeg", size: JPEG.length },
    metadata: { source: "apexos-web-movil" }
  };
}

test("servicio: la marcacion cuya selfie coincide queda con face_match coincide", () => withDetector({ faces: [{ embedding: A_NEAR, real: 0.8, live: 0.9 }] }, async () => {
  const capture = newCapture();
  const loaded = loadHrService(fakePrisma(capture, { enrolled: A }));
  try {
    const r = await loaded.service.createOwnPunch(TENANT, session, webPunch());
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(capture.punches[0].metadata.identity_verification.face_match.status, "coincide");
  } finally {
    loaded.restore();
  }
}));

test("servicio: si la selfie NO coincide la marcacion se registra igual pero SENALADA", () => withDetector({ faces: [{ embedding: B }] }, async () => {
  const capture = newCapture();
  const loaded = loadHrService(fakePrisma(capture, { enrolled: A }));
  try {
    const r = await loaded.service.createOwnPunch(TENANT, session, webPunch());
    assert.equal(r.ok, true, "no se pierde la marcacion");
    assert.equal(capture.punches.length, 1);
    assert.equal(capture.punches[0].metadata.identity_verification.face_match.status, "no_coincide");
  } finally {
    loaded.restore();
  }
}));

test("servicio: sin rostro registrado la marcacion indica sin_registro", () => withDetector({ faces: [{ embedding: A }] }, async () => {
  const capture = newCapture();
  const loaded = loadHrService(fakePrisma(capture));
  try {
    await loaded.service.createOwnPunch(TENANT, session, webPunch());
    assert.equal(capture.punches[0].metadata.identity_verification.face_match.status, "sin_registro");
  } finally {
    loaded.restore();
  }
}));

// ------------------------------------------------------------------ modelo real

test("humo: el modelo real (Human wasm) distingue a la misma persona de otra", { timeout: 120000 }, async () => {
  const sharp = require("sharp");
  const sample = path.join(path.dirname(require.resolve("@vladmandic/human")), "..", "assets", "samples.jpg");
  const man = await sharp(sample).extract({ left: 327, top: 0, width: 210, height: 158 }).resize(420).jpeg().toBuffer();
  const manDark = await sharp(man).modulate({ brightness: 0.7 }).resize(300).jpeg({ quality: 60 }).toBuffer();
  const woman = await sharp(sample).extract({ left: 165, top: 0, width: 145, height: 158 }).resize(300).jpeg().toBuffer();
  const enr = await face.enrollmentFromImage(man, CONFIG);
  assert.equal(enr.ok, true);
  assert.equal(enr.embedding.length, 1024);
  const same = await face.evaluateSelfie({ enrolledEmbedding: enr.embedding, selfieBuffer: manDark, config: CONFIG });
  const other = await face.evaluateSelfie({ enrolledEmbedding: enr.embedding, selfieBuffer: woman, config: CONFIG });
  assert.equal(same.status, "coincide", JSON.stringify(same));
  assert.equal(other.status, "no_coincide", JSON.stringify(other));
});
