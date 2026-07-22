const assert = require("node:assert/strict");
const prisma = require("../apps/api/src/core/prisma");
const accounting = require("../apps/api/src/modules/accounting/service");
const purchases = require("../apps/api/src/modules/purchases/service");

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { created_at: "asc" } });
  if (!tenant) throw new Error("QA requiere al menos una empresa");
  const tenantId = tenant.id;
  const fixture = await prisma.runWithTenant(tenantId, async () => {
    const [user, supplier, item, warehouse, location] = await Promise.all([
      prisma.user.findFirst(), prisma.party.findFirst({ where: { type: "supplier", active: true } }),
      prisma.item.findFirst({ where: { active: true } }), prisma.place.findFirst({ where: { type: "warehouse", active: true } }),
      prisma.location.findFirst({ where: { active: true } })
    ]);
    return { user, supplier, item, warehouse, location };
  });
  for (const [name, value] of Object.entries(fixture)) if (!value) throw new Error(`QA requiere fixture ${name}`);
  const originalMetadata = fixture.supplier.metadata || {};
  const initialItem = { stock_current: fixture.item.stock_current, unit_cost: fixture.item.unit_cost };
  const initialLocation = await prisma.runWithTenant(tenantId, () => prisma.itemLocation.findFirst({ where: { item_id: fixture.item.id, location_id: fixture.location.id, lot: null } }));
  const initialValuation = await prisma.runWithTenant(tenantId, () => prisma.skuValuation.findFirst({ where: { society_code: fixture.item.society_code || fixture.location.society_code || "SOC-01", item_id: fixture.item.id } }));
  let payableId = null; let poId = null;
  try {
    await accounting.initChartOfAccounts(tenantId);
    const masters = await accounting.getRetentionMasters(tenantId);
    assert.deepEqual(new Set(masters.map((row) => row.type)), new Set(["retefuente", "reteiva", "reteica"]));
    await accounting.saveSupplierRetentions(tenantId, fixture.supplier.id, { retention_codes: masters.map((row) => row.code) });
    const inherited = await accounting.getSupplierRetentions(tenantId, fixture.supplier.id);
    assert.equal(inherited.retentions.length, 3, "el proveedor hereda tres retenciones");

    const tree = await accounting.getOrganizationTree(tenantId);
    const society = tree.societies.find((row) => row.active !== false);
    const branch = tree.branches.find((row) => row.active !== false && row.society_code === society.code);
    const costCenter = tree.cost_centers.find((row) => row.active !== false && row.society_code === society.code && row.branch_code === branch.code);
    const vat = (await accounting.getVatMasters(tenantId)).find((row) => row.code === "COMPRAS-19");
    const ref = `QA-${Date.now()}`;
    const payload = { document_kind: "invoice", source_module: "purchases", posting_date: new Date().toISOString(), due_term: "AP30", supplier_reference: ref, header_text: "QA retenciones parametrizables", supplier_id: fixture.supplier.id, society_code: society.code, associated_account_code: "2205", lines: [{ account_code: "1435", branch_code: branch.code, cost_center_code: costCenter.code, movement: "debit", vat_code: vat.code, description: "QA impuesto y retenciones", amount: 100000 }], retentions: masters.map((row) => ({ code: row.code })) };
    const simulation = await accounting.simulatePayableDocument(tenantId, payload);
    assert.equal(simulation.gross_total, 119000);
    assert.equal(simulation.retention_total, 6316);
    assert.equal(simulation.total, 112684);
    assert.equal(simulation.totals.debit, simulation.totals.credit);

    const payable = await accounting.createPayableDocument(tenantId, fixture.user.id, payload);
    payableId = payable.id;
    const stored = await prisma.runWithTenant(tenantId, () => prisma.cxpCabdoc.findUnique({ where: { id: payable.id } }));
    assert.equal(stored.retention_total, 6316);
    const cntLines = await prisma.runWithTenant(tenantId, () => prisma.cntCuedoc.findMany({ where: { cabdoc_id: stored.accounting_document_id } }));
    assert.ok(cntLines.some((line) => line.tax_type === "iva" && line.tax_base === 100000));
    assert.equal(cntLines.filter((line) => ["retefuente", "reteiva", "reteica"].includes(line.tax_type)).length, 3);
    const annulled = await accounting.annulPayableDocument(tenantId, fixture.user.id, payable.id, { reason: "QA automatizada" });
    const originalCnt = await prisma.runWithTenant(tenantId, () => prisma.cntCabdoc.findUnique({ where: { id: stored.accounting_document_id } }));
    assert.equal(originalCnt.is_cancelled, true); assert.equal(originalCnt.cancelled_by, fixture.user.id);
    assert.equal(annulled.reversal_document.is_reversal, true); assert.equal(annulled.reversal_document.reversed_document_id, originalCnt.id);

    const po = await purchases.createPurchaseOrder(tenantId, fixture.user.id, { supplier_id: fixture.supplier.id, warehouse_id: fixture.warehouse.id, currency: "COP", lines: [{ item_id: fixture.item.id, qty: 1, unit_cost: Number(fixture.item.unit_cost || 1000), tax_rate: 0 }] });
    poId = po.id;
    await purchases.updatePOStatus(tenantId, fixture.user.id, po.id, "sent");
    await purchases.updatePOStatus(tenantId, fixture.user.id, po.id, "confirmed");
    await purchases.receivePurchaseOrder(tenantId, fixture.user.id, po.id, { received_lines: [{ line_id: po.lines[0].id, qty_received: 1, location_id: fixture.location.id }] });
    await purchases.returnPurchaseOrder(tenantId, fixture.user.id, po.id, { reason: "QA devolucion", returned_lines: [{ line_id: po.lines[0].id, qty_returned: 1, location_id: fixture.location.id }] });
    const enriched = await purchases.getPurchaseOrder(tenantId, po.id);
    assert.equal(enriched.lines[0].received_quantity, 0, "la devolucion reabre la cantidad recibible");
    const tracedMoves = await prisma.runWithTenant(tenantId, () => prisma.movement.findMany({ where: { transaction_id: po.id } }));
    assert.ok(tracedMoves.every((move) => move.purchase_order_line_id === po.lines[0].id));
    console.log("QA OK: maestros, herencia, calculo, persistencia fiscal, reversion auditada, reapertura y devolucion.");
  } finally {
    await prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
      if (poId) {
        await tx.ledgerEntry.deleteMany({ where: { transaction_id: poId } });
        await tx.productCost.deleteMany({ where: { source_id: poId, source_type: { in: ["movement", "purchase_order_receipt", "purchase_return"] } } });
        await tx.movement.deleteMany({ where: { transaction_id: poId } });
        await tx.transactionLine.deleteMany({ where: { transaction_id: poId } });
        await tx.transaction.deleteMany({ where: { id: poId } });
        await tx.item.update({ where: { id: fixture.item.id }, data: initialItem });
        if (initialValuation) await tx.skuValuation.update({ where: { id: initialValuation.id }, data: { quantity_balance: initialValuation.quantity_balance, value_balance: initialValuation.value_balance, average_cost: initialValuation.average_cost, version: initialValuation.version } });
        const currentLocation = await tx.itemLocation.findFirst({ where: { item_id: fixture.item.id, location_id: fixture.location.id, lot: null } });
        if (initialLocation && currentLocation) await tx.itemLocation.update({ where: { id: currentLocation.id }, data: { qty: initialLocation.qty, cost: initialLocation.cost } });
        else if (!initialLocation && currentLocation) await tx.itemLocation.delete({ where: { id: currentLocation.id } });
      }
      if (payableId) {
        const cxp = await tx.cxpCabdoc.findUnique({ where: { id: payableId } });
        const cnts = await tx.cntCabdoc.findMany({ where: { OR: [{ id: cxp?.accounting_document_id || -1 }, { reversed_document_id: cxp?.accounting_document_id || -1 }] }, include: { lines: true } });
        await tx.ledgerEntry.deleteMany({ where: { id: { in: cnts.flatMap((doc) => doc.lines.map((line) => line.ledger_entry_id).filter(Boolean)) } } });
        await tx.cntCabdoc.deleteMany({ where: { id: { in: cnts.map((doc) => doc.id) } } });
        await tx.cxpCabdoc.deleteMany({ where: { id: payableId } });
      }
      await tx.party.update({ where: { id: fixture.supplier.id }, data: { metadata: originalMetadata } });
    }));
    await prisma.$disconnect();
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
