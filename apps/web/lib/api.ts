const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";

function isSupabaseSession() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("auth_provider") === "supabase") return true;
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.iss || "").includes("supabase") || String(payload.ref || "") === "jbirkghkekuifgfsgquq";
  } catch {
    return false;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error("API no disponible. Inicia el backend en http://localhost:3000.");
  }

  if (response.status === 401 && typeof window !== "undefined" && !isSupabaseSession()) {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh");
    window.location.href = "/login";
    throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error("API no disponible. Inicia el backend en http://localhost:3000.");
    }

    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || "La solicitud no pudo completarse");
  }
  return response.json() as Promise<T>;
}
