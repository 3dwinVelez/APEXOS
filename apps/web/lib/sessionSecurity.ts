const LAST_ACTIVITY_KEY = "apex_last_activity";
const SESSION_TIMEOUT_MINUTES = Number(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES || 45);
const PASSWORD_CHANGE_REQUIRED_KEY = "apex_password_change_required";
const APP_ALERT_EVENT = "apex:alert";

type AppAlert = {
  title: string;
  message: string;
  technical?: string;
  level?: "info" | "warning" | "error";
};
const SESSION_REFRESH_WINDOW_MS = 5 * 60 * 1000;
let refreshPromise: Promise<void> | null = null;

function parseTokenPayload(token: string | null) {
  if (!token?.includes(".")) return null;
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number; iss?: string };
  } catch {
    return null;
  }
}

function isSupabaseToken(token: string | null) {
  const payload = parseTokenPayload(token);
  return Boolean(payload?.iss && String(payload.iss).includes("supabase"));
}

function shouldRefreshLocalToken(token: string | null) {
  if (!token || isSupabaseToken(token)) return false;
  const payload = parseTokenPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 - Date.now() <= SESSION_REFRESH_WINDOW_MS;
}

export function clearSession(reason = "expired") {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh");
  localStorage.removeItem("auth_provider");
  localStorage.removeItem("tenant_active_modules");
  localStorage.removeItem("role_permissions");
  localStorage.removeItem("role_metadata");
  localStorage.removeItem("role_name");
  localStorage.removeItem(PASSWORD_CHANGE_REQUIRED_KEY);
  localStorage.setItem("apex_session_end_reason", reason);
}

export function assertActiveSession() {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("token");
  if (!token) return;

  const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
  const inactiveMs = Date.now() - lastActivity;
  if (inactiveMs > SESSION_TIMEOUT_MINUTES * 60 * 1000) {
    clearSession("idle_timeout");
    window.location.href = "/login";
    throw new Error("Sesion cerrada por inactividad.");
  }
}

export function touchSession() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem("token")) return;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function setPasswordChangeRequired(required: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PASSWORD_CHANGE_REQUIRED_KEY, required ? "1" : "0");
}

export function emitAppAlert(alert: AppAlert) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_ALERT_EVENT, { detail: alert }));
}

export async function keepSessionAlive() {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("token");
  const refresh = localStorage.getItem("refresh");
  if (!token) return;
  if (!shouldRefreshLocalToken(token) || !refresh) {
    touchSession();
    return;
  }
  if (!refreshPromise) {
    refreshPromise = fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000"}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("No fue posible renovar la sesion.");
        const body = await response.json() as { token?: string };
        if (!body.token) throw new Error("La renovacion de sesion no devolvio token.");
        localStorage.setItem("token", body.token);
        touchSession();
      })
      .catch(() => {
        clearSession("refresh_failed");
        window.location.href = "/login";
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}
