CREATE TABLE "ServiceOrderItem" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "order_id" INTEGER NOT NULL,
  "reference_id" INTEGER NOT NULL,
  "service_type" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "description" TEXT,
  "observation" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pendiente',
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceOrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ServiceIncident" ADD COLUMN "item_id" INTEGER;
ALTER TABLE "ServicePhoto" ADD COLUMN "item_id" INTEGER;

CREATE UNIQUE INDEX "ServiceOrderItem_tenant_order_idempotency_key" ON "ServiceOrderItem"("tenant_id", "order_id", "idempotency_key");
CREATE INDEX "ServiceOrderItem_tenant_order_display_idx" ON "ServiceOrderItem"("tenant_id", "order_id", "display_order");
CREATE INDEX "ServiceOrderItem_tenant_order_status_idx" ON "ServiceOrderItem"("tenant_id", "order_id", "status");
CREATE INDEX "ServiceOrderItem_tenant_reference_idx" ON "ServiceOrderItem"("tenant_id", "reference_id");
CREATE INDEX "ServiceIncident_tenant_order_item_idx" ON "ServiceIncident"("tenant_id", "order_id", "item_id");
CREATE INDEX "ServicePhoto_tenant_order_item_active_idx" ON "ServicePhoto"("tenant_id", "order_id", "item_id", "active");

ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "ServiceReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceIncident" ADD CONSTRAINT "ServiceIncident_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ServiceOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServicePhoto" ADD CONSTRAINT "ServicePhoto_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ServiceOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
