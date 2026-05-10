const prisma = require("../../core/prisma");
const inventoryService = require("../inventory/service");
const accountingService = require("../accounting/service");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function createSupplier(tenantId, userId, data) {
  const {
    name, tax_id, tax_type = "company", email, phone, address, city, country = "CO",
    credit_limit = 0, credit_days = 0, metadata = {}
  } = data;
  if (!name?.trim()) throw appError(400, "REQUIRED_FIELD", "El nombre es obligatorio");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw appError(400, "INVALID_EMAIL", "Formato de email invalido");
  if (credit_limit < 0) throw appError(400, "INVALID_LIMIT", "El limite de credito no puede ser negativo");
  if (credit_days < 0 || credit_days > 365) throw appError(400, "INVALID_DAYS", "Los dias de credito deben estar entre 0 y 365");

  return prisma.runWithTenant(tenantId, async () => {
    if (tax_id) {
      const existing = await prisma.party.findFirst({ where: { tax_id, type: "supplier" } });
      if (existing) throw appError(409, "DUPLICATE_TAX_ID", `Ya existe un proveedor con el NIT/CC ${tax_id}`);
    }
    return prisma.party.create({
      data: {
        type: "supplier",
        name: name.trim(),
        tax_id,
        tax_type,
        email,
        phone,
        address,
        city,
        country,
        credit_limit,
        credit_days,
        balance: 0,
        active: true,
        metadata
      }
    });
  });
}

async function createPurchaseOrder(tenantId, userId, data) {
  const { supplier_id, lines, expected_at = null, notes = null } = data;
  if (!Array.isArray(lines) || lines.length === 0) throw appError(400, "NO_LINES", "La orden debe tener al menos una linea");

  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const supplier = await tx.party.findFirst({ where: { id: supplier_id, type: "supplier", active: true } });
    if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado");

    const processedLines = [];
    for (const line of lines) {
      if (!line.qty || line.qty <= 0) throw appError(400, "INVALID_QTY", "La cantidad debe ser mayor a 0");
      if (line.unit_cost === undefined || line.unit_cost < 0) throw appError(400, "INVALID_COST", "El costo unitario debe ser >= 0");
      const item = await tx.item.findFirst({ where: { id: line.item_id, active: true } });
      if (!item) throw appError(404, "ITEM_NOT_FOUND", `Item ${line.item_id} no encontrado`);
      const subtotal = Number(line.qty) * Number(line.unit_cost);
      processedLines.push({
        item_id: item.id,
        description: item.name,
        qty: Number(line.qty),
        unit: line.unit || item.unit,
        unit_cost: Number(line.unit_cost),
        unit_price: Number(line.unit_cost),
        discount: 0,
        tax_rate: 0,
        tax_amount: 0,
        subtotal,
        total: subtotal,
        metadata: { notes: line.notes || null }
      });
    }

    const subtotal = processedLines.reduce((sum, line) => sum + line.subtotal, 0);
    const count = await tx.transaction.count({ where: { type: "purchase" } });
    const number = `PO-${String(count + 1).padStart(6, "0")}`;
    return tx.transaction.create({
      data: {
        type: "purchase",
        number,
        party_id: supplier.id,
        status: "draft",
        date: new Date(),
        due_date: expected_at ? new Date(expected_at) : null,
        subtotal,
        tax_total: 0,
        total: subtotal,
        paid: 0,
        balance: subtotal,
        notes,
        metadata: { expected_at },
        created_by: userId,
        lines: { create: processedLines }
      },
      include: { lines: true, party: true }
    });
  }));
}

async function receivePurchaseOrder(tenantId, userId, poId, data) {
  const { received_lines = [], notes = null } = data;
  if (!Array.isArray(received_lines) || received_lines.length === 0) {
    throw appError(400, "NO_RECEIVED_LINES", "Debes enviar al menos una linea recibida");
  }
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const po = await tx.transaction.findFirst({
      where: { id: poId, type: "purchase" },
      include: { lines: true, party: true }
    });
    if (!po) throw appError(404, "NOT_FOUND", "PO no encontrada");
    if (!["draft", "sent", "confirmed", "partial"].includes(po.status)) {
      throw appError(422, "INVALID_STATUS", "No se puede recibir una PO en este estado");
    }

    let receivedTotal = 0;
    for (const row of received_lines) {
      const line = po.lines.find((entry) => entry.id === row.line_id);
      if (!line) throw appError(404, "LINE_NOT_FOUND", `Linea ${row.line_id} no encontrada`);
      if (!row.qty_received || row.qty_received <= 0) throw appError(400, "INVALID_QTY", "qty_received debe ser mayor a 0");
      const moved = await tx.movement.aggregate({
        where: { transaction_id: poId, item_id: line.item_id, type: "in" },
        _sum: { qty: true }
      });
      const already = moved._sum.qty || 0;
      const pending = Number(line.qty) - Number(already);
      if (row.qty_received > pending + 0.0001) {
        throw appError(422, "EXCEEDS_PENDING", `La cantidad recibida supera el pendiente (${pending})`);
      }
      await inventoryService.stockMove(tenantId, userId, {
        item_id: line.item_id,
        type: "in",
        qty: Number(row.qty_received),
        to_location_id: row.location_id,
        transaction_id: poId,
        cost: line.unit_cost,
        lot: row.lot || null,
        expiry: row.expiry || null,
        reason: `Recepcion ${po.number}`
      });
      receivedTotal += Number(row.qty_received) * Number(line.unit_cost);
    }

    if (receivedTotal > 0) {
      await accountingService.journalEntry(tenantId, {
        description: `Recepcion de mercancia ${po.number}`,
        transaction_id: po.id,
        entries: [{ account: "1435", debit: receivedTotal, credit: 0 }, { account: "2205", debit: 0, credit: receivedTotal }]
      });
    }

    const allMoves = await tx.movement.findMany({ where: { transaction_id: po.id, type: "in" } });
    const byItem = new Map();
    for (const move of allMoves) byItem.set(move.item_id, (byItem.get(move.item_id) || 0) + Number(move.qty));
    const fullyReceived = po.lines.every((line) => (byItem.get(line.item_id) || 0) >= Number(line.qty));
    const newStatus = fullyReceived ? "received" : "partial";

    const updated = await tx.transaction.update({
      where: { id: po.id },
      data: { status: newStatus, notes: notes || po.notes },
      include: { lines: true, party: true }
    });

    return updated;
  }));
}

const PO_TRANSITIONS = {
  draft: ["sent", "cancelled"],
  sent: ["confirmed", "cancelled"],
  confirmed: ["partial", "received", "cancelled"],
  partial: ["received", "cancelled"]
};

async function updatePOStatus(tenantId, userId, poId, newStatus) {
  return prisma.runWithTenant(tenantId, async () => {
    const po = await prisma.transaction.findFirst({ where: { id: poId, type: "purchase" } });
    if (!po) throw appError(404, "NOT_FOUND", "PO no encontrada");
    const allowed = PO_TRANSITIONS[po.status] || [];
    if (!allowed.includes(newStatus)) {
      throw appError(422, "INVALID_TRANSITION", `Transicion invalida: ${po.status} -> ${newStatus}. Permitidas: ${allowed.join(", ")}`);
    }
    if (newStatus === "cancelled") {
      const receipts = await prisma.movement.count({ where: { transaction_id: po.id, type: "in" } });
      if (receipts > 0) throw appError(422, "HAS_RECEIPTS", "No se puede cancelar una PO con recepciones registradas");
    }
    return prisma.transaction.update({ where: { id: po.id }, data: { status: newStatus } });
  });
}

async function checkVMIAlerts(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const lowItems = await prisma.item.findMany({
      where: { active: true, stock_current: { lte: prisma.item.fields.stock_min } },
      orderBy: { stock_current: "asc" }
    }).catch(async () => prisma.item.findMany({ where: { active: true }, orderBy: { stock_current: "asc" } }));

    const alerts = [];
    for (const item of lowItems.filter((row) => row.stock_current <= row.stock_min)) {
      const lastMovement = await prisma.movement.findFirst({
        where: {
          item_id: item.id,
          type: "in",
          created_at: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
          transaction_id: { not: null }
        },
        orderBy: { created_at: "desc" },
        include: { transaction: { include: { party: { select: { id: true, name: true } } } } }
      });
      const qtySuggested = item.stock_max ? Math.max(0, item.stock_max - item.stock_current) : item.stock_min * 2;
      alerts.push({
        item_id: item.id,
        item_code: item.code,
        item_name: item.name,
        stock_current: item.stock_current,
        stock_min: item.stock_min,
        qty_sugerida: qtySuggested,
        supplier_id: lastMovement?.transaction?.party?.id || null,
        supplier_name: lastMovement?.transaction?.party?.name || null,
        urgency: item.stock_current <= 0 ? "HIGH" : "MEDIUM"
      });
    }
    return alerts;
  });
}

module.exports = {
  createSupplier,
  createPurchaseOrder,
  receivePurchaseOrder,
  updatePOStatus,
  checkVMIAlerts
};

