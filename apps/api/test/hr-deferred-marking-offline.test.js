const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

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

function employee() {
  return {
    id: 41,
    user_id: 7,
    code: "EMP-41",
    user_type: "operario",
    metadata: { name: "Empleado 41" },
    user: { id: 7, name: "Empleado 41", email: "empleado41@apexos.local" }
  };
}

// La regla del dia opera sobre la zona operativa (America/Bogota), igual que startOfDay
// en el servicio; el dia se construye como medianoche local para coincidir con la
// persistencia real de TimeRoute.date.
function operatingDay(offsetDays = 0) {
  const base = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const shifted = new Date(`${base}T12:00:00-05:00`);
  shifted.setDate(shifted.getDate() + offsetDays);
  const day = shifted.toISOString().slice(0, 10);
  return { day, midnight: new Date(`${day}T00:00:00-05:00`) };
}

function routeFor(day, id, current) {
  return {
    id,
    tenant_id: "tenant-qa",
    date: day.midnight,
    employees: [current.code],
    start_time: "08:00",
    end_time: "17:00",
    status: "active",
    notes: "",
    per_diem: 0,
    tolerance_minutes: 15,
    vehicle_plate: ""
  };
}

function txFor(current, route, capture) {
  return {
    employee: { findFirst: async () => current, findMany: async () => [current] },
    timeRoute: { findFirst: async () => route },
    routePreoperationalChecklist: { findFirst: async () => null },
    timePunch: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }) => ({ id: 91, ...data })
    },
    gpsPing: { create: async () => ({}) },
    workSession: { findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    $executeRaw: async (strings, ...values) => { capture.raw.push({ sql: strings.join("?"), values }); },
    $queryRaw: async () => []
  };
}

function prismaFor(current, routes, tx, capture) {
  return {
    runWithTenant: (_tenantId, callback) => callback(),
    employee: { findFirst: async () => current, findMany: async () => [current] },
    timeRoute: {
      findFirst: async ({ where }) => routes.find((route) => route.id === where.id) || null,
      findMany: async () => routes.filter((route) => route.date.getTime() === operatingDay(0).midnight.getTime())
    },
    workSession: { findFirst: async () => null },
    timePunch: { findFirst: async () => null },
    $transaction: async (callback) => callback(tx),
    $executeRaw: async (strings, ...values) => { capture.raw.push({ sql: strings.join("?"), values }); },
    $queryRaw: async () => []
  };
}

test("la marcacion diferida del dia anterior dentro de la ventana se acepta contra su propia ruta", async () => {
  const current = employee();
  const yesterday = operatingDay(-1);
  const route = routeFor(yesterday, 12, current);
  const capture = { raw: [] };
  // La distancia entre "ayer 22:40" y el instante de la corrida depende de la hora,
  // asi que se fija la ventana para que la prueba no sea horaria.
  const previousWindow = process.env.HR_DEFERRED_MARKING_MAX_AGE_HOURS;
  process.env.HR_DEFERRED_MARKING_MAX_AGE_HOURS = "48";
  const loaded = loadHrService(prismaFor(current, [route], txFor(current, route, capture), capture));
  try {
    const result = await loaded.service.createOwnPunch("tenant-qa", { id: 7, email: current.user.email }, {
      employee_id: current.id,
      user_name: current.code,
      route_id: 12,
      type: "entrada",
      punched_at: new Date(`${yesterday.day}T22:40:00-05:00`).toISOString(),
      idempotency_key: "qa-deferred-0001",
      metadata: { queued_at: new Date().toISOString(), gps_unavailable: true, gps_unavailable_reason: "sin_senal" }
    });
    assert.equal(result.ok, true);
    const novelty = capture.raw.find((call) => call.sql.includes("th_novedades_jornada"));
    assert.ok(novelty, "debe registrar la novedad de GPS inactivo");
    assert.ok(novelty.values.includes("GPS_INACTIVO_SIN_SENAL"), "la novedad debe usar el tipo GPS_INACTIVO_SIN_SENAL");
    const catalog = capture.raw.find((call) => call.sql.includes("th_tipos_novedad"));
    assert.ok(catalog, "debe asegurar el tipo de novedad para tenants sin catalogo");
  } finally {
    loaded.restore();
    if (previousWindow === undefined) delete process.env.HR_DEFERRED_MARKING_MAX_AGE_HOURS;
    else process.env.HR_DEFERRED_MARKING_MAX_AGE_HOURS = previousWindow;
  }
});

test("la marcacion diferida fuera de la ventana maxima se rechaza", async () => {
  const current = employee();
  const old = operatingDay(-3);
  const route = routeFor(old, 13, current);
  const capture = { raw: [] };
  const loaded = loadHrService(prismaFor(current, [route], txFor(current, route, capture), capture));
  try {
    await assert.rejects(
      loaded.service.createOwnPunch("tenant-qa", { id: 7, email: current.user.email }, {
        employee_id: current.id,
        user_name: current.code,
        route_id: 13,
        type: "entrada",
        punched_at: new Date(`${old.day}T08:00:00-05:00`).toISOString(),
        idempotency_key: "qa-deferred-0002"
      }),
      (error) => error.code === "MARCACION_DIFERIDA_EXPIRADA" && error.statusCode === 409
    );
    assert.equal(capture.raw.length, 0, "no debe escribir nada cuando la marcacion esta vencida");
  } finally {
    loaded.restore();
  }
});

test("la marcacion con fecha futura se rechaza", async () => {
  const current = employee();
  const tomorrow = operatingDay(1);
  const route = routeFor(tomorrow, 14, current);
  const capture = { raw: [] };
  const loaded = loadHrService(prismaFor(current, [route], txFor(current, route, capture), capture));
  try {
    await assert.rejects(
      loaded.service.createOwnPunch("tenant-qa", { id: 7, email: current.user.email }, {
        employee_id: current.id,
        user_name: current.code,
        route_id: 14,
        type: "entrada",
        punched_at: new Date(`${tomorrow.day}T08:00:00-05:00`).toISOString(),
        idempotency_key: "qa-deferred-0003"
      }),
      (error) => error.code === "MARCACION_EN_EL_FUTURO" && error.statusCode === 409
    );
  } finally {
    loaded.restore();
  }
});

test("la regla del dia sigue bloqueando una ruta de otro dia marcada hoy", async () => {
  const current = employee();
  // Ruta de hace dos dias y marcacion de hace un minuto: el dia esperado nunca coincide
  // con el de la ruta, sin depender de la hora de la corrida ni caer en fecha futura.
  const stale = operatingDay(-2);
  const route = routeFor(stale, 15, current);
  const capture = { raw: [] };
  const loaded = loadHrService(prismaFor(current, [route], txFor(current, route, capture), capture));
  try {
    await assert.rejects(
      loaded.service.createOwnPunch("tenant-qa", { id: 7, email: current.user.email }, {
        employee_id: current.id,
        user_name: current.code,
        route_id: 15,
        type: "entrada",
        punched_at: new Date(Date.now() - 60000).toISOString(),
        idempotency_key: "qa-deferred-0004"
      }),
      (error) => error.code === "HORARIO_FUERA_DEL_DIA" && error.statusCode === 409
    );
  } finally {
    loaded.restore();
  }
});

test("la actividad con GPS declarado obligatorio y sin coordenadas se rechaza", async () => {
  const current = employee();
  const loaded = loadHrService({ runWithTenant: (_tenantId, callback) => callback(), employee: { findFirst: async () => current } });
  try {
    await assert.rejects(
      loaded.service.createWorkActivity("tenant-qa", { id: 7, email: current.user.email }, {
        employee_id: current.id,
        user_name: current.code,
        activity_type_name: "Inspeccion",
        gps_required: true,
        photo: { base64: "aaa", name: "a.jpg", type: "image/jpeg", size: 10 }
      }),
      (error) => error.code === "GPS_OBLIGATORIO_SIN_UBICACION" && error.statusCode === 422
    );
  } finally {
    loaded.restore();
  }
});

test("la correccion administrativa fuera del dia deja novedad de ajuste manual", async () => {
  const current = employee();
  const stale = operatingDay(-2);
  const route = routeFor(stale, 16, current);
  const capture = { raw: [] };
  const loaded = loadHrService(prismaFor(current, [route], txFor(current, route, capture), capture));
  try {
    const result = await loaded.service.createPunch("tenant-qa", {
      employee_id: current.id,
      user_name: current.code,
      route_id: 16,
      type: "entrada",
      punched_at: new Date(`${stale.day}T08:05:00-05:00`).toISOString(),
      extra_reason: "Correccion solicitada por el supervisor",
      idempotency_key: "qa-admin-adjust-0001"
    }, { id: 7, email: current.user.email });
    assert.equal(result.ok, true);
    const adjustment = capture.raw.find((call) => call.sql.includes("th_novedades_jornada") && call.values.includes("AJUSTE_MANUAL_MARCACION"));
    assert.ok(adjustment, "la correccion fuera de dia debe quedar auditada");
  } finally {
    loaded.restore();
  }
});

test("la marcacion propia del dia en curso no genera ajuste manual", async () => {
  const current = employee();
  const today = operatingDay(0);
  const route = routeFor(today, 17, current);
  const capture = { raw: [] };
  const loaded = loadHrService(prismaFor(current, [route], txFor(current, route, capture), capture));
  try {
    const result = await loaded.service.createOwnPunch("tenant-qa", { id: 7, email: current.user.email }, {
      employee_id: current.id,
      user_name: current.code,
      route_id: 17,
      type: "entrada",
      punched_at: new Date(Date.now() - 60000).toISOString(),
      idempotency_key: "qa-own-today-0001"
    });
    assert.equal(result.ok, true);
    assert.equal(
      capture.raw.some((call) => call.values.includes("AJUSTE_MANUAL_MARCACION")),
      false,
      "el operario que marca su propio dia no es una correccion administrativa"
    );
  } finally {
    loaded.restore();
  }
});

test("la migracion siembra el tipo de novedad de forma idempotente", () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, "../prisma/migrations/20260921000000_gps_inactivo_sin_senal_novelty_type/migration.sql"),
    "utf8"
  );
  assert.match(migration, /GPS_INACTIVO_SIN_SENAL/);
  assert.match(migration, /WHERE NOT EXISTS/);
  assert.doesNotMatch(migration, /DROP|DELETE|TRUNCATE|ALTER/i);
});

test("el contrato de marcacion sin senal queda versionado en el servicio", () => {
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
  assert.match(service, /function gpsUnavailableFromInput/);
  assert.match(service, /function recordGpsUnavailableNovelty/);
  assert.match(service, /function assertDeferredMarkingWindow/);
  assert.match(service, /HR_DEFERRED_MARKING_MAX_AGE_HOURS/);
  // La comprobacion GPS anterior era inalcanzable: gpsSkipped ya era verdadero cuando
  // faltaban las coordenadas, asi que el 422 nunca disparaba.
  assert.doesNotMatch(service, /if \(!gpsSkipped && \(input\.latitude == null/);
  assert.match(service, /if \(input\.gps_required === true && \(input\.latitude == null \|\| input\.longitude == null\) && !gpsUnavailable\)/);
  // La novedad se registra tanto en la marcacion como en la actividad.
  const noveltyCalls = service.match(/recordGpsUnavailableNovelty\(/g) || [];
  assert.equal(noveltyCalls.length, 3, "definicion + marcacion + actividad");
});
