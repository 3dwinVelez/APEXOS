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

const EVENT_NAME = "apex:alert";

export function notifyPlatform(payload: PlatformAlertPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

export function platformAlertEventName() {
  return EVENT_NAME;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
