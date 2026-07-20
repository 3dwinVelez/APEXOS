-- Additive indexes for API read paths with high-volume tenants.
CREATE INDEX IF NOT EXISTS "Employee_tenant_id_active_user_type_idx"
ON "Employee"("tenant_id", "active", "user_type");

CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_source_captured_at_idx"
ON "GpsPing"("tenant_id", "source", "captured_at");

CREATE INDEX IF NOT EXISTS "TimePunch_tenant_id_date_punched_at_idx"
ON "TimePunch"("tenant_id", "date", "punched_at");

CREATE INDEX IF NOT EXISTS "ServiceOrder_tenant_id_status_created_at_idx"
ON "ServiceOrder"("tenant_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "ServiceOrder_tenant_id_technician_id_status_created_at_idx"
ON "ServiceOrder"("tenant_id", "technician_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "ServiceReference_tenant_id_active_code_idx"
ON "ServiceReference"("tenant_id", "active", "code");

CREATE INDEX IF NOT EXISTS "ServiceReference_tenant_id_category_active_code_idx"
ON "ServiceReference"("tenant_id", "category", "active", "code");

CREATE INDEX IF NOT EXISTS "ServiceReferencePart_tenant_id_reference_id_display_order_idx"
ON "ServiceReferencePart"("tenant_id", "reference_id", "display_order");
