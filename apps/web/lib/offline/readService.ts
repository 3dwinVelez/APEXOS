import type {
  OfflineActivityRecord,
  OfflineChecklistRecord,
  OfflineMetadataRecord,
  OfflineOrderRecord,
  OfflineReadStorageAdapter,
  OfflineStorageContext
} from "./types.ts";

export class OfflineTechnicianReadService {
  private readonly adapter: OfflineReadStorageAdapter;
  private readonly context: OfflineStorageContext;
  private readonly now: () => number;

  constructor(
    adapter: OfflineReadStorageAdapter,
    context: OfflineStorageContext,
    now: () => number = Date.now
  ) {
    this.adapter = adapter;
    this.context = context;
    this.now = now;
  }

  listOrders(): Promise<OfflineOrderRecord[]> {
    return this.adapter.transaction((repositories) => repositories.orders.list(this.context));
  }

  getOrder(orderId: string): Promise<OfflineOrderRecord | null> {
    return this.adapter.transaction((repositories) =>
      repositories.orders.getById(this.context, orderId)
    );
  }

  listActivities(orderId: string): Promise<OfflineActivityRecord[]> {
    return this.adapter.transaction((repositories) =>
      repositories.activities.listByOrder(this.context, orderId)
    );
  }

  listChecklist(orderId: string): Promise<OfflineChecklistRecord[]> {
    return this.adapter.transaction((repositories) =>
      repositories.checklists.listByOrder(this.context, orderId)
    );
  }

  metadata(): Promise<OfflineMetadataRecord | null> {
    return this.adapter.transaction((repositories) => repositories.metadata.get(this.context));
  }

  async snapshotState(): Promise<{
    available: boolean;
    fresh: boolean;
    expired: boolean;
    generatedAt: string | null;
    expiresAt: string | null;
  }> {
    const metadata = await this.metadata();
    if (!metadata) {
      return {
        available: false,
        fresh: false,
        expired: false,
        generatedAt: null,
        expiresAt: null
      };
    }
    const expired = Date.parse(metadata.expiresAt) <= this.now();
    return {
      available: true,
      fresh: !expired,
      expired,
      generatedAt: metadata.generatedAt,
      expiresAt: metadata.expiresAt
    };
  }
}

