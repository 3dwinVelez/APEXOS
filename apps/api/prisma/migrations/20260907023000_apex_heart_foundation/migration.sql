CREATE TABLE "apex_heart_configs" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "annual_financing_rate" DOUBLE PRECISION NOT NULL DEFAULT 14.42,
  "lost_portfolio_rate" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "holding_rate" DOUBLE PRECISION NOT NULL DEFAULT 25,
  "order_cost" DOUBLE PRECISION NOT NULL DEFAULT 50000,
  "lead_time_days" INTEGER NOT NULL DEFAULT 14,
  "safety_stock_days" INTEGER NOT NULL DEFAULT 1,
  "inventory_target_days" INTEGER NOT NULL DEFAULT 60,
  "alert_email_enabled" BOOLEAN NOT NULL DEFAULT true,
  "alert_in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
  "recipients" JSONB NOT NULL DEFAULT '["owner","admin"]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "apex_heart_configs_tenant_id_key" ON "apex_heart_configs"("tenant_id");

CREATE TABLE "apex_heart_alert_rules" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "metric" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "warning_threshold" DOUBLE PRECISION NOT NULL,
  "critical_threshold" DOUBLE PRECISION NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'warning',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "cooldown_hours" INTEGER NOT NULL DEFAULT 24,
  "action_label" TEXT,
  "action_href" TEXT,
  "recipients" JSONB NOT NULL DEFAULT '["owner","admin"]',
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "apex_heart_alert_rules_tenant_id_code_key" ON "apex_heart_alert_rules"("tenant_id", "code");
CREATE INDEX "apex_heart_alert_rules_tenant_id_enabled_idx" ON "apex_heart_alert_rules"("tenant_id", "enabled");
CREATE INDEX "apex_heart_alert_rules_tenant_id_metric_idx" ON "apex_heart_alert_rules"("tenant_id", "metric");

CREATE TABLE "apex_heart_alerts" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "rule_id" INTEGER,
  "fingerprint" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "metric_value" DOUBLE PRECISION NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "action_label" TEXT,
  "action_href" TEXT,
  "context" JSONB NOT NULL DEFAULT '{}',
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMP(3),
  "acknowledged_by" INTEGER,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "apex_heart_alerts_tenant_id_fingerprint_key" ON "apex_heart_alerts"("tenant_id", "fingerprint");
CREATE INDEX "apex_heart_alerts_tenant_id_status_severity_idx" ON "apex_heart_alerts"("tenant_id", "status", "severity");
CREATE INDEX "apex_heart_alerts_tenant_id_detected_at_idx" ON "apex_heart_alerts"("tenant_id", "detected_at");

CREATE TABLE "apex_heart_inventory_snapshots" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "snapshot_date" TIMESTAMP(3) NOT NULL,
  "item_id" INTEGER NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'system',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "apex_heart_inventory_snapshots_tenant_date_item_key" ON "apex_heart_inventory_snapshots"("tenant_id", "snapshot_date", "item_id");
CREATE INDEX "apex_heart_inventory_snapshots_tenant_date_idx" ON "apex_heart_inventory_snapshots"("tenant_id", "snapshot_date");
CREATE INDEX "apex_heart_inventory_snapshots_tenant_item_date_idx" ON "apex_heart_inventory_snapshots"("tenant_id", "item_id", "snapshot_date");
