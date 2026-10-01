-- CreateTable
CREATE TABLE "TransportSettlementType" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requires_reinforced_approval" BOOLEAN NOT NULL DEFAULT false,
    "required_documents" JSONB NOT NULL DEFAULT '[]',
    "documentary_policy" TEXT NOT NULL DEFAULT 'alerta',
    "workflow" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlementType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementPeriod" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'abierto',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlementPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementPackage" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "period_id" INTEGER,
    "carrier_id" INTEGER NOT NULL,
    "carrier_code" TEXT,
    "carrier_name" TEXT,
    "type_id" INTEGER,
    "type_code" TEXT NOT NULL DEFAULT 'TRANSPORTADOR',
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "responsible_id" INTEGER,
    "observation" TEXT,
    "calculated_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjusted_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approved_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "accounted_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlementPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementItem" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" INTEGER NOT NULL,
    "guide_reference" TEXT NOT NULL,
    "service" TEXT,
    "route_description" TEXT,
    "origin_name" TEXT,
    "destination_name" TEXT,
    "destination_city" TEXT,
    "vehicle_plate" TEXT,
    "vehicle_type" TEXT,
    "service_level" TEXT,
    "service_date" TIMESTAMP(3),
    "base_type" TEXT NOT NULL DEFAULT 'viaje',
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "distance_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume_m3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stop_count" INTEGER NOT NULL DEFAULT 1,
    "reported_value" DECIMAL(18,2),
    "rate_card_id" INTEGER,
    "rate_code" TEXT,
    "rate_version" INTEGER,
    "rate_base" DECIMAL(18,2),
    "rate_unit_value" DECIMAL(18,4),
    "calculation_trace" JSONB NOT NULL DEFAULT '{}',
    "calculated_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjusted_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approved_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "observation" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementAdjustment" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "before_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "delta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "after_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "support" JSONB NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportSettlementAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementIssue" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'media',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "blocks" TEXT NOT NULL DEFAULT 'ninguna',
    "description" TEXT NOT NULL,
    "responsible_id" INTEGER,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'abierta',
    "resolution" TEXT,
    "support" JSONB NOT NULL DEFAULT '{}',
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER,
    "resolved_by" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlementIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementApproval" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "actor_id" INTEGER,
    "actor_role" TEXT,
    "decision" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportSettlementApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementAccounting" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" INTEGER NOT NULL,
    "reference" TEXT,
    "accounting_period" TEXT,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportSettlementAccounting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportSettlementType_tenant_id_active_idx" ON "TransportSettlementType"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSettlementType_tenant_id_code_key" ON "TransportSettlementType"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "TransportSettlementPeriod_tenant_id_status_idx" ON "TransportSettlementPeriod"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSettlementPeriod_tenant_id_code_key" ON "TransportSettlementPeriod"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "TransportSettlementPackage_tenant_id_status_idx" ON "TransportSettlementPackage"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "TransportSettlementPackage_tenant_id_carrier_id_idx" ON "TransportSettlementPackage"("tenant_id", "carrier_id");

-- CreateIndex
CREATE INDEX "TransportSettlementPackage_tenant_id_period_id_idx" ON "TransportSettlementPackage"("tenant_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSettlementPackage_tenant_id_code_key" ON "TransportSettlementPackage"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "TransportSettlementItem_tenant_id_guide_reference_idx" ON "TransportSettlementItem"("tenant_id", "guide_reference");

-- CreateIndex
CREATE INDEX "TransportSettlementItem_tenant_id_package_id_idx" ON "TransportSettlementItem"("tenant_id", "package_id");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSettlementItem_tenant_id_package_id_guide_referenc_key" ON "TransportSettlementItem"("tenant_id", "package_id", "guide_reference");

-- CreateIndex
CREATE INDEX "TransportSettlementAdjustment_tenant_id_package_id_idx" ON "TransportSettlementAdjustment"("tenant_id", "package_id");

-- CreateIndex
CREATE INDEX "TransportSettlementAdjustment_tenant_id_item_id_idx" ON "TransportSettlementAdjustment"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "TransportSettlementIssue_tenant_id_package_id_status_idx" ON "TransportSettlementIssue"("tenant_id", "package_id", "status");

-- CreateIndex
CREATE INDEX "TransportSettlementApproval_tenant_id_package_id_idx" ON "TransportSettlementApproval"("tenant_id", "package_id");

-- CreateIndex
CREATE INDEX "TransportSettlementAccounting_tenant_id_package_id_idx" ON "TransportSettlementAccounting"("tenant_id", "package_id");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSettlementAccounting_tenant_id_idempotency_key_key" ON "TransportSettlementAccounting"("tenant_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "TransportSettlementPackage" ADD CONSTRAINT "TransportSettlementPackage_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "TransportSettlementPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlementItem" ADD CONSTRAINT "TransportSettlementItem_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "TransportSettlementPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlementAdjustment" ADD CONSTRAINT "TransportSettlementAdjustment_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "TransportSettlementPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlementAdjustment" ADD CONSTRAINT "TransportSettlementAdjustment_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "TransportSettlementItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlementIssue" ADD CONSTRAINT "TransportSettlementIssue_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "TransportSettlementPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlementApproval" ADD CONSTRAINT "TransportSettlementApproval_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "TransportSettlementPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlementAccounting" ADD CONSTRAINT "TransportSettlementAccounting_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "TransportSettlementPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

