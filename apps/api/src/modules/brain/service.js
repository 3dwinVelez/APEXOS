const prisma = require("../../core/prisma");
const { partyRoleWhere } = require("../parties/roles");

const MODULE_LABELS = {
  ecosystem: "Ecosistema",
  inventory: "Inventario",
  purchases: "Compras",
  wms: "WMS",
  sales: "Ventas",
  invoicing: "Facturacion",
  finance: "Finanzas",
  platform: "Plataforma"
};

function can(user, module, action = "read") {
  const role = user.role;
  if (!role) return false;
  if (role.name === "APEX_ADMIN") return true;
  return (role.permissions || []).some((permission) => {
    const moduleOk = permission.module === module || permission.module === "*";
    const actionOk = permission.action === action || permission.action === "*";
    return moduleOk && actionOk;
  });
}

function toNumber(value) {
  return Number(value || 0);
}

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function money(value, currency = "USD") {
  return { value: Number(value.toFixed(2)), currency };
}

function sanitizeEvent(event) {
  return {
    ...event,
    id: event.id.toString(),
    created_at: event.created_at?.toISOString?.() || event.created_at
  };
}

function openTransaction(transaction) {
  return !["received", "closed", "cancelled", "canceled", "void", "paid"].includes(transaction.status);
}

function buildInsight({ id, module, severity = "info", title, summary, why, impact, action, href, confidence = 0.78, data = {} }) {
  return {
    id,
    module,
    module_label: MODULE_LABELS[module] || module,
    severity,
    title,
    summary,
    why,
    impact,
    recommended_action: action,
    href,
    confidence,
    data,
    source: "APEX AI Core",
    created_at: new Date().toISOString()
  };
}

async function buildSnapshot(tenantId, user) {
  return prisma.runWithTenant(tenantId, async () => {
    const includeFinance = can(user, "accounting", "read") || can(user, "finance", "read");
    const [
      tenant,
      items,
      suppliers,
      customers,
      purchases,
      sales,
      invoices,
      locations,
      itemLocations,
      auditCount,
      recentEvents,
      ledgerCount
    ] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, country: true, timezone: true, currency: true, plan: true } }),
      prisma.item.findMany({ select: { id: true, code: true, name: true, type: true, unit_cost: true, unit_price: true, stock_current: true, stock_min: true, stock_max: true, abc_class: true, metadata: true, active: true } }),
      prisma.party.findMany({ where: partyRoleWhere("supplier"), select: { id: true, name: true, tax_id: true, tax_type: true, email: true, country: true, rating: true, metadata: true } }),
      prisma.party.count({ where: partyRoleWhere("customer") }),
      prisma.transaction.findMany({ where: { type: "purchase" }, include: { party: true, lines: true, movements: true }, orderBy: { created_at: "desc" }, take: 120 }),
      prisma.transaction.findMany({ where: { type: "sale" }, include: { lines: true }, orderBy: { created_at: "desc" }, take: 120 }),
      prisma.transaction.findMany({ where: { type: "invoice" }, select: { id: true, number: true, status: true, due_date: true, total: true, balance: true, currency: true }, orderBy: { created_at: "desc" }, take: 120 }),
      prisma.location.findMany({ where: { active: true }, select: { id: true, code: true, zone: true, abc_class: true, capacity_kg: true } }),
      prisma.itemLocation.findMany({ where: { qty: { gt: 0 } }, select: { location_id: true, qty: true, cost: true } }),
      prisma.auditLog.count(),
      prisma.brainEvent.findMany({ orderBy: { created_at: "desc" }, take: 8 }),
      includeFinance ? prisma.ledgerEntry.count() : Promise.resolve(null)
    ]);

    const currency = tenant.currency || purchases[0].currency || invoices[0].currency || "USD";
    const stockItems = items.filter((item) => item.active && item.type !== "service");
    const lowStockItems = stockItems.filter((item) => toNumber(item.stock_min) > 0 && toNumber(item.stock_current) <= toNumber(item.stock_min));
    const overstockItems = stockItems.filter((item) => item.stock_max != null && toNumber(item.stock_current) > toNumber(item.stock_max));
    const criticalItems = lowStockItems.filter((item) => item.abc_class === "A");
    const stockValue = stockItems.reduce((sum, item) => sum + toNumber(item.stock_current) * toNumber(item.unit_cost), 0);
    const openPurchases = purchases.filter(openTransaction);
    const latePurchases = openPurchases.filter((po) => po.due_date && daysUntil(po.due_date) < 0);
    const approvedPurchases = openPurchases.filter((po) => ["approved", "partially_received", "partial"].includes(po.status));
    const incompleteSuppliers = suppliers.filter((supplier) => !supplier.tax_id || !supplier.email || !supplier.country);
    const overdueInvoices = invoices.filter((invoice) => toNumber(invoice.balance) > 0 && invoice.due_date && daysUntil(invoice.due_date) < 0);
    const occupiedLocations = new Set(itemLocations.map((row) => row.location_id));
    const occupancyRate = locations.length ? occupiedLocations.size / locations.length : 0;
    const productMasterGaps = stockItems.filter((item) => !item.metadata.country_scope && !item.metadata.tax_profile && !item.metadata.wms_profile);

    return {
      tenant: tenant || { id: tenantId, name: "Tenant activo", currency },
      permissions: {
        finance: includeFinance,
        inventory: can(user, "inventory", "read"),
        purchases: can(user, "purchases", "read"),
        sales: can(user, "sales", "read"),
        brain_write: can(user, "brain", "write")
      },
      totals: {
        items: stockItems.length,
        suppliers: suppliers.length,
        customers,
        purchase_orders: purchases.length,
        open_purchase_orders: openPurchases.length,
        approved_purchase_orders: approvedPurchases.length,
        sales_orders: sales.length,
        invoices: invoices.length,
        locations: locations.length,
        occupied_locations: occupiedLocations.size,
        audit_events: auditCount,
        ledger_entries: ledgerCount
      },
      inventory: {
        low_stock_count: lowStockItems.length,
        overstock_count: overstockItems.length,
        critical_count: criticalItems.length,
        master_gap_count: productMasterGaps.length,
        stock_value: includeFinance ? money(stockValue, currency) : null,
        low_stock_items: lowStockItems.slice(0, 8).map((item) => ({ id: item.id, code: item.code, name: item.name, stock_current: item.stock_current, stock_min: item.stock_min, abc_class: item.abc_class })),
        overstock_items: overstockItems.slice(0, 8).map((item) => ({ id: item.id, code: item.code, name: item.name, stock_current: item.stock_current, stock_max: item.stock_max }))
      },
      purchases: {
        open_count: openPurchases.length,
        late_count: latePurchases.length,
        approved_count: approvedPurchases.length,
        late_orders: latePurchases.slice(0, 8).map((po) => ({ id: po.id, number: po.number, supplier: po.party.name, status: po.status, due_in_days: daysUntil(po.due_date) })),
        pending_receipt_count: approvedPurchases.length
      },
      suppliers: {
        incomplete_count: incompleteSuppliers.length,
        incomplete: incompleteSuppliers.slice(0, 8).map((supplier) => ({ id: supplier.id, name: supplier.name, missing: ["tax_id", "email", "country"].filter((field) => !supplier[field]) }))
      },
      sales: {
        open_count: sales.filter(openTransaction).length
      },
      invoicing: {
        overdue_count: includeFinance ? overdueInvoices.length : null,
        overdue_balance: includeFinance ? money(overdueInvoices.reduce((sum, invoice) => sum + toNumber(invoice.balance), 0), currency) : null
      },
      wms: {
        location_count: locations.length,
        occupied_locations: occupiedLocations.size,
        occupancy_rate: Number((occupancyRate * 100).toFixed(1))
      },
      ai: {
        recent_events: recentEvents.map(sanitizeEvent)
      }
    };
  });
}

function buildInsightsFromSnapshot(snapshot, query = {}) {
  const insights = [];
  const moduleFilter = query.module;

  if (snapshot.inventory.critical_count > 0) {
    insights.push(buildInsight({
      id: "inventory-critical-low-stock",
      module: "inventory",
      severity: "critical",
      title: `${snapshot.inventory.critical_count} SKU criticos en minimo`,
      summary: "Hay productos clase A que ya estan en minimo o por debajo del minimo.",
      why: "Los SKU clase A suelen impactar ventas, produccion o despacho con mayor velocidad.",
      impact: "Riesgo de quiebre operativo y compras urgentes.",
      action: "Generar sugerencia de compra o revisar stock critico",
      href: "/dashboard/inventario/reportes",
      confidence: 0.91,
      data: { items: snapshot.inventory.low_stock_items }
    }));
  } else if (snapshot.inventory.low_stock_count > 0) {
    insights.push(buildInsight({
      id: "inventory-low-stock",
      module: "inventory",
      severity: "warning",
      title: `${snapshot.inventory.low_stock_count} SKU requieren reposicion`,
      summary: "El inventario tiene articulos por debajo del punto minimo configurado.",
      why: "APEX cruza stock actual contra stock minimo para reducir quiebres.",
      impact: "Puede afectar promesas de venta, picking o produccion.",
      action: "Revisar abastecimiento sugerido",
      href: "/dashboard/inventario/reportes",
      data: { items: snapshot.inventory.low_stock_items }
    }));
  }

  if (snapshot.inventory.overstock_count > 0) {
    insights.push(buildInsight({
      id: "inventory-overstock",
      module: "inventory",
      severity: "info",
      title: `${snapshot.inventory.overstock_count} SKU sobre maximo`,
      summary: "Hay productos con stock por encima del maximo operativo.",
      why: "El exceso inmoviliza capital y ocupa ubicaciones WMS.",
      impact: "Oportunidad de liberar espacio, promocionar o ajustar compras.",
      action: "Analizar exceso y rotacion",
      href: "/dashboard/inventario/reportes",
      data: { items: snapshot.inventory.overstock_items }
    }));
  }

  if (snapshot.inventory.master_gap_count > 0) {
    insights.push(buildInsight({
      id: "product-master-gaps",
      module: "inventory",
      severity: "warning",
      title: `${snapshot.inventory.master_gap_count} productos sin perfil transversal`,
      summary: "Faltan datos de alcance LATAM, impuestos o perfil WMS en parte del maestro.",
      why: "El producto debe operar igual de bien en compras, ventas, inventario, WMS y finanzas.",
      impact: "Menos automatizacion y mayor riesgo de captura manual.",
      action: "Completar producto maestro inteligente",
      href: "/dashboard/inventario/productos/nuevo"
    }));
  }

  if (snapshot.purchases.late_count > 0) {
    insights.push(buildInsight({
      id: "purchases-late",
      module: "purchases",
      severity: "critical",
      title: `${snapshot.purchases.late_count} OC abiertas estan retrasadas`,
      summary: "Compras tiene ordenes con fecha esperada vencida.",
      why: "La recepcion WMS y la disponibilidad futura dependen de estas OC.",
      impact: "Riesgo de abastecimiento, tareas WMS sin preparar y promesas incumplidas.",
      action: "Contactar proveedor o reprogramar entrega",
      href: "/dashboard/compras/ordenes/nueva",
      confidence: 0.89,
      data: { orders: snapshot.purchases.late_orders }
    }));
  } else if (snapshot.purchases.pending_receipt_count > 0) {
    insights.push(buildInsight({
      id: "purchases-ready-for-wms",
      module: "purchases",
      severity: "info",
      title: `${snapshot.purchases.pending_receipt_count} OC listas para WMS`,
      summary: "Existen ordenes aprobadas que pueden alimentar recepcion, putaway y control de diferencias.",
      why: "APEX conecta compras con InboundOrder para que WMS consuma la OC directamente.",
      impact: "Mejor trazabilidad entre abastecimiento, inventario y logistica.",
      action: "Crear o revisar recepciones",
      href: "/dashboard/compras/ordenes/recibir"
    }));
  }

  if (snapshot.suppliers.incomplete_count > 0) {
    insights.push(buildInsight({
      id: "suppliers-master-data",
      module: "purchases",
      severity: "warning",
      title: `${snapshot.suppliers.incomplete_count} proveedores incompletos`,
      summary: "Hay proveedores sin datos fiscales, correo o pais.",
      why: "En LATAM los datos fiscales y pais afectan impuestos, moneda, documentos y aprobaciones.",
      impact: "Puede frenar OC, facturacion recibida o integraciones futuras.",
      action: "Depurar maestro de proveedores",
      href: "/dashboard/compras/proveedores",
      data: { suppliers: snapshot.suppliers.incomplete }
    }));
  }

  if (snapshot.wms.location_count === 0) {
    insights.push(buildInsight({
      id: "wms-no-locations",
      module: "wms",
      severity: "warning",
      title: "WMS aun no tiene ubicaciones fisicas",
      summary: "No hay ubicaciones configuradas para recepcion, almacenamiento o picking.",
      why: "La cuadricula inteligente necesita casillas fisicas para guiar al usuario sin consultores.",
      impact: "Recepcion y putaway no podran ser completamente trazables.",
      action: "Abrir layout 2D y crear ubicaciones",
      href: "/dashboard/inventario/wms"
    }));
  } else if (snapshot.wms.occupancy_rate > 85) {
    insights.push(buildInsight({
      id: "wms-high-occupancy",
      module: "wms",
      severity: "warning",
      title: `Ocupacion WMS al ${snapshot.wms.occupancy_rate}%`,
      summary: "La bodega esta cerca del limite de ubicaciones ocupadas.",
      why: "La saturacion aumenta recorridos, errores de putaway y demoras de picking.",
      impact: "Riesgo de congestion operativa.",
      action: "Revisar redistribucion de ubicaciones",
      href: "/dashboard/inventario/wms"
    }));
  }

  if (snapshot.permissions.finance && snapshot.invoicing.overdue_count > 0) {
    insights.push(buildInsight({
      id: "finance-overdue-invoices",
      module: "finance",
      severity: "warning",
      title: `${snapshot.invoicing.overdue_count} facturas vencidas`,
      summary: `Saldo vencido estimado ${snapshot.invoicing.overdue_balance.value} ${snapshot.invoicing.overdue_balance.currency}.`,
      why: "La IA solo muestra esta senal a usuarios con permiso financiero.",
      impact: "Afecta cartera, flujo de caja y decisiones de despacho.",
      action: "Revisar cartera y recordatorios",
      href: "/dashboard/cartera"
    }));
  }

  insights.push(buildInsight({
    id: "ai-core-ecosystem",
    module: "platform",
    severity: "success",
    title: "APEX AI Core activo sobre el ecosistema",
    summary: "La capa cognitiva ya observa inventario, compras, proveedores, WMS, ventas, facturacion y finanzas segun permisos.",
    why: "APEXOS debe aprender, ensenar y recomendar desde los datos reales del tenant.",
    impact: "Base lista para copilotos por modulo, automatizaciones y memoria empresarial.",
    action: "Ver tablero de inteligencia",
    href: "/dashboard/apex-ai",
    confidence: 0.95
  }));

  const filtered = moduleFilter ? insights.filter((insight) => insight.module === moduleFilter || (moduleFilter === "compras" && insight.module === "purchases") || (moduleFilter === "inventario" && insight.module === "inventory")) : insights;
  const severityRank = { critical: 0, warning: 1, info: 2, success: 3 };
  return filtered.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
}

function healthScore(insights) {
  const penalties = insights.reduce((sum, insight) => {
    if (insight.severity === "critical") return sum + 18;
    if (insight.severity === "warning") return sum + 9;
    if (insight.severity === "info") return sum + 3;
    return sum;
  }, 0);
  return Math.max(40, Math.min(100, 100 - penalties));
}

async function getEcosystem(tenantId, user) {
  const snapshot = await buildSnapshot(tenantId, user);
  const insights = buildInsightsFromSnapshot(snapshot);
  return {
    snapshot,
    health_score: healthScore(insights),
    insight_count: insights.length,
    critical_count: insights.filter((insight) => insight.severity === "critical").length,
    generated_at: new Date().toISOString()
  };
}

async function listInsights(tenantId, user, query = {}) {
  const snapshot = await buildSnapshot(tenantId, user);
  const insights = buildInsightsFromSnapshot(snapshot, query);
  const limit = Math.min(Number(query.limit || 12), 25);
  return {
    data: insights.slice(0, limit),
    health_score: healthScore(insights),
    snapshot_summary: {
      tenant: snapshot.tenant.name,
      country: snapshot.tenant.country,
      currency: snapshot.tenant.currency,
      totals: snapshot.totals,
      permissions: snapshot.permissions
    },
    generated_at: new Date().toISOString()
  };
}

function mentorFor(module, insights) {
  const copy = {
    inventory: {
      title: "Mentor de inventario",
      message: "Empieza por el maestro de productos, minimos, ABC y ubicaciones. APEX puede sugerir compras cuando el stock y la demanda lo justifican.",
      steps: ["Completar datos transversales del producto", "Revisar SKU en minimo", "Conectar ubicaciones WMS"]
    },
    purchases: {
      title: "Mentor de compras",
      message: "La OC debe ser el origen operativo: proveedor, productos, costos, aprobacion y recepcion WMS en un solo flujo.",
      steps: ["Crear OC en menos de 2 minutos", "Aprobar para generar InboundOrder", "Recibir parcial y auditar diferencias"]
    },
    wms: {
      title: "Mentor WMS",
      message: "El layout 2D debe funcionar como LEGO: cada casilla representa una ubicacion fisica facil de configurar y localizar.",
      steps: ["Crear zonas", "Asignar ubicaciones por ABC", "Usar la OC aprobada para recepcion"]
    },
    finance: {
      title: "Mentor financiero",
      message: "APEX AI separa datos operativos de datos financieros y solo muestra saldos, costos o cartera a usuarios autorizados.",
      steps: ["Revisar vencimientos", "Validar moneda por pais", "Conectar facturas y pagos"]
    },
    platform: {
      title: "Mentor APEXOS",
      message: "La IA interna observa todo el ecosistema y convierte datos en acciones simples, trazables y auditables.",
      steps: ["Revisar alertas", "Aceptar recomendaciones utiles", "Convertir recomendaciones en tareas"]
    }
  };
  const normalized = module === "inventario" ? "inventory" : module === "compras" ? "purchases" : module || "platform";
  const mentor = copy[normalized] || copy.platform;
  return {
    module: normalized,
    ...mentor,
    priority_insights: insights.filter((insight) => insight.module === normalized || normalized === "platform").slice(0, 3)
  };
}

async function getMentor(tenantId, user, query = {}) {
  const snapshot = await buildSnapshot(tenantId, user);
  const insights = buildInsightsFromSnapshot(snapshot);
  return mentorFor(query.module, insights);
}

async function runRecommendations(tenantId, user, query = {}) {
  const snapshot = await buildSnapshot(tenantId, user);
  const insights = buildInsightsFromSnapshot(snapshot, query).slice(0, 12);
  const created = await prisma.runWithTenant(tenantId, async () => {
    const rows = [];
    for (const insight of insights) {
      const event = await prisma.brainEvent.create({
        data: {
          type: "ai_recommendation",
          module: insight.module,
          context: {
            source: "APEX AI Core",
            severity: insight.severity,
            confidence: insight.confidence,
            tenant_country: snapshot.tenant.country,
            tenant_currency: snapshot.tenant.currency
          },
          suggestion: insight
        }
      });
      rows.push(sanitizeEvent(event));
    }
    return rows;
  });
  return { created, count: created.length };
}

async function previewAction(tenantId, user, input) {
  const snapshot = await buildSnapshot(tenantId, user);
  const previews = {
    create_purchase_order: {
      allowed: can(user, "purchases", "write"),
      title: "Borrador de orden de compra sugerida",
      effects: ["No crea la OC todavia", "Usa productos criticos de inventario", "Requiere proveedor, costos y confirmacion"],
      next_endpoint: "POST /purchase-orders"
    },
    create_cycle_count: {
      allowed: can(user, "inventory", "write"),
      title: "Conteo ciclico sugerido",
      effects: ["Prioriza SKU criticos o ubicaciones congestionadas", "No ajusta stock automaticamente", "Requiere aprobacion operativa"],
      next_endpoint: "POST /inventory/movements"
    },
    open_wms_layout: {
      allowed: can(user, "inventory", "read"),
      title: "Abrir layout WMS 2D",
      effects: ["Permite configurar ubicaciones fisicas", "Mejora recepcion, putaway y picking"],
      href: "/dashboard/inventario/wms"
    }
  };
  const preview = previews[input.action] || {
    allowed: false,
    title: "Accion no registrada",
    effects: ["APEX AI Core puede previsualizar acciones antes de ejecutarlas con permisos y auditoria."]
  };
  return {
    action: input.action,
    module: input.module,
    allowed: preview.allowed,
    preview,
    context: {
      tenant: snapshot.tenant.name,
      low_stock_count: snapshot.inventory.low_stock_count,
      open_purchase_orders: snapshot.purchases.open_count
    }
  };
}

async function listEvents(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const page = Number(query.page || 1);
    const pageSize = Math.min(Number(query.page_size || 25), 100);
    const [data, total] = await Promise.all([
      prisma.brainEvent.findMany({
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.brainEvent.count()
    ]);
    return { data: data.map(sanitizeEvent), total, page, pages: Math.ceil(total / pageSize) };
  });
}

async function feedback(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const event = await prisma.brainEvent.update({
      where: { id: BigInt(input.event_id) },
      data: { accepted: input.accepted, feedback: input.feedback }
    });
    return sanitizeEvent(event);
  });
}

module.exports = {
  getEcosystem,
  listInsights,
  getMentor,
  runRecommendations,
  previewAction,
  listEvents,
  feedback
};
