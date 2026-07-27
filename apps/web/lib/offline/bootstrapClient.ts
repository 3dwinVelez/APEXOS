import {
  validateOfflineBootstrapResponse,
  type OfflineBootstrapResponse
} from "@apex-os/types/offline";
import type { OfflineServerCapability, OfflineSnapshot, OfflineStorageContext } from "./types.ts";

export interface OfflineCapabilitiesResponse {
  offlineTechnician: {
    enabled: boolean;
    readOnly: boolean;
    syncEnabled: boolean;
    evidenceEnabled: boolean;
    autoSyncEnabled: boolean;
  };
  context: {
    environmentId: string;
    companyId: string;
    userId: string;
  } | null;
}

function isCapabilitiesResponse(value: unknown): value is OfflineCapabilitiesResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as OfflineCapabilitiesResponse;
  const capability = response.offlineTechnician;
  return Boolean(
    capability &&
      typeof capability.enabled === "boolean" &&
      typeof capability.readOnly === "boolean" &&
      typeof capability.syncEnabled === "boolean" &&
      typeof capability.evidenceEnabled === "boolean" &&
      typeof capability.autoSyncEnabled === "boolean" &&
      (!capability.enabled ||
        (response.context &&
          response.context.environmentId &&
          response.context.companyId &&
          response.context.userId))
  );
}

export async function fetchOfflineCapabilities(): Promise<OfflineCapabilitiesResponse> {
  const { api } = await import("../api.ts");
  const response = await api<unknown>("/api/v1/offline/capabilities", { cache: "no-store" });
  if (!isCapabilitiesResponse(response)) {
    throw new Error("OFFLINE_CAPABILITY_INVALID");
  }
  return response;
}

export async function fetchOfflineBootstrap(
  capability: OfflineServerCapability,
  context: OfflineStorageContext
): Promise<OfflineBootstrapResponse> {
  const { api } = await import("../api.ts");
  const response = await api<unknown>("/api/v1/offline/bootstrap", { cache: "no-store" });
  return validateBootstrapForContext(response, capability, context);
}

export function validateBootstrapForContext(
  response: unknown,
  capability: OfflineServerCapability,
  context: OfflineStorageContext,
  now = Date.now()
): OfflineBootstrapResponse {
  const validation = validateOfflineBootstrapResponse(response);
  if (!validation.success) throw new Error("OFFLINE_BOOTSTRAP_CONTRACT_INVALID");
  const snapshot = validation.data;
  if (
    snapshot.environmentId !== capability.environmentId ||
    snapshot.companyId !== capability.companyId ||
    snapshot.userId !== capability.userId ||
    snapshot.environmentId !== context.environmentId ||
    snapshot.companyId !== context.companyId ||
    snapshot.userId !== context.userId
  ) {
    throw new Error("OFFLINE_BOOTSTRAP_CONTEXT_MISMATCH");
  }
  if (Date.parse(snapshot.expiresAt) <= now) {
    throw new Error("OFFLINE_BOOTSTRAP_EXPIRED");
  }
  return snapshot;
}

export function bootstrapToLocalSnapshot(
  response: OfflineBootstrapResponse,
  context: OfflineStorageContext
): OfflineSnapshot {
  return {
    context,
    schemaVersion: response.schemaVersion,
    generatedAt: response.generatedAt,
    expiresAt: response.expiresAt,
    orders: response.orders,
    activities: response.activities,
    checklists: response.checklists,
    catalogs: response.catalogs
  };
}
