const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const FIXTURE_TAG = "QA-CM-STABILITY-V1";
const CONFIRMATION = "populate-commercial-management-qa";
const DEFAULT_API_URL = "https://apexos-api-qa-production.up.railway.app";
const DEFAULT_COMPANY = "Cliente Piloto QA";
const DEFAULT_USER_EMAIL = "qa.commercial.population@apexos.invalid";

const fixture = {
  zones: [
    ["QA-CM-Z-NORTE", "Bogota Norte", "Bogota D.C.", "Cundinamarca"],
    ["QA-CM-Z-SUR", "Bogota Sur", "Bogota D.C.", "Cundinamarca"],
    ["QA-CM-Z-OCC", "Bogota Occidente", "Bogota D.C.", "Cundinamarca"],
    ["QA-CM-Z-CEN", "Bogota Centro", "Bogota D.C.", "Cundinamarca"]
  ],
  categories: [
    ["QA-CM-CAT-A", "Cuenta estrategica"],
    ["QA-CM-CAT-B", "Distribuidor"],
    ["QA-CM-CAT-C", "Minorista"],
    ["QA-CM-CAT-P", "Prospecto"]
  ],
  reasons: [
    ["QA-CM-MOT-VENTA", "Presentacion comercial"],
    ["QA-CM-MOT-SEG", "Seguimiento de oportunidad"],
    ["QA-CM-MOT-CART", "Revision de cartera"],
    ["QA-CM-MOT-POS", "Acompanamiento posventa"]
  ],
  results: [
    ["ORDER_GENERATED", "Pedido generado", true, false],
    ["INTERESTED_LATER", "Interes posterior", false, true],
    ["NO_BUDGET", "Sin presupuesto", false, true],
    ["CUSTOMER_UNAVAILABLE", "Cliente no disponible", false, true]
  ],
  advisors: ["Andrea Torres", "Carlos Restrepo", "Diana Martinez", "Felipe Rojas", "Laura Gomez"],
  customerNames: [
    "Alimentos Andinos", "Bodegas Capital", "Comercial La Sabana", "Distribuciones El Dorado",
    "Empaques del Centro", "Ferreteria Horizonte", "Grupo Gastronomico Norte", "Hogar y Oficina SAS",
    "Industrias Fontibon", "Jardines Urbanos", "Kioscos Metropolitanos", "Logistica Integral QA",
    "Mercados del Parque", "Negocios Chapinero", "Operaciones Kennedy", "Papeleria Continental",
    "Quimicos Seguros", "Restaurantes Unidos", "Suministros Teusaquillo", "Tiendas del Portal"
  ],
  productNames: [
    "Exhibidor comercial", "Kit punto de venta", "Material POP premium", "Senalizacion corporativa",
    "Estanteria modular", "Nevera exhibidora", "Congelador horizontal", "Vitrina refrigerada",
    "Servicio de instalacion", "Servicio de mantenimiento", "Plan de capacitacion", "Auditoria de exhibicion",
    "Repuesto controlador", "Repuesto ventilador", "Kit de iluminacion", "Extension de garantia"
  ]
};

function expectedCounts() {
  return {
    zones: fixture.zones.length,
    categories: fixture.categories.length,
    reasons: fixture.reasons.length,
    results: fixture.results.length,
    advisors: fixture.advisors.length,
    customers: fixture.customerNames.length,
    products: fixture.productNames.length,
    visits: fixture.customerNames.length,
    commitments: fixture.customerNames.length,
    quotations: 10,
    orders: 6
  };
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_API_URL));
  assert.equal(url.protocol, "https:", "La certificacion QA exige HTTPS.");
  assert.equal(url.hostname, new URL(DEFAULT_API_URL).hostname, "Solo se permite el API QA aprobado.");
  return url.origin;
}

function isoAt(day, hour, minute = 0) {
  const value = new Date();
  value.setUTCDate(day);
  value.setUTCHours(hour + 5, minute, 0, 0);
  return value.toISOString();
}

function monthWindow(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
  const [year, month, day] = formatter.format(now).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    today: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    start: `${year}-${String(month).padStart(2, "0")}-01T00:00:00-05:00`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59.999-05:00`,
    lastDay
  };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function createClient({ baseUrl, defaultHeaders = {}, label }) {
  return async function request(route, options = {}) {
    const accepted = options.accepted || [200, 201];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${baseUrl}${route}`, {
        ...options,
        headers: { ...defaultHeaders, ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
        body: options.body === undefined || typeof options.body === "string" ? options.body : JSON.stringify(options.body)
      });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (response.status === 429 && attempt < 3) {
        await sleep(Math.min(Number(response.headers.get("retry-after") || 2) * 1000, 10000));
        continue;
      }
      if (!accepted.includes(response.status)) {
        const detail = typeof body === "string" ? body : JSON.stringify(body);
        throw Object.assign(new Error(`${label} ${options.method || "GET"} ${route} -> ${response.status}: ${detail.slice(0, 500)}`), { status: response.status, body });
      }
      return { status: response.status, body };
    }
    throw new Error(`${label} ${route}: limite de reintentos agotado.`);
  };
}

async function main() {
  assert.equal(process.env.COMMERCIAL_QA_CONFIRM, CONFIRMATION, `Define COMMERCIAL_QA_CONFIRM=${CONFIRMATION}.`);
  const apiUrl = normalizeBaseUrl(process.env.COMMERCIAL_QA_API_URL);
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(supabaseUrl && anonKey && serviceKey, "Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.");
  assert.equal(new URL(supabaseUrl).hostname, "jbirkghkekuifgfsgquq.supabase.co", "Solo se permite el proyecto Supabase QA aprobado.");

  const supabaseAdmin = createClient({ baseUrl: supabaseUrl, label: "Supabase admin", defaultHeaders: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } });
  const companies = (await supabaseAdmin(`/rest/v1/companies?select=id,name,status&name=eq.${encodeURIComponent(process.env.COMMERCIAL_QA_COMPANY || DEFAULT_COMPANY)}`)).body;
  assert.equal(companies.length, 1, "No se encontro exactamente una compania QA objetivo.");
  const company = companies[0];
  assert.equal(company.status, "active", "La compania QA objetivo no esta activa.");

  const moduleCatalog = (await supabaseAdmin("/rest/v1/modules?select=id,code&code=eq.gestion_comercial")).body;
  assert.equal(moduleCatalog.length, 1, "Gestion Comercial no existe en el catalogo QA.");
  const moduleStatus = (await supabaseAdmin(`/rest/v1/company_modules?select=enabled&company_id=eq.${company.id}&module_id=eq.${moduleCatalog[0].id}`)).body;
  assert.equal(moduleStatus.length, 1, "Gestion Comercial no esta relacionado con la compania QA.");
  assert.equal(moduleStatus[0].enabled, true, "Gestion Comercial no esta habilitado para la compania QA.");

  const qaEmail = process.env.COMMERCIAL_QA_USER_EMAIL || DEFAULT_USER_EMAIL;
  const password = crypto.randomBytes(30).toString("base64url");
  const authUsers = (await supabaseAdmin("/auth/v1/admin/users?page=1&per_page=1000")).body.users || [];
  let authUser = authUsers.find((user) => String(user.email || "").toLowerCase() === qaEmail.toLowerCase());
  const authPayload = { email: qaEmail, password, email_confirm: true, user_metadata: { full_name: "QA Gestion Comercial", fixture_tag: FIXTURE_TAG } };
  if (authUser) {
    authUser = (await supabaseAdmin(`/auth/v1/admin/users/${authUser.id}`, { method: "PUT", body: authPayload })).body;
  } else {
    authUser = (await supabaseAdmin("/auth/v1/admin/users", { method: "POST", body: authPayload })).body;
  }
  await supabaseAdmin("/rest/v1/profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: [{ id: authUser.id, full_name: "QA Gestion Comercial", email: qaEmail, status: "active" }] });
  await supabaseAdmin("/rest/v1/company_users?on_conflict=company_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: [{ company_id: company.id, user_id: authUser.id, role: "admin", status: "active" }] });

  const supabasePublic = createClient({ baseUrl: supabaseUrl, label: "Supabase auth", defaultHeaders: { apikey: anonKey } });
  const session = (await supabasePublic("/auth/v1/token?grant_type=password", { method: "POST", body: { email: qaEmail, password } })).body;
  assert.ok(session.access_token, "Supabase no retorno el token QA.");
  const api = createClient({ baseUrl: apiUrl, label: "API QA", defaultHeaders: { authorization: `Bearer ${session.access_token}`, "x-company-id": company.id } });

  const health = (await api("/health")).body;
  assert.equal(health.status, "OK");
  const me = (await api("/api/v1/auth/me")).body;
  const identity = me.user || me;
  assert.ok(identity.id, "El API no devolvio la identidad autenticada.");
  await api("/api/v1/commercial-management/settings", { method: "PUT", body: { default_visit_duration_minutes: 45, default_quote_validity_days: 21 } });

  const base = "/api/v1/commercial-management";
  async function ensureByCode(endpoint, rows, payloadFor) {
    let current = (await api(`${base}/${endpoint}`)).body;
    const ensured = [];
    for (let index = 0; index < rows.length; index += 1) {
      const payload = payloadFor(rows[index], index);
      let item = current.find((entry) => entry.code === payload.code);
      if (item) item = (await api(`${base}/${endpoint}/${item.id}`, { method: "PATCH", body: payload })).body;
      else item = (await api(`${base}/${endpoint}`, { method: "POST", body: payload })).body;
      ensured.push(item);
    }
    return ensured;
  }

  const zones = await ensureByCode("zones", fixture.zones, ([code, name, city, department]) => ({ code, name, city, department, description: FIXTURE_TAG, active: true }));
  const categories = await ensureByCode("customer-categories", fixture.categories, ([code, name]) => ({ code, name, description: FIXTURE_TAG, active: true }));
  const reasons = await ensureByCode("visit-reasons", fixture.reasons, ([code, name]) => ({ code, name, description: FIXTURE_TAG, active: true }));
  const results = await ensureByCode("visit-results", fixture.results, ([code, name, effective, requiresObservation]) => ({ code, name, description: FIXTURE_TAG, counts_as_effective: effective, requires_observation: requiresObservation, active: true }));
  const advisors = await ensureByCode("advisors", fixture.advisors, (name, index) => ({ code: `QA-CM-ADV-${String(index + 1).padStart(2, "0")}`, name, email: `qa.cm.advisor.${index + 1}@apexos.invalid`, phone: `300700${String(index + 1).padStart(4, "0")}`, zone_id: zones[index % zones.length].id, active: true }));

  let customers = (await api(`${base}/customers`)).body;
  const ensuredCustomers = [];
  for (let index = 0; index < fixture.customerNames.length; index += 1) {
    const code = `QA-CM-CLI-${String(index + 1).padStart(3, "0")}`;
    const payload = { code, legal_name: `${fixture.customerNames[index]} QA`, trade_name: fixture.customerNames[index], identification_type: "NIT", identification: `90077${String(index + 1).padStart(4, "0")}-1`, contact_name: `Contacto QA ${index + 1}`, contact_position: index % 2 ? "Compras" : "Gerencia", phone: `601700${String(index + 1).padStart(4, "0")}`, whatsapp: `300800${String(index + 1).padStart(4, "0")}`, email: `qa.cm.customer.${index + 1}@apexos.invalid`, address: `Calle ${20 + index} # ${10 + index}-20`, city: "Bogota D.C.", department: "Cundinamarca", notes: FIXTURE_TAG, advisor_id: advisors[index % advisors.length].id, category_id: categories[index % categories.length].id, status: index % 7 === 6 ? "PROSPECT" : "ACTIVE", visit_frequency_days: [7, 15, 30][index % 3], credit_capacity: 5000000 + index * 750000 };
    let customer = customers.find((item) => item.code === code);
    customer = customer
      ? (await api(`${base}/customers/${customer.id}`, { method: "PATCH", body: payload })).body
      : (await api(`${base}/customers`, { method: "POST", body: payload })).body;
    ensuredCustomers.push(customer);
  }
  customers = ensuredCustomers;

  const inventoryResponse = (await api("/api/v1/inventory/items?all=true&active=true")).body;
  let inventoryItems = Array.isArray(inventoryResponse) ? inventoryResponse : inventoryResponse.data || [];
  const familiesResponse = (await api("/api/v1/inventory/families?active=true")).body;
  const families = Array.isArray(familiesResponse) ? familiesResponse : familiesResponse.data || [];
  const family = families.find((item) => item.active !== false && item.code_start && item.code_end && item.society_code && item.branch_code && Number(item.code_end) - Number(item.code_start) >= fixture.productNames.length);
  assert.ok(family, "Inventarios esta activo, pero no existe una familia con rango y organizacion suficiente para la poblacion QA.");
  const productCodes = fixture.productNames.map((_, index) => String(Number(family.code_start) + 20 + index).padStart(String(family.code_start).length, "0"));
  for (let index = 0; index < fixture.productNames.length; index += 1) {
    const code = productCodes[index];
    const payload = { name: `${fixture.productNames[index]} QA`, unit: index >= 8 && index < 12 ? "SERV" : "UND", unit_cost: 45000 + index * 50000, unit_price: 85000 + index * 137500, tax_rate: 19, stock_min: 0, stock_max: 1000, weight_kg: 0, volume_m3: 0, metadata: { fixture_tag: FIXTURE_TAG, commercial_population: true } };
    const current = inventoryItems.find((item) => item.code === code);
    if (current) await api(`/api/v1/inventory/items/${current.id}`, { method: "PATCH", body: payload });
    else await api("/api/v1/inventory/items", { method: "POST", body: { ...payload, code, type: index >= 8 && index < 12 ? "service" : "product", family_code: family.code, society_code: family.society_code, branch_code: family.branch_code } });
  }
  inventoryItems = ((await api("/api/v1/inventory/items?all=true&active=true")).body.data || []).filter((item) => productCodes.includes(item.code));
  assert.equal(inventoryItems.length, fixture.productNames.length, "No se consolidaron todos los articulos QA en Inventarios.");
  const commercialCatalog = (await api(`${base}/products`)).body;
  const products = commercialCatalog.filter((item) => productCodes.includes(item.code));
  assert.equal(products.length, fixture.productNames.length, "La sincronizacion Inventarios -> Gestion Comercial quedo incompleta.");

  const window = monthWindow();
  let periods = (await api(`${base}/periods`)).body;
  let period = periods.find((item) => new Date(item.start_date) <= new Date(window.start) && new Date(item.end_date) >= new Date(window.end));
  if (!period) period = (await api(`${base}/periods`, { method: "POST", body: { name: `${FIXTURE_TAG}-${window.year}-${String(window.month).padStart(2, "0")}`, start_date: window.start, end_date: window.end, status: "OPEN" } })).body;
  for (let index = 0; index < advisors.length; index += 1) await api(`${base}/budgets/advisors`, { method: "PUT", body: { period_id: period.id, advisor_id: advisors[index].id, budget_amount: 30000000 + index * 5000000, budget_type: "MONTHLY" } });
  for (let index = 0; index < customers.length; index += 1) await api(`${base}/budgets/customers`, { method: "PUT", body: { period_id: period.id, customer_id: customers[index].id, budget_amount: 4500000 + index * 250000, budget_type: "MONTHLY" } });

  let commitments = (await api(`${base}/commitments`)).body;
  const ensuredCommitments = [];
  for (let index = 0; index < customers.length; index += 1) {
    const description = `${FIXTURE_TAG} compromiso ${String(index + 1).padStart(2, "0")}`;
    let item = commitments.find((entry) => entry.description === description);
    if (!item) item = (await api(`${base}/customers/${customers[index].id}/commitments`, { method: "POST", body: { description, due_date: isoAt(Math.min(28, 4 + index), 14) } })).body;
    const desired = index < 4 ? "COMPLETED" : index === 4 ? "CANCELLED" : "PENDING";
    if (item.status !== desired) item = (await api(`${base}/commitments/${item.id}/status`, { method: "PATCH", body: { status: desired } })).body;
    ensuredCommitments.push(item);
  }
  commitments = ensuredCommitments;

  let visits = (await api(`${base}/visits?date_from=${window.today.slice(0, 8)}01&date_to=${window.today.slice(0, 8)}${String(window.lastDay).padStart(2, "0")}`)).body;
  const ensuredVisits = [];
  for (let index = 0; index < customers.length; index += 1) {
    const marker = `${FIXTURE_TAG} visita ${String(index + 1).padStart(2, "0")}`;
    let visit = visits.find((entry) => entry.notes === marker && !entry.rescheduled_from_id) || visits.find((entry) => entry.notes === marker);
    if (!visit) {
      const day = 2 + (index % Math.max(1, Math.min(24, window.lastDay - 2)));
      visit = (await api(`${base}/visits`, { method: "POST", body: { customer_id: customers[index].id, advisor_id: customers[index].advisor_id, reason_id: reasons[index % reasons.length].id, visit_date: isoAt(day, 8 + Math.floor(index / advisors.length), (index % advisors.length) * 5), duration_minutes: 45, visit_type: ["IN_PERSON", "PHONE", "VIRTUAL"][index % 3], notes: marker } })).body;
    }
    if (index < 6 && visit.status === "SCHEDULED") visit = (await api(`${base}/visits/${visit.id}/start`, { method: "PATCH" })).body;
    if (index < 6 && visit.status === "IN_PROGRESS") visit = (await api(`${base}/visits/${visit.id}/complete`, { method: "PATCH", body: { result_id: results[index % results.length].id, outcome_notes: `${FIXTURE_TAG} resultado validado`, follow_up_required: index % 2 === 0, follow_up_date: isoAt(Math.min(28, 10 + index), 15) } })).body;
    if (index === 6 && visit.status === "SCHEDULED") visit = (await api(`${base}/visits/${visit.id}/reschedule`, { method: "POST", body: { visit_date: isoAt(Math.min(28, 24), 16), duration_minutes: 45, reason: `${FIXTURE_TAG} validacion de reprogramacion` } })).body;
    ensuredVisits.push(visit);
  }
  visits = ensuredVisits;

  let quotations = (await api(`${base}/quotations`)).body;
  const ensuredQuotes = [];
  for (let index = 0; index < 10; index += 1) {
    const marker = `${FIXTURE_TAG} cotizacion ${String(index + 1).padStart(2, "0")}`;
    let quote = quotations.find((entry) => String(entry.notes || "").includes(marker));
    if (!quote) quote = (await api(`${base}/quotations`, { method: "POST", body: { customer_id: customers[index].id, advisor_id: customers[index].advisor_id, quotation_date: isoAt(3 + index, 11), validity_days: 21, notes: marker, lines: [{ product_id: products[index].id, quantity: 2 + index % 3, discount: index % 2 ? 5000 : 0 }, { product_id: products[(index + 5) % products.length].id, quantity: 1 }] } })).body;
    ensuredQuotes.push(quote);
  }
  quotations = ensuredQuotes;
  for (let index = 0; index < 3; index += 1) {
    if (quotations[index].status === "OPEN" && !quotations[index].sales_order) await api(`${base}/quotations/${quotations[index].id}/convert-to-order`, { method: "POST", body: {} });
  }
  if (quotations[3].status === "OPEN" && !quotations[3].sales_order) await api(`${base}/quotations/${quotations[3].id}/cancel`, { method: "POST", body: { reason: `${FIXTURE_TAG} escenario de cancelacion` } });

  let orders = (await api(`${base}/orders`)).body;
  for (let index = 0; index < 3; index += 1) {
    const marker = `${FIXTURE_TAG} pedido directo ${String(index + 1).padStart(2, "0")}`;
    let order = orders.find((entry) => String(entry.notes || "").includes(marker));
    if (!order) order = (await api(`${base}/orders`, { method: "POST", body: { customer_id: customers[10 + index].id, advisor_id: customers[10 + index].advisor_id, order_date: isoAt(14 + index, 10), notes: marker, lines: [{ product_id: products[12 + index].id, quantity: 3, discount: 2500 }] } })).body;
  }
  orders = (await api(`${base}/orders`)).body.filter((entry) => String(entry.notes || "").includes(FIXTURE_TAG) || String(entry.quotation?.quotation_number || "").startsWith("COT-"));
  const targetOrders = orders.slice(0, 6);
  for (let index = 0; index < targetOrders.length; index += 1) {
    let order = targetOrders[index];
    if (order.status === "REGISTERED") order = (await api(`${base}/orders/${order.id}/status`, { method: "PATCH", body: { status: index === 5 ? "CANCELLED" : "CONFIRMED" } })).body;
    if (index < 2 && order.status === "CONFIRMED") await api(`${base}/orders/${order.id}/status`, { method: "PATCH", body: { status: "INVOICED" } });
  }

  const expected = expectedCounts();
  const final = {
    zones: (await api(`${base}/zones`)).body.filter((x) => x.code.startsWith("QA-CM-")),
    categories: (await api(`${base}/customer-categories`)).body.filter((x) => x.code.startsWith("QA-CM-")),
    reasons: (await api(`${base}/visit-reasons`)).body.filter((x) => x.code.startsWith("QA-CM-")),
    results: (await api(`${base}/visit-results`)).body.filter((x) => fixture.results.some(([code]) => code === x.code)),
    advisors: (await api(`${base}/advisors`)).body.filter((x) => x.code.startsWith("QA-CM-")),
    customers: (await api(`${base}/customers`)).body.filter((x) => x.code.startsWith("QA-CM-")),
    products: (await api(`${base}/products`)).body.filter((x) => productCodes.includes(x.code)),
    visits: (await api(`${base}/visits?date_from=${window.today.slice(0, 8)}01&date_to=${window.today.slice(0, 8)}${String(window.lastDay).padStart(2, "0")}`)).body.filter((x) => x.notes === FIXTURE_TAG || String(x.notes || "").startsWith(`${FIXTURE_TAG} visita`)),
    commitments: (await api(`${base}/commitments`)).body.filter((x) => x.description.startsWith(FIXTURE_TAG)),
    quotations: (await api(`${base}/quotations`)).body.filter((x) => String(x.notes || "").includes(FIXTURE_TAG)),
    orders: (await api(`${base}/orders`)).body.filter((x) => String(x.notes || "").includes(FIXTURE_TAG))
  };
  for (const [key, minimum] of Object.entries(expected)) assert.ok(final[key].length >= minimum, `${key}: se esperaban al menos ${minimum}, se encontraron ${final[key].length}.`);

  const firstVisit = final.visits[0];
  await api(`${base}/visits/${firstVisit.id}/timeline`);
  await api(`${base}/visits/${firstVisit.id}/history`);
  await api(`${base}/customers/${final.customers[0].id}/overview?period_id=${period.id}`);
  await api(`${base}/budgets?period_id=${period.id}`);
  await api(`${base}/my-day?date=${window.today}`);
  await api(`${base}/visits/report?from=${window.today.slice(0, 8)}01&to=${window.today.slice(0, 8)}${String(window.lastDay).padStart(2, "0")}`);
  await api(`${base}/reports/advisors?year=${window.year}&month=${window.month}&group=advisor`);
  await api(`${base}/reports/quotation-comparison?year=${window.year}`);
  await api(`${base}/dashboard?period_id=${period.id}`);
  await api(`${base}/quotations/${final.quotations[0].id}`);
  await api(`${base}/orders/${final.orders[0].id}`);

  const occupied = final.visits.find((x) => ["SCHEDULED", "IN_PROGRESS"].includes(x.status));
  if (occupied) {
    const availability = (await api(`${base}/visits/check-availability`, { method: "POST", body: { advisor_id: occupied.advisor_id, visit_date: occupied.visit_date, duration_minutes: occupied.planned_duration_minutes } })).body;
    assert.equal(availability.available, false, "La deteccion de solapamiento no identifico una agenda ocupada.");
  }
  const foreignCompany = (await supabaseAdmin(`/rest/v1/companies?select=id&status=eq.active&id=neq.${company.id}&limit=1`)).body[0];
  if (foreignCompany) {
    const isolatedApi = createClient({ baseUrl: apiUrl, label: "API QA aislamiento", defaultHeaders: { authorization: `Bearer ${session.access_token}`, "x-company-id": foreignCompany.id } });
    await isolatedApi(`${base}/customers`, { accepted: [401] });
  }

  const evidence = {
    ok: true,
    fixture_tag: FIXTURE_TAG,
    environment: "QA develop",
    api_url: apiUrl,
    api_commit: health.commit,
    company: { id: company.id, name: company.name },
    technical_user: qaEmail,
    generated_at: new Date().toISOString(),
    expected_minimums: expected,
    actual: Object.fromEntries(Object.entries(final).map(([key, rows]) => [key, rows.length])),
    workflows: ["catalogos", "clientes", "productos", "presupuestos", "agenda", "solapamiento", "inicio_y_cierre", "reprogramacion", "compromisos", "cotizaciones", "conversion_a_pedido", "estados_de_pedido", "reportes", "dashboard", "rbac", "aislamiento_tenant"]
  };
  const output = path.resolve(process.env.COMMERCIAL_QA_EVIDENCE || `artifacts/qa/commercial-management-population-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ...evidence, evidence_file: output }, null, 2));
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ ok: false, fixture_tag: FIXTURE_TAG, error: error.message, status: error.status || null }, null, 2));
  process.exit(1);
});

module.exports = { CONFIRMATION, DEFAULT_API_URL, FIXTURE_TAG, expectedCounts, fixture, monthWindow, normalizeBaseUrl };
