require("./load-env")();

let prisma;
let salesService;
let salesInvoiceService;
let inventoryService;
let accountingService;

const BATCH = "consignment_sales_reports_demo_v1";
const CUSTOMER_TAX_ID = "900999901-1";
const CUSTOMER_NAME = "Cliente Consignacion Demo";
const WAREHOUSE_CODE = "CONSIG-DEMO";

function argsFrom(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    args[key] = inline === undefined && argv[index + 1] && !argv[index + 1].startsWith("--")
      ? argv[++index]
      : inline ?? true;
  }
  return args;
}

function assertSafeTarget(args, environment = process.env) {
  const databaseUrl = String(environment.DATABASE_URL || "");
  if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria.");
  const target = `${environment.NODE_ENV || ""} ${environment.APP_ENV || ""} ${environment.TARGET_ENV || ""} ${databaseUrl}`.toLowerCase();
  if (/production|produccion|prod\b/.test(target)) {
    throw new Error("El script de demostracion no puede ejecutarse contra produccion.");
  }
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  const local = ["localhost", "127.0.0.1", "postgres", "host.docker.internal"].includes(hostname);
  if (!local && args["allow-shared-qa"] !== true) {
    throw new Error("Una base compartida de QA exige --allow-shared-qa y autorizacion humana explicita.");
  }
}

async function tenantContext(args) {
  const requested = String(args.tenant || "").trim();
  const tenants = await prisma.tenant.findMany({
    where: requested ? { OR: [{ id: requested }, { domain: requested }] } : { active: true },
    orderBy: { created_at: "asc" },
    take: requested ? 2 : 3
  });
  if (!tenants.length) throw new Error(`No se encontro el tenant ${requested || "activo"}.`);
  if (!requested && tenants.length !== 1) throw new Error("Indique --tenant <id-o-dominio> para evitar escribir en la empresa equivocada.");
  const tenant = tenants[0];
  const user = await prisma.user.findFirst({ where: { tenant_id: tenant.id, active: true }, orderBy: { id: "asc" } });
  if (!user) throw new Error("El tenant no tiene un usuario activo para la auditoria de los documentos.");
  return { tenant, user };
}

async function findSourceStock(tenantId, societyCode, vatRates, requiredLines) {
  return prisma.runWithTenant(tenantId, async () => {
    const warehouses = await prisma.place.findMany({
      where: { type: "warehouse", warehouse_type: "owned", society_code: societyCode, active: true },
      include: {
        locations: {
          where: { active: true },
          orderBy: { id: "asc" },
          include: {
            items: {
              where: { qty: { gte: 1 } },
              include: { item: { include: { family: { include: { accounting: true } } } } }
            }
          }
        }
      },
      orderBy: { id: "asc" }
    });
    for (const warehouse of warehouses) {
      const firstLocation = warehouse.locations[0];
      if (!firstLocation) continue;
      const seenItems = new Set();
      const candidates = firstLocation.items.filter((stock) => {
        if (stock.lot || seenItems.has(stock.item_id)) return false;
        seenItems.add(stock.item_id);
        return (
        stock.item.active &&
        ["product", "component", "raw_material"].includes(stock.item.type) &&
        Number(stock.item.unit_price || 0) > 0 &&
        vatRates.has(Number(stock.item.tax_rate || 0)) &&
        stock.item.family?.accounting?.active !== false &&
        stock.item.family?.accounting?.sales_revenue_account_code &&
        stock.item.family?.accounting?.sales_cost_account_code
        );
      });
      const available = candidates.reduce((sum, row) => sum + Math.floor(Number(row.qty || 0)), 0);
      if (available >= requiredLines) return { warehouse, candidates };
    }
    throw new Error(`No hay ${requiredLines} unidades vendibles en la primera ubicacion de una bodega propia de ${societyCode}.`);
  });
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  assertSafeTarget(args);
  prisma = require("../apps/api/src/core/prisma");
  salesService = require("../apps/api/src/modules/sales/service");
  salesInvoiceService = require("../apps/api/src/modules/sales-invoice/service");
  inventoryService = require("../apps/api/src/modules/inventory/service");
  accountingService = require("../apps/api/src/modules/accounting/service");
  const invoiceCount = Math.max(1, Math.min(20, Number(args.count || 4)));
  const { tenant, user } = await tenantContext(args);
  const tree = await accountingService.getOrganizationTree(tenant.id);
  const society = tree.societies.find((row) => row.active !== false);
  const branch = tree.branches.find((row) => row.active !== false && row.society_code === society?.code);
  const costCenter = tree.cost_centers.find((row) => row.active !== false && row.society_code === society?.code && row.branch_code === branch?.code);
  const accounts = await accountingService.listAccounts(tenant.id, { active: true, type: "asset", limit: 1000 });
  const receivableAccount = accounts.find((row) => row.allows_tx && ["1305", "1330"].some((prefix) => row.code.startsWith(prefix)));
  const vatMasters = await accountingService.getVatMasters(tenant.id, "sales");
  const vatRates = new Set(vatMasters.filter((row) => row.active !== false).map((row) => Number(row.percent)));
  if (!society || !branch || !costCenter || !receivableAccount || !vatRates.size) {
    throw new Error("Faltan sociedad, sucursal, centro de costo, cuenta CxC o IVA activo en los maestros contables.");
  }

  const existingInvoices = await prisma.runWithTenant(tenant.id, () => prisma.salesInvoice.findMany({
    where: { notes: { contains: `demo_batch=${BATCH}` }, is_cancelled: false },
    select: { id: true, number: true },
    orderBy: { id: "asc" }
  }));
  const missingInvoices = Math.max(0, invoiceCount - existingInvoices.length);
  const source = missingInvoices ? await findSourceStock(tenant.id, society.code, vatRates, missingInvoices) : null;

  const plan = {
    tenant: { id: tenant.id, name: tenant.name },
    batch: BATCH,
    customer: { tax_id: CUSTOMER_TAX_ID, name: CUSTOMER_NAME },
    consignment_warehouse: WAREHOUSE_CODE,
    source_warehouse: source?.warehouse.code || null,
    requested_invoices: invoiceCount,
    existing_invoices: existingInvoices.length,
    invoices_to_create: missingInvoices,
    mode: args.apply === true ? "apply" : "dry-run"
  };
  if (args.apply !== true) {
    console.log(JSON.stringify(plan, null, 2));
    console.log("Sin cambios. Use --apply para confirmar; en QA compartido agregue tambien --allow-shared-qa.");
    return;
  }
  if (!missingInvoices) {
    console.log(JSON.stringify({ ...plan, status: "already-complete", invoices: existingInvoices }, null, 2));
    return;
  }

  let customer = await prisma.runWithTenant(tenant.id, () => prisma.party.findFirst({ where: { tax_id: CUSTOMER_TAX_ID } }));
  if (!customer) {
    customer = await salesService.createCustomer(tenant.id, user.id, {
      name: CUSTOMER_NAME,
      tax_id: CUSTOMER_TAX_ID,
      tax_type: "company",
      city: "Medellin",
      country: "CO",
      credit_limit: 50_000_000,
      credit_days: 30,
      segment: "Consignacion",
      metadata: { is_demo: true, demo_batch: BATCH, receivable_account_code: receivableAccount.code }
    });
  } else {
    customer = await prisma.runWithTenant(tenant.id, () => prisma.party.update({
      where: { id: customer.id },
      data: { active: true, metadata: { ...(customer.metadata || {}), is_demo: true, demo_batch: BATCH, receivable_account_code: receivableAccount.code, party_roles: [...new Set([...(customer.metadata?.party_roles || []), "customer"])] } }
    }));
  }

  let warehouse = await prisma.runWithTenant(tenant.id, () => prisma.place.findFirst({ where: { code: WAREHOUSE_CODE, type: "warehouse", __includeInactive: true } }));
  const warehousePayload = {
    code: WAREHOUSE_CODE,
    name: `Consignacion - ${CUSTOMER_NAME}`,
    address: "Bodega demo del cliente",
    city: "Medellin",
    country: "CO",
    society_code: society.code,
    branch_code: branch.code,
    cost_center_code: costCenter.code,
    warehouse_type: "consignment",
    active: true,
    metadata: { ...(warehouse?.metadata || {}), is_demo: true, demo_batch: BATCH, consignment_customer_id: customer.id }
  };
  await inventoryService.saveWarehouse(tenant.id, warehousePayload, warehouse?.id || null);
  warehouse = await prisma.runWithTenant(tenant.id, () => prisma.place.findFirst({ where: { code: WAREHOUSE_CODE, type: "warehouse" } }));

  const transferLines = [];
  let remaining = missingInvoices;
  for (const stock of source.candidates) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, Math.floor(Number(stock.qty || 0)));
    if (qty > 0) transferLines.push({ item_id: stock.item_id, qty });
    remaining -= qty;
  }
  if (remaining > 0) throw new Error("El stock de origen cambio durante la preparacion; vuelva a ejecutar el script.");
  const transfer = await inventoryService.createWarehouseTransfer(tenant.id, user.id, {
    origin_place_id: source.warehouse.id,
    destination_place_id: warehouse.id,
    reason: `Datos demo para reportes de ventas en consignacion (${BATCH})`,
    idempotency_key: `${BATCH}:transfer:${existingInvoices.length}:${invoiceCount}`,
    lines: transferLines
  });
  await inventoryService.dispatchWarehouseTransfer(tenant.id, user.id, transfer.id);
  await inventoryService.receiveWarehouseTransfer(tenant.id, user.id, transfer.id);

  const invoiceItems = transferLines.flatMap((line) => Array.from({ length: line.qty }, () => source.candidates.find((stock) => stock.item_id === line.item_id).item));
  const created = [];
  for (let index = 0; index < missingInvoices; index += 1) {
    const item = invoiceItems[index];
    const sequence = existingInvoices.length + index + 1;
    const result = await salesInvoiceService.createSalesInvoice(tenant.id, user.id, {
      customer_id: customer.id,
      posting_date: new Date().toISOString().slice(0, 10),
      due_term: sequence % 2 === 0 ? "AP30" : "AP15",
      header_text: `Venta en consignacion demo ${sequence}`,
      society_code: society.code,
      branch_code: branch.code,
      cost_center_code: costCenter.code,
      associated_account_code: receivableAccount.code,
      notes: `demo_batch=${BATCH};scenario=consignment;sequence=${sequence}`,
      retention_codes: [],
      lines: [{
        item_id: item.id,
        qty: 1,
        unit_price: Number(item.unit_price),
        discount: sequence % 3 === 0 ? 5 : 0,
        tax_rate: Number(item.tax_rate || 0),
        place_id: warehouse.id,
        customer_invoice_number: `CLI-CONS-${String(sequence).padStart(4, "0")}`
      }]
    });
    created.push({ id: result.invoice.id, number: result.invoice.number });
  }

  console.log(JSON.stringify({ ...plan, status: "ok", customer_id: customer.id, warehouse_id: warehouse.id, transfer: transfer.number, invoices: created }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => prisma?.$disconnect());
}

module.exports = { argsFrom, assertSafeTarget };
