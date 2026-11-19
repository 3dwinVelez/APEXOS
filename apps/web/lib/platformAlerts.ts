export type PlatformAlertLevel = "info" | "success" | "warning" | "error";

export type PlatformAlertPayload = {
  level?: PlatformAlertLevel;
  title: string;
  message: string;
  technical?: string;
  requestId?: string;
  source?: string;
  sticky?: boolean;
};

const DIAGNOSTIC_EVENT_NAME = "apex:diagnostic";
// Soporte enciende esta llave en el navegador del usuario para ver el detalle tecnico.
// Apagada, que es el estado de todo cliente, el fallo solo viaja a platform-logs.
const DIAGNOSTICS_FLAG = "apexos_diagnostics";

export function platformDiagnosticEventName() {
  return DIAGNOSTIC_EVENT_NAME;
}

export function technicalDiagnosticsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DIAGNOSTICS_FLAG) === "1";
  } catch {
    return false;
  }
}

export function emitPlatformDiagnostic(payload: PlatformAlertPayload) {
  if (typeof window === "undefined") return;
  if (!technicalDiagnosticsEnabled()) return;
  window.dispatchEvent(new CustomEvent(DIAGNOSTIC_EVENT_NAME, { detail: payload }));
}
