// Certificacion LOCAL de huella (WebAuthn), rostro y celular del camion para la web movil.
//
// Base de datos local REAL, API real (apps/api/server.js) y autenticador WebAuthn de software
// con llaves P-256 reales en el formato del estandar. Los rostros se recortan en tiempo de
// ejecucion de assets/samples.jpg de @vladmandic/human (no se versionan imagenes): dos
// personas distintas y la misma persona con otra luz. Sin escrituras remotas.
//
// Uso: node scripts/certifications/hr-huella-rostro-web-movil-local.js --output=<json>
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
require("../load-env")();
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error("Local database required");

const RP_ID = "movil.cert.apexos.test";
const ORIGIN = `https://${RP_ID}`;
Object.assign(process.env, {
  NODE_ENV: "test",
  REDIS_DISABLED: "true",
  DISABLE_REDIS: "true",
  JWT_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  ALLOWED_ORIGINS: ORIGIN,
  WEBAUTHN_ORIGINS: ORIGIN,
  WEBAUTHN_RP_IDS: RP_ID
});

const db = require("../../apps/api/src/core/prisma");
const bcrypt = require("bcrypt");
const sharp = require("sharp");
const faceIdentity = require("../../apps/api/src/modules/hr/face-identity");
const { FACE_CONSENT_VERSION } = require("../../apps/api/src/modules/hr/face-consent");
const { personalPunchMessage } = require("../../apps/api/src/modules/hr/personal-webauthn");
const { challengeForMessage, crewPunchMessage } = require("../../apps/api/src/modules/hr/shared-device-identity");

const output = process.argv.find((a) => a.startsWith("--output="))?.slice(9);
const result = { environment: "LOCAL", status: "running", started_at: new Date().toISOString(), checks: [], measurements: {} };
let app;

async function check(name, fn) {
  await fn();
  result.checks.push(name);
  console.log("PASS " + name);
}

// ------------------------------------------------------------------ autenticador de software
const b64url = (b) => Buffer.from(b).toString("base64url");
const sha = (b) => crypto.createHash("sha256").update(b).digest();

function authenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { privateKey, publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"), credentialId: b64url(crypto.randomBytes(32)) };
}
function authData(flags, count = 0) {
  const c = Buffer.alloc(4);
  c.writeUInt32BE(count);
  return Buffer.concat([sha(Buffer.from(RP_ID, "utf8")), Buffer.from([flags]), c]);
}
const clientData = (type, challenge) => Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }), "utf8");
function registration(key, challenge) {
  return {
    credential_id: key.credentialId,
    public_key: key.publicKey,
    public_key_algorithm: -7,
    client_data_json: b64url(clientData("webauthn.create", challenge)),
    authenticator_data: b64url(authData(0x45)),
    rp_id: RP_ID
  };
}
// Firma un reto ya en base64url (el que viaja en clientData.challenge).
function assertion(key, challenge, signer = key) {
  const cd = clientData("webauthn.get", challenge);
  const ad = authData(0x05);
  return {
    credential_id: key.credentialId,
    authenticator_data: b64url(ad),
    client_data_json: b64url(cd),
    signature: b64url(crypto.sign("sha256", Buffer.concat([ad, sha(cd)]), { key: signer.privateKey, dsaEncoding: "der" }))
  };
}

// ------------------------------------------------------------------ rostros de muestra
async function sampleFaces() {
  const humanDir = path.dirname(require.resolve("@vladmandic/human"));
  const samples = path.join(humanDir, "..", "assets", "samples.jpg");
  const { width, height } = await sharp(samples).metadata();
  const w = Math.floor(width / 3), h = Math.floor(height / 3);
  const tile = (r, c) => sharp(samples).extract({ left: c * w, top: r * h, width: w, height: h }).jpeg({ quality: 90 }).toBuffer();
  const personA = await tile(0, 0);
  const personB = await tile(0, 2);
  const personADark = await sharp(personA).modulate({ brightness: 0.75 }).jpeg({ quality: 82 }).toBuffer();
  return { personA, personADark, personB };
}
const photo = (buf, name) => ({ base64: `data:image/jpeg;base64,${buf.toString("base64")}`, name, type: "image/jpeg", size: buf.length });

// ------------------------------------------------------------------ datos y API
function bogotaDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function bogotaHHMM(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

(async () => {
  try {
    const faces = await sampleFaces();
    const password = "Cert!" + crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const stamp = crypto.randomUUID().slice(0, 8);
    async function company(label) {
      const tenant = await db.tenant.create({ data: { name: `CERT huella ${label} ${stamp}`, active_modules: ["M-17", "M-22"] } });
      const worker = await db.role.create({ data: { tenant_id: tenant.id, name: `Operario ${label}`, metadata: { role_type: "custom" }, permissions: { create: [["hr", "read"], ["hr", "write"]].map(([module, action]) => ({ module, action })) } } });
      const admin = await db.role.create({ data: { tenant_id: tenant.id, name: "APEX_ADMIN", is_system: true, permissions: { create: [{ module: "*", action: "*" }] } } });
      return { tenant, worker, admin };
    }
    async function person(co, label, role) {
      const user = await db.user.create({ data: { tenant_id: co.tenant.id, name: `CERT ${label}`, email: `${crypto.randomUUID()}@example.invalid`, password: hash, role_id: role.id } });
      const code = `CERT-${label}-${stamp}`.toUpperCase();
      const employee = await db.employee.create({ data: { tenant_id: co.tenant.id, user_id: user.id, code, salary_base: 1500000, position: "operario", department: "CERT", hire_date: new Date("2026-11-01T05:00:00Z"), metadata: { name: `CERT ${label}`, document: `99${Date.now()}${label.length}` } } });
      return { user, employee };
    }
    const co = await company("A");
    const neighbor = await company("B");
    const ana = await person(co, "ana", co.worker);
    const beto = await person(co, "beto", co.worker);
    const adminUser = await db.user.create({ data: { tenant_id: co.tenant.id, name: "CERT admin", email: `${crypto.randomUUID()}@example.invalid`, password: hash, role_id: co.admin.id } });
    const vecino = await person(neighbor, "vecino", neighbor.worker);

    const day = bogotaDay();
    const route = await db.timeRoute.create({
      data: { tenant_id: co.tenant.id, date: new Date(`${day}T05:00:00Z`), vehicle_plate: "CRT123", employees: [ana.employee.code, beto.employee.code], start_time: bogotaHHMM(), end_time: "23:59", tolerance_minutes: 30, status: "active" }
    });

    app = await require("../../apps/api/server")();
    const base = await app.listen({ host: "127.0.0.1", port: 0 });
    async function call(p, token, method = "GET", body) {
      const r = await fetch(base + "/api/v1" + p, {
        method,
        headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}), origin: ORIGIN },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(60000)
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }
    async function login(user) {
      const r = await call("/auth/login", null, "POST", { email: user.email, password });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return r.body.token;
    }
    const tokenAna = await login(ana.user);
    const tokenBeto = await login(beto.user);
    const tokenAdmin = await login(adminUser);
    const tokenVecino = await login(vecino.user);
    const keyAna = authenticator();

    await check("registro de rostro con autorizacion biometrica: queda ACTIVO, sin autorizacion 400 y repetirlo 409", async () => {
      const sin = await call("/hr/self/face-enrollment", tokenAna, "POST", { photo: photo(faces.personA, "ana.jpg"), consent_accepted: false, consent_version: FACE_CONSENT_VERSION });
      assert.equal(sin.status, 400, JSON.stringify(sin.body));
      const ok = await call("/hr/self/face-enrollment", tokenAna, "POST", { photo: photo(faces.personA, "ana.jpg"), consent_accepted: true, consent_version: FACE_CONSENT_VERSION });
      assert.equal(ok.status, 201, JSON.stringify(ok.body));
      const again = await call("/hr/self/face-enrollment", tokenAna, "POST", { photo: photo(faces.personA, "ana.jpg"), consent_accepted: true, consent_version: FACE_CONSENT_VERSION });
      assert.equal(again.status, 409);
      const own = await call("/hr/self/face-enrollment", tokenAna);
      assert.equal(own.status, 200);
      assert.equal(own.body.enrolled, true, JSON.stringify(own.body).slice(0, 300));
      const row = await db.hrFaceEnrollment.findFirst({ where: { tenant_id: co.tenant.id, employee_id: ana.employee.id, active: true } });
      assert.ok(row && Array.isArray(row.embedding) && row.embedding.length > 100);
      assert.equal(row.consent_version, FACE_CONSENT_VERSION);
    });

    await check("registro de huella propia: reto firmado por el servidor + llave ES256 queda activa y se lista", async () => {
      const ch = await call("/hr/self/webauthn/registration-challenge", tokenAna, "POST", {});
      assert.equal(ch.status, 200, JSON.stringify(ch.body));
      const reg = await call("/hr/self/webauthn", tokenAna, "POST", registration(keyAna, ch.body.challenge));
      assert.equal(reg.status, 201, JSON.stringify(reg.body));
      const list = await call("/hr/self/webauthn", tokenAna);
      assert.ok(list.body.credentials.some((c) => c.credential_id === keyAna.credentialId));
      assert.ok(!JSON.stringify(list.body).includes(keyAna.publicKey), "la llave publica no se expone");
    });

    function webPunch(type, selfie, o = {}) {
      const body = {
        user_name: ana.employee.code,
        type,
        punched_at: new Date().toISOString(),
        idempotency_key: crypto.randomUUID(),
        route_id: route.id,
        identity_photo: photo(selfie, "selfie.jpg"),
        metadata: { source: "apexos-web-movil", channel: "web" }
      };
      const message = personalPunchMessage({ userId: o.signedUser ?? ana.user.id, type: o.signedType || type, punchedAt: body.punched_at, idempotencyKey: body.idempotency_key, credentialId: keyAna.credentialId });
      body.metadata.webauthn = assertion(keyAna, challengeForMessage(message));
      return body;
    }

    await check("marcacion web: huella primero (firma v2) + selfie del mismo rostro -> huella verificada y rostro coincide; la firma cruda no se guarda", async () => {
      const t0 = Date.now();
      const r = await call("/hr/self/time-punches", tokenAna, "POST", webPunch("entrada", faces.personADark));
      result.measurements.marcacion_con_huella_y_rostro_ms = Date.now() - t0;
      assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 500));
      const row = await db.timePunch.findFirst({ where: { tenant_id: co.tenant.id, employee_id: ana.employee.id, type: "entrada" } });
      const iv = row.metadata.identity_verification;
      assert.equal(iv.fingerprint.status, "verificada");
      assert.equal(iv.face_match.status, "coincide", JSON.stringify(iv.face_match));
      assert.ok(iv.face_match.similarity >= 0.55);
      result.measurements.similitud_misma_persona = iv.face_match.similarity;
      assert.equal(row.metadata.webauthn, undefined, "la firma cruda no se persiste");
    });

    await check("firma de otro tipo o de otro usuario se rechaza 403 FIRMA_NO_CORRESPONDE sin crear la marcacion", async () => {
      const before = await db.timePunch.count({ where: { tenant_id: co.tenant.id, employee_id: ana.employee.id } });
      const otherType = await call("/hr/self/time-punches", tokenAna, "POST", webPunch("inicio_almuerzo", faces.personADark, { signedType: "salida" }));
      assert.equal(otherType.status, 403);
      assert.equal(otherType.body.code, "FIRMA_NO_CORRESPONDE");
      const otherUser = await call("/hr/self/time-punches", tokenAna, "POST", webPunch("inicio_almuerzo", faces.personADark, { signedUser: beto.user.id }));
      assert.equal(otherUser.status, 403);
      assert.equal(await db.timePunch.count({ where: { tenant_id: co.tenant.id, employee_id: ana.employee.id } }), before);
    });

    await check("selfie de OTRA persona: la marcacion se registra (no se pierde la hora) pero queda SENALADA no_coincide", async () => {
      const r = await call("/hr/self/time-punches", tokenAna, "POST", webPunch("inicio_almuerzo", faces.personB));
      assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 500));
      const row = await db.timePunch.findFirst({ where: { tenant_id: co.tenant.id, employee_id: ana.employee.id, type: "inicio_almuerzo" } });
      assert.equal(row.metadata.identity_verification.face_match.status, "no_coincide");
      assert.equal(row.metadata.identity_verification.fingerprint.status, "verificada");
      result.measurements.similitud_otra_persona = row.metadata.identity_verification.face_match.similarity;
    });

    await check("celular del camion: el administrador lo registra por placa y la tripulacion marca con su selfie -> device_verified", async () => {
      const device = authenticator();
      const deviceId = `cert-device-${stamp}`;
      const denied = await call("/hr/shared-devices/registration-challenge", tokenAna, "POST", {});
      assert.equal(denied.status, 403, "un operario no registra celulares");
      const ch = await call("/hr/shared-devices/registration-challenge", tokenAdmin, "POST", {});
      assert.equal(ch.status, 200, JSON.stringify(ch.body));
      const reg = await call("/hr/shared-devices", tokenAdmin, "POST", { ...registration(device, ch.body.challenge), device_id: deviceId, vehicle_plate: "CRT123", label: "Camion CERT" });
      assert.equal(reg.status, 201, JSON.stringify(reg.body));
      const crew = await call(`/hr/shared-devices/${deviceId}/crew`, tokenAna);
      assert.equal(crew.status, 200, JSON.stringify(crew.body).slice(0, 300));
      const selfie = faces.personB;
      const body = { employee_id: beto.employee.id, type: "entrada", punched_at: new Date().toISOString(), idempotency_key: crypto.randomUUID(), route_id: route.id, identity_photo: photo(selfie, "beto.jpg") };
      const msg = crewPunchMessage({ employeeId: beto.employee.id, type: "entrada", punchedAt: body.punched_at, idempotencyKey: body.idempotency_key, deviceId, photoSha256: sha(selfie).toString("hex") });
      const a = assertion(device, challengeForMessage(msg));
      body.metadata = { identity: { device_id: deviceId, credential_id: device.credentialId, signature: a.signature, authenticator_data: a.authenticator_data, client_data_json: a.client_data_json } };
      const r = await call(`/hr/shared-devices/${deviceId}/punches`, tokenAna, "POST", body);
      assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 500));
      const row = await db.timePunch.findFirst({ where: { tenant_id: co.tenant.id, employee_id: beto.employee.id, type: "entrada" } });
      assert.equal(row.metadata.identity_verification.status, "device_verified");
      assert.equal(row.metadata.identity_verification.vehicle_plate, "CRT123");
    });

    let loginReplay;
    await check("ingreso con huella: misma sesion que con clave y /auth/me responde a la persona", async () => {
      const ch = await call("/auth/webauthn/challenge", null, "POST", { tenant_id: co.tenant.id, user_id: ana.user.id });
      assert.equal(ch.status, 200, JSON.stringify(ch.body));
      loginReplay = { challenge: ch.body.challenge, ...assertion(keyAna, ch.body.challenge) };
      const t0 = Date.now();
      const r = await call("/auth/webauthn/login", null, "POST", loginReplay);
      result.measurements.ingreso_con_huella_ms = Date.now() - t0;
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.token && r.body.refresh);
      assert.equal(r.body.user.id, ana.user.id);
      const me = await call("/auth/me", r.body.token);
      assert.equal(me.status, 200);
      assert.equal(me.body.user.email, ana.user.email);
    });

    await check("ingreso con huella: reto reusado, llave ajena y empresa vecina responden 401; sin sesion las rutas propias 401", async () => {
      const replay = await call("/auth/webauthn/login", null, "POST", loginReplay);
      assert.equal(replay.status, 401);
      assert.equal(replay.body.code, "HUELLA_RETO_USADO");
      const chBeto = await call("/auth/webauthn/challenge", null, "POST", { tenant_id: co.tenant.id, user_id: beto.user.id });
      const foreign = await call("/auth/webauthn/login", null, "POST", { challenge: chBeto.body.challenge, ...assertion(keyAna, chBeto.body.challenge) });
      assert.equal(foreign.status, 401);
      const chVecino = await call("/auth/webauthn/challenge", null, "POST", { tenant_id: neighbor.tenant.id, user_id: ana.user.id });
      const otherCompany = await call("/auth/webauthn/login", null, "POST", { challenge: chVecino.body.challenge, ...assertion(keyAna, chVecino.body.challenge) });
      assert.equal(otherCompany.status, 401);
      for (const p of ["/hr/self/webauthn", "/hr/self/face-enrollment"]) assert.equal((await call(p, null)).status, 401);
    });

    await check("aislamiento: la empresa vecina no ve rostros ni celulares de la otra", async () => {
      const faces2 = await call("/hr/face-enrollments", tokenVecino);
      const list = Array.isArray(faces2.body) ? faces2.body : faces2.body.items || faces2.body.enrollments || [];
      assert.ok(!JSON.stringify(list).includes(ana.employee.code));
      const devices = await call("/hr/shared-devices", tokenVecino);
      assert.ok(!JSON.stringify(devices.body).includes("CRT123"));
    });

    await check("restablecer la huella es solo de administrador; tras restablecer, el ingreso con esa llave queda en 401", async () => {
      const byWorker = await call(`/hr/employees/${ana.employee.id}/webauthn`, tokenBeto, "DELETE", { reason: "cert" });
      assert.equal(byWorker.status, 403);
      const byAdmin = await call(`/hr/employees/${ana.employee.id}/webauthn`, tokenAdmin, "DELETE", { reason: "cert" });
      assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.body));
      assert.equal(byAdmin.body.revoked, 1);
      const ch = await call("/auth/webauthn/challenge", null, "POST", { tenant_id: co.tenant.id, user_id: ana.user.id });
      const after = await call("/auth/webauthn/login", null, "POST", { challenge: ch.body.challenge, ...assertion(keyAna, ch.body.challenge) });
      assert.equal(after.status, 401);
      assert.equal(after.body.code, "HUELLA_NO_REGISTRADA");
    });

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = error.stack;
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
    await db.$disconnect();
    result.finished_at = new Date().toISOString();
    if (output) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
    }
    console.log(JSON.stringify({ status: result.status, checks: result.checks.length, measurements: result.measurements }));
  }
})();
