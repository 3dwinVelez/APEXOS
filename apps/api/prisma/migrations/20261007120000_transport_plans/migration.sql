-- CreateTable
CREATE TABLE "TransportPlan" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin_id" INTEGER NOT NULL,
    "service_level" TEXT NOT NULL DEFAULT 'normal',
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportPlan_tenant_id_code_key" ON "TransportPlan"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "TransportPlan_tenant_id_status_due_date_idx" ON "TransportPlan"("tenant_id", "status", "due_date");

-- AddForeignKey
ALTER TABLE "TransportPlan" ADD CONSTRAINT "TransportPlan_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "TransportOrigin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TransportNeed" ADD COLUMN "plan_id" INTEGER;

-- CreateIndex
CREATE INDEX "TransportNeed_tenant_id_plan_id_idx" ON "TransportNeed"("tenant_id", "plan_id");

-- AddForeignKey
ALTER TABLE "TransportNeed" ADD CONSTRAINT "TransportNeed_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "TransportPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
