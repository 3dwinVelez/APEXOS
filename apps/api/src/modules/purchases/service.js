const prisma = require("../../core/prisma");
const inventoryService = require("../inventory/service");
const accountingService = require("../accounting/service");
const { hasPartyRole, partyRoleWhere, withPartyRoles, presentPartyForRole } = require("../parties/roles");

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
      const existing = await prisma.party.findFirst({ where: { tax_id } });
      if (existing) {
        if (hasPartyRole(existing, "supplier")) throw appError(409, "DUPLICATE_TAX_ID", `Ya existe un proveedor con el ID fiscal ${tax_id}`);
        const promoted = await prisma.party.update({
          where: { id: existing.id },
          data: {
            metadata: withPartyRoles({ ...(existing.metadata || {}), ...(metadata || {}), supplier_credit_limit: credit_limit, supplier_credit_days: credit_days }, ["supplier"])
          }
        });
        return presentPartyForRole(promoted, "supplier");
      }
    }
    const created = await prisma.party.create({
      data: {
        type: "supplier",
        name: name.trim(),
        tax_id,
        tax_type,
        email,
        phone,
        address,
        city,
        country: country || "CO",
        credit_limit,
        credit_days,
        balance: 0,
        active: true,
        metadata: withPartyRoles({ ...metadata, supplier_credit_limit: credit_limit, supplier_credit_days: credit_days }, ["supplier"])
      }
    });
    return enrichSupplier(presentPartyForRole(created, "supplier"));
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
    const supplier = await tx.party.findFirst({ where: { id: supplier_id, active: true, AND: [partyRoleWhere("supplier")] } });
    if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado");
    const warehouse = await tx.place.findFirst({ where: { id: Number(warehouse_id), type: "warehouse", active: true } });
    if (!warehouse) throw appError(404, "WAREHOUSE_NOT_FOUND", "Selecciona una bodega destino activa");

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
          warehouse_id: warehouse.id,
          warehouse_code: warehouse.code,
          warehouse_name: warehouse.name,
          society_code: warehouse.society_code,
          branch_code: warehouse.branch_code,
          cost_center_code: warehouse.cost_center_code,
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
      where: { id: supplierId, AND: [partyRoleWhere("supplier")] }
    });
    if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado");
    const orders = await prisma.transaction.findMany({
      where: { party_id: supplier.id, type: "purchase" },
      orderBy: { created_at: "desc" },
      include: { lines: true, movements: true }
    });
    return enrichSupplier(presentPartyForRole(supplier, "supplier"), await Promise.all(orders.map(enrichPurchaseOrder)));
  });
}

async function updateSupplier(tenantId, supplierId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const supplier = await prisma.party.findFirst({ where: { id: supplierId, AND: [partyRoleWhere("supplier")] } });
    if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado");
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw appError(400, "INVALID_EMAIL", "Formato de email invalido");
    if (data.credit_limit !== undefined && data.credit_limit < 0) throw appError(400, "INVALID_LIMIT", "El limite de credito no puede ser negativo");
    if (data.credit_days !== undefined && (data.credit_days < 0 || data.credit_days > 365)) throw appError(400, "INVALID_DAYS", "Los dias de credito deben estar entre 0 y 365");
    if (data.tax_id && data.tax_id !== supplier.tax_id) {
      const existing = await prisma.party.findFirst({ where: { tax_id: data.tax_id, id: { not: supplier.id } } });
      if (existing) throw appError(409, "DUPLICATE_TAX_ID", `Ya existe un proveedor con el ID fiscal ${data.tax_id}`);
    }

    const updated = await prisma.party.update({
      where: { id: supplier.id },
      data: {
        name: data.name?.trim() || supplier.name,
        tax_id: data.tax_id ?? supplier.tax_id,
        tax_type: data.tax_type ?? supplier.tax_type,
        email: data.email ?? supplier.email,
        phone: data.phone ?? supplier.phone,
        address: data.address ?? supplier.address,
        city: data.city ?? supplier.city,
        country: data.country ?? supplier.country,
        active: data.active ?? supplier.active,
        metadata: withPartyRoles({
          ...(supplier.metadata || {}),
          ...(data.metadata || {}),
          ...(data.credit_limit !== undefined ? { supplier_credit_limit: data.credit_limit } : {}),
          ...(data.credit_days !== undefined ? { supplier_credit_days: data.credit_days } : {})
        }, ["supplier"])
      }
    });
    return presentPartyForRole(updated, "supplier");
  });
}

async function enrichPurchaseOrder(po) {
  const receivedByLine = new Map();
  const legacyByItem = new Map();
  for (const move of po.movements || []) {
    const sign = move.type === "in" ? 1 : move.type === "out" ? -1 : 0;
    if (!sign) continue;
    if (move.purchase_order_line_id) receivedByLine.set(move.purchase_order_line_id, (receivedByLine.get(move.purchase_order_line_id) || 0) + sign * Number(move.qty));
    else legacyByItem.set(move.item_id, (legacyByItem.get(move.item_id) || 0) + sign * Number(move.qty));
  }
  const invoiceRows = po.lines?.length ? await prisma.purchaseOrderInvoiceLine.findMany({
    where: { purchase_order_line_id: { in: po.lines.map((line) => line.id) } }
  }) : [];
  const invoicedByLine = new Map();
  for (const row of invoiceRows) {
    const sign = row.document_kind === "credit_note" ? -1 : 1;
    invoicedByLine.set(row.purchase_order_line_id, (invoicedByLine.get(row.purchase_order_line_id) || 0) + sign * Number(row.qty));
  }

  const lines = (po.lines || []).map((line) => {
    const received_quantity = receivedByLine.has(line.id) ? receivedByLine.get(line.id) : (legacyByItem.get(line.item_id) || 0);
    const pending_quantity = Math.max(0, Number(line.qty) - received_quantity);
    const invoiced_quantity = Math.max(0, invoicedByLine.get(line.id) || 0);
    const pending_invoice_quantity = Math.max(0, Number(line.qty) - invoiced_quantity);
    return { ...line, received_quantity, pending_quantity, invoiced_quantity, pending_invoice_quantity };
  });
  const ordered = lines.reduce((sum, line) => sum + Number(line.qty), 0);
  const received = lines.reduce((sum, line) => sum + Number(line.received_quantity), 0);
  const invoiced = lines.reduce((sum, line) => sum + Number(line.invoiced_quantity), 0);
  return {
    ...po,
    lines,
    received_quantity: received,
    pending_quantity: Math.max(0, ordered - received),
    pending_invoice_quantity: Math.max(0, ordered - invoiced),
    invoiced_quantity: invoiced,
    received_percent: ordered ? Math.round((received / ordered) * 100) : 0,
    invoiced_percent: ordered ? Math.round((invoiced / ordered) * 100) : 0
  };
}

function purchaseReceiptLineState(line, movements = [], requestedQty) {
  const quantity = Number(requestedQty);
  const already = movements.reduce((sum, move) => (
    sum + (move.type === "in" ? 1 : move.type === "out" ? -1 : 0) * Number(move.qty)
  ), 0);
  const pending = Math.max(0, Number(line.qty) - already);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw appError(400, "INVALID_QTY", "La cantidad recibida debe ser mayor a 0");
  }
  if (quantity > pending + 0.0001) {
    throw appError(422, "EXCEEDS_PENDING", `La cantidad recibida supera el pendiente (${pending})`);
  }
  return { quantity, already, pending };
}

async function receivePurchaseOrder(tenantId, userId, poId, data) {
  const { received_lines = [], notes = null } = data;
  if (!Array.isArray(received_lines) || received_lines.length === 0) {
    throw appError(400, "NO_RECEIVED_LINES", "Debes enviar al menos una linea recibida");
  }
  await accountingService.assertPeriodOpen(tenantId, new Date());
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const po = await tx.transaction.findFirst({
      where: { id: poId, type: "purchase" },
      include: { lines: true, party: true }
    });
    if (!po) throw appError(404, "NOT_FOUND", "PO no encontrada");
    if (!["confirmed", "partial"].includes(po.status)) {
      throw appError(422, "INVALID_STATUS", "No se puede recibir una PO en este estado");
    }

    const warehouseId = Number(po.metadata?.warehouse_id || 0);
    let defaultLocationId = null;
    if (warehouseId) {
      const defaultLocation = await tx.location.findFirst({
        where: { place_id: warehouseId, active: true },
        orderBy: { id: "asc" }
      });
      defaultLocationId = defaultLocation?.id || null;
    }
    if (!defaultLocationId && received_lines.some((row) => !Number(row.location_id))) {
      throw appError(422, "WAREHOUSE_LOCATION_REQUIRED", "La bodega de la OC no tiene una ubicacion activa para recibir mercancia");
    }

    const duplicatedLine = received_lines.find((row, index) => (
      received_lines.findIndex((candidate) => Number(candidate.line_id) === Number(row.line_id)) !== index
    ));
    if (duplicatedLine) throw appError(400, "DUPLICATE_RECEIPT_LINE", "Cada posicion de la OC debe enviarse una sola vez por recepcion");

    const accountingLines = [];
    const purchaseImport = await tx.purchaseImport.findFirst({ where: { purchase_order_id: po.id }, include: { costs: true } });
    let importAllocation = new Map();
    if (purchaseImport) {
      if (purchaseImport.status !== "cost_confirmed") throw appError(422, "IMPORT_COSTS_NOT_CONFIRMED", "Confirma todos los costos de importacion antes de recibir la mercancia");
      const pendingRows = [];
      for (const line of po.lines) {
        const moves = await tx.movement.findMany({ where: { transaction_id: po.id, purchase_order_line_id: line.id } });
        const already = moves.reduce((sum, move) => sum + (move.type === "in" ? 1 : -1) * Number(move.qty), 0);
        pendingRows.push({ id: line.id, pending: Math.max(0, Number(line.qty) - already) });
      }
      if (received_lines.length !== pendingRows.filter((row) => row.pending > 0).length || received_lines.some((row) => Math.abs(Number(row.qty_received) - (pendingRows.find((entry) => entry.id === Number(row.line_id))?.pending || 0)) > 0.0001)) throw appError(422, "IMPORT_FULL_RECEIPT_REQUIRED", "La importacion debe recibirse completa; no se permiten recepciones parciales");
      importAllocation = allocateImportCosts(po.lines, purchaseImport.costs);
    }
    for (const row of received_lines) {
      const line = po.lines.find((entry) => entry.id === Number(row.line_id));
      if (!line) throw appError(404, "LINE_NOT_FOUND", `Linea ${row.line_id} no encontrada`);
      const moved = await tx.movement.findMany({ where: { transaction_id: poId, purchase_order_line_id: line.id } });
      const { quantity, already } = purchaseReceiptLineState(line, moved, row.qty_received);
      const destinationLocationId = Number(row.location_id || defaultLocationId);
      const destinationLocation = await tx.location.findFirst({ where: { id: destinationLocationId, active: true, place_id: warehouseId } });
      if (!destinationLocation) throw appError(422, "LOCATION_WAREHOUSE_MISMATCH", "La ubicacion de recepcion debe pertenecer a la bodega de la OC");
      const landedUnitCost = Number(line.unit_cost) + Number(importAllocation.get(line.id) || 0) / Number(line.qty);
      await inventoryService.stockMoveTx(tx, tenantId, userId, {
        item_id: line.item_id,
        type: "in",
        qty: quantity,
        to_location_id: destinationLocationId,
        transaction_id: poId,
        purchase_order_line_id: line.id,
        source_type: "purchase_order_receipt",
        source_id: po.id,
        idempotency_key: `purchase-receipt:${po.id}:${line.id}:${already}:${quantity}`,
        cost: landedUnitCost,
        lot: row.lot || null,
        expiry: row.expiry || null,
        reason: `Recepcion ${po.number}`
      });
      const family = await inventoryService.getFamilyAccountingByItem(tx, line.item_id);
      if (!family?.accounting?.goods_receipt_account_code || !family?.accounting?.gr_ir_account_code) {
        throw appError(422, "RECEIPT_ACCOUNTING_REQUIRED", `El SKU ${family?.item?.code || line.item_id} no tiene cuentas de inventario alta y EM/RF parametrizadas en su familia`);
      }
      accountingLines.push({
        inventory_account_code: family.accounting.goods_receipt_account_code,
        gr_ir_account_code: family.accounting.gr_ir_account_code,
        amount: quantity * landedUnitCost,
        description: `Recepcion ${po.number} - ${family.item.code}`
      });
    }

    const accountingDocument = await accountingService.createGoodsReceiptDocumentTx(tx, tenantId, userId, {
      posting_date: new Date(),
      reference: po.number,
      header_text: `Recepcion de mercancia ${po.number}`,
      society_code: po.metadata?.society_code,
      branch_code: po.metadata?.branch_code,
      cost_center_code: po.metadata?.cost_center_code,
      party_id: po.party_id,
      party_tax_id: po.party?.tax_id,
      transaction_id: po.id,
      lines: accountingLines
    });

    const allMoves = await tx.movement.findMany({ where: { transaction_id: po.id } });
    const byLine = new Map();
    for (const move of allMoves) if (move.purchase_order_line_id) byLine.set(move.purchase_order_line_id, (byLine.get(move.purchase_order_line_id) || 0) + (move.type === "in" ? 1 : -1) * Number(move.qty));
    const fullyReceived = po.lines.every((line) => (byLine.get(line.id) || 0) >= Number(line.qty));
    const newStatus = fullyReceived ? "received" : "partial";

    const updated = await tx.transaction.update({
      where: { id: po.id },
      data: { status: newStatus, notes: notes || po.notes },
      include: { lines: true, party: true }
    });
    if (purchaseImport) await tx.purchaseImport.update({ where: { id: purchaseImport.id }, data: { status: "received", received_at: new Date() } });

    return { ...updated, accounting_document: accountingDocument };
  }));
}

async function getPurchaseOrderPrintData(tenantId, poId) {
  return prisma.runWithTenant(tenantId, async () => {
    const po = await prisma.transaction.findFirst({
      where: { id: poId, type: "purchase" },
      include: { party: true, lines: true, movements: true }
    });
    if (!po) throw appError(404, "NOT_FOUND", "OC no encontrada");
    const enriched = await enrichPurchaseOrder(po);
    const itemIds = [...new Set(po.lines.map((line) => line.item_id).filter(Boolean))];
    const [tenant, warehouse, creator, organization, items] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, tax_id: true, currency: true, country: true } }),
      po.metadata?.warehouse_id ? prisma.place.findFirst({ where: { id: Number(po.metadata.warehouse_id), type: "warehouse", __includeInactive: true } }) : null,
      po.created_by ? prisma.user.findFirst({ where: { id: po.created_by }, select: { id: true, name: true, email: true } }) : null,
      accountingService.getOrganizationTree(tenantId),
      itemIds.length ? prisma.item.findMany({ where: { id: { in: itemIds }, __includeInactive: true }, select: { id: true, code: true, name: true } }) : []
    ]);
    const society = organization.societies.find((row) => row.code === (warehouse?.society_code || po.metadata?.society_code));
    const itemById = new Map(items.map((item) => [item.id, item]));
    return {
      ...enriched,
      company: {
        name: tenant?.name || "Empresa sin nombre configurado",
        tax_id: tenant?.tax_id || null,
        country: tenant?.country || warehouse?.country || null,
        society_code: society?.code || warehouse?.society_code || po.metadata?.society_code || null,
        society_name: society?.name || null
      },
      warehouse: warehouse ? {
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        address: warehouse.address,
        city: warehouse.city,
        country: warehouse.country,
        society_code: warehouse.society_code,
        branch_code: warehouse.branch_code,
        cost_center_code: warehouse.cost_center_code
      } : null,
      created_by_user: creator,
      lines: enriched.lines.map((line, index) => ({
        ...line,
        position: index + 1,
        sku: itemById.get(line.item_id)?.code || String(line.item_id || ""),
        description: line.description || itemById.get(line.item_id)?.name || ""
      }))
    };
  });
}

async function updatePurchaseOrder(tenantId, userId, poId, data) {
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
    const current = await tx.transaction.findFirst({ where: { id: poId, type: "purchase" }, include: { lines: true } });
    if (!current) throw appError(404, "NOT_FOUND", "OC no encontrada");
    if (current.status !== "draft") throw appError(409, "ORDER_NOT_DRAFT", "Solo se pueden editar ordenes de compra en borrador");

    const supplier = await tx.party.findFirst({ where: { id: supplier_id, active: true, AND: [partyRoleWhere("supplier")] } });
    if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado");
    const warehouse = await tx.place.findFirst({ where: { id: Number(warehouse_id), type: "warehouse", active: true } });
    if (!warehouse) throw appError(404, "WAREHOUSE_NOT_FOUND", "Selecciona una bodega destino activa");

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
    return tx.transaction.update({
      where: { id: current.id },
      data: {
        party_id: supplier.id,
        due_date: expected_at ? new Date(expected_at) : null,
        subtotal,
        tax_total: taxes,
        total,
        balance: total,
        currency,
        notes,
        metadata: {
          ...(current.metadata || {}),
          expected_at,
          warehouse_id: warehouse.id,
          warehouse_code: warehouse.code,
          warehouse_name: warehouse.name,
          society_code: warehouse.society_code,
          branch_code: warehouse.branch_code,
          cost_center_code: warehouse.cost_center_code,
          priority,
          payment_terms,
          tags,
          freight: Number(freight || 0),
          other_costs: Number(other_costs || 0),
          last_edited_by: userId,
          last_edited_at: new Date().toISOString()
        },
        lines: { deleteMany: {}, create: processedLines }
      },
      include: { lines: true, party: true }
    });
  }));
}

function round(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function normalizeCode(value) { return String(value || "").trim().toUpperCase(); }
function allocateImportCosts(lines, costs) {
  const baseTotal = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_cost), 0);
  const capitalizable = costs.filter((cost) => cost.classification === "capitalizable").reduce((sum, cost) => sum + Number(cost.estimated_amount), 0);
  return new Map(lines.map((line) => { const base = Number(line.qty) * Number(line.unit_cost); return [line.id, baseTotal > 0 ? capitalizable * base / baseTotal : 0]; }));
}

async function listPurchaseImports(tenantId, query = {}) { return prisma.runWithTenant(tenantId, () => prisma.purchaseImport.findMany({ where: query.status ? { status: String(query.status) } : {}, include: { costs: true }, orderBy: { id: "desc" } })); }
async function getPurchaseImport(tenantId, id) { return prisma.runWithTenant(tenantId, async () => { const row = await prisma.purchaseImport.findFirst({ where: { id: Number(id) }, include: { costs: { orderBy: { id: "asc" } } } }); if (!row) throw appError(404, "IMPORT_NOT_FOUND", "Importacion no encontrada"); const order = await prisma.transaction.findFirst({ where: { id: row.purchase_order_id, type: "purchase" }, include: { lines: true, party: true } }); return { ...row, order }; }); }
async function createPurchaseImport(tenantId, userId, data) { return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const order = await tx.transaction.findFirst({ where: { id: Number(data.purchase_order_id), type: "purchase", status: { in: ["draft", "confirmed"] } } }); if (!order) throw appError(422, "IMPORT_ORDER_INVALID", "La OC no existe o ya inicio su recepcion"); const existing = await tx.purchaseImport.findFirst({ where: { purchase_order_id: order.id } }); if (existing) throw appError(409, "IMPORT_EXISTS", "La OC ya tiene una importacion"); const number = `IMP-${String(order.id).padStart(6, "0")}`; const created = await tx.purchaseImport.create({ data: { tenant_id: tenantId, purchase_order_id: order.id, number, created_by: userId || null } }); await tx.transaction.update({ where: { id: order.id }, data: { metadata: { ...(order.metadata || {}), is_import: true, import_number: number } } }); return created; })); }
async function addPurchaseImportCost(tenantId, userId, id, data) { return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const imp = await tx.purchaseImport.findFirst({ where: { id: Number(id), status: "draft" } }); if (!imp) throw appError(422, "IMPORT_NOT_EDITABLE", "La importacion no existe o sus costos ya fueron confirmados"); const [supplier, account, clearing] = await Promise.all([tx.party.findFirst({ where: { id: Number(data.supplier_id), active: true, AND: [partyRoleWhere("supplier")] } }), tx.account.findFirst({ where: { code: normalizeCode(data.account_code), active: true, allows_tx: true } }), tx.account.findFirst({ where: { code: normalizeCode(data.clearing_account_code), active: true, allows_tx: true } })]); if (!supplier || !account || !clearing) throw appError(422, "IMPORT_MASTER_INVALID", "Proveedor o cuentas contables de costo no validos"); const cost = await tx.purchaseImportCost.create({ data: { tenant_id: tenantId, import_id: imp.id, concept: String(data.concept).trim(), supplier_id: supplier.id, classification: data.classification, estimated_amount: round(data.estimated_amount), actual_amount: data.actual_amount == null ? null : round(data.actual_amount), account_code: account.code, clearing_account_code: clearing.code, created_by: userId || null } }); const aggregate = await tx.purchaseImportCost.aggregate({ where: { import_id: imp.id }, _sum: { estimated_amount: true, actual_amount: true } }); await tx.purchaseImport.update({ where: { id: imp.id }, data: { estimated_total: round(aggregate._sum.estimated_amount || 0), actual_total: round(aggregate._sum.actual_amount || 0) } }); return cost; })); }
async function confirmPurchaseImportCosts(tenantId, userId, id) { return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const imp = await tx.purchaseImport.findFirst({ where: { id: Number(id), status: "draft" }, include: { costs: true } }); if (!imp || !imp.costs.length) throw appError(422, "IMPORT_COSTS_REQUIRED", "Registra al menos un costo antes de confirmar"); return tx.purchaseImport.update({ where: { id: imp.id }, data: { status: "cost_confirmed", costs_confirmed_at: new Date(), costs_confirmed_by: userId || null } }); })); }
async function listImportInvoiceableCosts(tenantId, id, query = {}) { return prisma.runWithTenant(tenantId, () => prisma.purchaseImportCost.findMany({ where: { import_id: Number(id), ...(query.supplier_id ? { supplier_id: Number(query.supplier_id) } : {}), cxp_cabdoc_id: null }, orderBy: { id: "asc" } })); }
async function linkImportCostInvoice(tenantId, userId, costId, data) { return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
  const cost = await tx.purchaseImportCost.findFirst({ where: { id: Number(costId), cxp_cabdoc_id: null }, include: { import: true } });
  if (!cost) throw appError(404, "IMPORT_COST_NOT_FOUND", "Costo no encontrado o ya facturado");
  const invoice = await tx.cxpCabdoc.findFirst({ where: { id: Number(data.cxp_cabdoc_id), supplier_id: cost.supplier_id, document_kind: "invoice" } });
  if (!invoice) throw appError(422, "IMPORT_INVOICE_SUPPLIER_MISMATCH", "La factura no pertenece al proveedor asignado al costo");
  const actual = round(data.actual_amount);
  const updated = await tx.purchaseImportCost.update({ where: { id: cost.id }, data: { cxp_cabdoc_id: invoice.id, actual_amount: actual, status: actual === round(cost.estimated_amount) ? "invoiced" : "variance_pending" } });
  const aggregate = await tx.purchaseImportCost.aggregate({ where: { import_id: cost.import_id }, _sum: { actual_amount: true } });
  await tx.purchaseImport.update({ where: { id: cost.import_id }, data: { actual_total: round(aggregate._sum.actual_amount || 0) } });
  return updated;
})); }

async function adjustImportCostVariance(tenantId, userId, costId, data) {
  const postingDate = new Date(data.posting_date);
  if (Number.isNaN(postingDate.getTime())) throw appError(400, "INVALID_POSTING_DATE", "Fecha de ajuste invalida");
  await accountingService.assertPeriodOpen(tenantId, postingDate);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const cost = await tx.purchaseImportCost.findFirst({ where: { id: Number(costId), status: "variance_pending", classification: "capitalizable" }, include: { import: true } });
    if (!cost || cost.import.status !== "received") throw appError(422, "IMPORT_VARIANCE_NOT_ADJUSTABLE", "La diferencia no existe, no es capitalizable o la importacion no ha sido recibida");
    const order = await tx.transaction.findFirst({ where: { id: cost.import.purchase_order_id, type: "purchase" }, include: { lines: true, party: true } });
    if (!order) throw appError(404, "IMPORT_ORDER_NOT_FOUND", "Orden de importacion no encontrada");
    const delta = round(Number(cost.actual_amount) - Number(cost.estimated_amount));
    if (Math.abs(delta) <= 0.01) return tx.purchaseImportCost.update({ where: { id: cost.id }, data: { status: "invoiced" } });
    const allocations = allocateImportCosts(order.lines, [{ classification: "capitalizable", estimated_amount: Math.abs(delta) }]);
    const accountingLines = [];
    for (const line of order.lines) {
      const amount = round(allocations.get(line.id) || 0); if (amount <= 0) continue;
      const family = await inventoryService.getFamilyAccountingByItem(tx, line.item_id);
      const inventoryCode = family?.accounting?.goods_receipt_account_code;
      if (!inventoryCode) throw appError(422, "IMPORT_INVENTORY_ACCOUNT_REQUIRED", `El SKU ${family?.item?.code || line.item_id} no tiene cuenta de inventario`);
      const valuation = await tx.skuValuation.findFirst({ where: { society_code: normalizeCode(order.metadata?.society_code), item_id: line.item_id } });
      if (!valuation || Number(valuation.quantity_balance) <= 0) throw appError(422, "IMPORT_VARIANCE_WITHOUT_STOCK", `No se puede cargar la diferencia al SKU ${family?.item?.code || line.item_id} porque no conserva existencias`);
      const signedAmount = delta > 0 ? amount : -amount;
      const nextValue = round(Number(valuation.value_balance) + signedAmount);
      if (nextValue < -0.01) throw appError(422, "IMPORT_VARIANCE_EXCEEDS_VALUE", "La diferencia negativa supera el valor disponible del inventario");
      const average = Math.round((nextValue / Number(valuation.quantity_balance)) * 10000) / 10000;
      await tx.skuValuation.update({ where: { id: valuation.id }, data: { value_balance: nextValue, average_cost: average, version: { increment: 1 } } });
      await tx.productCost.create({ data: { item_id: line.item_id, society_code: normalizeCode(order.metadata?.society_code), costing_method: "weighted_average", quantity_balance: valuation.quantity_balance, value_balance: nextValue, average_cost: average, last_unit_cost: average, source_type: "import_cost_adjustment", source_id: cost.id, created_by: userId || null } });
      accountingLines.push({ inventory_account_code: delta > 0 ? inventoryCode : cost.clearing_account_code, gr_ir_account_code: delta > 0 ? cost.clearing_account_code : inventoryCode, amount, description: `Ajuste ${cost.import.number} - ${cost.concept} - ${family.item.code}` });
    }
    const costSupplier = await tx.party.findFirst({ where: { id: cost.supplier_id } });
    const document = await accountingService.createGoodsReceiptDocumentTx(tx, tenantId, userId, { posting_date: postingDate, reference: cost.import.number, header_text: `Ajuste costo real ${cost.import.number}`, society_code: order.metadata?.society_code, branch_code: order.metadata?.branch_code, cost_center_code: order.metadata?.cost_center_code, party_id: cost.supplier_id, party_tax_id: costSupplier?.tax_id || null, transaction_id: order.id, lines: accountingLines });
    const updated = await tx.purchaseImportCost.update({ where: { id: cost.id }, data: { status: "adjusted" } });
    return { cost: updated, accounting_document: document, variance: delta };
  }));
}

async function returnPurchaseOrder(tenantId, userId, poId, data) {
  const rows = data.returned_lines || [];
  if (!rows.length) throw appError(400, "NO_RETURN_LINES", "Debes enviar al menos una linea a devolver");
  await accountingService.assertPeriodOpen(tenantId, new Date());
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const po = await tx.transaction.findFirst({ where: { id: poId, type: "purchase" }, include: { lines: true, party: true } });
    if (!po) throw appError(404, "NOT_FOUND", "PO no encontrada");
    const accountingLines = [];
    for (const row of rows) {
      const line = po.lines.find((item) => item.id === Number(row.line_id));
      if (!line || Number(row.qty_returned) <= 0) throw appError(400, "INVALID_RETURN_LINE", "Linea o cantidad de devolucion invalida");
      let moves = await tx.movement.findMany({ where: { transaction_id: po.id, purchase_order_line_id: line.id } });
      if (!moves.length) moves = await tx.movement.findMany({ where: { transaction_id: po.id, item_id: line.item_id } });
      const available = moves.reduce((sum, move) => sum + (move.type === "in" ? 1 : -1) * Number(move.qty), 0);
      if (Number(row.qty_returned) > available + 0.0001) throw appError(422, "EXCEEDS_RECEIVED", `La devolucion supera lo recibido (${available})`);
      const item = await tx.item.findFirst({ where: { id: line.item_id, active: true }, include: { family: { include: { accounting: true } } } });
      const familyAccounting = item?.family?.accounting;
      if (!familyAccounting?.goods_receipt_account_code || !familyAccounting?.gr_ir_account_code) {
        throw appError(422, "FAMILY_ACCOUNTING_REQUIRED", `El SKU ${item?.code || line.item_id} no tiene cuentas de inventario y EM/RF configuradas`);
      }
      await inventoryService.stockMoveTx(tx, tenantId, userId, { item_id: line.item_id, type: "out", qty: Number(row.qty_returned), from_location_id: Number(row.location_id), transaction_id: po.id, purchase_order_line_id: line.id, cost: line.unit_cost, source_type: "purchase_return", source_id: po.id, reason: `Devolucion ${po.number}: ${data.reason || "mercancia"}` });
      accountingLines.push({ inventory_account_code: familyAccounting.goods_receipt_account_code, gr_ir_account_code: familyAccounting.gr_ir_account_code, amount: Number(row.qty_returned) * Number(line.unit_cost), description: `Devolucion ${po.number} - ${item.code} ${line.description}` });
    }
    const originalReceipt = await tx.cntCabdoc.findFirst({ where: { reference: po.number, document_type: "EM", is_reversal: false }, orderBy: { posting_date: "desc" } });
    const accountingDocument = await accountingService.createGoodsReceiptDocumentTx(tx, tenantId, userId, {
      posting_date: new Date(), reference: po.number, header_text: `Devolucion de mercancia ${po.number}`,
      society_code: po.metadata?.society_code, branch_code: po.metadata?.branch_code, cost_center_code: po.metadata?.cost_center_code,
      party_id: po.party_id, party_tax_id: po.party?.tax_id, transaction_id: po.id, lines: accountingLines,
      is_reversal: true, referenced_document_id: originalReceipt?.id || null
    });
    await tx.transaction.update({ where: { id: po.id }, data: { status: "partial" } });
    return { purchase_order_id: po.id, returned_value: accountingLines.reduce((sum, line) => sum + line.amount, 0), returned_lines: rows.length, accounting_document: accountingDocument };
  }));
}

async function annulPurchaseInvoice(tenantId, userId, documentId, data) {
  const document = await prisma.runWithTenant(tenantId, () => prisma.cxpCabdoc.findFirst({ where: { id: Number(documentId) } }));
  if (!document) throw appError(404, "PAYABLE_DOCUMENT_NOT_FOUND", "Factura de compra no encontrada");
  const result = await accountingService.annulPayableDocument(tenantId, userId, document.id, data);
  await prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const controls = await tx.purchaseOrderInvoiceLine.findMany({ where: { cxp_cabdoc_id: document.id } });
    for (const row of controls) await tx.purchaseOrderInvoiceLine.create({ data: { purchase_order_id: row.purchase_order_id, purchase_order_line_id: row.purchase_order_line_id, cxp_cabdoc_id: document.id, item_id: row.item_id, document_kind: row.document_kind === "invoice" ? "credit_note" : "invoice", qty: row.qty, unit_cost: row.unit_cost, amount: row.amount, created_by: userId || null } });
    for (const poId of [...new Set(controls.map((row) => row.purchase_order_id))]) {
      const po = await tx.transaction.findUnique({ where: { id: poId } });
      await tx.transaction.update({ where: { id: poId }, data: { metadata: { ...(po.metadata || {}), invoice_status: "open", last_annulled_invoice: { cxp_id: document.id, at: new Date().toISOString(), by: userId || null } } } });
    }
  }));
  return result;
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

function purchaseOrderClosureState(lines, movements) {
  const orderedQuantity = lines.reduce((sum, line) => sum + Number(line.qty), 0);
  const receivedQuantity = Math.max(0, movements.reduce((sum, move) => sum + (move.type === "in" ? 1 : move.type === "out" ? -1 : 0) * Number(move.qty), 0));
  return { orderedQuantity, receivedQuantity, pendingQuantity: Math.max(0, orderedQuantity - receivedQuantity) };
}

async function closePurchaseOrder(tenantId, userId, poId, data) {
  const reason = String(data?.reason || "").trim();
  if (reason.length < 3) throw appError(400, "CLOSE_REASON_REQUIRED", "Indica el motivo del cierre de la orden");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const po = await tx.transaction.findFirst({
      where: { id: poId, type: "purchase" },
      include: { lines: true, movements: true, party: true }
    });
    if (!po) throw appError(404, "NOT_FOUND", "OC no encontrada");
    if (!["confirmed", "partial"].includes(po.status)) {
      throw appError(422, "ORDER_NOT_CLOSABLE", "Solo se pueden cerrar ordenes aprobadas o parcialmente recibidas");
    }
    const { orderedQuantity, receivedQuantity, pendingQuantity } = purchaseOrderClosureState(po.lines, po.movements);
    if (pendingQuantity <= 0) {
      throw appError(422, "ORDER_FULLY_RECEIVED", "La orden ya fue recibida en su totalidad y no requiere cierre manual");
    }
    const now = new Date().toISOString();
    return tx.transaction.update({
      where: { id: po.id },
      data: {
        status: "closed",
        metadata: {
          ...(po.metadata || {}),
          manual_closure: {
            reason,
            closed_by: userId || null,
            closed_at: now,
            previous_status: po.status,
            ordered_quantity: orderedQuantity,
            received_quantity: receivedQuantity,
            unreceived_quantity: pendingQuantity
          }
        }
      },
      include: { lines: true, party: true, movements: true }
    });
  }));
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
    const enriched = await enrichPurchaseOrder(po);
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

async function listSuppliers(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const suppliers = await prisma.party.findMany({
      where: { active: true, AND: [partyRoleWhere("supplier")] },
      orderBy: { name: "asc" },
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 100), 200)
    });
    const orders = await prisma.transaction.findMany({
      where: { type: "purchase", party_id: { in: suppliers.map((supplier) => supplier.id) } },
      orderBy: { created_at: "desc" },
      take: 500,
      include: { lines: true, movements: true }
    });
    const ordersBySupplier = new Map();
    for (const order of await Promise.all(orders.map(enrichPurchaseOrder))) {
      const list = ordersBySupplier.get(order.party_id) || [];
      list.push(order);
      ordersBySupplier.set(order.party_id, list);
    }
    return suppliers.map((supplier) => enrichSupplier(presentPartyForRole(supplier, "supplier"), ordersBySupplier.get(supplier.id) || []));
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
      last_order_at: orders[0]?.created_at || null,
      last_order_number: orders[0]?.number || null
    },
    recent_orders: orders.slice(0, 6)
  };
}

async function listPurchaseOrders(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const orders = await prisma.transaction.findMany({
      where: { type: "purchase" },
      orderBy: { created_at: "desc" },
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 100), 200),
      include: { party: true, lines: true, movements: { include: { item: true } } }
    });
    const documents = orders.length ? await prisma.cntCabdoc.findMany({
      where: { document_type: "EM", reference: { in: orders.map((order) => order.number) } },
      include: { lines: { orderBy: { line_no: "asc" } } },
      orderBy: { posting_date: "desc" }
    }) : [];
    const userIds = [...new Set(documents.map((document) => document.created_by).filter(Boolean))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    const documentsByOrder = new Map();
    for (const document of documents) {
      const current = documentsByOrder.get(document.reference) || [];
      current.push({ ...document, operation_type: document.is_reversal ? "return" : "receipt", created_by_user: document.created_by ? userById.get(document.created_by) || null : null });
      documentsByOrder.set(document.reference, current);
    }
    const enriched = await Promise.all(orders.map(enrichPurchaseOrder));
    return enriched.map((order) => {
      const receiptDocuments = documentsByOrder.get(order.number) || [];
      const orderedDocuments = [...receiptDocuments].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const previousByOperation = { receipt: 0, return: 0 };
      for (const document of orderedDocuments) {
        const operation = document.operation_type;
        const upperBound = new Date(document.created_at).getTime() + 1000;
        const lowerBound = previousByOperation[operation];
        document.operational_lines = (order.movements || [])
          .filter((movement) => {
            const movementTime = new Date(movement.created_at).getTime();
            const isOperation = operation === "return"
              ? movement.type === "out" && (movement.source_type === "purchase_return" || !movement.source_type)
              : movement.type === "in" && (movement.source_type === "purchase_order_receipt" || !movement.source_type);
            return isOperation && movementTime > lowerBound && movementTime <= upperBound;
          })
          .map((movement) => ({
            movement_id: movement.id,
            purchase_order_line_id: movement.purchase_order_line_id,
            sku: movement.item?.code || String(movement.item_id),
            description: movement.item?.name || "Producto",
            qty: Number(movement.qty),
            unit: movement.item?.unit || "UND",
            cost: Number(movement.cost || 0)
          }));
        previousByOperation[operation] = upperBound;
      }
      return { ...order, receipt_accounting_documents: receiptDocuments };
    });
  });
}

async function listOpenPurchaseOrders(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const supplierId = Number(query.supplier_id);
    if (!supplierId) throw appError(400, "REQUIRED_SUPPLIER", "Seleccione un proveedor para buscar ordenes abiertas");
    const search = String(query.search || "").trim().toUpperCase();
    const orders = await prisma.transaction.findMany({
      where: {
        type: "purchase",
        party_id: supplierId,
        status: { notIn: ["closed", "cancelled"] },
        ...(search ? { number: { contains: search } } : {})
      },
      orderBy: { created_at: "desc" },
      take: Math.min(Number(query.limit || 100), 200),
      include: { party: true, lines: true, movements: true }
    });
    const enriched = await Promise.all(orders.map(enrichPurchaseOrder));
    return enriched
      .map((order) => ({ ...order, lines: order.lines.filter((line) => Number(line.pending_invoice_quantity || 0) > 0) }))
      .filter((order) => order.lines.length > 0);
  });
}

async function preparePurchaseInvoiceAccounting(tx, data) {
  const documentKind = data.document_kind === "credit_note" ? "credit_note" : "invoice";
  const isCreditNote = documentKind === "credit_note";
  const supplier = await tx.party.findFirst({ where: { id: Number(data.supplier_id), active: true, AND: [partyRoleWhere("supplier")] } });
  if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado");
  const location = data.with_purchase_order ? null : await tx.location.findFirst({ where: { id: Number(data.location_id), active: true }, include: { place: true } });
  if (!data.with_purchase_order && !location) throw appError(404, "LOCATION_NOT_FOUND", "Seleccione una bodega/ubicacion activa para afectar inventario");
  let po = null;
  if (data.with_purchase_order) {
    po = await tx.transaction.findFirst({
      where: {
        id: Number(data.purchase_order_id) || undefined,
        number: data.purchase_order_id ? undefined : String(data.purchase_order_reference || "").trim().toUpperCase(),
        type: "purchase",
        party_id: supplier.id,
        status: { notIn: ["closed", "cancelled"] }
      },
      include: { lines: true }
    });
    if (!po) throw appError(404, "PURCHASE_ORDER_NOT_FOUND", "Orden de compra abierta no encontrada para este proveedor");
  }

  const payableLines = [];
  const stockUpdates = [];
  const poInvoiceControls = [];
  for (const [index, line] of data.lines.entries()) {
    const item = await tx.item.findFirst({ where: { id: Number(line.item_id), active: true }, include: { family: { include: { accounting: true } } } });
    if (!item) throw appError(404, "ITEM_NOT_FOUND", `Producto ${line.item_id} no encontrado`);
    if (!item.family?.accounting) throw appError(400, "FAMILY_ACCOUNTING_NOT_FOUND", `El producto ${item.code} no tiene familia con configuracion contable`);
    const qty = Number(line.qty || 0);
    const unitCost = Number(line.unit_cost || 0);
    if (qty <= 0 || unitCost < 0) throw appError(400, "INVALID_LINE", "Cantidad y costo unitario deben ser validos");
    if (isCreditNote && !data.with_purchase_order) {
      if (Number(item.stock_current || 0) - qty < -0.0001) throw appError(422, "INSUFFICIENT_STOCK", `Stock insuficiente para ${item.code}`);
      const stockAtLocation = await tx.itemLocation.findFirst({ where: { item_id: item.id, location_id: location.id } });
      if (!stockAtLocation || Number(stockAtLocation.qty || 0) < qty) throw appError(422, "INSUFFICIENT_LOCATION_STOCK", `Stock insuficiente en ${location.code} para ${item.code}`);
    }
    if (po) {
      if (!line.purchase_order_line_id) throw appError(400, "REQUIRED_PO_LINE", `La linea ${index + 1} debe venir de la orden de compra`);
      const poLine = po.lines.find((row) => row.id === Number(line.purchase_order_line_id));
      if (!poLine || poLine.item_id !== item.id) throw appError(400, "INVALID_PO_LINE", `La linea ${index + 1} no pertenece a la orden seleccionada`);
      const controls = await tx.purchaseOrderInvoiceLine.findMany({ where: { purchase_order_line_id: poLine.id } });
      const alreadyInvoiced = controls.reduce((sum, row) => sum + (row.document_kind === "credit_note" ? -Number(row.qty) : Number(row.qty)), 0);
      const available = isCreditNote ? alreadyInvoiced : Number(poLine.qty) - alreadyInvoiced;
      if (qty > available + 0.0001) {
        throw appError(422, "EXCEEDS_PO_INVOICE_PENDING", `${isCreditNote ? "La nota supera lo facturado" : "La factura supera el pendiente por facturar"} en ${poLine.description} (${available})`);
      }
      poInvoiceControls.push({ poLine, item, qty, unitCost, amount: Math.round(qty * unitCost * 100) / 100 });
    }
    const accountCode = data.with_purchase_order ? item.family.accounting.gr_ir_account_code : item.family.accounting.goods_receipt_account_code;
    const description = String(line.description || `${item.code} ${item.name}`).trim();
    payableLines.push({
      account_code: accountCode,
      branch_code: data.branch_code,
      cost_center_code: data.cost_center_code,
      movement: isCreditNote ? "credit" : "debit",
      vat_code: String(line.vat_code || "").trim().toUpperCase(),
      description,
      amount: Math.round(qty * unitCost * 100) / 100
    });
    if (!data.with_purchase_order) stockUpdates.push({ item, qty, unitCost, description });
  }

  return { documentKind, isCreditNote, supplier, location, po, payableLines, stockUpdates, poInvoiceControls };
}

function purchaseInvoicePayablePayload(data, prepared) {
  return {
    document_kind: prepared.documentKind,
    source_module: "purchases",
    posting_date: data.posting_date,
    due_term: data.due_term,
    due_date: data.due_date,
    supplier_reference: data.supplier_reference,
    header_text: data.header_text,
    supplier_id: prepared.supplier.id,
    referenced_invoice_id: data.referenced_invoice_id,
    invoice_reference: data.invoice_reference,
    society_code: data.society_code,
    associated_account_code: data.associated_account_code,
    retentions: data.retentions,
    lines: prepared.payableLines
  };
}

async function simulatePurchaseInvoice(tenantId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const prepared = await preparePurchaseInvoiceAccounting(prisma, data);
    return accountingService.simulatePayableDocument(tenantId, purchaseInvoicePayablePayload(data, prepared));
  });
}

async function createPurchaseInvoice(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const prepared = await preparePurchaseInvoiceAccounting(tx, data);
    const { documentKind, isCreditNote, location, po, stockUpdates, poInvoiceControls } = prepared;
    const payableLines = [];
    payableLines.push(...prepared.payableLines);

    const cxp = await accountingService.createPayableDocumentTx(tx, tenantId, userId, purchaseInvoicePayablePayload(data, { ...prepared, payableLines }));

    for (const row of poInvoiceControls) {
      await tx.purchaseOrderInvoiceLine.create({
        data: {
          purchase_order_id: po.id,
          purchase_order_line_id: row.poLine.id,
          cxp_cabdoc_id: cxp.id,
          item_id: row.item.id,
          document_kind: documentKind,
          qty: row.qty,
          unit_cost: row.unitCost,
          amount: row.amount,
          created_by: userId || null
        }
      });
    }

    for (const [stockIndex, row] of stockUpdates.entries()) {
      await inventoryService.stockMoveTx(tx, tenantId, userId, {
        item_id: row.item.id,
        type: isCreditNote ? "out" : "in",
        qty: row.qty,
        from_location_id: isCreditNote ? location.id : null,
        to_location_id: isCreditNote ? null : location.id,
        cost: row.unitCost,
        source_type: isCreditNote ? "purchase_credit_note" : "purchase_invoice",
        source_id: cxp.id,
        idempotency_key: `purchase-document:${cxp.id}:line:${stockIndex + 1}`,
        reason: `${isCreditNote ? "Nota credito compra" : "Factura compra"} ${cxp.number}`
      });
    }

    if (po) {
      const controls = await tx.purchaseOrderInvoiceLine.findMany({ where: { purchase_order_id: po.id } });
      const invoicedByLine = new Map();
      for (const control of controls) {
        const sign = control.document_kind === "credit_note" ? -1 : 1;
        invoicedByLine.set(control.purchase_order_line_id, (invoicedByLine.get(control.purchase_order_line_id) || 0) + sign * Number(control.qty));
      }
      const fullyInvoiced = po.lines.every((line) => (invoicedByLine.get(line.id) || 0) >= Number(line.qty) - 0.0001);
      await tx.transaction.update({
        where: { id: po.id },
        data: {
          metadata: {
            ...(po.metadata || {}),
            invoice_status: fullyInvoiced ? "fully_invoiced" : "partially_invoiced",
            last_purchase_invoice: { cxp_id: cxp.id, number: cxp.number, supplier_reference: data.supplier_reference, document_kind: documentKind, created_at: new Date().toISOString() }
          }
        }
      });
    }

    return { ...cxp, purchase_order: po ? { id: po.id, number: po.number } : null };
  }));
}

module.exports = {
  listSuppliers,
  getSupplier,
  updateSupplier,
  listPurchaseOrders,
  listOpenPurchaseOrders,
  getPurchaseOrder,
  getPurchaseOrderPrintData,
  createSupplier,
  createPurchaseOrder,
  updatePurchaseOrder,
  simulatePurchaseInvoice,
  createPurchaseInvoice,
  annulPurchaseInvoice,
  purchaseReceiptLineState,
  allocateImportCosts,
  receivePurchaseOrder,
  returnPurchaseOrder,
  updatePOStatus,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  purchaseOrderClosureState,
  duplicatePurchaseOrder,
  createReceiptFromPurchaseOrder,
  listPurchaseOrderReceipts,
  listPurchaseImports,
  getPurchaseImport,
  createPurchaseImport,
  addPurchaseImportCost,
  confirmPurchaseImportCosts,
  listImportInvoiceableCosts,
  linkImportCostInvoice,
  adjustImportCostVariance,
  checkVMIAlerts
};
