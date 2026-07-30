import { OfflineStorageError } from "./errors.ts";
import type { OfflineStorageContext } from "./types.ts";

export const OFFLINE_DATABASE_PREFIX = "apexos-offline-v2";

function requireContextPart(value: string, field: string): string {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 160) {
    throw new OfflineStorageError("CONTEXT_INVALID", `${field} no es valido.`);
  }
  return normalized;
}

export function normalizeContext(context: OfflineStorageContext): OfflineStorageContext {
  return Object.freeze({
    environmentId: requireContextPart(context.environmentId, "environmentId"),
    companyId: requireContextPart(context.companyId, "companyId"),
    tenantId: requireContextPart(context.tenantId, "tenantId"),
    userId: requireContextPart(context.userId, "userId")
  });
}

export function assertSameContext(
  expected: OfflineStorageContext,
  actual: Pick<OfflineStorageContext, "environmentId" | "companyId" | "userId" | "tenantId">
): void {
  if (
    expected.environmentId !== actual.environmentId ||
    expected.companyId !== actual.companyId ||
    expected.tenantId !== actual.tenantId ||
    expected.userId !== actual.userId
  ) {
    throw new OfflineStorageError(
      "CONTEXT_MISMATCH",
      "El contexto local no coincide con la sesion activa."
    );
  }
}

async function hashSegment(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new OfflineStorageError(
      "STORAGE_UNAVAILABLE",
      "Web Crypto no esta disponible para particionar el almacenamiento."
    );
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function contextDatabaseSegments(context: OfflineStorageContext): Promise<{
  environment: string;
  company: string;
  user: string;
}> {
  const normalized = normalizeContext(context);
  const [environment, company, user] = await Promise.all([
    hashSegment(normalized.environmentId),
    hashSegment(normalized.companyId),
    hashSegment(normalized.userId)
  ]);
  return { environment, company, user };
}

export async function contextDatabaseName(context: OfflineStorageContext): Promise<string> {
  const segments = await contextDatabaseSegments(context);
  return `${OFFLINE_DATABASE_PREFIX}-${segments.environment}-${segments.company}-${segments.user}`;
}

export function localKey(entity: string, serverId: string): string {
  return `${entity}:${serverId}`;
}
