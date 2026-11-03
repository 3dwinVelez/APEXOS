import { API_BASE_URL } from "./apiBaseUrl";

export type ComponentStatus = "ok" | "degraded" | "down" | "unknown";

export const STATUS_LABEL: Record<ComponentStatus, string> = {
  ok: "Operativo",
  degraded: "Degradado",
  down: "Caído",
  unknown: "Sin datos"
};

export const STATUS_TONE: Record<ComponentStatus, string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
  degraded: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
  down: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
  unknown: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-500/10 dark:text-slate-300"
};

export type ApexControlComponent = {
  key: string;
  name: string;
  kind: string;
  criticality: "critical" | "standard" | string;
  enabled: boolean;
  status: ComponentStatus;
  latency_ms: number | null;
  error_rate: number | null;
  score: number;
  details: Record<string, unknown>;
  last_checked_at: string | null;
  sampled_at: string | null;
};

export type ApexControlIncident = {
  id: string;
  component_key: string;
  severity: string;
  status: "open" | "acknowledged" | "resolved" | string;
  title: string;
  summary: string;
  fingerprint: string;
  first_seen: string | null;
  last_seen: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  evidence: Record<string, unknown>;
};

export type ApexControlEvent = {
  id: string;
  source: string;
  kind: string;
  severity: "debug" | "info" | "warning" | "error" | "critical" | string;
  component_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  fingerprint: string;
  payload: Record<string, unknown>;
  occurred_at: string | null;
};

export type ApexControlNotification = {
  id: string;
  level: string;
  title: string;
  message: string;
  href: string | null;
  read_at: string | null;
  created_at: string | null;
};

export type ApexControlReportRun = {
  id: string;
  kind: string;
  period_key: string;
  status: string;
  recipients: string[];
  summary: Record<string, unknown>;
  sent_at: string | null;
  created_at: string | null;
};

export type ApexControlStatus = {
  generated_at: string;
  status: ComponentStatus;
  score: number;
  counts: Record<ComponentStatus, number>;
  enabled: boolean;
  interval_ms: number;
  components: ApexControlComponent[];
  incidents: ApexControlIncident[];
  notifications_unread: number;
  last_report: ApexControlReportRun | null;
};

export type ApexControlSnapshot = {
  taken_at: string;
  status: ComponentStatus;
  score: number;
  counts: Record<ComponentStatus, number>;
  components: ApexControlComponent[];
};

function token() {
  return typeof window === "undefined" ? "" : localStorage.getItem("token") || "";
}

function companyId() {
  return typeof window === "undefined" ? "" : localStorage.getItem("apexos_company_id") || "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token()}`,
      "x-company-id": companyId(),
      ...(init.headers || {})
    },
    cache: "no-store"
  });
  if (response.status === 401) {
    throw Object.assign(new Error("Sesion expirada. Vuelve a iniciar sesion."), { status: 401 });
  }
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      message = body?.error || body?.message || message;
    } catch {
      // Respuesta sin cuerpo JSON.
    }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response.json() as Promise<T>;
}

export function getApexControlStatus() {
  return request<ApexControlStatus>("/apex-control/status");
}

export function getApexControlEvents(params: { limit?: number; since?: string; severity?: string; kind?: string } = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.since) query.set("since", params.since);
  if (params.severity) query.set("severity", params.severity);
  if (params.kind) query.set("kind", params.kind);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ events: ApexControlEvent[]; generated_at: string }>(`/apex-control/events${suffix}`);
}

export function getApexControlIncidents(params: { status?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ApexControlIncident[]>(`/apex-control/incidents${suffix}`);
}

export function acknowledgeApexControlIncident(id: string) {
  return request<ApexControlIncident>(`/apex-control/incidents/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
}

export function getApexControlNotifications(params: { unread?: boolean; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.unread) query.set("unread", "true");
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ notifications: ApexControlNotification[]; unread: number }>(`/apex-control/notifications${suffix}`);
}

export function markApexControlNotificationRead(id: string) {
  return request<ApexControlNotification>(`/apex-control/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function getApexControlReports() {
  return request<{ reports: ApexControlReportRun[] }>("/apex-control/reports");
}

export function apexControlSocketUrl() {
  const apiUrl = API_BASE_URL || (typeof window === "undefined" ? "" : window.location.origin);
  const base = (process.env.NEXT_PUBLIC_WS_URL || apiUrl.replace(/^http/, "ws")).replace(/\/$/, "");
  return base ? `${base}/apex-control/live` : "";
}

export type ApexControlLiveHandlers = {
  onReady?: (data: { company: string }) => void;
  onSnapshot?: (snapshot: ApexControlSnapshot) => void;
  onEvent?: (event: ApexControlEvent) => void;
  onNotification?: (notification: ApexControlNotification) => void;
  onConnection?: (state: "connected" | "disconnected") => void;
};

export function connectApexControlLive(handlers: ApexControlLiveHandlers) {
  const url = apexControlSocketUrl();
  const authToken = token();
  if (!url || !authToken || typeof WebSocket === "undefined") return () => {};

  let socket: WebSocket | null = null;
  let closed = false;
  let retries = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      socket?.send(JSON.stringify({ type: "authenticate", token: authToken, company_id: companyId() }));
    };
    socket.onmessage = (message) => {
      let value: { type?: string; data?: unknown };
      try {
        value = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if (value.type === "apex-control:ready") {
        retries = 0;
        handlers.onConnection?.("connected");
        handlers.onReady?.(value.data as { company: string });
      } else if (value.type === "apex-control:snapshot") {
        handlers.onSnapshot?.(value.data as ApexControlSnapshot);
      } else if (value.type === "apex-control:event") {
        handlers.onEvent?.(value.data as ApexControlEvent);
      } else if (value.type === "apex-control:notification") {
        handlers.onNotification?.(value.data as ApexControlNotification);
      }
    };
    socket.onclose = () => {
      handlers.onConnection?.("disconnected");
      if (closed) return;
      retries += 1;
      timer = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** Math.min(retries, 5)));
    };
    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        // Cierre best-effort.
      }
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    try {
      socket?.close();
    } catch {
      // Cierre best-effort.
    }
  };
}
