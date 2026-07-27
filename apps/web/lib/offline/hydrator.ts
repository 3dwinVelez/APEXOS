import type { DexieOfflineStorageAdapter } from "./storageAdapter.ts";
import type { OfflineSnapshot } from "./types.ts";

export class OfflineSnapshotHydrator {
  private readonly storage: DexieOfflineStorageAdapter;

  constructor(storage: DexieOfflineStorageAdapter) {
    this.storage = storage;
  }

  async hydrate(snapshot: OfflineSnapshot | unknown): Promise<void> {
    await this.storage.replaceSnapshot(snapshot);
  }
}
