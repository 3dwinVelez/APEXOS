require("./load-env")();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CATALOG = [
  ["Tecnología", ["Portátil Ejecutivo", "Monitor Profesional", "Mini PC Empresarial", "Tablet Comercial", "Estación de Trabajo", "Proyector Inteligente"], 760000],
  ["Muebles", ["Silla Ergonómica", "Escritorio Modular", "Archivador Metálico", "Mesa de Reunión", "Recepción Modular", "Biblioteca Ejecutiva"], 310000],
  ["Accesorios", ["Audífonos Empresariales", "Base para Portátil", "Teclado Inalámbrico", "Cámara Conferencia", "Hub Multipuerto", "Maletín Ejecutivo"], 52000],
  ["Redes", ["Router Empresarial", "Switch Administrable", "Punto de Acceso", "Firewall Compacto", "Rack de Comunicaciones", "Cableado Cat 6"], 135000],
  ["Impresión", ["Impresora Láser", "Multifuncional Color", "Escáner Documental", "Impresora Etiquetas", "Tóner Alto Rendimiento", "Kit de Mantenimiento"], 118000],
  ["Servicios", ["Instalación Técnica", "Soporte Premium", "Mantenimiento Preventivo", "Migración de Datos", "Capacitación Operativa", "Diagnóstico de Red"], 85000]
];
const PRODUCTS = CATALOG.flatMap(([category, names, base], categoryIndex) => names.map((name, index) => {
  const cost = Number(base) * (1 + index * .42); const margin = .18 + ((categoryIndex + index) % 5) * .07;
  return [`HEART-${String(categoryIndex + 1).padStart(2, "0")}${String(index + 1).padStart(2, "0")}`, name, category, Math.round(cost), Math.round(cost / (1 - margin)), 8 + ((categoryIndex * 19 + index * 13) % 115)];
}));

async function main() {
  const user = await prisma.user.findFirst({ where: { email: "demo@apex.local" } });
  if (!user) throw new Error("Ejecuta primero npm run seed:demo para crear la empresa demostrativa.");
  const tenantId = user.tenant_id;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const modules = Array.from(new Set([...(Array.isArray(tenant.active_modules) ? tenant.active_modules : []), "M-28", "apex_heart", "reportes"]));
  await prisma.tenant.update({ where: { id: tenantId }, data: { active_modules: modules } });

  const customers = [];
  for (let i = 1; i <= 10; i += 1) customers.push(await prisma.party.findFirst({ where: { tenant_id: tenantId, tax_id: `901HEART${String(i).padStart(3, "0")}`, type: "customer" } }) || await prisma.party.create({ data: { tenant_id: tenantId, type: "customer", name: `Cliente Gerencial ${i}`, legal_name: `Cliente Gerencial ${i} SAS`, tax_id: `901HEART${String(i).padStart(3, "0")}`, credit_days: 15 + (i % 4) * 15, credit_limit: 30000000 + i * 8000000, active: true } }));
  const suppliers = [];
  for (let i = 1; i <= 8; i += 1) suppliers.push(await prisma.party.findFirst({ where: { tenant_id: tenantId, tax_id: `902HEART${String(i).padStart(3, "0")}`, type: "supplier" } }) || await prisma.party.create({ data: { tenant_id: tenantId, type: "supplier", name: `Proveedor Estratégico ${i}`, legal_name: `Proveedor Estratégico ${i} SAS`, tax_id: `902HEART${String(i).padStart(3, "0")}`, credit_days: 30 + (i % 3) * 15, active: true } }));
  const arAccount = await prisma.account.upsert({ where: { tenant_id_code: { tenant_id: tenantId, code: "130505HEART" } }, update: {}, create: { tenant_id: tenantId, code: "130505HEART", name: "Clientes Apex Heart", type: "asset" } });
  const apAccount = await prisma.account.upsert({ where: { tenant_id_code: { tenant_id: tenantId, code: "220505HEART" } }, update: {}, create: { tenant_id: tenantId, code: "220505HEART", name: "Proveedores Apex Heart", type: "liability" } });

  const categories = new Map();
  for (const name of [...new Set(PRODUCTS.map((row) => row[2]))]) categories.set(name, await prisma.category.upsert({ where: { tenant_id_name_type: { tenant_id: tenantId, name, type: "item" } }, update: {}, create: { tenant_id: tenantId, name, type: "item" } }));
  const items = [];
  for (const [code, name, category, unitCost, unitPrice, stock] of PRODUCTS) items.push(await prisma.item.upsert({ where: { tenant_id_code: { tenant_id: tenantId, code } }, update: { unit_cost: unitCost, unit_price: unitPrice, stock_current: stock, category_id: categories.get(category).id, active: true }, create: { tenant_id: tenantId, code, name, type: "product", unit_cost: unitCost, unit_price: unitPrice, stock_current: stock, stock_min: 8, category_id: categories.get(category).id, active: true, metadata: { brand: "APEX DEMO", line: category } } }));

  const now = new Date();
  for (let monthOffset = 17; monthOffset >= 0; monthOffset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 12, 12);
    for (let batch = 1; batch <= 4; batch += 1) {
    const number = `HEART-FV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${batch}`;
    if (!await prisma.salesInvoice.findFirst({ where: { tenant_id: tenantId, number } })) {
      const customer = customers[(monthOffset + batch * 2) % customers.length];
      const selected = items.filter((_, index) => (index + batch + monthOffset) % 4 === 0 || index % 11 === batch).map((item, index) => { const season = 1 + Math.sin((17 - monthOffset) / 2) * .2; const qty = Math.max(1, Math.round((2 + ((17 - monthOffset + index * 3 + batch) % 12)) * season)); const subtotal = qty * item.unit_price; return { item, qty, subtotal, cost: qty * item.unit_cost }; });
      const subtotal = selected.reduce((sum, row) => sum + row.subtotal, 0); const tax = subtotal * .19; const total = subtotal + tax; const due = new Date(date); due.setDate(due.getDate() + 30);
      const invoice = await prisma.salesInvoice.create({ data: { tenant_id: tenantId, number, customer_id: customer.id, date, due_date: due, due_term: "AP30", subtotal, tax_total: tax, total, balance: monthOffset < 5 ? total * (.25 + batch * .1) : 0, status: "posted", document_kind: "invoice", society_code: "DEMO", branch_code: "MAIN", cost_center_code: "GERENCIA", posted_by: user.id, posted_at: date, created_by: user.id, lines: { create: selected.map((row, index) => ({ tenant_id: tenantId, line_no: index + 1, item_id: row.item.id, description: row.item.name, qty: row.qty, unit: "UND", unit_price: row.item.unit_price, subtotal: row.subtotal, tax_rate: 19, tax_amount: row.subtotal * .19, total: row.subtotal * 1.19, cost_value: row.cost })) } } });
      if (monthOffset < 5) { const agedDue = new Date(now); agedDue.setDate(agedDue.getDate() - [0, 12, 42, 75, 110][(monthOffset + batch) % 5]); await prisma.cxcCabdoc.create({ data: { tenant_id: tenantId, document_kind: "invoice", document_class: "FV", number: `HEART-CXC-${invoice.number}`, posting_date: date, due_term: "AP30", due_date: agedDue, header_text: "Cartera demostrativa Apex Heart", customer_id: customer.id, customer_tax_id: customer.tax_id, society_code: "DEMO", associated_account_id: arAccount.id, associated_account_code: arAccount.code, sales_invoice_id: invoice.id, subtotal, tax_total: tax, total, balance: invoice.balance, status: "open", created_by: user.id } }); }
    }
    }
    const supplier = suppliers[monthOffset % suppliers.length];
    const purchaseNumber = `HEART-CXP-RICH-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!await prisma.cxpCabdoc.findFirst({ where: { tenant_id: tenantId, number: purchaseNumber } })) {
      const purchaseTotal = 24000000 + (17 - monthOffset) * 1200000 + Math.round(Math.cos(monthOffset) * 6000000); const due = new Date(now); due.setDate(due.getDate() - [0, 20, 50, 85, 125][monthOffset % 5]);
      await prisma.cxpCabdoc.create({ data: { tenant_id: tenantId, document_kind: "invoice", document_class: "FC", number: purchaseNumber, supplier_reference: purchaseNumber, posting_date: date, due_term: "AP45", due_date: due, header_text: "Compra demostrativa Apex Heart", supplier_id: supplier.id, supplier_tax_id: supplier.tax_id, society_code: "DEMO", associated_account_id: apAccount.id, associated_account_code: apAccount.code, subtotal: purchaseTotal / 1.19, tax_total: purchaseTotal - purchaseTotal / 1.19, gross_total: purchaseTotal, total: purchaseTotal, balance: monthOffset < 2 ? purchaseTotal * .4 : 0, status: "posted", created_by: user.id } });
    }
    for (const [index, item] of items.entries()) {
      const quantity = Math.max(1, item.stock_current + ((monthOffset + index * 2) % 15) - 7);
      await prisma.apexHeartInventorySnapshot.upsert({ where: { tenant_id_snapshot_date_item_id: { tenant_id: tenantId, snapshot_date: date, item_id: item.id } }, update: { quantity, unit_cost: item.unit_cost, value: quantity * item.unit_cost }, create: { tenant_id: tenantId, snapshot_date: date, item_id: item.id, quantity, unit_cost: item.unit_cost, value: quantity * item.unit_cost, source: "demo" } });
    }
  }
  console.log(JSON.stringify({ tenant: tenant.name, module: "Apex Heart", products: items.length, months: 18, invoices: 72, customers: customers.length, suppliers: suppliers.length, enabled: true }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
