const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const organization = require("../src/modules/hr/organization");

const tree = {
  societies: [{ code: "SOC-01", active: true }, { code: "SOC-02", active: false }],
  branches: [{ code: "BR-01", society_code: "SOC-01", active: true }, { code: "BR-02", society_code: "SOC-01", active: true }],
  cost_centers: [{ code: "CC-01", society_code: "SOC-01", branch_code: "BR-01", active: true }, { code: "CC-02", society_code: "SOC-01", branch_code: "BR-02", active: true }]
};

test("employee organization derives society and returns canonical flat codes", () => {
  assert.deepEqual(organization.resolveEmployeeOrganization(tree, { branch_code: "BR-01", cost_center_code: "CC-01" }), {
    society_code: "SOC-01",
    branch_code: "BR-01",
    cost_center_code: "CC-01",
    cost_center: "CC-01"
  });
});

test("employee organization rejects a center from another branch", () => {
  assert.throws(
    () => organization.resolveEmployeeOrganization(tree, { branch_code: "BR-01", cost_center_code: "CC-02" }),
    (error) => error.code === "EMPLEADO_CENTRO_COSTO_ORGANIZACION_INVALIDA" && error.statusCode === 422
  );
});

test("legacy employee may be edited without touching accounting assignment", () => {
  assert.equal(organization.resolveEmployeeOrganization(tree, { position: "Conductor" }, { metadata: { cost_center: "LEGACY" } }, { allowEmpty: true }), null);
});

test("partial accounting edit uses current assignment, but cannot invent a branch", () => {
  assert.deepEqual(organization.resolveEmployeeOrganization(tree, { cost_center_code: "CC-01" }, {
    metadata: { accounting: { society_code: "SOC-01", branch_code: "BR-01", cost_center_code: "CC-OLD" } }
  }, { allowEmpty: true }).branch_code, "BR-01");
  assert.throws(
    () => organization.resolveEmployeeOrganization(tree, { cost_center_code: "CC-01" }, { metadata: { cost_center: "LEGACY" } }, { allowEmpty: true }),
    (error) => error.code === "EMPLEADO_ORGANIZACION_REQUERIDA"
  );
});

test("hr contract exposes organization fields and tenant-filtered lookup", () => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/schema.js"), "utf8");
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/routes.js"), "utf8");
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
  assert.match(schema, /society_code: \{ type: "string" \}/);
  assert.match(schema, /branch_code: \{ type: "string" \}/);
  assert.match(schema, /cost_center_code: \{ type: "string" \}/);
  assert.match(routes, /\/talento-humano\/empleados\/organization-options/);
  assert.match(routes, /\/talento-humano\/entidades\/terceros/);
  assert.match(routes, /requirePermission\("hr", "read"\)/);
  assert.match(service, /resolveTenantEmployeeOrganization\(tenantId, input\)/);
  assert.match(service, /listEmployeeOrganizationOptions/);
  assert.match(service, /listLaborEntityPartyCandidates/);
  assert.match(service, /resolveExplicitParty/);
  assert.match(service, /metadata: \{[\s\S]*accounting: organization/);
});

test("contract DTO serializes BIGINT values without coercing ordinary numbers", () => {
  process.env.DISABLE_REDIS = "true";
  const hrService = require("../src/modules/hr/service");
  const dto = hrService.jsonSafeBigInt({ id: 12n, previous_contract_id: 4n, salary_base: 2500000, metadata: { count: 2 } });
  assert.deepEqual(dto, { id: "12", previous_contract_id: "4", salary_base: 2500000, metadata: { count: 2 } });
});

test("rehire lookup includes retired employees while remaining tenant scoped", async () => {
  const hrService = require("../src/modules/hr/service");
  const calls = [];
  const db = {
    employee: {
      findFirst: async ({ where }) => {
        calls.push(where);
        return where.tenant_id === "tenant-a" && where.id === 17
          ? { id: 17, tenant_id: "tenant-a", active: false }
          : null;
      }
    }
  };

  const retired = await hrService.findEmployeeForRehire(db, "tenant-a", 17);
  const foreign = await hrService.findEmployeeForRehire(db, "tenant-b", 17);

  assert.equal(retired.active, false);
  assert.equal(foreign, null);
  assert.deepEqual(calls, [
    { tenant_id: "tenant-a", id: 17, __includeInactive: true },
    { tenant_id: "tenant-b", id: 17, __includeInactive: true }
  ]);
});
