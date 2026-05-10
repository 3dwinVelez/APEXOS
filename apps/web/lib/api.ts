const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (response.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh");
    window.location.href = "/login";
    throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || "La solicitud no pudo completarse");
  }
  return response.json() as Promise<T>;
}
