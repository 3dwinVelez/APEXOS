const prisma = require("../../core/prisma");
const { hasPartyRole, partyRoleWhere, withPartyRoles, presentPartyForRole } = require("../parties/roles");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function createCustomer(tenantId, userId, data) {
  const {
    name, tax_id, tax_type = "company", email, phone, address, city, country = "CO",
    credit_limit = 0, credit_days = 0, segment = "SMB", metadata = {}
  } = data;
  if (!name.trim()) throw appError(400, "REQUIRED_FIELD", "El nombre es obligatorio");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw appError(400, "INVALID_EMAIL", "Formato de email invalido");
  return prisma.runWithTenant(tenantId, async () => {
    if (tax_id) {
      const existing = await prisma.party.findFirst({ where: { tax_id } });
      if (existing) {
        if (hasPartyRole(existing, "customer")) throw appError(409, "DUPLICATE_TAX_ID", `Ya existe un cliente con el NIT/CC ${tax_id}`);
        const promoted = await prisma.party.update({
          where: { id: existing.id },
          data: {
            metadata: withPartyRoles({ ...(existing.metadata || {}), ...(metadata || {}), customer_credit_limit: credit_limit, customer_credit_days: credit_days }, ["customer"])
          }
        });
        return presentPartyForRole(promoted, "customer");
      }
    }
    return prisma.party.create({
      data: {
        type: "customer",
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
        segment,
        balance: 0,
        active: true,
        metadata: withPartyRoles({ ...metadata, customer_credit_limit: credit_limit, customer_credit_days: credit_days }, ["customer"])
      }
    });
  });
}

async function createSaleOrder(tenantId, userId, data) {
  const { customer_id, lines, notes = null } = data;
  if (!Array.isArray(lines) || lines.length === 0) throw appError(400, "NO_LINES", "La orden debe tener al menos una linea");

  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const party = await tx.party.findFirst({ where: { id: customer_id, active: true, AND: [partyRoleWhere("customer")] } });
    if (!party) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado");
    const customer = presentPartyForRole(party, "customer");

    const enrichedLines = [];
    for (const line of lines) {
      if (!line.qty || line.qty <= 0) throw appError(400, "INVALID_QTY", "La cantidad debe ser mayor a 0");
      const discount = line.discount || 0;
      if (discount < 0 || discount > 100) throw appError(400, "INVALID_DISCOUNT", "El descuento debe estar entre 0 y 100");
      const item = await tx.item.findFirst({ where: { id: line.item_id, active: true } });
      if (!item) throw appError(404, "ITEM_NOT_FOUND", `Item ${line.item_id} no encontrado`);

      const unitPrice = line.unit_price ?? item.unit_price;
      const priceAfterDiscount = unitPrice * (1 - discount / 100);
      const subtotal = Number(line.qty) * Number(priceAfterDiscount);
      const taxAmount = subtotal * (Number(item.tax_rate || 0) / 100);
      enrichedLines.push({
        item_id: item.id,
        description: item.name,
        qty: Number(line.qty),
        unit: item.unit,
        unit_cost: item.unit_cost,
        unit_price: unitPrice,
        discount,
        tax_rate: item.tax_rate || 0,
        tax_amount: taxAmount,
        subtotal,
        total: subtotal + taxAmount,
        metadata: { notes: line.notes || null }
      });
    }

    const subtotal = enrichedLines.reduce((sum, line) => sum + line.subtotal, 0);
    const taxTotal = enrichedLines.reduce((sum, line) => sum + line.tax_amount, 0);
    const total = subtotal + taxTotal;
    const count = await tx.transaction.count({ where: { type: "sale" } });
    const number = `SO-${String(count + 1).padStart(6, "0")}`;
    const warning = customer.credit_limit > 0 && customer.receivable_balance + total > customer.credit_limit
      ? "El cliente superaria su limite de credito"
      : null;

    const order = await tx.transaction.create({
      data: {
        type: "sale",
        number,
        party_id: customer.id,
        status: "draft",
        date: new Date(),
        subtotal,
        tax_total: taxTotal,
        total,
        paid: 0,
        balance: total,
        notes,
        created_by: userId,
        metadata: { warning },
        lines: { create: enrichedLines }
      },
      include: { lines: true, party: true }
    });
    return warning ? { ...order, warning } : order;
  }));
}

async function listCustomers(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const customers = await prisma.party.findMany({
    where: { active: true, AND: [partyRoleWhere("customer")] },
    orderBy: { name: "asc" },
    skip: Math.max(Number(query.offset || 0), 0),
    take: Math.min(Number(query.limit || 100), 200)
    });
    return customers.map((customer) => presentPartyForRole(customer, "customer"));
  });
}

async function listSaleOrders(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, () => prisma.transaction.findMany({
    where: { type: "sale" },
    orderBy: { created_at: "desc" },
    include: { party: true, lines: true },
    skip: Math.max(Number(query.offset || 0), 0),
    take: Math.min(Number(query.limit || 100), 200)
  }));
}

module.exports = { createCustomer, createSaleOrder, listCustomers, listSaleOrders };
