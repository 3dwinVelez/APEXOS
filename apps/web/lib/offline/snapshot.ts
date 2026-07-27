import { assertSameContext, localKey } from "./context.ts";
import { OfflineStorageError } from "./errors.ts";
import {
  OFFLINE_LOCAL_SCHEMA_VERSION,
  OFFLINE_LOCAL_TTL_MS,
  type OfflineActivityRecord,
  type OfflineCatalogRecord,
  type OfflineChecklistRecord,
  type OfflineOrderRecord,
  type OfflineSnapshot,
  type OfflineStorageContext
} from "./types.ts";

const ORDER_KEYS = new Set([
  "serverId",
  "orderId",
  "orderNumber",
  "status",
  "assignedTechnicianId",
  "customerDisplayName",
  "serviceAddress",
  "scheduledAt",
  "minimumOperationalData",
  "serverVersion",
  "serverUpdatedAt"
]);
const ACTIVITY_KEYS = new Set([
  "serverId",
  "activityId",
  "orderId",
  "activityType",
  "title",
  "description",
  "status",
  "sequence",
  "required",
  "serverVersion",
  "serverUpdatedAt"
]);
const CHECKLIST_KEYS = new Set([
  "serverId",
  "checklistId",
  "orderId",
  "label",
  "sequence",
  "required",
  "value",
  "serverVersion",
  "serverUpdatedAt"
]);
const CATALOG_KEYS = new Set([
  "serverId",
  "catalogType",
  "code",
  "label",
  "serverVersion",
  "serverUpdatedAt"
]);
const MINIMUM_DATA_KEYS = new Set(["referenceDisplayName", "serviceSummary", "contactPhone"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value: unknown, allowed: Set<string>, label: string): void {
  if (!isRecord(value)) throw new OfflineStorageError("SNAPSHOT_INVALID", `${label} debe ser objeto.`);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) {
    throw new OfflineStorageError(
      "SNAPSHOT_INVALID",
      `${label} contiene campos no autorizados: ${extra.join(", ")}.`
    );
  }
}

function assertString(value: unknown, label: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !value.trim()) {
    throw new OfflineStorageError("SNAPSHOT_INVALID", `${label} debe ser texto.`);
  }
}

function assertDate(value: unknown, label: string, nullable = false): void {
  if (nullable && value === null) return;
  assertString(value, label);
  if (Number.isNaN(Date.parse(value as string))) {
    throw new OfflineStorageError("SNAPSHOT_INVALID", `${label} debe ser ISO-8601.`);
  }
}

function assertVersion(value: unknown, label: string): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new OfflineStorageError("SNAPSHOT_INVALID", `${label} debe ser monotona no negativa.`);
  }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new OfflineStorageError("SNAPSHOT_INVALID", `${label} debe ser arreglo.`);
  }
}

function commonRecordValidation(record: Record<string, unknown>, label: string): void {
  assertString(record.serverId, `${label}.serverId`);
  assertVersion(record.serverVersion, `${label}.serverVersion`);
  assertDate(record.serverUpdatedAt, `${label}.serverUpdatedAt`);
}

export function validateOfflineSnapshot(
  value: unknown,
  expectedContext: OfflineStorageContext
): OfflineSnapshot {
  if (!isRecord(value) || !isRecord(value.context)) {
    throw new OfflineStorageError("SNAPSHOT_INVALID", "Snapshot o contexto invalido.");
  }
  assertSameContext(expectedContext, value.context as unknown as OfflineStorageContext);
  if (value.schemaVersion !== OFFLINE_LOCAL_SCHEMA_VERSION) {
    throw new OfflineStorageError("SCHEMA_INCOMPATIBLE", "Version de snapshot no soportada.");
  }
  assertString(value.snapshotId, "snapshotId");
  assertString(value.serverCheckpoint, "serverCheckpoint");
  assertDate(value.generatedAt, "generatedAt");
  if (value.expiresAt !== undefined) assertDate(value.expiresAt, "expiresAt");
  assertArray(value.orders, "orders");
  assertArray(value.activities, "activities");
  assertArray(value.checklists, "checklists");
  assertArray(value.catalogs, "catalogs");

  const orderIds = new Set<string>();
  for (const item of value.orders) {
    assertExactKeys(item, ORDER_KEYS, "order");
    const record = item as Record<string, unknown>;
    commonRecordValidation(record, "order");
    for (const key of [
      "orderId",
      "orderNumber",
      "status",
      "assignedTechnicianId",
      "customerDisplayName",
      "serviceAddress"
    ]) {
      assertString(record[key], `order.${key}`);
    }
    assertDate(record.scheduledAt, "order.scheduledAt", true);
    assertExactKeys(record.minimumOperationalData, MINIMUM_DATA_KEYS, "minimumOperationalData");
    orderIds.add(String(record.orderId));
  }

  for (const item of value.activities) {
    assertExactKeys(item, ACTIVITY_KEYS, "activity");
    const record = item as Record<string, unknown>;
    commonRecordValidation(record, "activity");
    for (const key of ["activityId", "orderId", "activityType", "title", "description", "status"]) {
      assertString(record[key], `activity.${key}`);
    }
    if (!orderIds.has(String(record.orderId))) {
      throw new OfflineStorageError("SNAPSHOT_INVALID", "Actividad sin orden autorizada.");
    }
    if (!Number.isInteger(record.sequence) || typeof record.required !== "boolean") {
      throw new OfflineStorageError("SNAPSHOT_INVALID", "Secuencia o requerido de actividad invalido.");
    }
  }

  for (const item of value.checklists) {
    assertExactKeys(item, CHECKLIST_KEYS, "checklist");
    const record = item as Record<string, unknown>;
    commonRecordValidation(record, "checklist");
    for (const key of ["checklistId", "orderId", "label"]) {
      assertString(record[key], `checklist.${key}`);
    }
    if (!orderIds.has(String(record.orderId))) {
      throw new OfflineStorageError("SNAPSHOT_INVALID", "Checklist sin orden autorizada.");
    }
    if (!Number.isInteger(record.sequence) || typeof record.required !== "boolean") {
      throw new OfflineStorageError("SNAPSHOT_INVALID", "Secuencia o requerido de checklist invalido.");
    }
    if (!["string", "boolean", "number"].includes(typeof record.value) && record.value !== null) {
      throw new OfflineStorageError("SNAPSHOT_INVALID", "Valor de checklist invalido.");
    }
  }

  for (const item of value.catalogs) {
    assertExactKeys(item, CATALOG_KEYS, "catalog");
    const record = item as Record<string, unknown>;
    commonRecordValidation(record, "catalog");
    for (const key of ["catalogType", "code", "label"]) {
      assertString(record[key], `catalog.${key}`);
    }
  }

  return value as unknown as OfflineSnapshot;
}

export function materializeSnapshot(
  snapshot: OfflineSnapshot,
  context: OfflineStorageContext,
  now = new Date(),
  ttlMs = OFFLINE_LOCAL_TTL_MS
): {
  orders: OfflineOrderRecord[];
  activities: OfflineActivityRecord[];
  checklists: OfflineChecklistRecord[];
  catalogs: OfflineCatalogRecord[];
  storedAt: string;
  expiresAt: string;
} {
  const storedAt = now.toISOString();
  const configuredExpiry = snapshot.expiresAt ? Date.parse(snapshot.expiresAt) : now.getTime() + ttlMs;
  const expiresAt = new Date(Math.min(configuredExpiry, now.getTime() + ttlMs)).toISOString();
  const common = {
    environmentId: context.environmentId,
    companyId: context.companyId,
    userId: context.userId,
    storedAt,
    expiresAt,
    schemaVersion: OFFLINE_LOCAL_SCHEMA_VERSION
  };
  return {
    orders: snapshot.orders.map((record) => {
      const recordKey = localKey("order", record.orderId);
      return {
      ...record,
      ...common,
      localKey: recordKey,
      localId: recordKey,
      syncStatus: "SYNCED",
      updatedAtLocal: storedAt,
      entityVersion: record.serverVersion
    };
    }),
    activities: snapshot.activities.map((record) => {
      const recordKey = localKey("activity", record.activityId);
      return {
      ...record,
      ...common,
      localKey: recordKey,
      localId: recordKey,
      syncStatus: "SYNCED",
      updatedAtLocal: storedAt,
      entityVersion: record.serverVersion
    };
    }),
    checklists: snapshot.checklists.map((record) => {
      const recordKey = localKey(
        "checklist",
        `${record.orderId}:${record.checklistId}`
      );
      return {
      ...record,
      ...common,
      localKey: recordKey,
      localId: recordKey,
      syncStatus: "SYNCED",
      updatedAtLocal: storedAt,
      entityVersion: record.serverVersion
    };
    }),
    catalogs: snapshot.catalogs.map((record) => {
      const recordKey = localKey(`catalog:${record.catalogType}`, record.serverId);
      return {
      ...record,
      ...common,
      localKey: recordKey,
      localId: recordKey
    };
    }),
    storedAt,
    expiresAt
  };
}
