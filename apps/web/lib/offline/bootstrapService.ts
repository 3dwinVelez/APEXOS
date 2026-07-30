import {
  bootstrapToLocalSnapshot,
  fetchOfflineBootstrap,
  type OfflineCapabilitiesResponse
} from "./bootstrapClient.ts";
import { initializeOfflineReadStorage } from "./access.ts";
import { OfflineSnapshotHydrator } from "./hydrator.ts";
import { OfflineTechnicianReadService } from "./readService.ts";
import { readAuthorizedOfflineContext, rememberOfflineContext } from "./session.ts";
import type {
  OfflineServerCapability,
  OfflineStorageContext
} from "./types.ts";

function capabilityContext(response: OfflineCapabilitiesResponse): {
  capability: OfflineServerCapability;
  context: OfflineStorageContext;
} | null {
  if (!response.offlineTechnician.enabled || !response.context) return null;
  const context = {
    environmentId: response.context.environmentId,
    companyId: response.context.companyId,
    tenantId: response.context.companyId,
    userId: response.context.userId
  };
  return {
    context,
    capability: {
      technician: true,
      environmentId: context.environmentId,
      companyId: context.companyId,
      userId: context.userId,
      authorizationSource: "server"
    }
  };
}

export class OfflineBootstrapService {
  async prepare(response: OfflineCapabilitiesResponse): Promise<OfflineTechnicianReadService> {
    const authorized = capabilityContext(response);
    if (!authorized) throw new Error("OFFLINE_NOT_ELIGIBLE");
    const bootstrap = await fetchOfflineBootstrap(authorized.capability, authorized.context);
    const access = await initializeOfflineReadStorage(
      authorized.capability,
      authorized.context
    );
    if (access.mode !== "offline-read") throw new Error("OFFLINE_STORAGE_UNAVAILABLE");
    try {
      if (!("replaceSnapshot" in access.adapter)) {
        throw new Error("OFFLINE_STORAGE_HYDRATION_UNAVAILABLE");
      }
      const hydrator = new OfflineSnapshotHydrator(
        access.adapter as typeof access.adapter & {
          replaceSnapshot(snapshot: unknown): Promise<void>;
        }
      );
      await hydrator.hydrate(bootstrapToLocalSnapshot(bootstrap, authorized.context));
      rememberOfflineContext(authorized.context, bootstrap.expiresAt);
      return new OfflineTechnicianReadService(access.adapter, authorized.context);
    } catch (error) {
      await access.adapter.close();
      throw error;
    }
  }

  async openPrepared(): Promise<OfflineTechnicianReadService | null> {
    const context = readAuthorizedOfflineContext();
    if (!context) return null;
    const { DexieOfflineStorageAdapter } = await import("./storageAdapter.ts");
    const adapter = new DexieOfflineStorageAdapter(context);
    try {
      await adapter.open();
      return new OfflineTechnicianReadService(adapter, context);
    } catch {
      await adapter.close();
      return null;
    }
  }
}
