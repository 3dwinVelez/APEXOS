/* Certificacion de aislamiento multi-tenant y RBAC del modulo Comercio (M-30).
 *
 * Celda que faltaba: la UX del modulo y la vitrina estaban certificadas, pero ningun
 * arnes hacia peticiones HTTP reales de UN tenant contra los documentos de OTRO. Aqui
 * no se burla nada: API real (server.build + inject), PostgreSQL real, tres empresas
 * creadas para la corrida y borradas al final.
 *
 * Que se certifico y por que esa es la celda:
 *   - Lectura y escritura cruzadas por id: el servicio resuelve el id DENTRO del
 *     contexto de tenant, así que el documento ajeno no existe. Se exige 404 con el
 *     codigo de negocio (PRODUCT_NOT_FOUND, SALE_NOT_FOUND, ...), nunca 200 y nunca
 *     403: un 403 revelaria que el id existe en otra empresa.
 *   - Listados, movimientos, dashboard y reportes de C no contienen ni una fila de A.
 *   - Configuracion: cada empresa ve su store_name y su codigo de vitrina.
 *   - RBAC: empresa sin M-30 => MODULO_NO_HABILITADO; rol solo-lectura => puede leer y
 *     queda fuera de write y de approve (anulaciones).
 *   - Vitrina publica anonima: solo los productos de su dueño, sin costo, sin stock
 *     crudo, sin tenant_id; quemar el link deja el anterior en 404.
 *   - mapApiError (extraccion a core/api-error.js): todos los rechazos conservan su
 *     `code`. Si el manejo global se hubiera roto, aqui saldrían 500 sin codigo.
 *
 * Uso:
 *   node scripts/certifications/comercio-tenant-rbac-local.js
 *   node scripts/certifications/comercio-tenant-rbac-local.js --output=<ruta.json>
 *
 * Requiere DATABASE_URL a PostgreSQL local. No levanta servidores: la aplicacion se
 * construye en el proceso, así que la corrida es deterministica.
 */
require("../load-env")();
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const bcrypt = require("bcrypt");

const COMERCIO_TABLES = [
  "comercio_promotion_sends", "comercio_promotion_products", "comercio_promotion_categories",
  "comercio_promotions", "comercio_payments", "comercio_installments", "comercio_credits",
  "comercio_sale_items", "comercio_sales", "comercio_purchases", "comercio_expenses",
  "comercio_stock_movements", "comercio_settings", "comercio_products", "comercio_customers"
];

// Contraseña de las cuatro empresas efimeras de esta corrida. No es credencial de ningun
// tenant existente; se puede fijar por variable para el ambiente que lo pida.
const PASSWORD = process.env.APEX_CERT_FIXTURE_PASSWORD || "cert1234";

async function main() {
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const output = path.resolve(outputArg
    ? outputArg.slice(9)
    : "docs/qa/evidence/comercio-tenant-rbac-20261106/api-local.json");
  const databaseUrl = String(process.env.DATABASE_URL || "");
  if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl)) {
    throw new Error("BLOQUEADO: DATABASE_URL debe apuntar a PostgreSQL local.");
  }

  const build = require("../../apps/api/server");
  const app = await build();
  const prisma = require("../../apps/api/src/core/prisma");
  const { invalidateTenantCache } = require("../../apps/api/src/core/tenantCache");

  const checks = [];
  const createdTenants = [];
  const statusCodes = [];
  let fase = "arranque";

  const check = (name, ok, detail) => {
    assert.ok(ok, `${name} [${fase}]: ${JSON.stringify(detail)}`);
    checks.push({ name, fase, status: "passed", detail });
  };

  async function call(method, url, { token, body } = {}) {
    const res = await app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: body
    });
    statusCodes.push(res.statusCode);
    return { status: res.statusCode, json: (() => { try { return res.json(); } catch { return null; } })() };
  }

  // Empresa nueva con un rol y un usuario. `modulos` es active_modules literal: la
  // prueba de MODULO_NO_HABILITADO necesita una empresa que NO tenga M-30 y un rol que
  // SI tenga los permisos, para que el bloqueo venga de la licencia y no del permiso.
  async function crearEmpresa({ etiqueta, modulos, rolNombre, permisos }) {
    // Login normaliza el correo a minusculas: la etiqueta va ya en minuscula o el
    // findFirst del servicio no encuentra al usuario creado.
    const sello = `${Date.now()}-${String(etiqueta).toLowerCase()}`;
    const tenant = await prisma.tenant.create({
      data: { name: `Cert Comercio ${etiqueta}`, domain: `${sello}.local.test`, active_modules: modulos }
    });
    createdTenants.push(tenant.id);
    const role = await prisma.role.create({
      data: { tenant_id: tenant.id, name: rolNombre, metadata: { role_type: "operador" } }
    });
    if (permisos.length) {
      await prisma.permission.createMany({ data: permisos.map((p) => ({ role_id: role.id, module: p.module, action: p.action })) });
    }
    const email = `${sello}@cert.local.test`;
    const user = await prisma.user.create({
      data: { tenant_id: tenant.id, name: `Usuario ${etiqueta}`, email, password: await bcrypt.hash(PASSWORD, 10), role_id: role.id }
    });
    const login = await call("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });
    assert.equal(login.status, 200, `login de ${etiqueta} falló: ${JSON.stringify(login.json)}`);
    return { tenant, role, user, token: login.json.token };
  }

  try {
    fase = "montaje";
    const A = await crearEmpresa({
      etiqueta: "A", modulos: ["M-30"], rolNombre: "Operador A",
      permisos: [{ module: "comercio", action: "read" }, { module: "comercio", action: "write" }, { module: "comercio", action: "approve" }]
    });
    const L = await crearEmpresa({
      etiqueta: "L", modulos: ["M-30"], rolNombre: "Lector A",
      permisos: [{ module: "comercio", action: "read" }]
    });
    const B = await crearEmpresa({
      etiqueta: "B", modulos: ["M-22"], rolNombre: "Operador B",
      permisos: [{ module: "comercio", action: "read" }, { module: "comercio", action: "write" }, { module: "comercio", action: "approve" }]
    });
    const C = await crearEmpresa({
      etiqueta: "C", modulos: ["M-30"], rolNombre: "Operador C",
      permisos: [{ module: "comercio", action: "read" }, { module: "comercio", action: "write" }, { module: "comercio", action: "approve" }]
    });
    check("cuatro_empresas_con_licencia_distinta", A.tenant.id !== C.tenant.id && B.tenant.id !== A.tenant.id, {
      A: A.tenant.id, L: L.tenant.id, B: B.tenant.id, C: C.tenant.id
    });

    fase = "datos de A";
    check("settings_de_A", (await call("PUT", "/api/v1/comercio/settings", { token: A.token, body: { store_name: "Almacen Aurora de A" } })).status === 200, "nombre de tienda escrito");
    const prodA = (await call("POST", "/api/v1/comercio/products", { token: A.token, body: { name: "Cafe Aurora 250 g", category: "Abarrotes", price: 12000, cost: 8000, stock: 40 } })).json;
    const cliA = (await call("POST", "/api/v1/comercio/customers", { token: A.token, body: { name: "Clienta Aurora", document: `AUR-${A.tenant.id.slice(0, 6)}` } })).json;
    check("productos_y_clientes_de_A_creados", Boolean(prodA?.id) && Boolean(cliA?.id), { producto: prodA?.id, cliente: cliA?.id });

    const ventaEfectivo = await call("POST", "/api/v1/comercio/sales", { token: A.token, body: { payment_type: "cash", method: "efectivo", items: [{ product_id: prodA.id, quantity: 2 }] } });
    const ventaCredito = await call("POST", "/api/v1/comercio/sales", {
      token: A.token,
      body: { payment_type: "credit", customer_id: cliA.id, items: [{ product_id: prodA.id, quantity: 3 }], credit: { down_payment: 5000, installment_count: 3, frequency: "monthly" } }
    });
    const gastoA = await call("POST", "/api/v1/comercio/expenses", { token: A.token, body: { concept: "Arriendo local de A", category: "Operaciones", amount: 900000, direction: "expense" } });
    const promoA = await call("POST", "/api/v1/comercio/promotions", { token: A.token, body: { name: "Promo Aurora", scope: "all", percent: 10 } });
    check("documentos_de_A_creados", ventaEfectivo.status === 201 && ventaCredito.status === 201 && gastoA.status === 201 && promoA.status === 201, {
      venta_efectivo: ventaEfectivo.json?.id, venta_credito: ventaCredito.json?.id, gasto: gastoA.json?.id, promocion: promoA.json?.id
    });
    const creditoA = (await call("GET", "/api/v1/comercio/credits", { token: A.token })).json?.items?.[0];
    check("cartera_de_A_tiene_cuota", Boolean(creditoA?.id), { credito: creditoA?.id });

    fase = "datos de C";
    const prodC = (await call("POST", "/api/v1/comercio/products", { token: C.token, body: { name: "Harina Cumbre 1 kg", category: "Abarrotes", price: 5900, cost: 4100, stock: 30 } })).json;
    const gastoC = (await call("POST", "/api/v1/comercio/expenses", { token: C.token, body: { concept: "Servicios local de C", amount: 120000, direction: "expense" } })).json;
    check("datos_de_C_creados", Boolean(prodC?.id) && Boolean(gastoC?.id), { producto: prodC?.id, gasto: gastoC?.id });

    fase = "lectura cruzada por id";
    // Solo las rutas que existen de verdad: el modulo no tiene GET individual de
    // clientes ni de gastos (se atacan por su ruta de escritura mas abajo), así que
    // aqui se usan las seis lecturas por id que si estan registradas.
    const lecturas = [
      ["producto", "GET", `/api/v1/comercio/products/${prodA.id}`, "PRODUCT_NOT_FOUND"],
      ["foto", "GET", `/api/v1/comercio/products/${prodA.id}/photo-url`, "PRODUCT_NOT_FOUND"],
      ["venta", "GET", `/api/v1/comercio/sales/${ventaEfectivo.json.id}`, "SALE_NOT_FOUND"],
      ["credito", "GET", `/api/v1/comercio/credits/${creditoA.id}`, "CREDIT_NOT_FOUND"],
      ["audiencia", "GET", `/api/v1/comercio/promotions/${promoA.json.id}/audience`, "PROMOTION_NOT_FOUND"],
      ["promocion", "GET", `/api/v1/comercio/promotions/${promoA.json.id}`, "PROMOTION_NOT_FOUND"]
    ];
    for (const [nombre, method, url, code] of lecturas) {
      const res = await call(method, url, { token: C.token });
      const codeOk = code ? res.json?.code === code : res.status === 404;
      check(`C_no_lee_el_${nombre}_de_A`, res.status === 404 && codeOk, { status: res.status, code: res.json?.code });
    }

    fase = "escritura cruzada por id";
    const escrituras = [
      ["editar_el_producto_de_A", "PUT", `/api/v1/comercio/products/${prodA.id}`, { price: 1 }, "PRODUCT_NOT_FOUND"],
      ["ajustar_el_stock_de_A", "POST", `/api/v1/comercio/products/${prodA.id}/adjust-stock`, { quantity: 10, note: "invasión" }, "PRODUCT_NOT_FOUND"],
      ["archivar_el_producto_de_A", "POST", `/api/v1/comercio/products/${prodA.id}/deactivate`, {}, "PRODUCT_NOT_FOUND"],
      ["archivar_el_cliente_de_A", "POST", `/api/v1/comercio/customers/${cliA.id}/deactivate`, {}, "CUSTOMER_NOT_FOUND"],
      ["editar_el_cliente_de_A", "PUT", `/api/v1/comercio/customers/${cliA.id}`, { name: "Cliente robado" }, "CUSTOMER_NOT_FOUND"],
      ["anular_la_venta_de_A", "POST", `/api/v1/comercio/sales/${ventaEfectivo.json.id}/void`, { reason: "invasión" }, "SALE_NOT_FOUND"],
      ["abonar_a_la_cartera_de_A", "POST", `/api/v1/comercio/credits/${creditoA.id}/payments`, { amount: 1000 }, "CREDIT_NOT_FOUND"],
      ["editar_el_gasto_de_A", "PUT", `/api/v1/comercio/expenses/${gastoA.json.id}`, { amount: 1 }, "EXPENSE_NOT_FOUND"],
      ["anular_el_gasto_de_A", "POST", `/api/v1/comercio/expenses/${gastoA.json.id}/void`, {}, "EXPENSE_NOT_FOUND"],
      ["activar_la_promocion_de_A", "POST", `/api/v1/comercio/promotions/${promoA.json.id}/status`, { status: "active" }, "PROMOTION_NOT_FOUND"],
      ["editar_la_promocion_de_A", "PUT", `/api/v1/comercio/promotions/${promoA.json.id}`, { percent: 50 }, "PROMOTION_NOT_FOUND"]
    ];
    for (const [nombre, method, url, body, code] of escrituras) {
      const res = await call(method, url, { token: C.token, body });
      check(`C_no_${nombre}`, res.status === 404 && res.json?.code === code, { status: res.status, code: res.json?.code });
    }

    fase = "los datos de A siguen intactos";
    const productoIntacto = await call("GET", `/api/v1/comercio/products/${prodA.id}`, { token: A.token });
    check("el_invasor_no_muto_nada", productoIntacto.status === 200
      && productoIntacto.json.price === 12000 && productoIntacto.json.active === true, {
      price: productoIntacto.json?.price, active: productoIntacto.json?.active
    });

    fase = "listados y agregados";
    const listas = [
      ["productos", "/api/v1/comercio/products?include_inactive=true"],
      ["clientes", "/api/v1/comercio/customers"],
      ["ventas", "/api/v1/comercio/sales"],
      ["creditos", "/api/v1/comercio/credits"],
      ["gastos", "/api/v1/comercio/expenses"],
      ["movimientos", "/api/v1/comercio/movements"],
      ["promociones", "/api/v1/comercio/promotions"]
    ];
    for (const [nombre, url] of listas) {
      const res = await call("GET", url, { token: C.token });
      const crudo = JSON.stringify(res.json);
      const idsDeA = [prodA.id, cliA.id, ventaEfectivo.json.id, ventaCredito.json.id, creditoA.id, gastoA.json.id, promoA.json.id];
      check(`la_lista_de_${nombre}_de_C_no_tiene_filas_de_A`, res.status === 200
        && !crudo.includes("Aurora") && !crudo.includes(A.tenant.id)
        && idsDeA.every((id) => !new RegExp(`"id":${id}[,}]`).test(crudo)), {
        status: res.status, tamano: crudo.length, items: Array.isArray(res.json?.items) ? res.json.items.length : null
      });
    }
    const dashC = await call("GET", "/api/v1/comercio/dashboard", { token: C.token });
    const dashA = await call("GET", "/api/v1/comercio/dashboard", { token: A.token });
    check("dashboard_de_C_no_lee_la_ventana_de_A", dashC.status === 200 && dashA.status === 200
      && JSON.stringify(dashC.json) !== JSON.stringify(dashA.json)
      && !JSON.stringify(dashC.json).includes(A.tenant.id), {
      ventas_A: dashA.json?.metrics?.sales_count ?? dashA.json?.totals?.sales ?? null,
      ventas_C: dashC.json?.metrics?.sales_count ?? dashC.json?.totals?.sales ?? null
    });
    const reportC = await call("GET", "/api/v1/comercio/reports/summary", { token: C.token });
    check("reporte_de_C_sin_ingresos_de_A", reportC.status === 200
      && !JSON.stringify(reportC.json).includes("Aurora")
      && !JSON.stringify(reportC.json).includes(A.tenant.id), { status: reportC.status });
    const settingsC = await call("GET", "/api/v1/comercio/settings", { token: C.token });
    check("configuracion_de_C_es_la_suya", settingsC.status === 200
      && settingsC.json.store_name !== "Almacen Aurora de A", { store_name: settingsC.json?.store_name });

    fase = "licencia por empresa";
    const sinLicencia = await call("GET", "/api/v1/comercio/dashboard", { token: B.token });
    check("empresa_sin_M30_queda_fuera_del_modulo", sinLicencia.status === 403
      && sinLicencia.json?.code === "MODULO_NO_HABILITADO", { status: sinLicencia.status, code: sinLicencia.json?.code });
    const sinLicenciaEscr = await call("POST", "/api/v1/comercio/products", { token: B.token, body: { name: "Intruso", price: 1, cost: 1 } });
    check("empresa_sin_M30_no_crea_nada", sinLicenciaEscr.status === 403
      && sinLicenciaEscr.json?.code === "MODULO_NO_HABILITADO", { status: sinLicenciaEscr.status, code: sinLicenciaEscr.json?.code });

    fase = "permisos por rol";
    const lectorLee = await call("GET", "/api/v1/comercio/products", { token: L.token });
    check("el_lector_si_lee", lectorLee.status === 200, { status: lectorLee.status });
    const lectorEscribe = await call("POST", "/api/v1/comercio/products", { token: L.token, body: { name: "No debe existir", price: 1, cost: 1 } });
    check("el_lector_no_escribe", lectorEscribe.status === 403
      && lectorEscribe.json?.code === "PERMISO_DENEGADO", { status: lectorEscribe.status, code: lectorEscribe.json?.code });
    const lectorAnula = await call("POST", `/api/v1/comercio/sales/${ventaEfectivo.json.id}/void`, { token: L.token, body: { reason: "sin permiso" } });
    check("el_lector_no_anula", lectorAnula.status === 403
      && lectorAnula.json?.code === "PERMISO_DENEGADO", { status: lectorAnula.status, code: lectorAnula.json?.code });
    const lectorConfigura = await call("PUT", "/api/v1/comercio/settings", { token: L.token, body: { store_name: "Nombre que no debe grabarse" } });
    check("el_lector_no_configura", lectorConfigura.status === 403
      && lectorConfigura.json?.code === "PERMISO_DENEGADO", { status: lectorConfigura.status, code: lectorConfigura.json?.code });
    const sinToken = await call("GET", "/api/v1/comercio/dashboard", {});
    check("sin_sesion_no_hay_modulo", sinToken.status === 401, { status: sinToken.status, code: sinToken.json?.code });

    fase = "vitrina publica anonima";
    const publicar = await call("PUT", "/api/v1/comercio/settings", { token: A.token, body: { catalog_enabled: true } });
    const codigo = publicar.json?.catalog_code;
    check("A_publica_su_vitrina", publicar.status === 200 && typeof codigo === "string" && codigo.length >= 4, { codigo });
    const anonimo = await call("GET", `/api/v1/public/comercio/catalog/${codigo}`, {});
    check("la_vitrina_es_publica", anonimo.status === 200 && anonimo.json?.store_name === "Almacen Aurora de A", {
      status: anonimo.status, store_name: anonimo.json?.store_name, items: anonimo.json?.items?.length
    });
    check("la_vitrina_saca_solo_productos_de_A", anonimo.json.items.some((i) => i.name === "Cafe Aurora 250 g")
      && !anonimo.json.items.some((i) => i.name === "Harina Cumbre 1 kg"), { items: anonimo.json.items.map((i) => i.name) });
    const crudoVitrina = JSON.stringify(anonimo.json);
    for (const [nombre, filtro] of [["costo", '"cost"'], ["stock_crudo", '"stock"'], ["tenant", A.tenant.id], ["ids_internas", '"id":']]) {
      check(`la_vitrina_no_revela_${nombre}`, !crudoVitrina.includes(filtro), { filtro });
    }
    const codigoAjeno = await call("GET", `/api/v1/public/comercio/catalog/${(await call("GET", "/api/v1/comercio/settings", { token: C.token })).json.catalog_code || "zzzz"}`, {});
    check("la_vitrina_de_C_no_existe_sin_publicar", codigoAjeno.status === 404
      && codigoAjeno.json?.code === "CATALOG_NOT_FOUND", { status: codigoAjeno.status, code: codigoAjeno.json?.code });
    const quemar = await call("POST", "/api/v1/comercio/settings/catalog/regenerate", { token: A.token });
    check("quemar_el_link_cambia_el_codigo", quemar.status === 200 && quemar.json?.catalog_code !== codigo, {
      anterior: codigo, nuevo: quemar.json?.catalog_code
    });
    const linkViejo = await call("GET", `/api/v1/public/comercio/catalog/${codigo}`, {});
    check("el_link_quemado_muere", linkViejo.status === 404
      && linkViejo.json?.code === "CATALOG_NOT_FOUND", { status: linkViejo.status });

    fase = "codigo de negocio conservado";
    check("ninguna_respuesta_es_5xx", statusCodes.every((s) => s < 500), {
      codigos: [...new Set(statusCodes)].sort((a, b) => a - b)
    });
    check("los_rechazos_traen_codigo_de_negocio", statusCodes.filter((s) => s >= 400).length > 0
      && !checks.some((c) => c.name.startsWith("C_no_") && !c.detail.code), {
      rechazos: statusCodes.filter((s) => s >= 400).length
    });

    const resultado = {
      certification: "comercio-tenant-rbac-local",
      version: 1,
      status: "passed",
      generated_at: new Date().toISOString(),
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      environment: {
        type: "local-isolated-api",
        database: new URL(databaseUrl).pathname.slice(1),
        node: process.version
      },
      method: "server.build() + app.inject, sin burlas ni interception",
      tenants: { A: A.tenant.id, L: L.tenant.id, B: B.tenant.id, C: C.tenant.id },
      summary: { total: checks.length, fallidos: [] },
      checks
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(resultado, null, 2)}\n`);
    console.log(`CERTIFICATION_OK ${JSON.stringify({ evidencia: output, total: checks.length })}`);
  } catch (error) {
    const parcial = {
      certification: "comercio-tenant-rbac-local",
      version: 1,
      status: "failed",
      fase,
      generated_at: new Date().toISOString(),
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      error: String(error?.message || error),
      summary: { total: checks.length, fallidos: checks.filter((c) => c.status !== "passed").map((c) => c.name) },
      checks
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(parcial, null, 2)}\n`);
    throw error;
  } finally {
    // Borrado fisico por SQL crudo: `prisma.user.deleteMany` cae en el middleware de
    // soft-delete y deja el usuario blandiblinda en la base, y `role.deleteMany` choca
    // con la FK de los usuarios. El orden es sesiones, usuarios, permisos, roles,
    // empresa; la verificacion final no admite residuales.
    for (const id of createdTenants) {
      for (const table of COMERCIO_TABLES) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE tenant_id = $1`, id).catch(() => undefined);
      }
      await prisma.$executeRawUnsafe('DELETE FROM "AuthorizationSession" WHERE user_id IN (SELECT id FROM "User" WHERE tenant_id = $1)', id).catch(() => undefined);
      await prisma.$executeRawUnsafe('DELETE FROM "Permission" WHERE role_id IN (SELECT id FROM "Role" WHERE tenant_id = $1)', id).catch(() => undefined);
      await prisma.$executeRawUnsafe('DELETE FROM "User" WHERE tenant_id = $1', id).catch(() => undefined);
      await prisma.$executeRawUnsafe('DELETE FROM "Role" WHERE tenant_id = $1', id).catch(() => undefined);
      await invalidateTenantCache(id).catch(() => undefined);
    }
    for (const id of createdTenants) {
      await prisma.$executeRawUnsafe('DELETE FROM "Tenant" WHERE id = $1', id).catch(() => undefined);
    }
    const lista = createdTenants.map((_, i) => `$${i + 1}`).join(",");
    const residuales = [];
    const conteos = [
      ...COMERCIO_TABLES.map((t) => [`"${t}"`, `tenant_id IN (${lista})`]),
      ['"User"', `tenant_id IN (${lista})`],
      ['"Role"', `tenant_id IN (${lista})`],
      ['"Permission"', `role_id IN (SELECT id FROM "Role" WHERE tenant_id IN (${lista}))`],
      ['"AuthorizationSession"', `user_id IN (SELECT id FROM "User" WHERE tenant_id IN (${lista}))`],
      ['"Tenant"', `id IN (${lista})`]
    ];
    for (const [tabla, filtro] of conteos) {
      const filas = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS total FROM ${tabla} WHERE ${filtro}`, ...createdTenants
      ).catch(() => [{ total: -1 }]);
      if (filas[0]?.total !== 0) residuales.push(`${tabla}=${filas[0]?.total}`);
    }
    if (residuales.length) console.error(`LIMPIEZA_INCOMPLETA ${JSON.stringify(residuales)}`);
    console.log(`LIMPIEZA ${JSON.stringify({ empresas: createdTenants.length, residuales })}`);
    await app.close();
  }
}

main().catch((error) => { console.error(String(error?.message || error)); process.exitCode = 1; });
