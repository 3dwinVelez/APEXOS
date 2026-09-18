ALTER TABLE "commercial_visits"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "outcome_notes" TEXT,
  ADD COLUMN "reschedule_reason" TEXT,
  ADD COLUMN "rescheduled_from_id" INTEGER;

ALTER TABLE "commercial_visits" ALTER COLUMN "result_code" DROP NOT NULL;

ALTER TABLE "commercial_visits"
  ADD CONSTRAINT "commercial_visits_rescheduled_from_id_fkey"
  FOREIGN KEY ("rescheduled_from_id") REFERENCES "commercial_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "commercial_visits_tenant_id_advisor_id_status_visit_date_idx"
  ON "commercial_visits"("tenant_id", "advisor_id", "status", "visit_date");
CREATE INDEX "commercial_visits_rescheduled_from_id_idx" ON "commercial_visits"("rescheduled_from_id");
