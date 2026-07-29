import type { OfflineOperationRecord, OfflineStorageContext } from "./types.ts";

export type OfflinePushResultStatus =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "RETRYABLE_ERROR"
  | "REJECTED"
  | "CONFLICT"
  | "BLOCKED";

export interface OfflinePushResult {
  operationId: string;
  status: OfflinePushResultStatus;
  code: string;
  processedAt: string;
}

export interface OfflinePushResponse {
  context: OfflineStorageContext & { installationId: string };
  results: OfflinePushResult[];
}

export class OfflineSyncClientError extends Error {
  readonly code: string;
  readonly category: "NETWORK" | "TIMEOUT" | "SERVER_TEMPORARY" | "AUTHORIZATION" | "VALIDATION";

  constructor(
    code: string,
    category: "NETWORK" | "TIMEOUT" | "SERVER_TEMPORARY" | "AUTHORIZATION" | "VALIDATION"
  ) {
    super(code);
    this.code = code;
    this.category = category;
  }
}

function validResponse(value: unknown): value is OfflinePushResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as OfflinePushResponse;
  const context = response.context;
  return Boolean(
    context?.environmentId &&
      context.companyId &&
      context.userId &&
      context.installationId &&
      Array.isArray(response.results) &&
      response.results.every((item) =>
        item &&
        typeof item.operationId === "string" &&
        ["APPLIED", "ALREADY_APPLIED", "RETRYABLE_ERROR", "REJECTED", "CONFLICT", "BLOCKED"].includes(item.status) &&
        typeof item.code === "string" &&
        !Number.isNaN(Date.parse(item.processedAt))
      )
  );
}

export class OfflineSyncClient {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 15_000) {
    this.timeoutMs = timeoutMs;
  }

  async push(
    context: OfflineStorageContext,
    installationId: string,
    operations: OfflineOperationRecord[]
  ): Promise<OfflinePushResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const { api } = await import("../api.ts");
      const response = await api<unknown>("/api/v1/offline/sync/push", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          installationId,
          operations: operations.map((operation) => ({
            operationId: operation.operationId,
            idempotencyKey: operation.idempotencyKey,
            operationType: operation.operationType,
            payload: operation.payload,
            baseVersion: operation.baseVersion,
            createdAtDevice: operation.createdAtDevice
          }))
        })
      });
      if (!validResponse(response)) {
        throw new OfflineSyncClientError("OFFLINE_SYNC_CONTRACT_INVALID", "VALIDATION");
      }
      if (
        response.context.environmentId !== context.environmentId ||
        response.context.companyId !== context.companyId ||
        response.context.userId !== context.userId ||
        response.context.installationId !== installationId
      ) {
        throw new OfflineSyncClientError("OFFLINE_SYNC_CONTEXT_MISMATCH", "AUTHORIZATION");
      }
      return response;
    } catch (error) {
      if (error instanceof OfflineSyncClientError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new OfflineSyncClientError("OFFLINE_SYNC_TIMEOUT", "TIMEOUT");
      }
      throw new OfflineSyncClientError("OFFLINE_SYNC_NETWORK_ERROR", "NETWORK");
    } finally {
      clearTimeout(timer);
    }
  }
}
