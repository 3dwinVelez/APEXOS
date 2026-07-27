export type SyncStatus =
  | "LOCAL_ONLY"
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "FAILED"
  | "CONFLICT"
  | "BLOCKED";

export type OfflineOperationType =
  | "SERVICE_STARTED"
  | "SERVICE_COMPLETION_REQUESTED"
  | "ACTIVITY_COMPLETED"
  | "CHECKLIST_UPDATED"
  | "OBSERVATION_ADDED"
  | "EVIDENCE_CAPTURED"
  | "LOCATION_EVENT_RECORDED";

export type SyncOperationResultStatus =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "RETRYABLE_ERROR"
  | "REJECTED"
  | "CONFLICT"
  | "BLOCKED";

export type SyncErrorCategory =
  | "NETWORK"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "SERVER"
  | "STORAGE"
  | "UNKNOWN";

export interface OfflineOperation<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  operationId: string;
  type: OfflineOperationType;
  entityId: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  baseVersion: number;
  occurredAt: string;
  payload: TPayload;
}

export interface SyncError {
  category: SyncErrorCategory;
  code: string;
  message: string;
  retryAfterMs?: number;
}

export interface OfflineConflict {
  entityType: string;
  entityId: string;
  baseVersion: number;
  serverVersion: number;
  fields: string[];
  rule: string;
  allowedActions: string[];
}

export interface SyncOperationResult {
  operationId: string;
  status: SyncOperationResultStatus;
  serverEntityId?: string;
  serverVersion?: number;
  processedAt: string;
  error?: SyncError | null;
  conflict?: OfflineConflict | null;
}

export interface SyncCheckpoint {
  value: string;
  issuedAt: string;
  expiresAt?: string;
}

export interface DeviceIdentity {
  deviceId: string;
  registeredAt: string;
  schemaVersion: number;
  capabilities: string[];
}

export interface OfflineLocalMetadata {
  tenantId: string;
  userId: string;
  schemaVersion: number;
  lastCheckpoint?: SyncCheckpoint;
  lastSyncedAt?: string;
  expiresAt: string;
}

export interface ContractValidationError {
  code: "OFFLINE_CONTRACT_INVALID";
  issues: string[];
}

export type ContractValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ContractValidationError };

export const SYNC_STATUSES: readonly SyncStatus[];
export const OFFLINE_OPERATION_TYPES: readonly OfflineOperationType[];
export const SYNC_OPERATION_RESULT_STATUSES: readonly SyncOperationResultStatus[];
export const SYNC_ERROR_CATEGORIES: readonly SyncErrorCategory[];
export function validateOfflineOperation(value: unknown): ContractValidationResult<OfflineOperation>;
export function validateSyncOperationResult(value: unknown): ContractValidationResult<SyncOperationResult>;
export * from "./repositories";
