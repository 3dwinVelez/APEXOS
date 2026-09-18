CREATE TABLE "TransportNotification" (
  "id" BIGSERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "channel" TEXT NOT NULL,
  "event_type" TEXT NOT NULL, "recipient" TEXT NOT NULL, "subject" TEXT, "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pendiente', "trip_id" INTEGER, "need_id" INTEGER,
  "attempt_id" INTEGER, "provider_ref" TEXT, "error" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_by" INTEGER, "sent_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "TransportNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TransportNotification_tenant_status_created_idx" ON "TransportNotification"("tenant_id", "status", "created_at" DESC);
CREATE INDEX "TransportNotification_tenant_trip_created_idx" ON "TransportNotification"("tenant_id", "trip_id", "created_at" DESC);
CREATE INDEX "TransportNotification_tenant_need_created_idx" ON "TransportNotification"("tenant_id", "need_id", "created_at" DESC);
