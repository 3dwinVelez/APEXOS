CREATE TABLE "commercial_visit_reasons" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "commercial_visit_results" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "counts_as_effective" BOOLEAN NOT NULL DEFAULT FALSE,
  "requires_observation" BOOLEAN NOT NULL DEFAULT TRUE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "commercial_visit_reasons_tenant_id_code_key" ON "commercial_visit_reasons"("tenant_id", "code");
CREATE INDEX "commercial_visit_reasons_tenant_id_active_name_idx" ON "commercial_visit_reasons"("tenant_id", "active", "name");
CREATE UNIQUE INDEX "commercial_visit_results_tenant_id_code_key" ON "commercial_visit_results"("tenant_id", "code");
CREATE INDEX "commercial_visit_results_tenant_id_active_name_idx" ON "commercial_visit_results"("tenant_id", "active", "name");

ALTER TABLE "commercial_visits" ADD COLUMN "reason_id" INTEGER;
ALTER TABLE "commercial_visits" ADD COLUMN "result_id" INTEGER;
CREATE INDEX "commercial_visits_reason_id_idx" ON "commercial_visits"("reason_id");
CREATE INDEX "commercial_visits_result_id_idx" ON "commercial_visits"("result_id");
ALTER TABLE "commercial_visits" ADD CONSTRAINT "commercial_visits_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "commercial_visit_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_visits" ADD CONSTRAINT "commercial_visits_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "commercial_visit_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "commercial_visit_reasons" ("tenant_id", "code", "name", "description", "updated_at")
SELECT tenant."id", defaults."code", defaults."name", defaults."description", CURRENT_TIMESTAMP
FROM "Tenant" tenant
CROSS JOIN (VALUES
  ('SALE', 'Venta', 'Presentación de oferta y cierre comercial'),
  ('COLLECTION', 'Cobro', 'Gestión de cartera y acuerdos de pago'),
  ('FOLLOW_UP', 'Seguimiento', 'Seguimiento comercial o posventa'),
  ('SERVICE', 'Servicio', 'Atención de novedades o requerimientos')
) AS defaults("code", "name", "description")
ON CONFLICT ("tenant_id", "code") DO NOTHING;

INSERT INTO "commercial_visit_results" ("tenant_id", "code", "name", "description", "counts_as_effective", "requires_observation", "updated_at")
SELECT tenant."id", defaults."code", defaults."name", defaults."description", defaults."effective", defaults."observation", CURRENT_TIMESTAMP
FROM "Tenant" tenant
CROSS JOIN (VALUES
  ('ORDER_GENERATED', 'Pedido generado', 'La visita produjo un pedido', TRUE, FALSE),
  ('COMMITMENT_OBTAINED', 'Compromiso obtenido', 'Se obtuvo compromiso de pago o siguiente acción', TRUE, TRUE),
  ('FOLLOW_UP_REQUIRED', 'Requiere seguimiento', 'Debe programarse una nueva gestión', FALSE, TRUE),
  ('CUSTOMER_UNAVAILABLE', 'Cliente no disponible', 'No fue posible atender la visita', FALSE, TRUE),
  ('NOT_INTERESTED', 'No interesado', 'El cliente no desea continuar', FALSE, TRUE),
  ('OTHER', 'Otro resultado', 'Resultado no contemplado en las opciones anteriores', FALSE, TRUE)
) AS defaults("code", "name", "description", "effective", "observation")
ON CONFLICT ("tenant_id", "code") DO NOTHING;
