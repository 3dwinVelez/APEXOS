require("./load-env")();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PRODUCTS = [
  ["HEART-A01", "Portátil Ejecutivo", "Tecnología", 2800000, 4100000, 18],
  ["HEART-A02", "Monitor Profesional", "Tecnología", 720000, 1190000, 30],
  ["HEART-B01", "Silla Ergonómica", "Muebles", 480000, 790000, 42],
  ["HEART-B02", "Escritorio Modular", "Muebles", 680000, 1050000, 24],
  ["HEART-C01", "Audífonos Empresariales", "Accesorios", 95000, 169000, 80],
  ["HEART-C02", "Base para Portátil", "Accesorios", 55000, 99000, 110]
];

async function main() {
  const user = await prisma.user.findFirst({ where: { email: "demo@apex.local" } });
  if (!user) throw new Error("Ejecuta primero npm run seed:demo para crear la empresa demostrativa.");
  const tenantId = user.tenant_id;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const modules = Array.from(new Set([...(Array.isArray(tenant.active_modules) ? tenant.active_modules : []), "M-28", "apex_heart", "reportes"]));
  await prisma.tenant.update({ where: { id: tenantId }, data: { active_modules: modules } });

  const customer = await prisma.party.findFirst({ where: { tenant_id: tenantId, tax_id: "900HEART001", type: "customer" } }) || await prisma.party.create({ data: { tenant_id: tenantId, type: "customer", name: "Cliente Apex Heart", legal_name: "Cliente Apex Heart SAS", tax_id: "900HEART001", credit_days: 30, credit_limit: 80000000, active: true } });
  const supplier = await prisma.party.findFirst({ where: { tenant_id: tenantId, tax_id: "900HEART002", type: "supplier" } }) || await prisma.party.create({ data: { tenant_id: tenantId, type: "supplier", name: "Proveedor Apex Heart", legal_name: "Proveedor Apex Heart SAS", tax_id: "900HEART002", credit_days: 45, active: true } });
  const arAccount = await prisma.account.upsert({ where: { tenant_id_code: { tenant_id: tenantId, code: "130505HEART" } }, update: {}, create: { tenant_id: tenantId, code: "130505HEART", name: "Clientes Apex Heart", type: "asset" } });
  const apAccount = await prisma.account.upsert({ where: { tenant_id_code: { tenant_id: tenantId, code: "220505HEART" } }, update: {}, create: { tenant_id: tenantId, code: "220505HEART", name: "Proveedores Apex Heart", type: "liability" } });

  const categories = new Map();
  for (const name of [...new Set(PRODUCTS.map((row) => row[2]))]) categories.set(name, await prisma.category.upsert({ where: { tenant_id_name_type: { tenant_id: tenantId, name, type: "item" } }, update: {}, create: { tenant_id: tenantId, name, type: "item" } }));
  const items = [];
  for (const [code, name, category, unitCost, unitPrice, stock] of PRODUCTS) items.push(await prisma.item.upsert({ where: { tenant_id_code: { tenant_id: tenantId, code } }, update: { unit_cost: unitCost, unit_price: unitPrice, stock_current: stock, category_id: categories.get(category).id, active: true }, create: { tenant_id: tenantId, code, name, type: "product", unit_cost: unitCost, unit_price: unitPrice, stock_current: stock, stock_min: 8, category_id: categories.get(category).id, active: true, metadata: { brand: "APEX DEMO", line: category } } }));

  const now = new Date();
  for (let monthOffset = 11; monthOffset >= 0; monthOffset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 12, 12);
    const number = `HEART-FV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
    const existing = await prisma.salesInvoice.findFirst({ where: { tenant_id: tenantId, number } });
    if (!existing) {
      const selected = items.map((item, index) => { const qty = 2 + ((11 - monthOffset + index * 2) % 9); const subtotal = qty * item.unit_price; return { item, qty, subtotal, cost: qty * item.unit_cost }; });
      const subtotal = selected.reduce((sum, row) => sum + row.subtotal, 0); const tax = subtotal * .19; const total = subtotal + tax; const due = new Date(date); due.setDate(due.getDate() + 30);
      const invoice = await prisma.salesInvoice.create({ data: { tenant_id: tenantId, number, customer_id: customer.id, date, due_date: due, due_term: "AP30", subtotal, tax_total: tax, total, balance: monthOffset < 3 ? total * .55 : 0, status: "posted", document_kind: "invoice", society_code: "DEMO", branch_code: "MAIN", cost_center_code: "GERENCIA", posted_by: user.id, posted_at: date, created_by: user.id, lines: { create: selected.map((row, index) => ({ tenant_id: tenantId, line_no: index + 1, item_id: row.item.id, description: row.item.name, qty: row.qty, unit: "UND", unit_price: row.item.unit_price, subtotal: row.subtotal, tax_rate: 19, tax_amount: row.subtotal * .19, total: row.subtotal * 1.19, cost_value: row.cost })) } } });
      if (monthOffset < 3) await prisma.cxcCabdoc.create({ data: { tenant_id: tenantId, document_kind: "invoice", document_class: "FV", number: `HEART-CXC-${invoice.number}`, posting_date: date, due_term: "AP30", due_date: monthOffset === 2 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : due, header_text: "Cartera demostrativa Apex Heart", customer_id: customer.id, customer_tax_id: customer.tax_id, society_code: "DEMO", associated_account_id: arAccount.id, associated_account_code: arAccount.code, sales_invoice_id: invoice.id, subtotal, tax_total: tax, total, balance: total * .55, status: "open", created_by: user.id } });
    }
    const purchaseNumber = `HEART-CXP-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!await prisma.cxpCabdoc.findFirst({ where: { tenant_id: tenantId, number: purchaseNumber } })) {
      const purchaseTotal = 9000000 + (11 - monthOffset) * 430000; const due = new Date(date); due.setDate(due.getDate() + 45);
      await prisma.cxpCabdoc.create({ data: { tenant_id: tenantId, document_kind: "invoice", document_class: "FC", number: purchaseNumber, supplier_reference: purchaseNumber, posting_date: date, due_term: "AP45", due_date: due, header_text: "Compra demostrativa Apex Heart", supplier_id: supplier.id, supplier_tax_id: supplier.tax_id, society_code: "DEMO", associated_account_id: apAccount.id, associated_account_code: apAccount.code, subtotal: purchaseTotal / 1.19, tax_total: purchaseTotal - purchaseTotal / 1.19, gross_total: purchaseTotal, total: purchaseTotal, balance: monthOffset < 2 ? purchaseTotal * .4 : 0, status: "posted", created_by: user.id } });
    }
    for (const [index, item] of items.entries()) {
      const quantity = Math.max(1, item.stock_current + ((monthOffset + index) % 7) - 3);
      await prisma.apexHeartInventorySnapshot.upsert({ where: { tenant_id_snapshot_date_item_id: { tenant_id: tenantId, snapshot_date: date, item_id: item.id } }, update: { quantity, unit_cost: item.unit_cost, value: quantity * item.unit_cost }, create: { tenant_id: tenantId, snapshot_date: date, item_id: item.id, quantity, unit_cost: item.unit_cost, value: quantity * item.unit_cost, source: "demo" } });
    }
  }
  console.log(JSON.stringify({ tenant: tenant.name, module: "Apex Heart", products: items.length, months: 12, enabled: true }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
