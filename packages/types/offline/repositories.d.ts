import type {
  OfflineLocalMetadata,
  OfflineOperation,
  SyncOperationResult,
  SyncStatus
} from "./index";

export interface OfflineRepositoryContext {
  tenantId: string;
  userId: string;
}

export interface OfflineEntityRecord {
  localId: string;
  serverId?: string;
  entityVersion: number;
  syncStatus: SyncStatus;
  updatedAtLocal: string;
  serverUpdatedAt?: string;
}

export interface OfflineRepositoryError {
  code:
    | "NOT_OPEN"
    | "NOT_FOUND"
    | "QUOTA_EXCEEDED"
    | "TRANSACTION_FAILED"
    | "SCHEMA_INCOMPATIBLE"
    | "CONTEXT_MISMATCH";
  message: string;
  retryable: boolean;
}

export interface OfflineOrderRepository<TOrder extends OfflineEntityRecord = OfflineEntityRecord> {
  getById(context: OfflineRepositoryContext, id: string): Promise<TOrder | null>;
  list(context: OfflineRepositoryContext): Promise<TOrder[]>;
  putMany(context: OfflineRepositoryContext, orders: TOrder[]): Promise<void>;
  deleteMany(context: OfflineRepositoryContext, ids: string[]): Promise<number>;
}

export interface OfflineActivityRepository<TActivity extends OfflineEntityRecord = OfflineEntityRecord> {
  listByOrder(context: OfflineRepositoryContext, orderId: string): Promise<TActivity[]>;
  putMany(context: OfflineRepositoryContext, activities: TActivity[]): Promise<void>;
  deleteByOrder(context: OfflineRepositoryContext, orderId: string): Promise<number>;
}

export interface OfflineChecklistRepository<TItem extends OfflineEntityRecord = OfflineEntityRecord> {
  listByOrder(context: OfflineRepositoryContext, orderId: string): Promise<TItem[]>;
  putMany(context: OfflineRepositoryContext, items: TItem[]): Promise<void>;
  deleteByOrder(context: OfflineRepositoryContext, orderId: string): Promise<number>;
}

export interface OfflineEvidenceRepository<TEvidence extends OfflineEntityRecord = OfflineEntityRecord> {
  getById(context: OfflineRepositoryContext, id: string): Promise<TEvidence | null>;
  listPending(context: OfflineRepositoryContext, limit: number): Promise<TEvidence[]>;
  put(context: OfflineRepositoryContext, evidence: TEvidence): Promise<void>;
  delete(context: OfflineRepositoryContext, id: string): Promise<boolean>;
}

export interface OfflineOperationQueueRepository {
  enqueue(context: OfflineRepositoryContext, operation: OfflineOperation): Promise<void>;
  peek(context: OfflineRepositoryContext, limit: number): Promise<OfflineOperation[]>;
  markResult(context: OfflineRepositoryContext, result: SyncOperationResult): Promise<void>;
  deleteApplied(context: OfflineRepositoryContext, olderThan: string): Promise<number>;
}

export interface OfflineMetadataRepository {
  get(context: OfflineRepositoryContext): Promise<OfflineLocalMetadata | null>;
  put(context: OfflineRepositoryContext, metadata: OfflineLocalMetadata): Promise<void>;
  delete(context: OfflineRepositoryContext): Promise<boolean>;
}

export interface OfflineStorageTransaction {
  orders: OfflineOrderRepository;
  activities: OfflineActivityRepository;
  checklists: OfflineChecklistRepository;
  evidence: OfflineEvidenceRepository;
  operations: OfflineOperationQueueRepository;
  metadata: OfflineMetadataRepository;
}

export interface OfflineStorageEstimate {
  usageBytes: number;
  quotaBytes: number;
}

export interface OfflineStorageAdapter {
  readonly schemaVersion: number;
  open(context: OfflineRepositoryContext): Promise<void>;
  close(): Promise<void>;
  transaction<T>(work: (repositories: OfflineStorageTransaction) => Promise<T>): Promise<T>;
  estimate(): Promise<OfflineStorageEstimate>;
  migrate(targetSchemaVersion: number): Promise<void>;
  clear(context: OfflineRepositoryContext): Promise<void>;
  clearExpired(now: string): Promise<number>;
}
