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
    name, tax_id, tax_type = "company", email, phone, address, city, country = null,
    credit_limit = 0, credit_days = 0, metadata = {}
  } = data;
  if (!name.trim()) throw appError(400, "REQUIRED_FIELD", "El nombre es obligatorio");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw appError(400, "INVALID_EMAIL", "Formato de email invalido");
  if (credit_limit < 0) throw appError(400, "INVALID_LIMIT", "El limite de credito no puede ser negativo");
  if (credit_days < 0 || credit_days > 365) throw appError(400, "INVALID_DAYS", "Los dias de credito deben estar entre 0 y 365");

  return prisma.runWithTenant(tenantId, async () => {
    if (tax_id) {
      const existing = await prisma.party.findFirst({ where: { tax_id, type: "supplier" } });
      if (existing) throw appError(409, "DUPLICATE_TAX_ID", `Ya existe un proveedor con el ID fiscal ${tax_id}`);
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
  const {
    supplier_id,
    lines,
    expected_at = null,
    notes = null,
    warehouse_id = null,
    priority = "normal",
    currency = "USD",
    payment_terms = null,
    tags = [],
    freight = 0,
    other_costs = 0
  } = data;
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
      const gross = Number(line.qty) * Number(line.unit_cost);
      const discount = Number(line.discount || 0);
      const taxRate = Number(line.tax_rate || 0);
      const subtotal = Math.max(0, gross - discount);
      const taxAmount = subtotal * (taxRate / 100);
      processedLines.push({
        item_id: item.id,
        description: item.name,
        qty: Number(line.qty),
        unit: line.unit || item.unit,
        unit_cost: Number(line.unit_cost),
        unit_price: Number(line.unit_cost),
        discount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        subtotal,
        total: subtotal + taxAmount,
        metadata: {
          notes: line.notes || null,
          expected_at: line.expected_at || expected_at,
          stock_current: item.stock_current,
          stock_min: item.stock_min,
          stock_max: item.stock_max,
          abc_class: item.abc_class
        }
      });
    }

    const subtotal = processedLines.reduce((sum, line) => sum + line.subtotal, 0);
    const taxes = processedLines.reduce((sum, line) => sum + line.tax_amount, 0);
    const total = subtotal + taxes + Number(freight || 0) + Number(other_costs || 0);
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
        tax_total: taxes,
        total,
        paid: 0,
        balance: total,
        currency,
        notes,
        metadata: {
          expected_at,
          warehouse_id,
          priority,
          payment_terms,
          tags,
          freight: Number(freight || 0),
          other_costs: Number(other_costs || 0),
          approval: { status: "draft", approved_by: null, approved_at: null },
          wms: { inbound_order: null, created_at: null },
          source: "purchase_order_workspace"
        },
        created_by: userId,
        lines: { create: processedLines }
      },
      include: { lines: true, party: true }
    });
  }));
}

async function getPurchaseOrder(tenantId, poId) {
  return prisma.runWithTenant(tenantId, async () => {
    const po = await prisma.transaction.findFirst({
      where: { id: poId, type: "purchase" },
      include: { party: true, lines: true, movements: true, documents: true, payments: true }
    });
    if (!po) throw appError(404, "NOT_FOUND", "PO no encontrada");
    return enrichPurchaseOrder(po);
  });
}

async function getSupplier(tenantId, supplierId) {
  return prisma.runWithTenant(tenantId, async () => {
    const supplier = await prisma.party.findFirst({
      where: { id: supplierId, type: "supplier" }
    });
    if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado");
    const orders = await prisma.transaction.findMany({
      where: { party_id: supplier.id, type: "purchase" },
      orderBy: { created_at: "desc" },
      include: { lines: true, movements: true }
    });
    return enrichSupplier(supplier, orders.map(enrichPurchaseOrder));
  });
}

async function updateSupplier(tenantId, supplierId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const supplier = await prisma.party.findFirst({ where: { id: supplierId, type: "supplier" } });
    if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado");
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw appError(400, "INVALID_EMAIL", "Formato de email invalido");
    if (data.credit_limit !== undefined && data.credit_limit < 0) throw appError(400, "INVALID_LIMIT", "El limite de credito no puede ser negativo");
    if (data.credit_days !== undefined && (data.credit_days < 0 || data.credit_days > 365)) throw appError(400, "INVALID_DAYS", "Los dias de credito deben estar entre 0 y 365");
    if (data.tax_id && data.tax_id !== supplier.tax_id) {
      const existing = await prisma.party.findFirst({ where: { tax_id: data.tax_id, type: "supplier", id: { not: supplier.id } } });
      if (existing) throw appError(409, "DUPLICATE_TAX_ID", `Ya existe un proveedor con el ID fiscal ${data.tax_id}`);
    }

    return prisma.party.update({
      where: { id: supplier.id },
      data: {
        name: data.name.trim() || supplier.name,
        tax_id: data.tax_id ?? supplier.tax_id,
        tax_type: data.tax_type ?? supplier.tax_type,
        email: data.email ?? supplier.email,
        phone: data.phone ?? supplier.phone,
        address: data.address ?? supplier.address,
        city: data.city ?? supplier.city,
        country: data.country ?? supplier.country,
        credit_limit: data.credit_limit ?? supplier.credit_limit,
        credit_days: data.credit_days ?? supplier.credit_days,
        active: data.active ?? supplier.active,
        metadata: data.metadata ? { ...(supplier.metadata || {}), ...data.metadata } : supplier.metadata
      }
    });
  });
}

function enrichPurchaseOrder(po) {
  const receivedByItem = new Map();
  for (const move of po.movements || []) {
    if (move.type !== "in") continue;
    receivedByItem.set(move.item_id, (receivedByItem.get(move.item_id) || 0) + Number(move.qty));
  }

  const lines = (po.lines || []).map((line) => {
    const received_quantity = receivedByItem.get(line.item_id) || 0;
    const pending_quantity = Math.max(0, Number(line.qty) - received_quantity);
    return { ...line, received_quantity, pending_quantity };
  });
  const ordered = lines.reduce((sum, line) => sum + Number(line.qty), 0);
  const received = lines.reduce((sum, line) => sum + Number(line.received_quantity), 0);
  return {
    ...po,
    lines,
    received_quantity: received,
    pending_quantity: Math.max(0, ordered - received),
    received_percent: ordered ? Math.round((received / ordered) * 100) : 0
  };
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

async function approvePurchaseOrder(tenantId, userId, poId) {
  return prisma.runWithTenant(tenantId, async () => {
    const po = await prisma.transaction.findFirst({ where: { id: poId, type: "purchase" } });
    if (!po) throw appError(404, "NOT_FOUND", "PO no encontrada");
    if (!["draft", "sent", "pending_approval"].includes(po.status)) {
      throw appError(422, "INVALID_STATUS", "Solo se pueden aprobar OC en borrador o pendiente de aprobación");
    }
    const metadata = po.metadata || {};
    return prisma.transaction.update({
      where: { id: po.id },
      data: {
        status: "confirmed",
        metadata: {
          ...metadata,
          approval: { status: "approved", approved_by: userId, approved_at: new Date().toISOString() },
          wms: {
            ...(metadata.wms || {}),
            inbound_order: metadata.wms.inbound_order || `INB-${po.number}`,
            created_at: metadata.wms.created_at || new Date().toISOString()
          }
        }
      },
      include: { party: true, lines: true }
    });
  });
}

async function cancelPurchaseOrder(tenantId, userId, poId) {
  return updatePOStatus(tenantId, userId, poId, "cancelled");
}

async function duplicatePurchaseOrder(tenantId, userId, poId) {
  return prisma.runWithTenant(tenantId, async () => {
    const po = await prisma.transaction.findFirst({
      where: { id: poId, type: "purchase" },
      include: { lines: true }
    });
    if (!po) throw appError(404, "NOT_FOUND", "PO no encontrada");
    return createPurchaseOrder(tenantId, userId, {
      supplier_id: po.party_id,
      expected_at: po.metadata.expected_at || null,
      notes: po.notes || undefined,
      warehouse_id: po.metadata.warehouse_id || null,
      priority: po.metadata.priority || "normal",
      currency: po.currency || "USD",
      payment_terms: po.metadata.payment_terms || null,
      tags: po.metadata.tags || [],
      freight: po.metadata.freight || 0,
      other_costs: po.metadata.other_costs || 0,
      lines: po.lines.map((line) => ({
        item_id: line.item_id,
        qty: Number(line.qty),
        unit_cost: Number(line.unit_cost),
        unit: line.unit,
        discount: Number(line.discount || 0),
        tax_rate: Number(line.tax_rate || 0),
        expected_at: line.metadata.expected_at || po.metadata.expected_at || undefined,
        notes: line.metadata.notes || undefined
      }))
    });
  });
}

async function createReceiptFromPurchaseOrder(tenantId, userId, poId) {
  return prisma.runWithTenant(tenantId, async () => {
    const po = await prisma.transaction.findFirst({
      where: { id: poId, type: "purchase" },
      include: { lines: true, party: true, movements: true }
    });
    if (!po) throw appError(404, "NOT_FOUND", "PO no encontrada");
    if (!["confirmed", "partial"].includes(po.status)) {
      throw appError(422, "INVALID_STATUS", "La OC debe estar aprobada para crear recepción WMS");
    }
    const enriched = enrichPurchaseOrder(po);
    return {
      id: `INB-${po.number}`,
      po_id: po.id,
      po_number: po.number,
      supplier: po.party.name,
      status: enriched.pending_quantity > 0 ? "ready_to_receive" : "completed",
      warehouse_id: po.metadata.warehouse_id || null,
      lines: enriched.lines.map((line) => ({
        line_id: line.id,
        item_id: line.item_id,
        description: line.description,
        ordered: Number(line.qty),
        received: Number(line.received_quantity),
        pending: Number(line.pending_quantity)
      })),
      mobile_steps: ["Escanear OC", "Validar SKU/lote", "Confirmar cantidad", "Enviar a putaway"]
    };
  });
}

async function listPurchaseOrderReceipts(tenantId, poId) {
  return prisma.runWithTenant(tenantId, async () => {
    const movements = await prisma.movement.findMany({
      where: { transaction_id: poId, type: "in" },
      orderBy: { created_at: "desc" }
    });
    return movements.map((move) => ({
      id: move.id,
      po_id: poId,
      item_id: move.item_id,
      qty: move.qty,
      received_by: move.created_by,
      received_at: move.created_at,
      status: "posted",
      lot: move.lot
    }));
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
        supplier_id: lastMovement.transaction.party.id || null,
        supplier_name: lastMovement.transaction.party.name || null,
        urgency: item.stock_current <= 0 ? "HIGH" : "MEDIUM"
      });
    }
    return alerts;
  });
}

async function listSuppliers(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const suppliers = await prisma.party.findMany({
      where: { type: "supplier", active: true },
      orderBy: { name: "asc" }
    });
    const orders = await prisma.transaction.findMany({
      where: { type: "purchase", party_id: { in: suppliers.map((supplier) => supplier.id) } },
      orderBy: { created_at: "desc" },
      include: { lines: true, movements: true }
    });
    const ordersBySupplier = new Map();
    for (const order of orders.map(enrichPurchaseOrder)) {
      const list = ordersBySupplier.get(order.party_id) || [];
      list.push(order);
      ordersBySupplier.set(order.party_id, list);
    }
    return suppliers.map((supplier) => enrichSupplier(supplier, ordersBySupplier.get(supplier.id) || []));
  });
}

function enrichSupplier(supplier, orders = []) {
  const totalPurchased = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const openOrders = orders.filter((order) => !["received", "cancelled", "closed"].includes(order.status));
  const pendingReceipts = orders.reduce((sum, order) => sum + Number(order.pending_quantity || 0), 0);
  const receivedOrders = orders.filter((order) => Number(order.received_percent || 0) >= 100);
  const serviceLevel = orders.length ? Math.round((receivedOrders.length / orders.length) * 100) : 100;
  return {
    ...supplier,
    metrics: {
      orders_count: orders.length,
      open_orders: openOrders.length,
      pending_receipts: pendingReceipts,
      total_purchased: totalPurchased,
      service_level: serviceLevel,
      last_order_at: orders[0].created_at || null,
      last_order_number: orders[0].number || null
    },
    recent_orders: orders.slice(0, 6)
  };
}

async function listPurchaseOrders(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const orders = await prisma.transaction.findMany({
    where: { type: "purchase" },
    orderBy: { created_at: "desc" },
      include: { party: true, lines: true, movements: true }
    });
    return orders.map(enrichPurchaseOrder);
  });
}

module.exports = {
  listSuppliers,
  getSupplier,
  updateSupplier,
  listPurchaseOrders,
  getPurchaseOrder,
  createSupplier,
  createPurchaseOrder,
  receivePurchaseOrder,
  updatePOStatus,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  duplicatePurchaseOrder,
  createReceiptFromPurchaseOrder,
  listPurchaseOrderReceipts,
  checkVMIAlerts
};
