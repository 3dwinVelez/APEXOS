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
  base64_data?: string;
  file_name?: string;
  file_url?: string;
};

export function scheduleMonitorPunchEvidence(row: {
  extra_evidence?: ScheduleMonitorEvidence | Record<string, unknown> | null;
  metadata?: {
    extra_evidence?: ScheduleMonitorEvidence | Record<string, unknown> | null;
    photo?: unknown;
    photo_name?: unknown;
  } | null;
}) {
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
