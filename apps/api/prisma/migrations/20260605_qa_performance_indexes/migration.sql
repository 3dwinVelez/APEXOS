-- Non-destructive indexes for high-frequency QA list and reporting queries.
CREATE INDEX IF NOT EXISTS "Party_tenant_id_type_active_name_idx"
  ON "Party"("tenant_id", "type", "active", "name");

CREATE INDEX IF NOT EXISTS "Transaction_tenant_id_type_created_at_idx"
  ON "Transaction"("tenant_id", "type", "created_at");

CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_document_class_posting_date_idx"
  ON "cxp_cabdoc"("tenant_id", "document_class", "posting_date");

CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_supplier_id_due_date_idx"
  ON "cxp_cabdoc"("tenant_id", "supplier_id", "due_date");

CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_captured_at_idx"
  ON "GpsPing"("tenant_id", "captured_at");

CREATE INDEX IF NOT EXISTS "ServiceOrder_tenant_id_created_at_idx"
  ON "ServiceOrder"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "Payroll_tenant_id_created_at_idx"
  ON "Payroll"("tenant_id", "created_at");
