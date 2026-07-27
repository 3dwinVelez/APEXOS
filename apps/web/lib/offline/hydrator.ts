import type { OfflineSnapshot } from "./types.ts";

export interface OfflineSnapshotStorage {
  replaceSnapshot(snapshot: unknown): Promise<void>;
}

export class OfflineSnapshotHydrator {
  private readonly storage: OfflineSnapshotStorage;

  constructor(storage: OfflineSnapshotStorage) {
    this.storage = storage;
  }

  async hydrate(snapshot: OfflineSnapshot | unknown): Promise<void> {
    await this.storage.replaceSnapshot(snapshot);
  }
}
