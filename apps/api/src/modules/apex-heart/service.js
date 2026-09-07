const crypto = require("node:crypto");
const prisma = require("../../core/prisma");
const { emailQueue } = require("../../fabric/queues");

const DEFAULT_CONFIG = {
  annual_financing_rate: 14.42,
  lost_portfolio_rate: 5,
  holding_rate: 25,
  order_cost: 50000,
  lead_time_days: 14,
  safety_stock_days: 1,
  inventory_target_days: 60,
  alert_email_enabled: true,
  alert_in_app_enabled: true,
  recipients: ["owner", "admin"]
};

const DEFAULT_RULES = [
  { code: "margin_low", name: "Margen bruto bajo", metric: "gross_margin_pct", operator: "lt", warning_threshold: 25, critical_threshold: 15, action_label: "Revisar rentabilidad", action_href: "/dashboard/reportes/apex-heart?view=abc" },
  { code: "overdue_high", name: "Cartera vencida alta", metric: "overdue_ratio_pct", operator: "gt", warning_threshold: 15, critical_threshold: 30, action_label: "Gestionar cartera", action_href: "/dashboard/cxc/reportes/cartera" },
  { code: "inventory_days_high", name: "Inventario inmovilizado", metric: "inventory_days", operator: "gt", warning_threshold: 75, critical_threshold: 120, action_label: "Revisar inventario", action_href: "/dashboard/inventario/reportes" },
  { code: "gmroi_low", name: "Retorno de inventario bajo", metric: "gmroi", operator: "lt", warning_threshold: 1.5, critical_threshold: 0.75, action_label: "Analizar productos", action_href: "/dashboard/reportes/apex-heart?view=abc" },
  { code: "cash_cycle_high", name: "Ciclo de caja extendido", metric: "cash_cycle_days", operator: "gt", warning_threshold: 60, critical_threshold: 100, action_label: "Revisar flujo", action_href: "/dashboard/reportes/apex-heart?view=cash" },
  { code: "excess_inventory_high", name: "Exceso de inventario", metric: "excess_inventory_pct", operator: "gt", warning_threshold: 20, critical_threshold: 35, action_label: "Liberar capital", action_href: "/dashboard/inventario/reportes" }
];

function n(value) { return Number(value) || 0; }
function round(value, digits = 2) { const factor = 10 ** digits; return Math.round(n(value) * factor) / factor; }
function ratio(a, b, scale = 100) { return b ? round((a / b) * scale) : 0; }
function startOfDay(value) { const date = value ? new Date(value) : new Date(); date.setHours(0, 0, 0, 0); return date; }
function endOfDay(value) { const date = value ? new Date(value) : new Date(); date.setHours(23, 59, 59, 999); return date; }
function recipientRoleFilters(recipients = []) {
  const aliases = { owner: ["APEX_ADMIN", "Propietario"], admin: ["Administrador de empresa", "APEX_ADMIN"] };
  return [...new Set(recipients.flatMap((recipient) => aliases[String(recipient).toLowerCase()] || [recipient]))]
    .filter(Boolean)
    .map((name) => ({ name: { contains: String(name), mode: "insensitive" } }));
}

function classifyProducts(lines, inventoryByItem, days) {
  const products = new Map();
  for (const line of lines) {
    if (!line.item_id) continue;
    const current = products.get(line.item_id) || {
      item_id: line.item_id,
      code: line.item?.code || "",
      name: line.item?.name || line.description,
      category: line.item?.category?.name || line.item?.family?.name || "Sin categoría",
      revenue: 0, gross_profit: 0, cost: 0, units: 0
    };
    current.revenue += n(line.subtotal || line.total);
    current.cost += n(line.cost_value);
    current.gross_profit = current.revenue - current.cost;
    current.units += n(line.qty);
    products.set(line.item_id, current);
  }
  const rows = [...products.values()].map((row) => {
    const inv = inventoryByItem.get(row.item_id) || { quantity: 0, value: 0 };
    const gmroi = inv.value > 0 ? row.gross_profit / inv.value : (row.cost > 0 ? row.gross_profit / row.cost : 0);
    const inventoryDays = row.cost > 0 ? inv.value * days / row.cost : (inv.value > 0 ? 999 : 0);
    return { ...row, inventory_quantity: round(inv.quantity), inventory_value: round(inv.value), margin_pct: ratio(row.gross_profit, row.revenue), gmroi: round(gmroi), inventory_days: round(inventoryDays) };
  }).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  let cumulative = 0;
  return rows.map((row, index) => {
    cumulative += row.revenue;
    const cumulativePct = ratio(cumulative, totalRevenue);
    const abc_class = cumulativePct <= 80 ? "A" : cumulativePct <= 95 ? "B" : "C";
    const revenueRank = rows.length > 1 ? 1 - index / (rows.length - 1) : 1;
    const profitRank = [...rows].sort((a, b) => b.gross_profit - a.gross_profit).findIndex((item) => item.item_id === row.item_id);
    const gmroiRank = [...rows].sort((a, b) => b.gmroi - a.gmroi).findIndex((item) => item.item_id === row.item_id);
    const percentile = (rank) => rows.length > 1 ? 1 - rank / (rows.length - 1) : 1;
    return { ...row, revenue: round(row.revenue), cost: round(row.cost), gross_profit: round(row.gross_profit), revenue_share_pct: ratio(row.revenue, totalRevenue), cumulative_pct: cumulativePct, abc_class, score: round((percentile(profitRank) * .4 + revenueRank * .35 + percentile(gmroiRank) * .25) * 3) };
  });
}

function evaluateRules(metrics, rules) {
  return rules.filter((rule) => rule.enabled !== false).flatMap((rule) => {
    const value = n(metrics[rule.metric]);
    const critical = rule.operator === "lt" ? value < n(rule.critical_threshold) : value > n(rule.critical_threshold);
    const warning = rule.operator === "lt" ? value < n(rule.warning_threshold) : value > n(rule.warning_threshold);
    if (!critical && !warning) return [];
    const severity = critical ? "critical" : "warning";
    const threshold = critical ? n(rule.critical_threshold) : n(rule.warning_threshold);
    return [{ rule_id: rule.id, code: rule.code, metric: rule.metric, metric_value: round(value), threshold, severity, title: rule.name, message: `${rule.name}: ${round(value)} frente al umbral ${threshold}.`, action_label: rule.action_label, action_href: rule.action_href }];
  });
}

async function ensureDefaults(tenantId) {
  const config = await prisma.apexHeartConfig.upsert({ where: { tenant_id: tenantId }, update: {}, create: { tenant_id: tenantId, ...DEFAULT_CONFIG } });
  const count = await prisma.apexHeartAlertRule.count({ where: { tenant_id: tenantId } });
  if (!count) await prisma.apexHeartAlertRule.createMany({ data: DEFAULT_RULES.map((rule) => ({ tenant_id: tenantId, ...rule })) });
  const rules = await prisma.apexHeartAlertRule.findMany({ where: { tenant_id: tenantId }, orderBy: { id: "asc" } });
  return { config, rules };
}

async function buildDashboard(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const to = endOfDay(query.to);
    const from = startOfDay(query.from || new Date(to.getFullYear(), to.getMonth() - 11, 1));
    if (from > to) throw Object.assign(new Error("El periodo inicial no puede ser posterior al final"), { statusCode: 400 });
    const days = Math.max(1, Math.ceil((to - from) / 86400000) + 1);
    const { config, rules } = await ensureDefaults(tenantId);
    const [invoices, items, receivables, payables, snapshots, openAlerts] = await Promise.all([
      prisma.salesInvoice.findMany({ where: { date: { gte: from, lte: to }, is_cancelled: false, is_reversal: false, document_kind: "invoice", status: { notIn: ["draft", "cancelled", "annulled"] } }, include: { lines: { include: { item: { include: { category: true, family: true } } } } }, orderBy: { date: "asc" } }),
      prisma.item.findMany({ where: { active: true, type: { in: ["product", "item", "producto"] } }, include: { category: true, family: true } }),
      prisma.cxcCabdoc.findMany({ where: { document_kind: "invoice", balance: { gt: .01 }, status: { notIn: ["cancelled", "annulled"] } } }),
      prisma.cxpCabdoc.findMany({ where: { document_kind: "invoice", posting_date: { gte: from, lte: to }, status: { notIn: ["cancelled", "annulled"] } } }),
      prisma.apexHeartInventorySnapshot.findMany({ where: { snapshot_date: { gte: from, lte: to } }, orderBy: { snapshot_date: "asc" } }),
      prisma.apexHeartAlert.findMany({ where: { status: "open" }, orderBy: [{ severity: "asc" }, { detected_at: "desc" }], take: 30 })
    ]);
    const lines = invoices.flatMap((invoice) => invoice.lines);
    const inventoryByItem = new Map(items.map((item) => [item.id, { quantity: n(item.stock_current), value: n(item.stock_current) * n(item.unit_cost) }]));
    const products = classifyProducts(lines, inventoryByItem, days);
    const revenue = lines.reduce((sum, line) => sum + n(line.subtotal || line.total), 0);
    const cogs = lines.reduce((sum, line) => sum + n(line.cost_value), 0);
    const grossProfit = revenue - cogs;
    const inventoryValue = [...inventoryByItem.values()].reduce((sum, item) => sum + item.value, 0);
    const inventoryQuantity = [...inventoryByItem.values()].reduce((sum, item) => sum + item.quantity, 0);
    const averageInventory = snapshots.length ? snapshots.reduce((sum, row) => sum + n(row.value), 0) / new Set(snapshots.map((row) => row.snapshot_date.toISOString().slice(0, 10))).size : inventoryValue;
    const receivable = receivables.reduce((sum, doc) => sum + n(doc.balance), 0);
    const overdue = receivables.filter((doc) => new Date(doc.due_date) < to).reduce((sum, doc) => sum + n(doc.balance), 0);
    const purchases = payables.reduce((sum, doc) => sum + n(doc.total), 0);
    const payableBalance = payables.reduce((sum, doc) => sum + n(doc.balance), 0);
    const inventoryDays = cogs ? averageInventory * days / cogs : (inventoryValue ? 999 : 0);
    const receivableDays = revenue ? receivable * days / revenue : 0;
    const payableDays = purchases ? payableBalance * days / purchases : 0;
    const cashCycle = Math.max(0, inventoryDays + receivableDays - payableDays);
    const targetValue = inventoryDays > 0 ? inventoryValue * n(config.inventory_target_days) / inventoryDays : inventoryValue;
    const excessInventory = Math.max(0, inventoryValue - targetValue);
    const cashEffort = excessInventory + receivable;
    const financingCost = cashEffort * (Math.pow(1 + n(config.annual_financing_rate) / 100, cashCycle / 365) - 1);
    const metrics = {
      revenue: round(revenue), gross_profit: round(grossProfit), gross_margin_pct: ratio(grossProfit, revenue), cogs: round(cogs), units_sold: round(lines.reduce((sum, line) => sum + n(line.qty), 0)),
      inventory_quantity: round(inventoryQuantity), inventory_value: round(inventoryValue), average_inventory_value: round(averageInventory), inventory_days: round(inventoryDays), gmroi: round(averageInventory ? grossProfit / averageInventory : 0),
      purchases: round(purchases), payable_balance: round(payableBalance), receivable_balance: round(receivable), overdue_balance: round(overdue), overdue_ratio_pct: ratio(overdue, receivable), receivable_days: round(receivableDays), payable_days: round(payableDays),
      cash_cycle_days: round(cashCycle), excess_inventory_value: round(excessInventory), excess_inventory_pct: ratio(excessInventory, inventoryValue), cash_effort: round(cashEffort), financing_cost: round(financingCost), economic_net_margin: round(grossProfit - financingCost)
    };
    const monthly = new Map();
    for (const invoice of invoices) {
      const period = invoice.date.toISOString().slice(0, 7);
      const row = monthly.get(period) || { period, revenue: 0, gross_profit: 0 };
      for (const line of invoice.lines) { row.revenue += n(line.subtotal || line.total); row.gross_profit += n(line.subtotal || line.total) - n(line.cost_value); }
      monthly.set(period, row);
    }
    return { period: { from: from.toISOString(), to: to.toISOString(), days }, data_status: { invoices: invoices.length, products: items.length, receivables: receivables.length, payables: payables.length, inventory_snapshots: snapshots.length, freshness: new Date().toISOString() }, metrics, products: products.slice(0, Number(query.limit) || 100), monthly: [...monthly.values()].map((row) => ({ ...row, revenue: round(row.revenue), gross_profit: round(row.gross_profit), margin_pct: ratio(row.gross_profit, row.revenue) })), rules, computed_alerts: evaluateRules(metrics, rules), alerts: openAlerts, config };
  });
}

async function updateConfig(tenantId, data) {
  const allowed = ["annual_financing_rate", "lost_portfolio_rate", "holding_rate", "order_cost", "lead_time_days", "safety_stock_days", "inventory_target_days", "alert_email_enabled", "alert_in_app_enabled", "recipients"];
  const clean = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
  return prisma.runWithTenant(tenantId, () => prisma.apexHeartConfig.upsert({ where: { tenant_id: tenantId }, create: { tenant_id: tenantId, ...DEFAULT_CONFIG, ...clean }, update: clean }));
}

async function saveRule(tenantId, userId, data, id) {
  const allowed = ["code", "name", "description", "metric", "operator", "warning_threshold", "critical_threshold", "severity", "enabled", "cooldown_hours", "action_label", "action_href", "recipients"];
  const clean = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
  return prisma.runWithTenant(tenantId, async () => {
    if (!id) return prisma.apexHeartAlertRule.create({ data: { ...clean, tenant_id: tenantId, created_by: userId || null } });
    const existing = await prisma.apexHeartAlertRule.findFirst({ where: { id: Number(id) } });
    if (!existing) throw Object.assign(new Error("Regla Apex Heart no encontrada"), { statusCode: 404 });
    return prisma.apexHeartAlertRule.update({ where: { id: existing.id }, data: clean });
  });
}

async function evaluateAndPersistAlerts(tenantId, query = {}) {
  const dashboard = await buildDashboard(tenantId, query);
  return prisma.runWithTenant(tenantId, async () => {
    const results = [];
    let notificationsQueued = 0;
    for (const alert of dashboard.computed_alerts) {
      const rule = dashboard.rules.find((candidate) => candidate.id === alert.rule_id);
      const cooldownMs = Math.max(1, n(rule?.cooldown_hours || 24)) * 3600000;
      const recent = await prisma.apexHeartAlert.findFirst({ where: { rule_id: alert.rule_id, detected_at: { gte: new Date(Date.now() - cooldownMs) } }, orderBy: { detected_at: "desc" } });
      const { code: _code, ...record } = alert;
      if (recent) {
        results.push(await prisma.apexHeartAlert.update({ where: { id: recent.id }, data: { metric_value: alert.metric_value, threshold: alert.threshold, severity: alert.severity, message: alert.message } }));
        continue;
      }
      const fingerprint = crypto.createHash("sha256").update(`${tenantId}:${alert.code}:${Date.now()}`).digest("hex");
      const created = await prisma.apexHeartAlert.create({ data: { tenant_id: tenantId, fingerprint, ...record } });
      results.push(created);
      if (dashboard.config.alert_email_enabled) {
        const roleNames = Array.isArray(rule?.recipients) && rule.recipients.length ? rule.recipients : dashboard.config.recipients;
        const roleFilters = recipientRoleFilters(roleNames);
        const users = roleFilters.length ? await prisma.user.findMany({ where: { active: true, role: { OR: roleFilters } }, select: { email: true } }) : [];
        const to = [...new Set(users.map((user) => user.email).filter(Boolean))];
        if (to.length) {
          await emailQueue.add("apex-heart-alert", { tenant_id: tenantId, to, subject: `[Apex Heart] ${alert.title}`, text: `${alert.message}\nAcción: ${alert.action_label || "Abrir Apex Heart"}`, html: `<h2>${alert.title}</h2><p>${alert.message}</p><p><strong>Acción:</strong> ${alert.action_label || "Abrir Apex Heart"}</p>` }, { jobId: `apex-heart-${created.id}` });
          notificationsQueued += 1;
        }
      }
    }
    return { evaluated_at: new Date().toISOString(), created_or_updated: results.length, notifications_queued: notificationsQueued, alerts: results };
  });
}

async function captureInventorySnapshot(tenantId, at = new Date()) {
  return prisma.runWithTenant(tenantId, async () => {
    const snapshotDate = startOfDay(at);
    const items = await prisma.item.findMany({ where: { active: true, type: { in: ["product", "item", "producto"] } }, select: { id: true, stock_current: true, unit_cost: true } });
    for (const item of items) {
      const quantity = n(item.stock_current);
      await prisma.apexHeartInventorySnapshot.upsert({
        where: { tenant_id_snapshot_date_item_id: { tenant_id: tenantId, snapshot_date: snapshotDate, item_id: item.id } },
        update: { quantity, unit_cost: n(item.unit_cost), value: quantity * n(item.unit_cost) },
        create: { tenant_id: tenantId, snapshot_date: snapshotDate, item_id: item.id, quantity, unit_cost: n(item.unit_cost), value: quantity * n(item.unit_cost) }
      });
    }
    return items.length;
  });
}

async function refreshAllTenants() {
  const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true } });
  const results = [];
  for (const tenant of tenants) {
    const snapshots = await captureInventorySnapshot(tenant.id);
    const alerts = await evaluateAndPersistAlerts(tenant.id);
    results.push({ tenant_id: tenant.id, snapshots, alerts: alerts.created_or_updated });
  }
  return results;
}

async function acknowledgeAlert(tenantId, userId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const alert = await prisma.apexHeartAlert.findFirst({ where: { id: Number(id) } });
    if (!alert) throw Object.assign(new Error("Alerta Apex Heart no encontrada"), { statusCode: 404 });
    return prisma.apexHeartAlert.update({ where: { id: alert.id }, data: { status: "acknowledged", acknowledged_at: new Date(), acknowledged_by: userId || null } });
  });
}

module.exports = { DEFAULT_CONFIG, DEFAULT_RULES, classifyProducts, evaluateRules, buildDashboard, updateConfig, saveRule, evaluateAndPersistAlerts, acknowledgeAlert, captureInventorySnapshot, refreshAllTenants };
