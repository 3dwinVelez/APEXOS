const prisma = require("../../core/prisma");
const inventoryService = require("../inventory/service");
const accountingService = require("../accounting/service");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function getNextInvoiceNumber(tx, tenantId) {
  const count = await tx.salesInvoice.count({ where: { tenant_id: tenantId } });
  return `FV-${String(count + 1).padStart(6, "0")}`;
}

async function createSalesInvoice(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    // 1. Validar cliente activo
    const customer = await tx.party.findFirst({ where: { id: Number(data.customer_id), type: "customer", active: true } });
    if (!customer) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado o inactivo");

    // 2. Validar bodega default (opcional)
    let defaultPlace = null;
    if (data.place_id) {
      defaultPlace = await tx.place.findFirst({ where: { id: Number(data.place_id), type: "warehouse", active: true } });
      if (!defaultPlace) throw appError(404, "PLACE_NOT_FOUND", "Bodega no encontrada o inactiva");
    }

    // 3. Procesar líneas
    const invoiceLines = [];
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    let totalCostValue = 0;

    for (const [index, lineData] of data.lines.entries()) {
      const item = await tx.item.findFirst({ where: { id: Number(lineData.item_id), active: true } });
      if (!item) throw appError(404, "ITEM_NOT_FOUND", `Producto ID ${lineData.item_id} no encontrado`);

      // Validar familia contable con cuentas de ventas
      const familyAccounting = item.family_id ? await tx.inventoryFamilyAccounting.findFirst({ where: { family_id: item.family_id, active: true } }) : null;
      if (!familyAccounting || !familyAccounting.sales_revenue_account_code) {
        throw appError(422, "FAMILY_ACCOUNTING_REQUIRED", `El producto ${item.code} no tiene configuracion contable de ventas en su familia`);
      }

      // Validar bodega por línea (si no, usar la de cabecera)
      let linePlaceId = lineData.place_id || data.place_id || null;
      if (linePlaceId) {
        const linePlace = await tx.place.findFirst({ where: { id: Number(linePlaceId), type: "warehouse", active: true } });
        if (!linePlace) throw appError(404, "LINE_PLACE_NOT_FOUND", `Bodega ID ${linePlaceId} no encontrada para linea ${index + 1}`);
        linePlaceId = linePlace.id;
      }

      const qty = Number(lineData.qty) || 0;
      if (qty <= 0) throw appError(422, "INVALID_QTY", `Cantidad invalida para linea ${index + 1}`);
      const unitPrice = Number(lineData.unit_price) || 0;
      const discount = Number(lineData.discount) || 0;
      const taxRate = Number(lineData.tax_rate) >= 0 ? Number(lineData.tax_rate) : Number(item.tax_rate || 0);
      const lineSubtotal = round(qty * unitPrice);
      const lineDiscount = round(lineSubtotal * (discount / 100));
      const netAmount = round(lineSubtotal - lineDiscount);
      const lineTax = round(netAmount * (taxRate / 100));
      const lineTotal = round(netAmount + lineTax);

      // Cost value for inventory deduction
      const costValue = round(qty * Number(item.unit_cost || 0));

      subtotal = round(subtotal + netAmount);
      taxTotal = round(taxTotal + lineTax);
      discountTotal = round(discountTotal + lineDiscount);
      totalCostValue = round(totalCostValue + costValue);

      invoiceLines.push({
        line_no: index + 1,
        item_id: item.id,
        description: lineData.description || item.name || item.code,
        qty,
        unit: lineData.unit || item.unit || "UND",
        unit_price: unitPrice,
        discount,
        subtotal: netAmount,
        tax_rate: taxRate,
        tax_amount: lineTax,
        total: lineTotal,
        place_id: linePlaceId,
        customer_invoice_number: lineData.customer_invoice_number || null,
        cost_value: costValue
      });
    }

    // 4. Calcular retenciones
    let retentionTotal = 0;
    const retentionLines = [];
    const retentionCodes = data.retention_codes || [];

    // Obtener retenciones del cliente (desde metadata.withholding_rates)
    const customerRetentions = customer.metadata?.withholding_rates || [];
    const allRetentions = retentionCodes.length > 0 ? retentionCodes : customerRetentions;

    for (const ret of allRetentions) {
      const retMaster = await tx.retentionMaster.findFirst({
        where: { tenant_id: tenantId, code: ret.code || ret, active: true }
      });
      if (!retMaster) continue;
      const baseAmount = round(Number(ret.base_amount) || subtotal);
      const retAmount = round(baseAmount * (retMaster.percent / 100));
      retentionTotal = round(retentionTotal + retAmount);
      retentionLines.push({
        account_code: retMaster.account_code,
        account_name: retMaster.description,
        amount: retAmount,
        percent: retMaster.percent,
        code: retMaster.code,
        base_amount: baseAmount
      });
    }

    const total = round(subtotal + taxTotal);

    // 5. Generar número de factura
    const number = await getNextInvoiceNumber(tx, tenantId);

    // 6. Calcular fecha de vencimiento
    const postingDate = new Date(data.posting_date);
    if (Number.isNaN(postingDate.getTime())) throw appError(400, "INVALID_DATE", "Fecha de contabilizacion invalida");
    const dueTerm = String(data.due_term || "AP30").toUpperCase();
    const dueDays = parseInt(dueTerm.replace("AP", "")) || 30;
    const dueDate = data.due_date ? new Date(data.due_date) : new Date(postingDate.getTime() + dueDays * 86400000);

    // 7. Crear SalesInvoice
    const invoice = await tx.salesInvoice.create({
      data: {
        number,
        customer_id: customer.id,
        place_id: defaultPlace?.id || null,
        date: postingDate,
        due_date: dueDate,
        due_term: dueTerm,
        subtotal,
        tax_total: taxTotal,
        discount_total: discountTotal,
        retention_total: retentionTotal,
        total,
        balance: total,
        status: "issued",
        header_text: data.header_text,
        society_code: data.society_code,
        branch_code: data.branch_code,
        cost_center_code: data.cost_center_code,
        notes: data.notes || null,
        created_by: userId || null,
        lines: {
          create: invoiceLines.map((line) => ({
            tenant_id: tenantId,
            ...line
          }))
        }
      },
      include: { lines: { orderBy: { line_no: "asc" } } }
    });

    // 8. Descontar inventario (stockMoveTx) para ítems físicos
    for (const line of invoiceLines) {
      const item = await tx.item.findFirst({ where: { id: line.item_id, active: true } });
      if (item && ["product", "component", "raw_material"].includes(item.type)) {
        const fromLocation = line.place_id
          ? await tx.location.findFirst({ where: { place_id: line.place_id }, include: { place: true } })
          : null;
        if (!fromLocation && line.place_id) {
          throw appError(400, "LOCATION_NOT_FOUND", `No hay ubicaciones en la bodega ${line.place_id} para el producto ${item.code}`);
        }
        await inventoryService.stockMoveTx(tx, tenantId, userId, {
          item_id: item.id,
          type: "out",
          qty: line.qty,
          from_location_id: fromLocation?.id || null,
          transaction_id: null,
          cost: line.cost_value > 0 ? round(line.cost_value / line.qty) : Number(item.unit_cost || 0),
          reason: `Factura venta ${number}`
        });
      }
    }

    // 9. Construir líneas contables para createReceivableDocument
    const ledgerLines = [];

    // Líneas de ingreso: Crédito a sales_revenue_account_code por línea/familia
    const revenueByFamily = new Map();
    for (const line of invoiceLines) {
      const item = await tx.item.findFirst({ where: { id: line.item_id } });
      const fa = await tx.inventoryFamilyAccounting.findFirst({ where: { family_id: item.family_id, active: true } });
      const revAccountCode = fa.sales_revenue_account_code;
      const revAccount = await tx.account.findFirst({ where: { code: revAccountCode, active: true } });
      if (!revAccount) throw appError(404, "REVENUE_ACCOUNT_NOT_FOUND", `Cuenta de ingreso ${revAccountCode} no encontrada`);
      const key = revAccount.id;
      const current = revenueByFamily.get(key) || { account_id: revAccount.id, account_code: revAccountCode, account_name: revAccount.name, total: 0 };
      current.total = round(current.total + line.subtotal);
      revenueByFamily.set(key, current);
    }

    // Crédito a ingresos por familia
    for (const [, rev] of revenueByFamily) {
      ledgerLines.push({
        account_id: rev.account_id,
        account_code: rev.account_code,
        account_name: rev.account_name,
        debit: 0,
        credit: rev.total,
        description: `Ingreso ventas ${number}`
      });
    }

    // Crédito a IVA por pagar (2408)
    if (taxTotal > 0) {
      const taxAccount = await tx.account.findFirst({ where: { code: "2408", active: true } });
      if (taxAccount) {
        ledgerLines.push({
          account_id: taxAccount.id,
          account_code: taxAccount.code,
          account_name: taxAccount.name,
          debit: 0,
          credit: taxTotal,
          description: `IVA generado ${number}`
        });
      }
    }

    // Débito a retenciones
    for (const ret of retentionLines) {
      const retAccount = await tx.account.findFirst({ where: { code: ret.account_code, active: true } });
      if (retAccount) {
        ledgerLines.push({
          account_id: retAccount.id,
          account_code: retAccount.code,
          account_name: retAccount.account_name,
          debit: ret.amount,
          credit: 0,
          description: `Retencion ${ret.code} ${number}`,
          retention_code: ret.code,
          retention_percent: ret.percent,
          retention_amount: ret.amount
        });
      }
    }

    // Débito a costo de ventas (5105), Crédito a inventarios
    if (totalCostValue > 0) {
      const costByFamily = new Map();
      for (const line of invoiceLines) {
        const item = await tx.item.findFirst({ where: { id: line.item_id } });
        const fa = await tx.inventoryFamilyAccounting.findFirst({ where: { family_id: item.family_id, active: true } });
        const costAccountCode = fa.sales_cost_account_code;
        const costAccount = await tx.account.findFirst({ where: { code: costAccountCode, active: true } });
        if (!costAccount) throw appError(404, "COST_ACCOUNT_NOT_FOUND", `Cuenta de costo ${costAccountCode} no encontrada`);
        const invAccountCode = fa.goods_receipt_account_code || "1435";
        const invAccount = await tx.account.findFirst({ where: { code: invAccountCode, active: true } });
        if (!invAccount) throw appError(404, "INVENTORY_ACCOUNT_NOT_FOUND", `Cuenta de inventario ${invAccountCode} no encontrada`);

        const familyKey = `${costAccount.id}_${invAccount.id}`;
        const current = costByFamily.get(familyKey) || {
          cost_account_id: costAccount.id, cost_account_code: costAccountCode, cost_account_name: costAccount.name,
          inv_account_id: invAccount.id, inv_account_code: invAccountCode, inv_account_name: invAccount.name,
          cost_total: 0, inv_total: 0
        };
        current.cost_total = round(current.cost_total + line.cost_value);
        current.inv_total = round(current.inv_total + line.cost_value);
        costByFamily.set(familyKey, current);
      }

      for (const [, cf] of costByFamily) {
        ledgerLines.push({
          account_id: cf.cost_account_id,
          account_code: cf.cost_account_code,
          account_name: cf.cost_account_name,
          debit: cf.cost_total,
          credit: 0,
          description: `Costo ventas ${number}`
        });
        ledgerLines.push({
          account_id: cf.inv_account_id,
          account_code: cf.inv_account_code,
          account_name: cf.inv_account_name,
          debit: 0,
          credit: cf.inv_total,
          description: `Salida inventario ${number}`
        });
      }
    }

    // Total a cargar a la cuenta de deudor
    const invoiceTotal = total;
    const effectiveTotal = round(invoiceTotal - retentionTotal);

    // 10. Crear documento CxC vía accountingService.createReceivableDocument
    const cxcData = {
      document_kind: "invoice",
      customer_id: customer.id,
      customer_reference: number,
      posting_date: postingDate.toISOString().split("T")[0],
      due_term: dueTerm,
      due_date: dueDate.toISOString().split("T")[0],
      header_text: data.header_text,
      society_code: data.society_code,
      associated_account_code: data.associated_account_code || "1305",
      subtotal,
      tax_total,
      retention_total,
      total: effectiveTotal,
      // Nota: no pasamos customer_id como número, el service lo toma de data.customer_id
      ...data,
      ledger_lines: ledgerLines,
      total: effectiveTotal,
      sales_invoice_id: invoice.id
    };

    const cxc = await accountingService.createReceivableDocument(tenantId, userId, cxcData);

    // 11. Actualizar factura con referencia al CxC
    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { balance: effectiveTotal }
    });

    return {
      invoice: await tx.salesInvoice.findFirst({
        where: { id: invoice.id },
        include: { lines: { orderBy: { line_no: "asc" } }, cxc: { include: { lines: { orderBy: { line_no: "asc" } } } } }
      })
    };
  }));
}

async function simulateSalesInvoice(tenantId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const customer = await prisma.party.findFirst({ where: { id: Number(data.customer_id), type: "customer", active: true } });
    if (!customer) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado");

    // Simulate line calculations
    let subtotal = 0;
    let taxTotal = 0;
    const simulatedLines = [];

    for (const [index, lineData] of data.lines.entries()) {
      const item = await prisma.item.findFirst({ where: { id: Number(lineData.item_id), active: true } });
      if (!item) throw appError(404, "ITEM_NOT_FOUND", `Producto ID ${lineData.item_id} no encontrado`);
      const qty = Number(lineData.qty) || 0;
      const unitPrice = Number(lineData.unit_price) || 0;
      const discount = Number(lineData.discount) || 0;
      const taxRate = Number(lineData.tax_rate) >= 0 ? Number(lineData.tax_rate) : Number(item.tax_rate || 0);
      const lineSubtotal = round(qty * unitPrice);
      const lineDiscount = round(lineSubtotal * (discount / 100));
      const netAmount = round(lineSubtotal - lineDiscount);
      const lineTax = round(netAmount * (taxRate / 100));
      const lineTotal = round(netAmount + lineTax);
      subtotal = round(subtotal + netAmount);
      taxTotal = round(taxTotal + lineTax);

      const fa = item.family_id ? await prisma.inventoryFamilyAccounting.findFirst({ where: { family_id: item.family_id, active: true } }) : null;
      simulatedLines.push({
        line_no: index + 1,
        item_code: item.code,
        item_name: item.name,
        qty,
        unit_price: unitPrice,
        discount,
        net_amount: netAmount,
        tax_rate: taxRate,
        tax_amount: lineTax,
        total: lineTotal,
        revenue_account: fa?.sales_revenue_account_code || null,
        cost_account: fa?.sales_cost_account_code || null
      });
    }

    const total = round(subtotal + taxTotal);
    const costValue = simulatedLines.reduce((s, l) => s + round(l.qty * 0), 0); // simplified

    // Get retention masters for simulation preview
    const customerRetentions = customer.metadata?.withholding_rates || [];
    const retCodes = data.retention_codes || customerRetentions;
    const retLines = [];
    let retTotal = 0;
    for (const ret of retCodes) {
      const master = await prisma.retentionMaster.findFirst({ where: { tenant_id: tenantId, code: ret.code || ret, active: true } });
      if (master) {
        const base = round(Number(ret.base_amount) || subtotal);
        const amt = round(base * (master.percent / 100));
        retTotal = round(retTotal + amt);
        retLines.push({ code: master.code, description: master.description, account_code: master.account_code, percent: master.percent, amount: amt });
      }
    }
    const effectiveTotal = round(total - retTotal);

    return {
      customer: { id: customer.id, name: customer.legal_name || customer.name, tax_id: customer.tax_id },
      date: data.posting_date,
      due_term: data.due_term || "AP30",
      society_code: data.society_code,
      associated_account_code: data.associated_account_code || "1305",
      lines: simulatedLines,
      subtotal,
      tax_total: taxTotal,
      retentions: retLines,
      retention_total: retTotal,
      total,
      effective_total: effectiveTotal,
      estimated_cost: costValue
    };
  });
}

async function listSalesInvoices(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = { tenant_id: tenantId };
    if (query.customer_id) where.customer_id = Number(query.customer_id);
    if (query.status) where.status = String(query.status);
    if (query.date_from || query.date_to) {
      where.date = {};
      if (query.date_from) where.date.gte = new Date(query.date_from);
      if (query.date_to) where.date.lte = new Date(query.date_to);
    }
    if (query.item_id) {
      where.lines = { some: { item_id: Number(query.item_id) } };
    }
    if (query.search) {
      const search = String(query.search).trim();
      where.OR = [
        { number: { contains: search, mode: "insensitive" } },
        { header_text: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } }
      ];
    }
    const includeObj = {
      customer: { select: { id: true, name: true, legal_name: true, tax_id: true } },
      lines: { orderBy: { line_no: "asc" } }
    };
    const rows = await prisma.salesInvoice.findMany({
      where,
      include: includeObj,
      orderBy: { created_at: "desc" },
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 100), 200)
    });
    const total = await prisma.salesInvoice.count({ where });
    return { data: rows, total, page: Number(query.page || 1), pages: Math.ceil(total / Math.min(Number(query.limit || 100), 200)) };
  });
}

async function getSalesInvoice(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: Number(id), tenant_id: tenantId },
      include: {
        customer: { select: { id: true, name: true, legal_name: true, tax_id: true, email: true, phone: true, balance: true, credit_limit: true, metadata: true } },
        lines: { orderBy: { line_no: "asc" }, include: { item: { select: { id: true, code: true, name: true, unit: true } }, place: { select: { id: true, code: true, name: true } } } },
        cxc: { include: { lines: { orderBy: { line_no: "asc" } } } }
      }
    });
    if (!invoice) throw appError(404, "INVOICE_NOT_FOUND", "Factura de venta no encontrada");
    return invoice;
  });
}

async function cancelSalesInvoice(tenantId, userId, id) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const invoice = await tx.salesInvoice.findFirst({
      where: { id: Number(id), tenant_id: tenantId },
      include: { lines: true, cxc: true }
    });
    if (!invoice) throw appError(404, "INVOICE_NOT_FOUND", "Factura no encontrada");
    if (invoice.status !== "issued") throw appError(422, "INVALID_STATUS", "Solo se pueden cancelar facturas emitidas");
    if (invoice.cxc && invoice.cxc.status === "cleared") {
      throw appError(422, "INVOICE_ALREADY_PAID", "No se puede cancelar una factura que ya ha sido pagada");
    }

    // Reverse inventory
    for (const line of invoice.lines) {
      const item = await tx.item.findFirst({ where: { id: line.item_id } });
      if (item && ["product", "component", "raw_material"].includes(item.type)) {
        const fromLocation = line.place_id
          ? await tx.location.findFirst({ where: { place_id: line.place_id } })
          : null;
        await inventoryService.stockMoveTx(tx, tenantId, userId, {
          item_id: item.id,
          type: "in",
          qty: line.qty,
          to_location_id: fromLocation?.id || null,
          transaction_id: null,
          cost: Number(item.unit_cost || 0),
          reason: `Cancelacion factura venta ${invoice.number}`
        });
      }
    }

    // Reverse CxC balance
    if (invoice.cxc) {
      await tx.cxcCabdoc.update({
        where: { id: invoice.cxc.id },
        data: {
          status: "cancelled",
          balance: 0,
          applied_total: 0
        }
      });
    }

    // Reverse customer balance
    const effectiveTotal = round(invoice.total - invoice.retention_total);
    await tx.party.update({
      where: { id: invoice.customer_id },
      data: { balance: { decrement: effectiveTotal } }
    });

    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { status: "cancelled", balance: 0 }
    });

    return { id: invoice.id, number: invoice.number, status: "cancelled" };
  }));
}

// ============================================================
// REPORTS
// ============================================================

async function getSalesByCustomer(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const dateFrom = query.date_from ? new Date(query.date_from) : new Date("2020-01-01");
    const dateTo = query.date_to ? new Date(query.date_to) : new Date();
    const rows = await prisma.salesInvoice.findMany({
      where: {
        tenant_id: tenantId,
        status: "issued",
        date: { gte: dateFrom, lte: dateTo },
        ...(query.customer_id ? { customer_id: Number(query.customer_id) } : {})
      },
      include: { customer: { select: { id: true, name: true, legal_name: true, tax_id: true } } },
      orderBy: { date: "asc" }
    });
    const byCustomer = new Map();
    for (const row of rows) {
      const key = row.customer_id;
      const c = byCustomer.get(key) || { customer: row.customer, invoices: 0, subtotal: 0, tax_total: 0, total: 0, count: 0 };
      c.subtotal = round(c.subtotal + row.subtotal);
      c.tax_total = round(c.tax_total + row.tax_total);
      c.total = round(c.total + row.total);
      c.count += 1;
      c.invoices += 1;
      byCustomer.set(key, c);
    }
    return {
      date_from: dateFrom,
      date_to: dateTo,
      rows: Array.from(byCustomer.values()),
      grand_total: round(Array.from(byCustomer.values()).reduce((s, r) => s + r.total, 0))
    };
  });
}

async function getSalesByItem(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const dateFrom = query.date_from ? new Date(query.date_from) : new Date("2020-01-01");
    const dateTo = query.date_to ? new Date(query.date_to) : new Date();
    const rows = await prisma.salesInvoiceLine.findMany({
      where: {
        tenant_id: tenantId,
        invoice: { status: "issued", date: { gte: dateFrom, lte: dateTo } }
      },
      include: { item: { select: { id: true, code: true, name: true, unit: true } }, invoice: { select: { number: true, date: true } } },
      orderBy: { created_at: "desc" }
    });
    const byItem = new Map();
    for (const row of rows) {
      const key = row.item_id || 0;
      const i = byItem.get(key) || {
        item: row.item ? { id: row.item.id, code: row.item.code, name: row.item.name, unit: row.item.unit } : { id: null, code: "N/A", name: row.description },
        qty: 0, subtotal: 0, total: 0, count: 0
      };
      i.qty = round(i.qty + row.qty);
      i.subtotal = round(i.subtotal + row.subtotal);
      i.total = round(i.total + row.total);
      i.count += 1;
      byItem.set(key, i);
    }
    return {
      date_from: dateFrom,
      date_to: dateTo,
      rows: Array.from(byItem.values()).sort((a, b) => b.total - a.total),
      grand_total: round(Array.from(byItem.values()).reduce((s, r) => s + r.total, 0))
    };
  });
}

async function getSalesByDate(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const dateFrom = query.date_from ? new Date(query.date_from) : new Date("2020-01-01");
    const dateTo = query.date_to ? new Date(query.date_to) : new Date();
    const groupBy = query.group_by || "day";
    const rows = await prisma.salesInvoice.findMany({
      where: { tenant_id: tenantId, status: "issued", date: { gte: dateFrom, lte: dateTo } },
      orderBy: { date: "asc" }
    });
    const byDate = new Map();
    for (const row of rows) {
      let key;
      const d = new Date(row.date);
      if (groupBy === "month") {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else if (groupBy === "week") {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = startOfWeek.toISOString().split("T")[0];
      } else {
        key = d.toISOString().split("T")[0];
      }
      const current = byDate.get(key) || { period: key, invoices: 0, subtotal: 0, tax_total: 0, total: 0, count: 0 };
      current.subtotal = round(current.subtotal + row.subtotal);
      current.tax_total = round(current.tax_total + row.tax_total);
      current.total = round(current.total + row.total);
      current.count += 1;
      byDate.set(key, current);
    }
    return {
      date_from: dateFrom,
      date_to: dateTo,
      group_by: groupBy,
      rows: Array.from(byDate.values()),
      grand_total: round(Array.from(byDate.values()).reduce((s, r) => s + r.total, 0))
    };
  });
}

async function getSalesDetail(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const dateFrom = query.date_from ? new Date(query.date_from) : new Date("2020-01-01");
    const dateTo = query.date_to ? new Date(query.date_to) : new Date();
    const where = { tenant_id: tenantId, date: { gte: dateFrom, lte: dateTo } };
    if (query.customer_id) where.customer_id = Number(query.customer_id);
    if (query.status) where.status = String(query.status);
    if (query.search) {
      const s = String(query.search).trim();
      where.OR = [
        { number: { contains: s, mode: "insensitive" } },
        { header_text: { contains: s, mode: "insensitive" } }
      ];
    }
    const invoices = await prisma.salesInvoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, legal_name: true, tax_id: true } },
        lines: { orderBy: { line_no: "asc" }, include: { item: { select: { id: true, code: true, name: true, unit: true } } } },
        cxc: { select: { id: true, number: true, balance: true, status: true } }
      },
      orderBy: { date: "desc" },
      take: Math.min(Number(query.limit || 500), 1000)
    });
    return {
      date_from: dateFrom,
      date_to: dateTo,
      count: invoices.length,
      invoices
    };
  });
}

module.exports = {
  createSalesInvoice,
  simulateSalesInvoice,
  listSalesInvoices,
  getSalesInvoice,
  cancelSalesInvoice,
  getSalesByCustomer,
  getSalesByItem,
  getSalesByDate,
  getSalesDetail
};
