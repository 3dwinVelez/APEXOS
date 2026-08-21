const DEFAULT_COLLECTION_KEYS = ["data", "rows", "items", "results"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accepts both the canonical array response and legacy/paginated wrappers.
 * Unexpected successful payloads become an empty collection instead of
 * reaching a React render path that calls `.map()` on a non-array value.
 */
export function asCollection<T>(value: unknown, preferredKeys: readonly string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!isRecord(value)) return [];

  for (const key of [...preferredKeys, ...DEFAULT_COLLECTION_KEYS]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate as T[];
    if (isRecord(candidate)) {
      for (const nestedKey of [...preferredKeys, ...DEFAULT_COLLECTION_KEYS]) {
        const nested = candidate[nestedKey];
        if (Array.isArray(nested)) return nested as T[];
      }
    }
  }

  return [];
}

export function asRecord<T extends object>(value: unknown, preferredKeys: readonly string[] = []): Partial<T> {
  if (!isRecord(value)) return {};
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (isRecord(candidate)) return candidate as Partial<T>;
  }
  return value as Partial<T>;
}
