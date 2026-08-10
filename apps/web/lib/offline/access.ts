import type {
  OfflineServerCapability,
  OfflineStorageAccess,
  OfflineStorageContext
} from "./types.ts";

type AdapterModule = typeof import("./storageAdapter.ts");
type AdapterLoader = () => Promise<AdapterModule>;

const loadDexieAdapter: AdapterLoader = () => import("./storageAdapter.ts");

export async function initializeOfflineReadStorage(
  capability: OfflineServerCapability,
  context: OfflineStorageContext,
  loader: AdapterLoader = loadDexieAdapter
): Promise<OfflineStorageAccess> {
  if (!capability.technician || capability.authorizationSource !== "server") {
    return { mode: "connected", reason: "DISABLED" };
  }
  if (
    capability.environmentId !== context.environmentId ||
    capability.companyId !== context.companyId ||
    capability.userId !== context.userId
  ) {
    return { mode: "connected", reason: "CONTEXT_MISMATCH" };
  }
  try {
    const { DexieOfflineStorageAdapter } = await loader();
    const adapter = new DexieOfflineStorageAdapter(context);
    await adapter.open();
    return { mode: "offline-read", adapter };
  } catch {
    return { mode: "connected", reason: "STORAGE_UNAVAILABLE" };
  }
}
