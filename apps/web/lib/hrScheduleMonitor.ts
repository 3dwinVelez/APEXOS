export function localCalendarDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function scheduleMonitorDate(value?: string | null, fallback = localCalendarDate()) {
  if (!value) return fallback;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : localCalendarDate(date);
}

export type ScheduleMonitorEvidence = {
  id?: string | number;
  base64_data?: string;
  file_name?: string;
  file_url?: string;
  has_base64_data?: boolean;
  available?: boolean;
};

export function scheduleMonitorPunchEvidence(row: {
  extra_evidence?: ScheduleMonitorEvidence | Record<string, unknown> | null;
  metadata?: {
    extra_evidence?: ScheduleMonitorEvidence | Record<string, unknown> | null;
    photo?: unknown;
    photo_name?: unknown;
  } | null;
}): ScheduleMonitorEvidence {
  const evidence = (row.extra_evidence || row.metadata?.extra_evidence || {}) as Record<string, unknown>;
  const base64 = String(evidence.base64_data || evidence.base64 || row.metadata?.photo || "").trim();
  const fileUrl = String(evidence.file_url || "").trim();
  const fileName = String(evidence.file_name || evidence.name || row.metadata?.photo_name || "evidencia.jpg").trim();

  if (!base64 && !fileUrl) return {};
  return {
    ...(base64 ? { base64_data: base64 } : {}),
    ...(fileUrl ? { file_url: fileUrl } : {}),
    file_name: fileName || "evidencia.jpg"
  };
}

export function scheduleMonitorPunchEvidenceSummary(row: Parameters<typeof scheduleMonitorPunchEvidence>[0] & { id?: string | number }) {
  const evidence = scheduleMonitorPunchEvidence(row);
  if (!evidence.base64_data && !evidence.file_url) return {};
  return {
    ...(row.id != null ? { id: row.id } : {}),
    ...(evidence.file_name ? { file_name: evidence.file_name } : {}),
    ...(evidence.file_url ? { file_url: evidence.file_url } : {}),
    has_base64_data: Boolean(evidence.base64_data),
    available: true
  };
}

export function scheduleGpsRequired(route: { gps_required?: unknown; tracking_mode?: unknown; metadata?: Record<string, unknown> | null } | null | undefined) {
  if (!route) return true;
  if (route.gps_required != null) return route.gps_required !== false;
  if (route.metadata?.gps_required != null) return route.metadata.gps_required !== false;
  return String(route.tracking_mode || route.metadata?.tracking_mode || "gps").toLowerCase() !== "punch_only";
}

export function scheduleTrackingMode(gpsRequired: boolean) {
  return gpsRequired ? "gps" : "punch_only";
}
