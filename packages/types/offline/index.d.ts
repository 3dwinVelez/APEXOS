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

export interface OfflineBootstrapOrder {
  serverId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  assignedTechnicianId: string;
  customerDisplayName: string;
  serviceAddress: string;
  scheduledAt: string | null;
  minimumOperationalData: {
    referenceDisplayName?: string;
    serviceSummary?: string;
    contactPhone?: string;
  };
  serverVersion: number;
  serverUpdatedAt: string;
}

export interface OfflineBootstrapActivity {
  serverId: string;
  activityId: string;
  orderId: string;
  activityType: string;
  title: string;
  description: string;
  status: string;
  sequence: number;
  required: boolean;
  serverVersion: number;
  serverUpdatedAt: string;
}

export interface OfflineBootstrapChecklist {
  serverId: string;
  checklistId: string;
  orderId: string;
  label: string;
  sequence: number;
  required: boolean;
  value: string | boolean | number | null;
  serverVersion: number;
  serverUpdatedAt: string;
}

export interface OfflineBootstrapCatalog {
  serverId: string;
  catalogType: string;
  code: string;
  label: string;
  serverVersion: number;
  serverUpdatedAt: string;
}

export interface OfflineBootstrapResponse {
  schemaVersion: 2;
  snapshotId: string;
  generatedAt: string;
  expiresAt: string;
  environmentId: string;
  companyId: string;
  userId: string;
  serverCheckpoint: string;
  orders: OfflineBootstrapOrder[];
  activities: OfflineBootstrapActivity[];
  checklists: OfflineBootstrapChecklist[];
  catalogs: OfflineBootstrapCatalog[];
  metadata: {
    ttlSeconds: number;
    hasMore: boolean;
    versionStrategy: "READ_TIMESTAMP_REVISION";
  };
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
export const OFFLINE_BOOTSTRAP_SCHEMA_VERSION: 2;
export function validateOfflineOperation(value: unknown): ContractValidationResult<OfflineOperation>;
export function validateSyncOperationResult(value: unknown): ContractValidationResult<SyncOperationResult>;
export function validateOfflineBootstrapResponse(
  value: unknown
): ContractValidationResult<OfflineBootstrapResponse>;
export * from "./repositories";
