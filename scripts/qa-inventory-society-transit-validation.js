process.env.REDIS_DISABLED = "true";
const assert = require("node:assert/strict");
const prisma = require("../apps/api/src/core/prisma");
const inventory = require("../apps/api/src/modules/inventory/service");

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error("QA requiere una empresa");
  const tenantId = tenant.id;
  const fixture = await prisma.runWithTenant(tenantId, async () => {
    const user = await prisma.user.findFirst();
    const stock = await prisma.itemLocation.findFirst({ where: { qty: { gt: 0 }, location: { place: { type: "warehouse", active: true } } }, include: { item: true, location: { include: { place: true } } } });
    return { user, stock };
  });
  if (!fixture.user || !fixture.stock?.location?.place?.society_code) throw new Error("QA requiere usuario y stock en una bodega con sociedad");
  const origin = fixture.stock.location.place;
  const initialOriginQty = Number(fixture.stock.qty);
  const initialItemStock = Number(fixture.stock.item.stock_current);
  const initialValuation = await prisma.runWithTenant(tenantId, () => inventory.getSocietyValuationTx(prisma, origin.society_code, fixture.stock.item_id));
  let destinationPlaceId; let destinationLocationId; let transferId; let transitLocationId;
  try {
    const destination = await prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
      const place = await tx.place.create({ data: { type: "warehouse", code: `QA-DEST-${Date.now()}`, name: "QA Destino transito", society_code: origin.society_code, branch_code: origin.branch_code, cost_center_code: origin.cost_center_code, active: true } });
      const location = await tx.location.create({ data: { place_id: place.id, code: "GEN", active: true } });
      return { place, location };
    }));
    destinationPlaceId = destination.place.id; destinationLocationId = destination.location.id;
    const created = await inventory.createWarehouseTransfer(tenantId, fixture.user.id, { origin_place_id: origin.id, destination_place_id: destinationPlaceId, reason: "QA transito completo", idempotency_key: `qa-transfer-${Date.now()}`, lines: [{ item_id: fixture.stock.item_id, qty: Math.min(1, initialOriginQty) }] });
    transferId = created.id;
    assert.equal(created.status, "draft");
    const dispatched = await inventory.dispatchWarehouseTransfer(tenantId, fixture.user.id, transferId);
    transitLocationId = dispatched.transit_location_id;
    assert.equal(dispatched.status, "in_transit");
    const afterDispatch = await prisma.runWithTenant(tenantId, async () => ({
      origin: await prisma.itemLocation.findFirst({ where: { id: fixture.stock.id } }),
      transit: await prisma.itemLocation.findFirst({ where: { item_id: fixture.stock.item_id, location_id: transitLocationId } }),
      item: await prisma.item.findFirst({ where: { id: fixture.stock.item_id } }),
      valuation: await prisma.skuValuation.findFirst({ where: { id: initialValuation.id } })
    }));
    assert.equal(Number(afterDispatch.origin.qty), initialOriginQty - 1);
    assert.equal(Number(afterDispatch.transit.qty), 1);
    assert.equal(Number(afterDispatch.item.stock_current), initialItemStock, "transito conserva inventario global");
    assert.equal(Number(afterDispatch.valuation.value_balance), Number(initialValuation.value_balance), "transito conserva valor global");
    const received = await inventory.receiveWarehouseTransfer(tenantId, fixture.user.id, transferId);
    assert.equal(received.status, "received");
    const afterReceive = await prisma.runWithTenant(tenantId, async () => ({
      transit: await prisma.itemLocation.findFirst({ where: { item_id: fixture.stock.item_id, location_id: transitLocationId } }),
      destination: await prisma.itemLocation.findFirst({ where: { item_id: fixture.stock.item_id, location_id: destinationLocationId } }),
      movements: await prisma.movement.findMany({ where: { source_type: "warehouse_transfer", source_id: transferId } })
    }));
    assert.equal(Number(afterReceive.transit.qty), 0);
    assert.equal(Number(afterReceive.destination.qty), 1);
    assert.deepEqual(afterReceive.movements.map((row) => row.type).sort(), ["transfer_dispatch", "transfer_receive"]);
    await inventory.receiveWarehouseTransfer(tenantId, fixture.user.id, transferId);
    const movementCount = await prisma.runWithTenant(tenantId, () => prisma.movement.count({ where: { source_type: "warehouse_transfer", source_id: transferId } }));
    assert.equal(movementCount, 2, "el reintento no duplica movimientos");
    console.log("QA OK: costo por sociedad conservado, despacho a transito, descarga completa e idempotencia.");
  } finally {
    await prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
      if (transferId) await tx.movement.deleteMany({ where: { source_type: "warehouse_transfer", source_id: transferId } });
      if (transferId) await tx.warehouseTransfer.deleteMany({ where: { id: transferId } });
      if (destinationLocationId) await tx.itemLocation.deleteMany({ where: { location_id: destinationLocationId } });
      if (transitLocationId) await tx.itemLocation.deleteMany({ where: { location_id: transitLocationId, item_id: fixture.stock.item_id } });
      await tx.itemLocation.update({ where: { id: fixture.stock.id }, data: { qty: initialOriginQty } });
      if (destinationLocationId) await tx.location.deleteMany({ where: { id: destinationLocationId } });
      if (destinationPlaceId) await tx.place.deleteMany({ where: { id: destinationPlaceId } });
    }));
    await prisma.$disconnect();
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
