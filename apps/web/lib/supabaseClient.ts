const QA_SUPABASE_URL = "https://jbirkghkekuifgfsgquq.supabase.co";
const QA_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Plz-iF_ayZUBR0XSq0klMw_svtfQzoX";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || QA_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || QA_SUPABASE_PUBLISHABLE_KEY;

type SupabaseFetchOptions = RequestInit & {
  contentType?: string;
  requireSession?: boolean;
};

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

export async function supabaseFetch<T>(path: string, options: SupabaseFetchOptions = {}): Promise<T> {
  const { contentType = "application/json", requireSession = true, headers, ...init } = options;
  const response = await fetch(supabaseUrl(path), {
    ...init,
    headers: {
      ...supabaseHeaders({ contentType, requireSession }),
      ...headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    const detail = body.message || body.error_description || body.error || JSON.stringify(body);
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const supabaseAuth = {
  signInWithPassword(email: string, password: string) {
    return supabaseFetch<{ access_token: string; refresh_token: string; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=password", {
      method: "POST",
      requireSession: false,
      body: JSON.stringify({ email, password })
    });
  },
  getUser() {
    return supabaseFetch<{ user: { id: string; email?: string } }>("/auth/v1/user", { method: "GET" });
  },
  signOut() {
    return supabaseFetch<void>("/auth/v1/logout", { method: "POST" });
  }
};
