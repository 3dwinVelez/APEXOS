#!/usr/bin/env node
require("./load-env")();

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "apps", "web");
const NEXT_MANIFEST = path.join(WEB_DIR, ".next", "app-path-routes-manifest.json");
const API_BUILD = require(path.join(ROOT, "apps", "api", "server"));

const results = [];
const batch = `DET-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

function record(area, name, ok, detail = {}) {
  results.push({ area, name, ok, detail });
  console.log(`[${ok ? "OK" : "FAIL"}] ${area} - ${name}${detail.message ? `: ${detail.message}` : ""}`);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function injectJson(app, options, expectedStatuses = [200]) {
  const response = await app.inject(options);
  const text = response.body || "";
  const body = text ? JSON.parse(text) : null;
  if (!expectedStatuses.includes(response.statusCode)) {
    const error = new Error(`HTTP ${response.statusCode}`);
    error.statusCode = response.statusCode;
    error.body = body;
    throw error;
  }
  return { statusCode: response.statusCode, body, headers: response.headers };
}

async function validateApi(app) {
  const health = await injectJson(app, { method: "GET", url: "/health" });
  record("api", "Health endpoint", health.statusCode === 200, { status: health.body?.status });

  const login = await injectJson(app, {
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "demo@apex.local", password: "test1234" }
  });
  const token = login.body?.token;
  expect(token, "El login local no devolvio token.");
  record("api", "Login demo local", true, { email: "demo@apex.local" });

  const headers = { authorization: `Bearer ${token}` };
  const branchCode = `BR-${batch.slice(-4)}`;
  const costCenterCode = `CC-${batch.slice(-4)}`;
  const familyCode = `FAM-${batch.slice(-6)}`;
  const warehouseCode = `BOD-${batch.slice(-5)}`;

  await injectJson(app, {
    method: "POST",
    url: "/api/v1/accounting/chart/init",
    headers,
    payload: { country: "CO" }
  }, [200, 201]);
  record("api", "Plan de cuentas", true);

  await injectJson(app, {
    method: "POST",
    url: "/api/v1/accounting/organization-tree",
    headers,
    payload: { type: "branch", code: branchCode, name: `Sucursal ${batch}`, society_code: "SOC-01", active: true }
  }, [200, 201]);
  await injectJson(app, {
    method: "POST",
    url: "/api/v1/accounting/organization-tree",
    headers,
    payload: { type: "cost_center", code: costCenterCode, name: `Centro ${batch}`, society_code: "SOC-01", branch_code: branchCode, active: true }
  }, [200, 201]);
  record("api", "Estructura contable base", true);

  await injectJson(app, {
    method: "POST",
    url: "/api/v1/inventory/families",
    headers,
    payload: {
      code: familyCode,
      name: `Familia ${batch}`,
      society_code: "SOC-01",
      branch_code: branchCode,
      code_start: `7${batch.slice(-5)}00`,
      code_end: `7${batch.slice(-5)}99`,
      accounting: {
        goods_receipt_account_code: "1435",
        gr_ir_account_code: "2205",
        sales_cost_account_code: "6135",
        sales_revenue_account_code: "4135",
        return_revenue_account_code: "4175",
        manual_in_account_code: "1435",
        manual_out_account_code: "6135"
      }
    }
  }, [200, 201]);
  const families = await injectJson(app, { method: "GET", url: "/api/v1/inventory/families", headers });
  expect(Array.isArray(families.body) && families.body.some((row) => row.code === familyCode), "La familia creada no aparece en el listado.");
  record("api", "Familias inventario", true);

  const warehouses = await injectJson(app, {
    method: "POST",
    url: "/api/v1/inventory/warehouses",
    headers,
    payload: {
      code: warehouseCode,
      name: `Bodega ${batch}`,
      society_code: "SOC-01",
      branch_code: branchCode,
      cost_center_code: costCenterCode,
      warehouse_type: "owned"
    }
  }, [200, 201]);
  const warehouse = Array.isArray(warehouses.body) ? warehouses.body.find((row) => row.code === warehouseCode) : null;
  const locations = await injectJson(app, { method: "GET", url: "/api/v1/inventory/locations", headers });
  expect(Array.isArray(locations.body) && locations.body.some((row) => String(row.warehouse_code) === warehouseCode), "La bodega no genero ubicacion por defecto.");
  record("api", "Bodegas y ubicaciones", true);

  const item = await injectJson(app, {
    method: "POST",
    url: "/api/v1/inventory/items",
    headers,
    payload: {
      name: `Producto ${batch}`,
      type: "product",
      unit: "UND",
      family_code: familyCode,
      society_code: "SOC-01",
      branch_code: branchCode,
      unit_cost: 12000,
      unit_price: 18000
    }
  }, [200, 201]);
  const itemId = item.body?.id;
  expect(itemId, "No se pudo crear el producto de inventario.");
  const inventoryCosts = await injectJson(app, { method: "GET", url: "/api/v1/inventory/costs", headers });
  expect(Array.isArray(inventoryCosts.body?.data), "La consulta de costos no devolvio estructura valida.");
  record("api", "Productos y costos inventario", true);

  await injectJson(app, {
    method: "POST",
    url: "/api/v1/purchases/suppliers",
    headers,
    payload: {
      name: `Proveedor ${batch}`,
      tax_id: `NIT-${batch.slice(-8)}`,
      email: `proveedor.${batch.toLowerCase()}@apex.local`
    }
  }, [200, 201]);
  const suppliers = await injectJson(app, { method: "GET", url: "/api/v1/purchases/suppliers", headers });
  expect(Array.isArray(suppliers.body), "La consulta de proveedores no devolvio una lista.");
  const supplier = suppliers.body.find((row) => String(row.tax_id) === `NIT-${batch.slice(-8)}`) || suppliers.body[0];
  expect(supplier?.id, "No se encontro el proveedor recien creado.");
  record("api", "Proveedores compras", true);

  const order = await injectJson(app, {
    method: "POST",
    url: "/api/v1/purchases/orders",
    headers,
    payload: {
      supplier_id: supplier.id,
      warehouse_id: warehouse?.id,
      lines: [{ item_id: itemId, qty: 1, unit_cost: 12000 }]
    }
  }, [200, 201]);
  const orderId = order.body?.id;
  const lineId = order.body?.lines?.[0]?.id;
  expect(orderId && lineId, "No se pudo crear la orden de compra QA.");
  await injectJson(app, { method: "POST", url: `/api/v1/purchases/orders/${orderId}/approve`, headers }, [200]);
  await injectJson(app, {
    method: "POST",
    url: `/api/v1/purchases/orders/${orderId}/receive`,
    headers,
    payload: { received_lines: [{ line_id: lineId, qty_received: 1 }] }
  }, [200]);
  record("api", "Orden de compra y recepcion", true);

  await injectJson(app, { method: "GET", url: "/api/v1/hr/payroll/config", headers }, [200]);
  await injectJson(app, {
    method: "PUT",
    url: "/api/v1/hr/payroll/config",
    headers,
    payload: { parameters: { transport_allowance_monthly: 162000 } }
  }, [200]);
  record("api", "Configuracion de nomina", true);
}

async function validateSupabase(app) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) {
    record("supabase", "Configuracion base", false, { message: "Faltan variables publicas de Supabase." });
    return;
  }

  const loginResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: "scj@apexos.qa", password: "ApexOS-QA-SCJ-2026!" })
  });
  const loginBody = await loginResponse.json();
  expect(loginResponse.ok && loginBody.access_token, "No fue posible iniciar sesion Supabase con SCJ QA.");
  record("supabase", "Login SCJ QA", true);

  const modulesResponse = await fetch(`${url}/rest/v1/v_company_module_status?select=module_code,enabled&enabled=eq.true`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${loginBody.access_token}`,
      prefer: "count=exact"
    }
  });
  const modules = await modulesResponse.json();
  const enabled = Array.isArray(modules) ? modules.map((row) => row.module_code).sort() : [];
  const required = ["administracion_apex", "contabilidad", "compras", "inventario", "servicios", "talento_humano", "transporte"];
  const missing = required.filter((item) => !enabled.includes(item));
  expect(!missing.length, `SCJ no tiene modulos requeridos: ${missing.join(", ")}`);
  record("supabase", "Modulos SCJ", true, { enabled });

  const apiResponse = await injectJson(app, {
    method: "GET",
    url: "/api/v1/projects",
    headers: { authorization: `Bearer ${loginBody.access_token}` }
  }, [200]);
  expect(Array.isArray(apiResponse.body), "El token Supabase no fue aceptado por el API Prisma.");
  record("supabase", "Token Supabase contra API", true);
}

function validateFrontendBuild() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const build = spawnSync(npmCmd, ["--workspace", "apps/web", "run", "build"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_DIST_DIR: ".next"
    }
  });
  if (build.status !== 0) {
    throw new Error(build.stderr || build.stdout || build.error?.message || "next build fallo");
  }
  record("frontend", "Build web", true);

  expect(fs.existsSync(NEXT_MANIFEST), "No existe app-path-routes-manifest.json despues del build.");
  const manifest = JSON.parse(fs.readFileSync(NEXT_MANIFEST, "utf8"));
  const compiledRoutes = new Set(Object.values(manifest));
  const expectedRoutes = [
    "/dashboard/inventario/familias",
    "/dashboard/compras/facturas",
    "/dashboard/contabilidad/asientos"
  ];
  const missingRoutes = expectedRoutes.filter((route) => !compiledRoutes.has(route));
  expect(!missingRoutes.length, `Faltan rutas frontend en el build: ${missingRoutes.join(", ")}`);
  record("frontend", "Rutas criticas compiladas", true);
}

async function main() {
  const app = await API_BUILD();
  try {
    await validateApi(app);
    await validateSupabase(app);
    validateFrontendBuild();
  } finally {
    await app.close();
  }

  const failed = results.filter((item) => !item.ok);
  const reportDir = path.join(ROOT, "reports", "qa");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `QA-DETERMINISTIC-${batch}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ batch, generated_at: new Date().toISOString(), summary: { passed: results.length - failed.length, failed: failed.length }, results }, null, 2));
  console.log(`Report JSON: ${reportPath}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
