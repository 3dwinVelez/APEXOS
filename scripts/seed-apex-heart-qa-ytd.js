require("./load-env")();

const PROJECT_REF = "jbirkghkekuifgfsgquq";
const TENANT_DOMAIN = "cliente.piloto.qa.prod";
const CONFIRMATION = "CLIENTE_PILOTO_QA_2026";
const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

if (!url.includes(PROJECT_REF) || !key) throw new Error("La conexión Supabase QA esperada no está configurada.");
if (process.env.APEX_HEART_QA_SEED_CONFIRM !== CONFIRMATION) throw new Error(`Define APEX_HEART_QA_SEED_CONFIRM=${CONFIRMATION} para autorizar únicamente el tenant QA.`);

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const catalog = [
  ["Tecnología", ["Portátil Ejecutivo", "Monitor Profesional", "Mini PC Empresarial", "Tablet Comercial", "Estación de Trabajo", "Proyector Inteligente"], 760000],
  ["Muebles", ["Silla Ergonómica", "Escritorio Modular", "Archivador Metálico", "Mesa de Reunión", "Recepción Modular", "Biblioteca Ejecutiva"], 310000],
  ["Accesorios", ["Audífonos Empresariales", "Base para Portátil", "Teclado Inalámbrico", "Cámara Conferencia", "Hub Multipuerto", "Maletín Ejecutivo"], 52000],
  ["Redes", ["Router Empresarial", "Switch Administrable", "Punto de Acceso", "Firewall Compacto", "Rack de Comunicaciones", "Cableado Cat 6"], 135000],
  ["Impresión", ["Impresora Láser", "Multifuncional Color", "Escáner Documental", "Impresora Etiquetas", "Tóner Alto Rendimiento", "Kit de Mantenimiento"], 118000],
  ["Servicios", ["Instalación Técnica", "Soporte Premium", "Mantenimiento Preventivo", "Migración de Datos", "Capacitación Operativa", "Diagnóstico de Red"], 85000]
];
const products = catalog.flatMap(([category, names, base], categoryIndex) => names.map((name, index) => {
  const cost = Number(base) * (1 + index * .42), margin = .18 + ((categoryIndex + index) % 5) * .07;
  return { code: `HEART-YTD-${categoryIndex + 1}${String(index + 1).padStart(2, "0")}`, name, category, cost: Math.round(cost), price: Math.round(cost / (1 - margin)), stock: 8 + ((categoryIndex * 19 + index * 13) % 115), brand: ["Apex Pro", "Nova", "Vertex"][index % 3] };
}));

async function request(table, { method = "GET", query = "", body, prefer = "return=representation" } = {}) {
  const response = await fetch(`${url}/rest/v1/${table}${query ? `?${query}` : ""}`, { method, headers: { ...headers, Prefer: prefer }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${table} HTTP ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}
async function findOne(table, query) { return (await request(table, { query: `${query}&limit=1` }))[0] || null; }
async function findOrCreate(table, query, data) { return await findOne(table, query) || (await request(table, { method: "POST", body: data }))[0]; }
const iso = (date) => date.toISOString();

async function main() {
  const updatedAt = new Date().toISOString();
  const tenant = await findOne("Tenant", `select=id,name,active_modules&domain=eq.${TENANT_DOMAIN}`);
  if (!tenant || tenant.name !== "Cliente Piloto QA") throw new Error("El tenant QA esperado no existe o no coincide.");
  const tenantId = tenant.id;
  const modules = [...new Set([...(Array.isArray(tenant.active_modules) ? tenant.active_modules : []), "M-28", "apex_heart", "reportes"] )];
  await request("Tenant", { method: "PATCH", query: `id=eq.${tenantId}`, body: { active_modules: modules }, prefer: "return=minimal" });

  const ar = await findOrCreate("Account", `select=*&tenant_id=eq.${tenantId}&code=eq.130505HEART`, { tenant_id: tenantId, code: "130505HEART", name: "Clientes Apex Heart QA", type: "asset" });
  const ap = await findOrCreate("Account", `select=*&tenant_id=eq.${tenantId}&code=eq.220505HEART`, { tenant_id: tenantId, code: "220505HEART", name: "Proveedores Apex Heart QA", type: "liability" });
  const customers = [], suppliers = [];
  for (let i = 1; i <= 10; i += 1) customers.push(await findOrCreate("Party", `select=*&tenant_id=eq.${tenantId}&tax_id=eq.901YTD${String(i).padStart(3, "0")}&type=eq.customer`, { tenant_id: tenantId, type: "customer", name: `Cliente Gerencial YTD ${i}`, legal_name: `Cliente Gerencial YTD ${i} SAS`, tax_id: `901YTD${String(i).padStart(3, "0")}`, credit_days: 15 + (i % 4) * 15, credit_limit: 30000000 + i * 8000000, active: true, segment: ["Corporativo", "Pyme", "Distribuidor"][i % 3], updated_at: updatedAt }));
  for (let i = 1; i <= 8; i += 1) suppliers.push(await findOrCreate("Party", `select=*&tenant_id=eq.${tenantId}&tax_id=eq.902YTD${String(i).padStart(3, "0")}&type=eq.supplier`, { tenant_id: tenantId, type: "supplier", name: `Proveedor Estratégico YTD ${i}`, legal_name: `Proveedor Estratégico YTD ${i} SAS`, tax_id: `902YTD${String(i).padStart(3, "0")}`, credit_days: 30 + (i % 3) * 15, active: true, updated_at: updatedAt }));

  const categories = new Map(), items = [];
  for (const name of [...new Set(products.map((product) => product.category))]) categories.set(name, await findOrCreate("Category", `select=*&tenant_id=eq.${tenantId}&name=eq.${encodeURIComponent(name)}&type=eq.item`, { tenant_id: tenantId, name, type: "item" }));
  for (const product of products) {
    const existing = await findOne("Item", `select=*&tenant_id=eq.${tenantId}&code=eq.${product.code}`);
    const data = { tenant_id: tenantId, code: product.code, name: product.name, type: "product", unit_cost: product.cost, unit_price: product.price, stock_current: product.stock, stock_min: 8, stock_max: 140, category_id: categories.get(product.category).id, active: true, tax_rate: 19, metadata: { brand: product.brand, line: product.category, source: "apex-heart-ytd-2026" }, updated_at: updatedAt };
    if (existing) { await request("Item", { method: "PATCH", query: `id=eq.${existing.id}`, body: data, prefer: "return=minimal" }); items.push({ ...existing, ...data }); }
    else items.push((await request("Item", { method: "POST", body: data }))[0]);
  }

  const current = new Date(), lastMonth = current.getFullYear() === 2026 ? current.getMonth() : 11;
  for (let month = 0; month <= lastMonth; month += 1) {
    const monthDate = new Date(Date.UTC(2026, month, 12, 17));
    for (let batch = 1; batch <= 5; batch += 1) {
      const invoiceNumber = `HEART-YTD-FV-2026${String(month + 1).padStart(2, "0")}-${batch}`;
      if (await findOne("sales_invoices", `select=id&tenant_id=eq.${tenantId}&number=eq.${invoiceNumber}`)) continue;
      const customer = customers[(month + batch * 2) % customers.length];
      const selected = items.filter((_, index) => (index + batch + month) % 4 === 0 || index % 13 === batch).map((item, index) => { const season = 1 + Math.sin((month + 1) / 2) * .2, qty = Math.max(1, Math.round((2 + ((month + index * 3 + batch) % 12)) * season)), subtotal = qty * item.unit_price; return { item, qty, subtotal, cost: qty * item.unit_cost }; });
      const subtotal = selected.reduce((sum, row) => sum + row.subtotal, 0), tax = subtotal * .19, total = subtotal + tax, due = new Date(monthDate); due.setUTCDate(due.getUTCDate() + 30);
      const balance = month >= Math.max(0, lastMonth - 4) ? total * (.25 + batch * .08) : 0;
      const invoice = (await request("sales_invoices", { method: "POST", body: { tenant_id: tenantId, number: invoiceNumber, customer_id: customer.id, date: iso(monthDate), due_date: iso(due), due_term: "AP30", subtotal, tax_total: tax, total, balance, status: "posted", document_kind: "invoice", document_class: "FV", society_code: "QA", branch_code: "MAIN", cost_center_code: "GERENCIA", posted_at: iso(monthDate), header_text: "Apex Heart YTD 2026", updated_at: updatedAt } }))[0];
      await request("sales_invoice_lines", { method: "POST", body: selected.map((row, index) => ({ tenant_id: tenantId, invoice_id: invoice.id, line_no: index + 1, item_id: row.item.id, description: row.item.name, qty: row.qty, unit: "UND", unit_price: row.item.unit_price, subtotal: row.subtotal, tax_rate: 19, tax_amount: row.subtotal * .19, total: row.subtotal * 1.19, cost_value: row.cost })) });
      if (balance > 0) { const agedDue = new Date(current); agedDue.setUTCDate(agedDue.getUTCDate() - [0, 12, 42, 75, 110][(month + batch) % 5]); await request("cxc_cabdoc", { method: "POST", body: { tenant_id: tenantId, document_kind: "invoice", document_class: "FV", number: `HEART-YTD-CXC-${invoiceNumber}`, posting_date: iso(monthDate), due_term: "AP30", due_date: iso(agedDue), header_text: "Cartera Apex Heart YTD", customer_id: customer.id, customer_tax_id: customer.tax_id, society_code: "QA", associated_account_id: ar.id, associated_account_code: ar.code, sales_invoice_id: invoice.id, subtotal, tax_total: tax, total, balance, status: "open", updated_at: updatedAt } }); }
    }
    const supplier = suppliers[month % suppliers.length], purchaseNumber = `HEART-YTD-CXP-2026${String(month + 1).padStart(2, "0")}`;
    if (!await findOne("cxp_cabdoc", `select=id&tenant_id=eq.${tenantId}&number=eq.${purchaseNumber}`)) { const total = 24000000 + month * 1400000 + Math.round(Math.cos(month) * 6000000), due = new Date(current); due.setUTCDate(due.getUTCDate() - [0, 20, 50, 85, 125][month % 5]); await request("cxp_cabdoc", { method: "POST", body: { tenant_id: tenantId, document_kind: "invoice", document_class: "FC", number: purchaseNumber, supplier_reference: purchaseNumber, posting_date: iso(monthDate), due_term: "AP45", due_date: iso(due), header_text: "Compra Apex Heart YTD", supplier_id: supplier.id, supplier_tax_id: supplier.tax_id, society_code: "QA", associated_account_id: ap.id, associated_account_code: ap.code, subtotal: total / 1.19, tax_total: total - total / 1.19, gross_total: total, total, balance: month >= Math.max(0, lastMonth - 4) ? total * .45 : 0, status: "posted", updated_at: updatedAt } }); }
    for (const [index, item] of items.entries()) { const quantity = Math.max(1, item.stock_current + ((month + index * 2) % 15) - 7); await request("apex_heart_inventory_snapshots", { method: "POST", query: "on_conflict=tenant_id,snapshot_date,item_id", body: { tenant_id: tenantId, snapshot_date: iso(monthDate), item_id: item.id, quantity, unit_cost: item.unit_cost, value: quantity * item.unit_cost, source: "qa-ytd-2026" }, prefer: "resolution=merge-duplicates,return=minimal" }); }
  }

  const count = async (table, extra = "") => (await request(table, { query: `select=id&tenant_id=eq.${tenantId}${extra}` })).length;
  const result = { environment: "QA", tenant: tenant.name, year: 2026, through_month: lastMonth + 1, products: await count("Item", "&code=like.HEART-YTD-*&limit=500"), invoices: await count("sales_invoices", "&number=like.HEART-YTD-FV-*&limit=500"), invoice_lines: await count("sales_invoice_lines", "&limit=2000"), receivables: await count("cxc_cabdoc", "&number=like.HEART-YTD-CXC-*&limit=500"), payables: await count("cxp_cabdoc", "&number=like.HEART-YTD-CXP-*&limit=500"), snapshots: await count("apex_heart_inventory_snapshots", "&source=eq.qa-ytd-2026&limit=2000") };
  if (result.products < 36 || result.invoices < (lastMonth + 1) * 5 || result.snapshots < (lastMonth + 1) * 36) throw new Error(`Cobertura incompleta: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
