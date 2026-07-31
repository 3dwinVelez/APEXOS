import type { OfflineStorageContext } from "./types.ts";

const OFFLINE_CONTEXT_KEY = "apex_offline_authorized_context_v1";

type StoredOfflineContext = OfflineStorageContext & {
  authorizedUntil: string;
};

function tokenClaims(): { id?: string | number; tenant_id?: string; exp?: number } | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return null;
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
}

export function rememberOfflineContext(
  context: OfflineStorageContext,
  authorizedUntil: string
): void {
  localStorage.setItem(OFFLINE_CONTEXT_KEY, JSON.stringify({ ...context, authorizedUntil }));
}

export function readAuthorizedOfflineContext(): OfflineStorageContext | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(
      localStorage.getItem(OFFLINE_CONTEXT_KEY) || "null"
    ) as StoredOfflineContext | null;
    const claims = tokenClaims();
    if (
      !stored ||
      !claims?.exp ||
      claims.exp * 1000 <= Date.now() ||
      Date.parse(stored.authorizedUntil) <= Date.now() ||
      String(claims.id || "") !== stored.userId ||
      String(claims.tenant_id || "") !== stored.tenantId ||
      stored.companyId !== stored.tenantId
    ) {
      return null;
    }
    return {
      environmentId: stored.environmentId,
      companyId: stored.companyId,
      tenantId: stored.tenantId,
      userId: stored.userId
    };
  } catch {
    return null;
  }
}

export function forgetOfflineContext(): void {
  if (typeof window !== "undefined") localStorage.removeItem(OFFLINE_CONTEXT_KEY);
}

export async function clearAuthorizedOfflineContextData(): Promise<void> {
  const context = readAuthorizedOfflineContext();
  forgetOfflineContext();
  if (!context) return;
  const { DexieOfflineStorageAdapter } = await import("./storageAdapter.ts");
  const adapter = new DexieOfflineStorageAdapter(context);
  await adapter.deleteDatabase().catch(() => undefined);
}

export async function clearOfflineDataOnLogout(): Promise<void> {
  if (typeof window === "undefined") return;
  let context: OfflineStorageContext | null = null;
  try {
    const stored = JSON.parse(
      localStorage.getItem(OFFLINE_CONTEXT_KEY) || "null"
    ) as StoredOfflineContext | null;
    if (stored?.environmentId && stored.companyId && stored.tenantId && stored.userId) {
      context = {
        environmentId: stored.environmentId,
        companyId: stored.companyId,
        tenantId: stored.tenantId,
        userId: stored.userId
      };
    }
  } catch {
    context = null;
  }
  forgetOfflineContext();
  if (!context) return;
  const { DexieOfflineStorageAdapter } = await import("./storageAdapter.ts");
  const adapter = new DexieOfflineStorageAdapter(context);
  await adapter.deleteDatabase().catch(() => undefined);
}
