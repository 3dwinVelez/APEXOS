const LAST_ACTIVITY_KEY = "apex_last_activity";
const SESSION_TIMEOUT_MINUTES = Number(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES || 45);
const PASSWORD_CHANGE_REQUIRED_KEY = "apex_password_change_required";
const APP_ALERT_EVENT = "apex:app-alert";

type AppAlert = {
  title: string;
  message: string;
  technical?: string;
  level?: "info" | "warning" | "error";
};

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
