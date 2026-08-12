ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "authorization_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "authorization_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "AuthorizationSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" INTEGER NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_version" INTEGER NOT NULL,
  "tenant_version" INTEGER NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "revoke_reason" TEXT,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthorizationSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthorizationSession_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AuthorizationSession_user_id_revoked_at_idx"
  ON "AuthorizationSession"("user_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "AuthorizationSession_tenant_id_revoked_at_idx"
  ON "AuthorizationSession"("tenant_id", "revoked_at");
