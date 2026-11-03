-- APEX Control F0: sistema nervioso y Torre de Control.
-- Registra componentes de infraestructura, muestras de salud, eventos,
-- incidentes, notificaciones y corridas de reportes. El estado de
-- infraestructura es global; las notificaciones pueden ser globales
-- (tenant_id NULL) o por empresa.

CREATE TABLE "apex_components" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "criticality" TEXT NOT NULL DEFAULT 'standard',
    "probe_interval_s" INTEGER NOT NULL DEFAULT 15,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_status" TEXT NOT NULL DEFAULT 'unknown',
    "last_checked_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apex_components_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "apex_components_kind_enabled_idx" ON "apex_components"("kind", "enabled");

CREATE TABLE "apex_health_samples" (
    "id" BIGSERIAL NOT NULL,
    "component_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "error_rate" DOUBLE PRECISION,
    "score" INTEGER,
    "details" JSONB NOT NULL DEFAULT '{}',
    "sampled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apex_health_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "apex_health_samples_component_key_sampled_at_idx" ON "apex_health_samples"("component_key", "sampled_at");
CREATE INDEX "apex_health_samples_sampled_at_idx" ON "apex_health_samples"("sampled_at");

CREATE TABLE "apex_events" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "component_key" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "fingerprint" TEXT NOT NULL,
    "correlation_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apex_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "apex_events_occurred_at_idx" ON "apex_events"("occurred_at");
CREATE INDEX "apex_events_fingerprint_occurred_at_idx" ON "apex_events"("fingerprint", "occurred_at");
CREATE INDEX "apex_events_tenant_id_occurred_at_idx" ON "apex_events"("tenant_id", "occurred_at");

CREATE TABLE "apex_incidents" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT,
    "component_key" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "evidence" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "apex_incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "apex_incidents_status_severity_idx" ON "apex_incidents"("status", "severity");
CREATE INDEX "apex_incidents_component_key_status_idx" ON "apex_incidents"("component_key", "status");
CREATE INDEX "apex_incidents_fingerprint_status_idx" ON "apex_incidents"("fingerprint", "status");

CREATE TABLE "apex_notifications" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT,
    "user_id" INTEGER,
    "level" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apex_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "apex_notifications_tenant_id_read_at_created_at_idx" ON "apex_notifications"("tenant_id", "read_at", "created_at");

CREATE TABLE "apex_report_runs" (
    "id" BIGSERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apex_report_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "apex_report_runs_kind_period_key_key" ON "apex_report_runs"("kind", "period_key");
