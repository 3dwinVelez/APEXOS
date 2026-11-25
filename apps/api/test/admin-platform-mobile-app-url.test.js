// Contrato del enlace de la app movil administrado por ambiente (platform_settings).
//
// Existe porque el boton «Descarga nuestra app» del acceso deja de ser una constante del build: ahora
// vale lo que el administrador guardo EN ESTE despliegue. Los cuatro defectos que este corte tiene
// que impedir:
//  1. Que el destino del acceso dependa de una variable de entorno que nadie ve: si el enlace se
//     tuerce, la pantalla no dice nada. Aqui el valor vive en la base y la lectura administrada
//     responde QUE ambiente contesto y QUIEN lo cambio.
//  2. Que una lectura publica (previa a la sesion) se quede sin destino o se cuele detras del
//     authenticate: la lectura responde SIEMPRE un https util y el endpoint vive en el scope que no
//     hereda authenticate/tenancy.
//  3. Que un administrador de empresa cambie el enlace que ve todo el mundo: es redireccionar el
//     acceso ajeno. La escritura exige superadministrador y no alcanza con el rol grueso admin:write.
//  4. Que una direccion torcida guardada rompa el boton: la escritura rechaza (400) y la lectura
//     ignora (cae al respaldo) lo que no sea https con dominio.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { hasAdminCapability, requireAdminCapability } = require("../src/middleware/rbac");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

function makePrisma({ row = null, fail = null, usuario = null, usuarioFalla = false } = {}) {
  const llamadas = { findUnique: 0, upsert: 0, audit: [], lastUpsert: null, usuario: 0 };
  let stored = row;
  const prisma = {
    platformSetting: {
      findUnique: async () => {
        llamadas.findUnique += 1;
        if (fail) throw fail;
        return stored;
      },
      upsert: async (args) => {
        llamadas.upsert += 1;
        llamadas.lastUpsert = args;
        stored = {
          id: 1,
          key: args.where.key,
          value: args.update.value,
          updated_by: args.update.updated_by,
          updated_at: new Date("2026-11-25T14:00:00.000Z")
        };
        return stored;
      }
    },
    user: {
      findUnique: async () => {
        llamadas.usuario += 1;
        if (usuarioFalla) throw new Error("P2025: An operation failed because the row does not exist");
        return usuario;
      }
    },
    auditLog: {
      create: async (args) => {
        llamadas.audit.push(args);
        return args;
      }
    }
  };
  return { prisma, llamadas };
}

// El servicio guarda su cache a nivel de modulo: cada caso necesita su propio require con su propio
// prisma, si no, el caso anterior contamina la lectura del siguiente y un assert sale verde por memoria.
function loadService(prisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/admin/platform-config-service");
  const previous = require.cache[prismaPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previous) require.cache[prismaPath] = previous;
      else delete require.cache[prismaPath];
    }
  };
}

async function authorize(role, resource, action, tenant = { active_modules: ["M-22"] }) {
  const reply = {
    statusCode: 0,
    payload: null,
    code(status) { this.statusCode = status; return this; },
    send(payload) { this.payload = payload; return payload; }
  };
  await requireAdminCapability(resource, action)({ user: { role }, tenant, params: {}, query: {}, body: {} }, reply);
  return { status: reply.statusCode || 200, payload: reply.payload };
}

function roleWith(name, roleType, legacyPermissions, permissions = []) {
  return { id: 12, name, metadata: { role_type: roleType, legacy_permissions: legacyPermissions }, permissions };
}

test("la escritura rechaza toda direccion que no sea https con dominio y acepta la valida", () => {
  const { prisma } = makePrisma();
  const { service, restore } = loadService(prisma);
  try {
    const rejects = [
      ["", "URL_APP_MOVIL_VACIA"],
      [null, "URL_APP_MOVIL_VACIA"],
      ["app.midominio.co", "URL_APP_MOVIL_INVALIDA"],
      ["http://app.midominio.co", "URL_APP_MOVIL_NO_HTTPS"],
      ["http://mi-app.local", "URL_APP_MOVIL_NO_HTTPS"],
      ["https://intranet", "URL_APP_MOVIL_SIN_DOMINIO"],
      ["https://user:pass@app.midominio.co", "URL_APP_MOVIL_CON_CREDENCIALES"],
      ["https://app.midominio.co/#/inicio", "URL_APP_MOVIL_CON_FRAGMENTO"],
      [`https://app.midominio.co/${"x".repeat(320)}`, "URL_APP_MOVIL_TROP_LARGA"]
    ];
    for (const [input, code] of rejects) {
      assert.throws(() => service.normalizeMobileAppUrl(input), (error) => {
        assert.equal(error.statusCode, 400, `${String(input).slice(0, 40)} no se rechazo con 400`);
        assert.equal(error.code, code);
        return true;
      });
    }
    // Contraste: si todo se rechazara, la pantalla no podria guardar nada y el corte daria igual.
    assert.equal(service.normalizeMobileAppUrl("https://app.midominio.co/"), "https://app.midominio.co", "la barra final se quita: rompe el enlace al concatenar");
    assert.equal(service.normalizeMobileAppUrl("https://appapexos-production.up.railway.app"), service.FALLBACK_MOBILE_APP_URL);
    assert.equal(service.normalizeMobileAppUrl("https://localhost"), "https://localhost", "contraste: el bucle invertido se admite para probar la app en el propio puesto");
    assert.equal(service.normalizeMobileAppUrl("http://localhost:3005"), "http://localhost:3005", "lo que el administrador puede guardar es exactamente lo que el acceso puede usar: la regla de http localhost es la misma en apps/web/lib/mobileAppInstall.ts");
  } finally {
    restore();
  }
});

test("la lectura publica siempre devuelve un https, aunque la base mienta o no exista", async () => {
  const casos = [
    { nombre: "valor administrado", prisma: makePrisma({ row: { value: { url: "https://app.example.co" }, updated_at: new Date(), updated_by: "edwin@apex.co" } }), esperado: "https://app.example.co" },
    { nombre: "sin fila aun", prisma: makePrisma({ row: null }), esperado: null },
    { nombre: "valor torcido guardado", prisma: makePrisma({ row: { value: { url: "http://roto.test" } } }), esperado: null },
    { nombre: "tabla inexistente", prisma: makePrisma({ fail: Object.assign(new Error("table platform_settings does not exist"), { code: "P2021" }) }), esperado: null }
  ];
  for (const caso of casos) {
    const { service, restore } = loadService(caso.prisma.prisma);
    try {
      const leido = await service.getPublicMobileApp();
      assert.match(leido.url, /^https:\/\//, `${caso.nombre}: la lectura publica devolvio ${leido.url}`);
      assert.equal(leido.url, caso.esperado || service.FALLBACK_MOBILE_APP_URL, `${caso.nombre}: no cayo al destino quemado`);
      assert.deepEqual(Object.keys(leido), ["url"], `${caso.nombre}: la lectura publica no puede exponer ambiente, autor ni fechas`);
    } finally {
      restore();
    }
  }
});

test("la lectura publica se sirve cacheada y el guardado la invalida", async () => {
  const fake = makePrisma({ row: null });
  const { service, restore } = loadService(fake.prisma);
  try {
    await service.getPublicMobileApp();
    await service.getPublicMobileApp();
    await service.getPublicMobileApp();
    assert.equal(fake.llamadas.findUnique, 1, "el acceso se abre muchas veces: cada vista no puede pagar un viaje al pooler");
    await service.saveMobileAppConfig("tenant-1", { id: 3, email: "edwin@apex.co", role: { name: "APEX_ADMIN" } }, { url: "https://app.example.co" });
    assert.equal(fake.llamadas.upsert, 1);
    const despues = await service.getPublicMobileApp();
    assert.equal(despues.url, "https://app.example.co", "guardar no puede dejar el acceso mostrando el enlace viejo durante 20 segundos");
    // 3 lecturas: la primera de la cache, la del guardado (para el valor anterior de la auditoria) y
    // la de despues del guardado. Si la cache no se invalidara, la tercera no existiria.
    assert.equal(fake.llamadas.findUnique, 3);
  } finally {
    restore();
  }
});

test("la lectura de administracion declara ambiente, autor y no usa la cache tibia", async () => {
  const previo = process.env.EXPECTED_ENVIRONMENT;
  process.env.EXPECTED_ENVIRONMENT = "qa";
  const row = { value: { url: "https://app.example.co" }, updated_at: "2026-11-25T13:00:00.000Z", updated_by: "edwin@apex.co" };
  const fake = makePrisma({ row });
  const { service, restore } = loadService(fake.prisma);
  try {
    await service.getPublicMobileApp();
    const config = await service.getMobileAppConfig();
    assert.equal(config.environment, "qa", "el ambiente lo declara el servidor: si saliera del navegador, alguien podria creerse en Produccion estando en QA");
    assert.equal(config.url, "https://app.example.co");
    assert.equal(config.source, "base");
    assert.equal(config.updated_at, "2026-11-25T13:00:00.000Z");
    assert.equal(config.updated_by, "edwin@apex.co");
    assert.match(config.fallback_url, /^https:\/\//);
    assert.ok(Number.isInteger(config.cache_ms) && config.cache_ms > 0, "el administrador dice cuanto puede tardar en refrescarse el acceso");
    assert.equal(fake.llamadas.findUnique, 2, "contraste: la administracion tiene que releer, si no la fecha y el autor salen vacios por culpa de la cache");

    const virgen = makePrisma({ row: null });
    const otro = loadService(virgen.prisma);
    try {
      const sinCambios = await otro.service.getMobileAppConfig();
      assert.equal(sinCambios.source, "respaldo");
      assert.equal(sinCambios.url, otro.service.FALLBACK_MOBILE_APP_URL);
      assert.equal(sinCambios.updated_at, null);
      assert.equal(sinCambios.updated_by, null);
    } finally {
      otro.restore();
    }
  } finally {
    restore();
    if (previo === undefined) delete process.env.EXPECTED_ENVIRONMENT;
    else process.env.EXPECTED_ENVIRONMENT = previo;
  }
});

test("guardar persiste el enlace, deja auditoria atribuible y avisa si se restauro el destino", async () => {
  const fake = makePrisma({ row: null });
  const { service, restore } = loadService(fake.prisma);
  const previo = process.env.EXPECTED_ENVIRONMENT;
  process.env.EXPECTED_ENVIRONMENT = "production";
  try {
    const resultado = await service.saveMobileAppConfig("tenant-9", { id: 7, email: "edwin@apex.co", role: { name: "APEX_ADMIN" } }, { url: "https://app.example.co/" });
    assert.equal(resultado.ok, true);
    assert.equal(resultado.url, "https://app.example.co", "se guarda normalizado, no lo escrito");
    assert.equal(resultado.environment, "produccion");
    assert.equal(resultado.restaurada, false);
    assert.deepEqual(fake.llamadas.lastUpsert.where, { key: service.MOBILE_APP_URL_KEY }, "una clave libre en la tabla es un almacen sin contrato");
    assert.deepEqual(fake.llamadas.lastUpsert.create.value, { url: "https://app.example.co" });
    assert.equal(fake.llamadas.lastUpsert.create.updated_by, "edwin@apex.co", "la autoria visible es un correo, no un numero suelto");

    assert.equal(fake.llamadas.audit.length, 1, "cambiar el enlace publico sin auditoria es inaceptable");
    const auditoria = fake.llamadas.audit[0].data;
    assert.equal(auditoria.tenant_id, "tenant-9");
    assert.equal(auditoria.user_id, 7);
    assert.equal(auditoria.action, "platform.mobile_app.url.updated");
    assert.equal(auditoria.entity, "PlatformSetting");
    assert.equal(auditoria.entity_id, service.MOBILE_APP_URL_KEY);
    assert.deepEqual(auditoria.old_value, { url: service.FALLBACK_MOBILE_APP_URL, source: "respaldo" }, "el valor anterior es lo unico que permite deshacer con conocimiento");
    assert.deepEqual(auditoria.new_value, { url: "https://app.example.co" });

    const vuelta = await service.saveMobileAppConfig("tenant-9", { id: 7, email: "edwin@apex.co", role: { name: "APEX_ADMIN" } }, { url: service.FALLBACK_MOBILE_APP_URL });
    assert.equal(vuelta.restaurada, true, "volver al destino por defecto tiene que decirse en la pantalla");
    assert.deepEqual(fake.llamadas.audit[1].data.old_value, { url: "https://app.example.co", source: "base" });
  } finally {
    restore();
    if (previo === undefined) delete process.env.EXPECTED_ENVIRONMENT;
    else process.env.EXPECTED_ENVIRONMENT = previo;
  }
});

// server.js arma request.user desde las claims del token (id, tenant_id, role): el correo NO viaja
// en la sesion. Si el servicio se queda con lo que trae el token, la pantalla de administracion
// muestra un numero en "Quien lo cambio" y nadie puede llamar al autor del cambio.
test("la autoria sale del correo de la cuenta aunque el token no lo traiga", async () => {
  const fake = makePrisma({ row: null, usuario: { email: "edwin@apex.co", name: "Edwin" } });
  const { service, restore } = loadService(fake.prisma);
  try {
    await service.saveMobileAppConfig("tenant-9", { id: 7, tenant_id: "tenant-9", role: { name: "APEX_ADMIN" } }, { url: "https://app.example.co" });
    assert.equal(fake.llamadas.usuario, 1, "sin correo en la sesion hay que leer la cuenta para poder atribuir");
    assert.equal(fake.llamadas.lastUpsert.update.updated_by, "edwin@apex.co", "la autoria visible debe ser un correo reconocible");
    assert.equal(fake.llamadas.lastUpsert.create.updated_by, "edwin@apex.co");
    assert.equal(fake.llamadas.audit[0].data.user_id, 7, "la auditoria sigue firmando con el id numerico que exige su esquema");
  } finally {
    restore();
  }
});

test("una cuenta ilegible no pierde el guardado: la autoria degrada al id", async () => {
  const fake = makePrisma({ row: null, usuarioFalla: true });
  const { service, restore } = loadService(fake.prisma);
  try {
    const resultado = await service.saveMobileAppConfig("tenant-9", { id: 7, role: { name: "APEX_ADMIN" } }, { url: "https://app.example.co" });
    assert.equal(resultado.ok, true, "la autoria no puede tumbar un guardado valido");
    assert.equal(fake.llamadas.lastUpsert.update.updated_by, "7");
    assert.equal(fake.llamadas.audit.length, 1, "aunque no se reconozca al autor, el movimiento queda auditado");
  } finally {
    restore();
  }
});

test("solo un superadministrador de APEXOS escribe el enlace: el rol grueso no alcanza", async () => {
  const fake = makePrisma({ row: null });
  const { service, restore } = loadService(fake.prisma);
  try {
    const adminEmpresa = roleWith("Administrador corporativo", "admin_empresa", {});
    await assert.rejects(
      service.saveMobileAppConfig("tenant-9", { id: 4, email: "otro@empresa.co", role: adminEmpresa }, { url: "https://phishing.test" }),
      (error) => {
        assert.equal(error.statusCode, 403, "un administrador de empresa no puede reescribir el acceso de los demas");
        assert.equal(error.code, "PLATAFORMA_SOLO_SUPERADMIN");
        return true;
      }
    );
    assert.equal(fake.llamadas.upsert, 0, "el rechazo tiene que ocurrir antes de tocar la tabla");
    assert.equal(fake.llamadas.audit.length, 0);

    // Contraste: el mismo llamada con superadministrador si escribe.
    await service.saveMobileAppConfig("tenant-9", { id: 5, email: "edwin@apex.co", role: { name: "APEX_ADMIN" } }, { url: "https://app.example.co" });
    assert.equal(fake.llamadas.upsert, 1);

    const superPorTipo = roleWith("Dueño del ambiente", "superadmin", {});
    await service.saveMobileAppConfig("tenant-9", { id: 6, email: "edwin@apex.co", role: superPorTipo }, { url: "https://otro.test" });
    assert.equal(fake.llamadas.upsert, 2, "el tipo superadmin es el equivalente real del nombre APEX_ADMIN");

    // Autorizacion antes que validacion: un no-superadministrador no obtiene ni un 400 que confirme formato.
    await assert.rejects(
      service.saveMobileAppConfig("tenant-9", { id: 4, email: "otro@empresa.co", role: adminEmpresa }, { url: "no-es-url" }),
      (error) => error.statusCode === 403
    );
  } finally {
    restore();
  }
});

test("la matriz legacy no cierra la puerta de lectura a quien administra configuracion", async () => {
  const soporte = roleWith("Soporte tecnico", "soporte", { configuracion: { access: true, view: true, edit: true, configure: true, administer: false } }, [{ module: "admin", action: "write" }]);
  const soloLectura = roleWith("Auditor", "custom", { configuracion: { access: true, view: true, configure: false, administer: false } }, [{ module: "admin", action: "read" }]);
  const ventas = roleWith("Comercial", "custom", { configuracion: { access: false, view: false } }, [{ module: "ventas", action: "read" }]);

  assert.equal(hasAdminCapability(soporte, "platform_settings", "read"), true);
  assert.equal(hasAdminCapability(soporte, "platform_settings", "edit"), true);
  assert.equal(hasAdminCapability(soloLectura, "platform_settings", "read"), true);
  assert.equal(hasAdminCapability(soloLectura, "platform_settings", "edit"), false, "ver el enlace no es poder moverlo");
  assert.equal(hasAdminCapability(ventas, "platform_settings", "read"), false);

  assert.equal((await authorize(soporte, "platform_settings", "read")).status, 200);
  assert.equal((await authorize(soloLectura, "platform_settings", "edit")).payload.code, "CAPACIDAD_ROL_DENEGADA");
  assert.equal((await authorize(ventas, "platform_settings", "read")).status, 403);
  assert.equal((await authorize(roleWith("APEX_ADMIN", "superadmin", {}), "platform_settings", "edit")).status, 200);
});

test("la lectura publica no hereda el authenticate y la escritura exige capacidad", () => {
  const publicas = read("src/modules/admin/public-routes.js");
  const admin = read("src/modules/admin/routes.js");
  const server = read("server.js");

  assert.match(publicas, /get\("\/public\/platform\/mobile-app"[\s\S]{0,220}rateLimit/, "la lectura publica necesita limite de peticiones: es una puerta abierta antes del login");
  const ruta = publicas.slice(publicas.indexOf('get("/public/platform/mobile-app"'));
  const handler = ruta.slice(0, ruta.indexOf("async (request"));
  assert.doesNotMatch(handler, /preHandler/, "el acceso es previo a la sesion: con preHandler de autenticacion el boton nunca se pinta");
  assert.match(publicas, /reply\.header\("cache-control", "no-store"\)/, "un enlace por ambiente cacheado en el navegador mostraria el destino de otro ambiente");

  assert.match(admin, /addHook\("preHandler", fastify\.authenticate\)/, "el area de administracion si queda detras de la sesion");
  assert.match(admin, /get\("\/admin\/platform\/mobile-app"[\s\S]{0,160}requireAdminCapability\("platform_settings", "read"\)/);
  assert.match(admin, /put\("\/admin\/platform\/mobile-app"[\s\S]{0,160}requireAdminCapability\("platform_settings", "edit"\)/);
  assert.match(admin, /saveMobileAppConfig\(request\.user\?\.tenant_id, request\.user, request\.body \|\| \{\}\)/, "el autor de la escritura sale de la sesion, nunca del body");

  assert.match(server, /registerRoutes\("admin-public",[\s\S]{0,120}public-routes/, "la ruta publica vive en el scope que no hereda authenticate/tenancy");
});

test("el esquema es de plataforma: global, con clave unica, sin columna de empresa y forward-only", () => {
  const schema = read("prisma/schema.prisma");
  const bloque = schema.slice(schema.indexOf("model PlatformSetting {"));
  const cuerpo = bloque.slice(0, bloque.indexOf("\n}"));
  assert.ok(bloque.length > 40, "contraste: se encontro el modelo PlatformSetting para leer su cuerpo");
  assert.match(cuerpo, /key\s+String\s+@unique/);
  assert.match(cuerpo, /value\s+Json\s+@\(default\("\{\}"\)\)|value\s+Json\s+@default\("\{\}"\)/);
  assert.match(cuerpo, /@@map\("platform_settings"\)/, "la tabla va en snake_case plural como manda docs/DATABASE_CONVENTIONS.md");
  assert.match(cuerpo, /id\s+Int\s+@id\s+@default\(autoincrement\(\)\)/, "clave tecnica Int autoincremental, no uuid");
  assert.match(cuerpo, /created_at\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(cuerpo, /updated_at\s+DateTime\s+@updatedAt/);
  assert.doesNotMatch(cuerpo, /tenant_id/i, "es un catalogo de plataforma: una columna de empresa lo convertiria en config de tenant sin contrato");

  const tenantModels = read("src/core/tenantModels.js");
  assert.equal(tenantModels.includes("PlatformSetting"), false, "si entrara a TENANT_MODELS, el middleware de aislamiento lo filtraria por tenant y el acceso publico no tiene tenant");

  const migDir = "prisma/migrations/20261125183000_platform_settings/migration.sql";
  assert.ok(fs.existsSync(path.join(ROOT, migDir)), "la migracion se versiona con el nombre de la tabla y timestamp del dia");
  const sql = read(migDir);
  assert.match(sql, /^-- /m, "toda migracion se documenta: header explicando el porque");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "platform_settings"/);
  assert.match(sql, /"key" TEXT NOT NULL/);
  assert.match(sql, /"value" JSONB NOT NULL DEFAULT '\{\}'/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "platform_settings_key_key"/);
  assert.doesNotMatch(sql, /\bDROP\b/i, "forward-only: una migracion nueva nunca borra");
  assert.doesNotMatch(sql, /tenant_id/i);
});
