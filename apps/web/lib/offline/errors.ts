export type OfflineStorageErrorCode =
  | "CONTEXT_INVALID"
  | "CONTEXT_MISMATCH"
  | "SCHEMA_INCOMPATIBLE"
  | "SNAPSHOT_INVALID"
  | "SNAPSHOT_STALE"
  | "QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE"
  | "DATABASE_BLOCKED"
  | "DATABASE_CLOSED"
  | "TRANSACTION_ABORTED"
  | "MIGRATION_FAILED"
  | "CORRUPT_DATA"
  | "UNKNOWN_STORAGE_ERROR";

export class OfflineStorageError extends Error {
  readonly code: OfflineStorageErrorCode;
  readonly retryable: boolean;

  constructor(code: OfflineStorageErrorCode, message: string, retryable = false, cause?: unknown) {
    super(message, { cause });
    this.name = "OfflineStorageError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function toOfflineStorageError(error: unknown): OfflineStorageError {
  if (error instanceof OfflineStorageError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError") {
    return new OfflineStorageError("QUOTA_EXCEEDED", "La cuota local es insuficiente.", false, error);
  }
  if (name === "InvalidStateError" || name === "MissingAPIError") {
    return new OfflineStorageError(
      "STORAGE_UNAVAILABLE",
      "IndexedDB no esta disponible en este navegador.",
      false,
      error
    );
  }
  if (name === "DatabaseClosedError") {
    return new OfflineStorageError("DATABASE_CLOSED", "La base local esta cerrada.", true, error);
  }
  if (name === "AbortError" || name === "TransactionInactiveError") {
    return new OfflineStorageError(
      "TRANSACTION_ABORTED",
      "La transaccion local fue abortada.",
      true,
      error
    );
  }
  return new OfflineStorageError(
    "UNKNOWN_STORAGE_ERROR",
    "Fallo inesperado del almacenamiento local.",
    false,
    error
  );
}

