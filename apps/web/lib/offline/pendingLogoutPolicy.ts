import type { OfflineOperationStatus } from "./types.ts";

export type OfflinePendingLogoutDecision =
  | { action: "CLEAR_LOCAL_DATA"; pending: 0 }
  | {
      action: "REQUIRE_EXPLICIT_DECISION";
      pending: number;
      options: readonly ["RETURN_TO_SYNC", "DISCARD_WITH_CONFIRMATION"];
    };

const PENDING_STATUSES = new Set<OfflineOperationStatus>([
  "PENDING",
  "PROCESSING",
  "RETRYABLE",
  "BLOCKED",
  "CONFLICT"
]);

export function pendingLogoutDecision(
  counts: Partial<Record<OfflineOperationStatus, number>>
): OfflinePendingLogoutDecision {
  const pending = [...PENDING_STATUSES].reduce(
    (total, status) => total + (counts[status] || 0),
    0
  );
  return pending === 0
    ? { action: "CLEAR_LOCAL_DATA", pending: 0 }
    : {
        action: "REQUIRE_EXPLICIT_DECISION",
        pending,
        options: ["RETURN_TO_SYNC", "DISCARD_WITH_CONFIRMATION"]
      };
}
