const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_SUPABASE_TIMEOUT_MS || 20000);
const SUPABASE_GET_CACHE_TTL_MS = Number(process.env.NEXT_PUBLIC_SUPABASE_GET_CACHE_TTL_MS || 12000);
const SUPABASE_GET_STALE_MS = Number(process.env.NEXT_PUBLIC_SUPABASE_GET_STALE_MS || 60000);
const SUPABASE_GET_CACHE_MAX_ENTRIES = Number(process.env.NEXT_PUBLIC_SUPABASE_GET_CACHE_MAX_ENTRIES || 120);
const SUPABASE_SESSION_REFRESH_WINDOW_MS = 5 * 60 * 1000;

type SupabaseFetchOptions = RequestInit & {
  contentType?: string;
  requireSession?: boolean;
  cacheTtlMs?: number;
  skipAuthRefresh?: boolean;
};

type SupabaseCacheEntry = {
  at: number;
  token: string;
  refreshing?: Promise<unknown>;
  promise?: Promise<unknown>;
  value?: unknown;
};

const supabaseGetCache = new Map<string, SupabaseCacheEntry>();
let supabaseRefreshInFlight: Promise<boolean> | null = null;

export function getSupabaseConfigStatus() {
  return {
    hasUrl: Boolean(SUPABASE_URL),
    hasAnonKey: Boolean(SUPABASE_ANON_KEY),
    ready: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
  };
}

export function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

export function getSupabaseAccessToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function parseTokenPayload(token: string | null) {
  if (!token?.includes(".")) return null;
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number; iss?: string };
  } catch {
    return null;
  }
}

function isSupabaseSessionToken(token: string | null) {
  const payload = parseTokenPayload(token);
  return Boolean(payload?.iss && String(payload.iss).includes("supabase"));
}

function shouldRefreshSupabaseToken(token: string | null) {
  const payload = parseTokenPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 - Date.now() <= SUPABASE_SESSION_REFRESH_WINDOW_MS;
}

export async function refreshSupabaseSession(force = false) {
  if (typeof window === "undefined") return false;
  const token = localStorage.getItem("token");
  const provider = localStorage.getItem("auth_provider");
  if (provider !== "supabase" && !isSupabaseSessionToken(token)) return false;
  if (!force && !shouldRefreshSupabaseToken(token)) return true;

  const refreshToken = localStorage.getItem("refresh");
  if (!refreshToken) return false;
  if (!supabaseRefreshInFlight) {
    supabaseRefreshInFlight = (async () => {
      try {
        const data = await supabaseAuth.refreshSession(refreshToken);
        if (!data.access_token) return false;
        localStorage.setItem("token", data.access_token);
        if (data.refresh_token) localStorage.setItem("refresh", data.refresh_token);
        if (data.user?.email) localStorage.setItem("user_email", data.user.email);
        clearSupabaseFetchCache();
        return true;
      } catch {
        return false;
      } finally {
        supabaseRefreshInFlight = null;
      }
    })();
  }
  return supabaseRefreshInFlight;
}

export function supabaseUrl(path: string) {
  requireSupabaseConfig();
  return `${SUPABASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function supabaseHeaders({ contentType, requireSession = true }: Pick<SupabaseFetchOptions, "contentType" | "requireSession"> = {}) {
  requireSupabaseConfig();
  const token = getSupabaseAccessToken();
  if (requireSession && !token) throw new Error("Sesion requerida para consultar Supabase.");
  return {
    apikey: SUPABASE_ANON_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(contentType ? { "Content-Type": contentType } : {})
  };
}

function supabaseCacheKey(path: string, token: string) {
  return `${token.slice(0, 24)}:${path}`;
}

function pruneSupabaseGetCache() {
  while (supabaseGetCache.size > SUPABASE_GET_CACHE_MAX_ENTRIES) {
    const oldestKey = supabaseGetCache.keys().next().value;
    if (!oldestKey) return;
    supabaseGetCache.delete(oldestKey);
  }
}

export function clearSupabaseFetchCache() {
  supabaseGetCache.clear();
}

async function executeSupabaseFetch<T>(
  path: string,
  options: SupabaseFetchOptions,
  controller: AbortController
): Promise<T> {
  const { contentType = "application/json", requireSession = true, headers, cacheTtlMs, skipAuthRefresh, ...init } = options;
  void cacheTtlMs;
  void skipAuthRefresh;
  let response: Response;
  try {
    response = await fetch(supabaseUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        ...supabaseHeaders({ contentType, requireSession }),
        Accept: "application/json",
        ...headers
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Supabase no respondio a tiempo. Reintenta en unos segundos.");
    }
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    const detail = body.message || body.error_description || body.error || JSON.stringify(body);
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function isSupabaseUnauthorizedError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /^Supabase 401\b/.test(error.message);
}

export async function supabaseFetch<T>(path: string, options: SupabaseFetchOptions = {}): Promise<T> {
  const { contentType = "application/json", requireSession = true, headers, cacheTtlMs, skipAuthRefresh = false, ...init } = options;
  const method = String(init.method || "GET").toUpperCase();
  if (requireSession && !skipAuthRefresh) await refreshSupabaseSession(false);
  const token = getSupabaseAccessToken() || "";
  const ttl = cacheTtlMs ?? SUPABASE_GET_CACHE_TTL_MS;
  const canCache = method === "GET" && ttl > 0;
  const key = canCache ? supabaseCacheKey(path, token) : "";
  if (method !== "GET") clearSupabaseFetchCache();
  if (key) {
    const cached = supabaseGetCache.get(key);
    if (cached?.promise) return cached.promise as Promise<T>;
    if (cached?.value !== undefined && cached.token === token) {
      const age = Date.now() - cached.at;
      if (age <= ttl) return cached.value as T;
      if (age <= ttl + SUPABASE_GET_STALE_MS) {
        if (!cached.refreshing) {
          cached.refreshing = supabaseFetch<T>(path, { ...options, cacheTtlMs: 0 })
            .then((value) => {
              supabaseGetCache.set(key, { at: Date.now(), token, value });
              pruneSupabaseGetCache();
              return value;
            })
            .catch(() => cached.value);
          supabaseGetCache.set(key, cached);
        }
        return cached.value as T;
      }
    }
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  const request = (async () => {
    try {
      return await executeSupabaseFetch<T>(path, { contentType, requireSession, headers, cacheTtlMs, skipAuthRefresh, ...init }, controller);
    } catch (error) {
      if (!skipAuthRefresh && requireSession && isSupabaseUnauthorizedError(error) && await refreshSupabaseSession(true)) {
        return executeSupabaseFetch<T>(path, { contentType, requireSession, headers, cacheTtlMs: 0, skipAuthRefresh: true, ...init }, controller);
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  })();
  if (key) {
    supabaseGetCache.set(key, { at: Date.now(), token, promise: request });
    pruneSupabaseGetCache();
    request
      .then((value) => {
        supabaseGetCache.set(key, { at: Date.now(), token, value });
        pruneSupabaseGetCache();
      })
      .catch(() => supabaseGetCache.delete(key));
  }
  return request;
}

export const supabaseAuth = {
  signInWithPassword(email: string, password: string) {
    return supabaseFetch<{ access_token: string; refresh_token: string; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=password", {
      method: "POST",
      requireSession: false,
      body: JSON.stringify({ email, password })
    });
  },
  refreshSession(refresh_token: string) {
    return supabaseFetch<{ access_token: string; refresh_token: string; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      requireSession: false,
      skipAuthRefresh: true,
      body: JSON.stringify({ refresh_token })
    });
  },
  getUser() {
    return supabaseFetch<{ user: { id: string; email?: string } }>("/auth/v1/user", { method: "GET" });
  },
  updatePassword(password: string) {
    return supabaseFetch<{ user: { id: string; email?: string } }>("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify({ password })
    });
  },
  signOut() {
    return supabaseFetch<void>("/auth/v1/logout", { method: "POST" });
  }
};
