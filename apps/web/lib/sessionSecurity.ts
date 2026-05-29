const LAST_ACTIVITY_KEY = "apex_last_activity";
const SESSION_TIMEOUT_MINUTES = Number(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES || 45);

export function clearSession(reason = "expired") {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh");
  localStorage.removeItem("auth_provider");
  localStorage.removeItem("tenant_active_modules");
  localStorage.removeItem("role_permissions");
  localStorage.removeItem("role_metadata");
  localStorage.removeItem("role_name");
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
