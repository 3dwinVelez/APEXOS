CREATE TABLE "apex_heart_report_schedules" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "view" TEXT NOT NULL DEFAULT 'pulse',
  "frequency" TEXT NOT NULL DEFAULT 'weekly',
  "weekday" INTEGER,
  "month_day" INTEGER,
  "send_hour" INTEGER NOT NULL DEFAULT 8,
  "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
  "recipients" JSONB NOT NULL DEFAULT '[]',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "next_run_at" TIMESTAMP(3) NOT NULL,
  "last_run_at" TIMESTAMP(3),
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "apex_heart_report_schedules_tenant_enabled_next_idx" ON "apex_heart_report_schedules"("tenant_id", "enabled", "next_run_at");
