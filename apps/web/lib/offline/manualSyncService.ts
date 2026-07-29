import { OfflineSyncClient, type OfflinePushResult } from "./syncClient.ts";
import type {
  OfflineOperationErrorCategory,
  OfflineOperationRecord,
  OfflineStorageContext
} from "./types.ts";

export interface OfflineSyncQueueRepository {
  listPending(): Promise<OfflineOperationRecord[]>;
  markProcessing(id: string): Promise<OfflineOperationRecord>;
  markConfirmed(id: string): Promise<OfflineOperationRecord>;
  markBlocked(id: string, code?: string): Promise<OfflineOperationRecord>;
  markConflict(id: string, code?: string): Promise<OfflineOperationRecord>;
  markRetryable(
    id: string,
    code: string,
    category: OfflineOperationErrorCategory
  ): Promise<OfflineOperationRecord>;
}

export interface ManualSyncSummary {
  attempted: number;
  confirmed: number;
  retryable: number;
  blocked: number;
  conflicts: number;
}

function emptySummary(): ManualSyncSummary {
  return { attempted: 0, confirmed: 0, retryable: 0, blocked: 0, conflicts: 0 };
}

export class OfflineManualSyncService {
  private readonly context: OfflineStorageContext;
  private readonly queue: OfflineSyncQueueRepository;
  private readonly client: OfflineSyncClient;

  constructor(
    context: OfflineStorageContext,
    queue: OfflineSyncQueueRepository,
    client = new OfflineSyncClient()
  ) {
    this.context = context;
    this.queue = queue;
    this.client = client;
  }

  private async applyResult(item: OfflinePushResult, summary: ManualSyncSummary) {
    if (item.status === "APPLIED" || item.status === "ALREADY_APPLIED") {
      await this.queue.markConfirmed(item.operationId);
      summary.confirmed += 1;
    } else if (item.status === "RETRYABLE_ERROR") {
      await this.queue.markRetryable(item.operationId, item.code, "SERVER_TEMPORARY");
      summary.retryable += 1;
    } else if (item.status === "CONFLICT") {
      await this.queue.markConflict(item.operationId, item.code);
      summary.conflicts += 1;
    } else {
      await this.queue.markBlocked(item.operationId, item.code);
      summary.blocked += 1;
    }
  }

  async syncPending(): Promise<ManualSyncSummary> {
    const pending = (await this.queue.listPending())
      .filter((operation) => operation.operationType === "TEST_OPERATION")
      .slice(0, 20);
    const summary = emptySummary();
    if (!pending.length) return summary;
    const installationId = pending[0].installationId;
    const batch = pending.filter((operation) => operation.installationId === installationId);
    for (const operation of batch) await this.queue.markProcessing(operation.operationId);
    summary.attempted = batch.length;
    try {
      const response = await this.client.push(this.context, installationId, batch);
      const byId = new Map(response.results.map((item) => [item.operationId, item]));
      for (const operation of batch) {
        const item = byId.get(operation.operationId);
        if (item) await this.applyResult(item, summary);
        else {
          await this.queue.markRetryable(operation.operationId, "SYNC_RESULT_MISSING", "SERVER_TEMPORARY");
          summary.retryable += 1;
        }
      }
      return summary;
    } catch (error) {
      const code = error instanceof Error ? error.message : "OFFLINE_SYNC_FAILED";
      const category: OfflineOperationErrorCategory =
        error && typeof error === "object" && "category" in error
          ? (String(error.category) as OfflineOperationErrorCategory)
          : "NETWORK";
      for (const operation of batch) {
        if (category === "AUTHORIZATION" || category === "VALIDATION") {
          await this.queue.markBlocked(operation.operationId, code);
          summary.blocked += 1;
        } else {
          await this.queue.markRetryable(
            operation.operationId,
            code,
            category === "TIMEOUT" ? "TIMEOUT" : "NETWORK"
          );
          summary.retryable += 1;
        }
      }
      return summary;
    }
  }
}
