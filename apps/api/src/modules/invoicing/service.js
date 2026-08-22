const prisma = require("../../core/prisma");
const inventoryService = require("../inventory/service");
const accountingService = require("../accounting/service");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function invoiceSaleOrder(tenantId, userId, soId, data) {
  const { invoice_lines = null, location_id = null, due_date = null, notes = null } = data || {};
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const saleOrder = await tx.transaction.findFirst({
      where: { id: soId, type: "sale" },
      include: { lines: true, party: true }
    });
    if (!saleOrder) throw appError(404, "SO_NOT_FOUND", "Orden de venta no encontrada");
    if (!["draft", "confirmed"].includes(saleOrder.status)) {
      throw appError(422, "INVALID_STATUS", "La orden no puede ser facturada en su estado actual");
    }

    const selected = invoice_lines.length
      ? saleOrder.lines.filter((line) => invoice_lines.some((entry) => entry.line_id === line.id))
      : saleOrder.lines;
    if (!selected.length) throw appError(400, "NO_LINES", "No hay lineas para facturar");

    const invoiceLineData = [];
    const stockCostLines = [];
    for (const soLine of selected) {
      const requested = invoice_lines.find((entry) => entry.line_id === soLine.id)?.qty ?? soLine.qty;
      if (!requested || requested <= 0 || requested > soLine.qty) {
        throw appError(422, "INVALID_QTY", `Cantidad invalida para la linea ${soLine.id}`);
      }
      const item = soLine.item_id ? await tx.item.findFirst({ where: { id: soLine.item_id, active: true } }) : null;
      if (!item && soLine.item_id) throw appError(404, "ITEM_NOT_FOUND", `Item ${soLine.item_id} no encontrado`);

      const ratio = Number(requested) / Number(soLine.qty);
      const subtotal = Number(soLine.subtotal) * ratio;
      const taxAmount = Number(soLine.tax_amount) * ratio;
      const total = Number(soLine.total) * ratio;
      invoiceLineData.push({
        item_id: soLine.item_id,
        description: soLine.description,
        qty: Number(requested),
        unit: soLine.unit,
        unit_cost: soLine.unit_cost,
        unit_price: soLine.unit_price,
        discount: soLine.discount,
        tax_rate: soLine.tax_rate,
        tax_amount: taxAmount,
        subtotal,
        total,
        metadata: soLine.metadata
      });

      if (item && ["product", "component", "raw_material"].includes(item.type)) {
        if (!location_id) throw appError(400, "LOCATION_REQUIRED", "location_id es obligatorio para items fisicos");
        stockCostLines.push({ item, qty: Number(requested), unit_cost: Number(soLine.unit_cost) });
      }
    }

    const subtotal = invoiceLineData.reduce((sum, row) => sum + row.subtotal, 0);
    const taxTotal = invoiceLineData.reduce((sum, row) => sum + row.tax_amount, 0);
    const total = subtotal + taxTotal;
    const count = await tx.transaction.count({ where: { type: "invoice" } });
    const number = `FV-${String(count + 1).padStart(6, "0")}`;

    const invoice = await tx.transaction.create({
      data: {
        type: "invoice",
        number,
        party_id: saleOrder.party_id,
        status: "issued",
        date: new Date(),
        due_date: due_date ? new Date(due_date) : new Date(),
        subtotal,
        tax_total: taxTotal,
        total,
        paid: 0,
        balance: total,
        notes,
        created_by: userId,
        metadata: { source_sale_order: saleOrder.id },
        lines: { create: invoiceLineData }
      },
      include: { lines: true, party: true }
    });

    for (const stockLine of stockCostLines) {
      await inventoryService.stockMoveTx(tx, tenantId, userId, {
        item_id: stockLine.item.id,
        type: "out",
        qty: stockLine.qty,
        from_location_id: location_id,
        transaction_id: null,
        cost: stockLine.unit_cost,
        reason: `Factura ${invoice.number}`
      });
    }

    await tx.party.update({ where: { id: saleOrder.party_id }, data: { balance: { increment: total } } });

    await tx.transaction.update({ where: { id: saleOrder.id }, data: { status: "invoiced" } });

    await accountingService.journalEntryTx(tx, {
      description: `Factura ${invoice.number}`,
      transaction_id: invoice.id,
      entries: [
        { account: "1305", debit: total, credit: 0 },
        { account: "4135", debit: 0, credit: subtotal },
        { account: "2408", debit: 0, credit: taxTotal }
      ]
    });

    const cogsAmount = stockCostLines.reduce((sum, row) => sum + (row.qty * row.unit_cost), 0);
    if (cogsAmount > 0) {
      await accountingService.journalEntryTx(tx, {
        description: `Costo de venta ${invoice.number}`,
        transaction_id: invoice.id,
        entries: [
          { account: "5105", debit: cogsAmount, credit: 0 },
          { account: "1435", debit: 0, credit: cogsAmount }
        ]
      });
    }

    return invoice;
  }));
}

async function listInvoices(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, () => prisma.transaction.findMany({
    where: { type: "invoice" },
    orderBy: { created_at: "desc" },
    include: { party: true, lines: true },
    skip: Math.max(Number(query.offset || 0), 0),
    take: Math.min(Number(query.limit || 100), 200)
  }));
}

module.exports = { invoiceSaleOrder, listInvoices };
