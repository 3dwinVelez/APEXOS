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
  readonly category:
    | "NETWORK"
    | "TIMEOUT"
    | "SERVER_TEMPORARY"
    | "AUTHENTICATION"
    | "AUTHORIZATION"
    | "VALIDATION"
    | "CONFLICT"
    | "RATE_LIMIT";

  constructor(
    code: string,
    category: OfflineSyncClientError["category"]
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
  private readonly request: (path: string, options: RequestInit) => Promise<unknown>;

  constructor(
    timeoutMs = 15_000,
    request?: (path: string, options: RequestInit) => Promise<unknown>
  ) {
    this.timeoutMs = timeoutMs;
    this.request = request || (async (path, options) => {
      const { api } = await import("../api.ts");
      return api<unknown>(path, options);
    });
  }

  async push(
    context: OfflineStorageContext,
    installationId: string,
    operations: OfflineOperationRecord[]
  ): Promise<OfflinePushResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.request("/api/v1/offline/sync/push", {
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
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 0;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "OFFLINE_SYNC_REQUEST_FAILED";
      if (status === 401) throw new OfflineSyncClientError(code, "AUTHENTICATION");
      if (status === 403) throw new OfflineSyncClientError(code, "AUTHORIZATION");
      if (status === 409) throw new OfflineSyncClientError(code, "CONFLICT");
      if (status === 422) throw new OfflineSyncClientError(code, "VALIDATION");
      if (status === 429) throw new OfflineSyncClientError(code, "RATE_LIMIT");
      if (status >= 500) throw new OfflineSyncClientError(code, "SERVER_TEMPORARY");
      throw new OfflineSyncClientError("OFFLINE_SYNC_NETWORK_ERROR", "NETWORK");
    } finally {
      clearTimeout(timer);
    }
  }
}
