const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

// C-01/C-02 del plan candado: el formulario publico de Servicios ya no puede elegir la
// empresa. La unica fuente es APEXOS_PUBLIC_SERVICE_COMPANY_ID; el body y el query son
// cosmeticos. Estas pruebas fijan el contrato del servicio, no del HTTP: catalogo
// proyectado, referencia ajena rechazada y preorden marcada como publica.

const TENANT_ID = "tenant-allowlist-1";
const OTHER_TENANT_ID = "tenant-ajeno-2";

function tenantConfig() {
  return {
    services: {
      service_types: [{ code: "montaje", label: "Montaje", active: true }],
      service_stores: [{ code: "sede_1", label: "Sede 1", active: true }]
    }
  };
}

function referenceFixtures() {
  return [
    { id: 7, tenant_id: TENANT_ID, code: "A1", name: "Referencia propia", category: "categoria", brand: "marca", model: "modelo", active: true, cost: 90000, stock: 4 },
    { id: 99, tenant_id: OTHER_TENANT_ID, code: "B2", name: "Referencia ajena", active: true, cost: 1, stock: 1 }
  ];
}

function loadSubject(options = {}) {
  const references = options.references || referenceFixtures();
  const config = options.config || tenantConfig();
  const prismaPath = require.resolve("../src/core/prisma");
  const tenantCachePath = require.resolve("../src/core/tenantCache");
  const publicPath = require.resolve("../src/modules/services/public-service");
  const servicePath = require.resolve("../src/modules/services/service");
  const calls = { tenantQueries: [], tenantScopes: [], referenceQueries: [], orderCreates: [], countWhere: null };

  const prisma = {
    async runWithTenant(tenantId, fn) {
      calls.tenantScopes.push(tenantId);
      return fn();
    },
    tenant: {
      async findFirst({ where }) {
        calls.tenantQueries.push(where);
        if (where.id !== TENANT_ID) return null;
        return { id: TENANT_ID, config };
      }
    },
    serviceReference: {
      async findMany({ where } = {}) {
        calls.referenceQueries.push(where);
        const wanted = where?.id?.in;
        return references
          .filter((row) => row.tenant_id === where?.tenant_id && row.active !== false)
          .filter((row) => (Array.isArray(wanted) ? wanted.includes(row.id) : row.code !== "__SERVICE_TYPES__"))
          .map((row) => (Array.isArray(wanted)
            ? { id: row.id }
            : { id: row.id, code: row.code, name: row.name, category: row.category, brand: row.brand, model: row.model }));
      }
    },
    serviceOrder: {
      async count({ where }) {
        calls.countWhere = where;
        return options.orderCount || 0;
      },
      async create(args) {
        calls.orderCreates.push(args);
        return { id: 501, number: args.data.number };
      }
    }
  };

  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  // tenantCache arrastra la configuracion de Redis al cargarse; el catalogo publico lee el
  // tenant directo, asi que aqui no aporta nada.
  require.cache[tenantCachePath] = {
    id: tenantCachePath,
    filename: tenantCachePath,
    loaded: true,
    exports: { async getTenantConfig() { return null; }, async invalidateTenantCache() {} }
  };
  delete require.cache[servicePath];
  delete require.cache[publicPath];
  return { service: require(publicPath), calls, references };
}

function validOrder(overrides = {}) {
  return {
    customer_name: "Ana Perez",
    customer_document: "10203040",
    customer_phone: "3001234567",
    customer_phone_secondary: "3007654321",
    customer_email: "ana@example.test",
    customer_address: "Calle 1 # 2-3",
    customer_neighborhood: "Centro",
    service_store: "Sede 1",
    items: [{ reference_id: "7", service_type: "montaje", quantity: 1, observation: "Porteria" }],
    ...overrides
  };
}

test.afterEach(() => {
  delete process.env.APEXOS_PUBLIC_SERVICE_COMPANY_ID;
});

test("sin allowlist el servicio responde 503 y no consulta la base", async () => {
  delete process.env.APEXOS_PUBLIC_SERVICE_COMPANY_ID;
  const { service, calls } = loadSubject();
  await assert.rejects(
    () => service.publicCatalog(),
    (error) => error.statusCode === 503 && error.code === "EMPRESA_PUBLICA_NO_CONFIGURADA"
  );
  assert.equal(calls.tenantQueries.length, 0);
  assert.equal(calls.tenantScopes.length, 0);
});

test("la allowlist invalida tampoco abre una busqueda implicita", async () => {
  process.env.APEXOS_PUBLIC_SERVICE_COMPANY_ID = "../../etc/passwd";
  const { service, calls } = loadSubject();
  await assert.rejects(
    () => service.publicCatalog(),
    (error) => error.statusCode === 503 && error.code === "EMPRESA_PUBLICA_NO_CONFIGURADA"
  );
  assert.equal(calls.tenantQueries.length, 0);
});

test("el catalogo publico solo proyecta la empresa de la allowlist", async () => {
  process.env.APEXOS_PUBLIC_SERVICE_COMPANY_ID = TENANT_ID;
  const { service, calls } = loadSubject();
  const catalog = await service.publicCatalog();
  assert.equal(catalog.ok, true);
  assert.equal(catalog.company_id, TENANT_ID);
  assert.deepEqual(calls.tenantScopes, [TENANT_ID]);
  assert.equal(calls.referenceQueries[0].tenant_id, TENANT_ID);
  assert.equal(catalog.references.length, 1);
  assert.equal(catalog.references[0].id, "7");
  assert.equal(catalog.references[0].company_id, TENANT_ID);
  assert.deepEqual(
    Object.keys(catalog.references[0]).sort(),
    ["brand", "category", "code", "company_id", "id", "model", "name"]
  );
  assert.equal(catalog.service_types[0].code, "montaje");
  assert.equal(catalog.service_stores[0].code, "sede_1");
  assert.doesNotMatch(
    fs.readFileSync(require.resolve("../src/modules/services/public-service"), "utf8"),
    /select:\s*\{[^}]*\b(cost|stock|tenant_id)\b/,
    "el catalogo publico no proyecta costo, stock ni id de tenant"
  );
});

test("una referencia de otra empresa no se puede solicitar", async () => {
  process.env.APEXOS_PUBLIC_SERVICE_COMPANY_ID = TENANT_ID;
  const { service, calls } = loadSubject();
  await assert.rejects(
    () => service.createPublicOrder(validOrder({ items: [{ reference_id: "99", service_type: "montaje", quantity: 1 }] })),
    (error) => error.statusCode === 400 && error.code === "REFERENCIA_INVALIDA"
  );
  assert.equal(calls.orderCreates.length, 0);
});

test("el company_id del cuerpo no cambia el tenant destinatario", async () => {
  process.env.APEXOS_PUBLIC_SERVICE_COMPANY_ID = TENANT_ID;
  const { service, calls } = loadSubject();
  await service.createPublicOrder(validOrder({ company_id: OTHER_TENANT_ID, company_name: "Empresa ajena" }));
  assert.deepEqual(calls.tenantScopes, [TENANT_ID]);
  assert.equal(calls.tenantQueries[0].id, TENANT_ID);
  assert.equal(calls.countWhere.tenant_id, TENANT_ID);
  const written = calls.orderCreates[0].data;
  assert.equal(written.tenant_id, TENANT_ID);
  assert.equal(written.company_id, undefined);
  assert.equal(written.metadata.company_id, undefined);
  assert.doesNotMatch(JSON.stringify(written.metadata), /tenant-ajeno-2/);
});

test("la preorden publica queda agendada, marcada y con consecutivo corto", async () => {
  process.env.APEXOS_PUBLIC_SERVICE_COMPANY_ID = TENANT_ID;
  const { service, calls } = loadSubject();
  const result = await service.createPublicOrder(validOrder());
  assert.equal(result.ok, true);
  assert.equal(result.order.number, `SOL-${new Date().getFullYear()}-00001`);
  const written = calls.orderCreates[0].data;
  assert.equal(written.status, "agendado");
  assert.equal(written.reference_id, 7);
  assert.equal(written.service_type, "montaje");
  assert.equal(written.metadata.created_from, "public_service_request");
  assert.equal(written.metadata.public_request, true);
  assert.equal(written.metadata.requires_admin_completion, true);
  assert.equal(written.metadata.customer_document, "10203040");
  assert.equal(written.metadata.customer_phone_secondary, "3007654321");
  assert.equal(written.metadata.service_store, "sede_1");
  assert.match(written.items.create[0].idempotency_key, /^public-[0-9a-f-]{36}-0$/);
});
