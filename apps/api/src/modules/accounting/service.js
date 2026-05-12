const prisma = require("../../core/prisma");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const PUC_CO = [
  { code: "1105", name: "Caja", type: "asset" },
  { code: "1110", name: "Bancos", type: "asset" },
  { code: "1305", name: "Clientes", type: "asset" },
  { code: "1330", name: "Anticipos y Avances", type: "asset" },
  { code: "1435", name: "Inventarios", type: "asset" },
  { code: "1524", name: "Equipo de Oficina", type: "asset" },
  { code: "1540", name: "Flota y Equipo Transporte", type: "asset" },
  { code: "2105", name: "Obligaciones Financieras", type: "liability" },
  { code: "2205", name: "Proveedores", type: "liability" },
  { code: "2335", name: "Costos y Gastos por Pagar", type: "liability" },
  { code: "2365", name: "Retencion en la Fuente", type: "liability" },
  { code: "2408", name: "IVA por Pagar", type: "liability" },
  { code: "2610", name: "Obligaciones Laborales", type: "liability" },
  { code: "3105", name: "Capital Social", type: "equity" },
  { code: "3605", name: "Utilidad del Ejercicio", type: "equity" },
  { code: "4135", name: "Ingresos por Ventas", type: "income" },
  { code: "4175", name: "Ingresos por Servicios", type: "income" },
  { code: "5105", name: "Costo de Ventas", type: "expense" },
  { code: "5195", name: "Gastos de Inventario", type: "expense" },
  { code: "5205", name: "Sueldos y Salarios", type: "expense" },
  { code: "5210", name: "Horas Extras", type: "expense" },
  { code: "5220", name: "Auxilio de Transporte", type: "expense" },
  { code: "5260", name: "Aportes EPS", type: "expense" },
  { code: "5270", name: "Aportes Pensiones", type: "expense" },
  { code: "5290", name: "Aportes SENA ICBF CCF", type: "expense" },
  { code: "5320", name: "Arrendamientos", type: "expense" },
  { code: "5360", name: "Servicios Publicos", type: "expense" },
  { code: "5395", name: "Otros Gastos", type: "expense" }
];

async function initChartOfAccounts(tenantId, country = "CO") {
  return prisma.runWithTenant(tenantId, async () => {
    const plan = country === "CO" ? PUC_CO : PUC_CO;
    const existing = await prisma.account.findMany({ select: { code: true } });
    const existingCodes = new Set(existing.map((row) => row.code));
    const missing = plan.filter((account) => !existingCodes.has(account.code));
    if (missing.length) {
      await prisma.account.createMany({
        data: missing.map((account) => ({ code: account.code, name: account.name, type: account.type, allows_tx: true, active: true }))
      });
    }
    return prisma.account.findMany({ orderBy: { code: "asc" } });
  });
}

async function journalEntry(tenantId, data) {
  const { description, date = new Date(), transaction_id = null, entries = [] } = data;
  if (!description.trim()) throw appError(400, "REQUIRED_DESCRIPTION", "La descripcion del asiento es obligatoria");
  if (entries.length < 2) throw appError(400, "MIN_ENTRIES", "El asiento requiere al menos dos lineas");

  const totalDebit = entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
  const totalCredit = entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw appError(422, "UNBALANCED_ENTRY", `Partida no cuadra: Debito ${totalDebit.toFixed(2)}, Credito ${totalCredit.toFixed(2)}`);
  }

  const period = new Date(date).toISOString().substring(0, 7);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const created = [];
    for (const entry of entries) {
      const account = await tx.account.findFirst({
        where: { code: { startsWith: String(entry.account) }, active: true }
      });
      if (!account) throw appError(404, "ACCOUNT_NOT_FOUND", `Cuenta ${entry.account} no encontrada`);
      created.push(await tx.ledgerEntry.create({
        data: {
          account_id: account.id,
          transaction_id,
          date: new Date(date),
          debit: entry.debit || 0,
          credit: entry.credit || 0,
          balance: 0,
          description,
          period
        }
      }));
    }
    return created;
  }));
}

async function getBalanceSheet(tenantId, period = null) {
  return prisma.runWithTenant(tenantId, async () => {
    const dateFilter = period ? { lte: new Date(`${period}-31`) } : { lte: new Date() };
    const accounts = await prisma.account.findMany({
      where: { active: true },
      include: { entries: { where: { date: dateFilter } } },
      orderBy: { code: "asc" }
    });

    const grouped = { assets: [], liabilities: [], equity: [], income: [], expense: [] };
    for (const account of accounts) {
      const totalDebit = account.entries.reduce((sum, row) => sum + row.debit, 0);
      const totalCredit = account.entries.reduce((sum, row) => sum + row.credit, 0);
      const debitNature = ["asset", "expense"].includes(account.type);
      const balance = debitNature ? totalDebit - totalCredit : totalCredit - totalDebit;
      if (Math.abs(balance) < 0.0001) continue;
      const key = account.type === "asset" ? "assets"
        : account.type === "liability" ? "liabilities"
          : account.type === "equity" ? "equity"
            : account.type === "income" ? "income" : "expense";
      grouped[key].push({ code: account.code, name: account.name, balance: Math.round(balance * 100) / 100 });
    }

    const sum = (rows) => Math.round(rows.reduce((acc, row) => acc + row.balance, 0) * 100) / 100;
    const totalAssets = sum(grouped.assets);
    const totalLiabilities = sum(grouped.liabilities);
    const totalEquity = sum(grouped.equity);
    return {
      period: period || new Date().toISOString().substring(0, 7),
      assets: { total: totalAssets, accounts: grouped.assets },
      liabilities: { total: totalLiabilities, accounts: grouped.liabilities },
      equity: { total: totalEquity, accounts: grouped.equity },
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) <= 0.01
    };
  });
}

async function getIncomeStatement(tenantId, period) {
  if (!period) throw appError(400, "REQUIRED_PERIOD", "El periodo YYYY-MM es obligatorio");
  return prisma.runWithTenant(tenantId, async () => {
    const dateRange = { gte: new Date(`${period}-01`), lte: new Date(`${period}-31`) };
    const accounts = await prisma.account.findMany({
      where: { active: true, type: { in: ["income", "expense"] } },
      include: { entries: { where: { date: dateRange } } },
      orderBy: { code: "asc" }
    });

    const income = [];
    const cogs = [];
    const opex = [];
    for (const account of accounts) {
      const debit = account.entries.reduce((sum, row) => sum + row.debit, 0);
      const credit = account.entries.reduce((sum, row) => sum + row.credit, 0);
      const balance = account.type === "income" ? credit - debit : debit - credit;
      if (Math.abs(balance) < 0.0001) continue;
      const row = { code: account.code, name: account.name, balance: Math.round(balance * 100) / 100 };
      if (account.type === "income") income.push(row);
      else if (account.code.startsWith("5105") || account.code.startsWith("5195")) cogs.push(row);
      else opex.push(row);
    }

    const totalIncome = income.reduce((sum, row) => sum + row.balance, 0);
    const totalCOGS = cogs.reduce((sum, row) => sum + row.balance, 0);
    const totalOPEX = opex.reduce((sum, row) => sum + row.balance, 0);
    const grossProfit = totalIncome - totalCOGS;
    const operatingProfit = grossProfit - totalOPEX;
    const pct = (n, d) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);

    return {
      period,
      income: { total: Math.round(totalIncome * 100) / 100, accounts: income },
      cogs: { total: Math.round(totalCOGS * 100) / 100, accounts: cogs },
      gross_profit: Math.round(grossProfit * 100) / 100,
      gross_margin_pct: pct(grossProfit, totalIncome),
      operating_expenses: { total: Math.round(totalOPEX * 100) / 100, accounts: opex },
      operating_profit: Math.round(operatingProfit * 100) / 100,
      net_margin_pct: pct(operatingProfit, totalIncome)
    };
  });
}

async function registerPayment(tenantId, userId, data) {
  const { transaction_id = null, party_id = null, type, method, amount, date = new Date(), reference = null, notes = null } = data;
  if (!amount || amount <= 0) throw appError(400, "INVALID_AMOUNT", "El monto debe ser mayor a 0");
  if (!["income", "expense"].includes(type)) throw appError(400, "INVALID_TYPE", "type debe ser income o expense");
  const validMethods = ["cash", "transfer", "card", "check", "other"];
  if (!validMethods.includes(method)) throw appError(400, "INVALID_METHOD", `Metodo invalido. Validos: ${validMethods.join(", ")}`);

  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    if (transaction_id) {
      const transaction = await tx.transaction.findFirst({ where: { id: transaction_id } });
      if (!transaction) throw appError(404, "TRANSACTION_NOT_FOUND", "Documento no encontrado");
      if (amount > transaction.balance) {
        throw appError(422, "EXCEEDS_BALANCE", `El pago supera el saldo pendiente (saldo: ${transaction.balance})`);
      }
      const newBalance = Math.round((transaction.balance - amount) * 100) / 100;
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { paid: { increment: amount }, balance: newBalance, status: newBalance <= 0.01 ? "paid" : transaction.status }
      });
    }

    if (party_id) {
      const party = await tx.party.findFirst({ where: { id: party_id, active: true } });
      if (!party) throw appError(404, "PARTY_NOT_FOUND", "Tercero no encontrado");
      await tx.party.update({ where: { id: party_id }, data: { balance: { decrement: amount } } });
    }

    const payment = await tx.payment.create({
      data: { transaction_id, party_id, type, method, amount, date: new Date(date), reference, notes, created_by: userId }
    });

    await journalEntry(tenantId, {
      description: `Pago ${payment.id}`,
      date,
      transaction_id: transaction_id || null,
      entries: type === "income"
        ? [{ account: "1110", debit: amount, credit: 0 }, { account: "1305", debit: 0, credit: amount }]
        : [{ account: "2205", debit: amount, credit: 0 }, { account: "1110", debit: 0, credit: amount }]
    });

    return payment;
  }));
}

module.exports = {
  initChartOfAccounts,
  journalEntry,
  getBalanceSheet,
  getIncomeStatement,
  registerPayment
};
