-- Recepcion y asignacion de facturas electronicas (M-07 Contabilidad).
-- Se conserva el XML y el PDF originales en invoice_documents (storage_reference),
-- y la factura guarda dedupe_key para impedir doble registro por CUFE/CUDE o por
-- emisor + prefijo + numero cuando el CUFE no viene en el archivo.

CREATE TABLE "invoice_suppliers" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_recipients" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_processed_emails" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'imap',
    "mailbox" TEXT,
    "message_key" TEXT NOT NULL,
    "internet_message_id" TEXT,
    "subject" TEXT,
    "from_address" TEXT,
    "received_at" TIMESTAMP(3),
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "processed_attachment_count" INTEGER NOT NULL DEFAULT 0,
    "invoice_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error_message" TEXT,
    "raw_size_bytes" INTEGER,
    "zip_file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "invoice_processed_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_received" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email_id" INTEGER,
    "supplier_id" INTEGER,
    "recipient_id" INTEGER,
    "document_type" TEXT NOT NULL DEFAULT 'invoice',
    "document_type_label" TEXT,
    "cufe" TEXT,
    "prefix" TEXT,
    "invoice_number" TEXT NOT NULL,
    "full_number" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3),
    "reception_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuer_tax_id" TEXT,
    "issuer_name" TEXT,
    "receiver_tax_id" TEXT,
    "receiver_name" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ica" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT,
    "dian_validation_status" TEXT,
    "extraction_source" TEXT NOT NULL DEFAULT 'xml',
    "extraction_metadata" JSONB NOT NULL DEFAULT '{}',
    "processing_status" TEXT NOT NULL DEFAULT 'pending_assignment',
    "assignment_status" TEXT NOT NULL DEFAULT 'unassigned',
    "invoice_status" TEXT NOT NULL DEFAULT 'Pendiente de asignación',
    "group_name" TEXT,
    "cost_center" TEXT,
    "responsible_user_id" INTEGER,
    "responsible_name" TEXT,
    "leader_assignment_status" TEXT NOT NULL DEFAULT 'pending',
    "segment" TEXT,
    "assignment_detail" TEXT,
    "observations" TEXT,
    "notification_emails" JSONB NOT NULL DEFAULT '[]',
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reasons" JSONB NOT NULL DEFAULT '[]',
    "validation_issues" JSONB NOT NULL DEFAULT '[]',
    "pdf_available" BOOLEAN NOT NULL DEFAULT false,
    "xml_available" BOOLEAN NOT NULL DEFAULT false,
    "source_archive" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "assigned_by" INTEGER,
    "assigned_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "last_action_by" INTEGER,
    "last_action_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_received_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_documents" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" INTEGER,
    "email_id" INTEGER,
    "document_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_reference" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "checksum_sha256" TEXT NOT NULL,
    "page_count" INTEGER,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_assignments" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "responsible_user_id" INTEGER,
    "responsible_name" TEXT,
    "segment" TEXT,
    "leader_assignment_status" TEXT NOT NULL DEFAULT 'pending',
    "assignment_status" TEXT NOT NULL,
    "detail" TEXT,
    "observations" TEXT,
    "assigned_by" INTEGER,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_change_logs" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_processing_errors" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email_id" INTEGER,
    "document_id" INTEGER,
    "invoice_id" INTEGER,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_processing_errors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_mail_configs" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'imap',
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 993,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "password_env_key" TEXT NOT NULL DEFAULT 'INVOICE_IMAP_PASSWORD',
    "folder" TEXT NOT NULL DEFAULT 'INBOX',
    "polling_minutes" INTEGER NOT NULL DEFAULT 15,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_mail_configs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_suppliers_tenant_id_name_idx" ON "invoice_suppliers"("tenant_id", "name");
CREATE UNIQUE INDEX "invoice_suppliers_tenant_id_tax_id_key" ON "invoice_suppliers"("tenant_id", "tax_id");
CREATE UNIQUE INDEX "invoice_recipients_tenant_id_tax_id_key" ON "invoice_recipients"("tenant_id", "tax_id");
CREATE INDEX "invoice_processed_emails_tenant_id_status_created_at_idx" ON "invoice_processed_emails"("tenant_id", "status", "created_at");
CREATE UNIQUE INDEX "invoice_processed_emails_tenant_id_message_key_key" ON "invoice_processed_emails"("tenant_id", "message_key");
CREATE INDEX "invoice_received_tenant_id_processing_status_created_at_idx" ON "invoice_received"("tenant_id", "processing_status", "created_at");
CREATE INDEX "invoice_received_tenant_id_assignment_status_idx" ON "invoice_received"("tenant_id", "assignment_status");
CREATE INDEX "invoice_received_tenant_id_issue_date_idx" ON "invoice_received"("tenant_id", "issue_date");
CREATE INDEX "invoice_received_tenant_id_supplier_id_idx" ON "invoice_received"("tenant_id", "supplier_id");
CREATE INDEX "invoice_received_tenant_id_responsible_user_id_idx" ON "invoice_received"("tenant_id", "responsible_user_id");
CREATE INDEX "invoice_received_tenant_id_invoice_number_idx" ON "invoice_received"("tenant_id", "invoice_number");
CREATE UNIQUE INDEX "invoice_received_tenant_id_dedupe_key_key" ON "invoice_received"("tenant_id", "dedupe_key");
CREATE INDEX "invoice_documents_tenant_id_invoice_id_idx" ON "invoice_documents"("tenant_id", "invoice_id");
CREATE INDEX "invoice_documents_tenant_id_checksum_sha256_idx" ON "invoice_documents"("tenant_id", "checksum_sha256");
CREATE INDEX "invoice_assignments_tenant_id_invoice_id_created_at_idx" ON "invoice_assignments"("tenant_id", "invoice_id", "created_at");
CREATE INDEX "invoice_change_logs_tenant_id_invoice_id_created_at_idx" ON "invoice_change_logs"("tenant_id", "invoice_id", "created_at");
CREATE INDEX "invoice_processing_errors_tenant_id_resolved_created_at_idx" ON "invoice_processing_errors"("tenant_id", "resolved", "created_at");
CREATE UNIQUE INDEX "invoice_mail_configs_tenant_id_key" ON "invoice_mail_configs"("tenant_id");

ALTER TABLE "invoice_received" ADD CONSTRAINT "invoice_received_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "invoice_processed_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_received" ADD CONSTRAINT "invoice_received_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "invoice_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_received" ADD CONSTRAINT "invoice_received_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "invoice_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice_received"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "invoice_processed_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_assignments" ADD CONSTRAINT "invoice_assignments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice_received"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_change_logs" ADD CONSTRAINT "invoice_change_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice_received"("id") ON DELETE CASCADE ON UPDATE CASCADE;
