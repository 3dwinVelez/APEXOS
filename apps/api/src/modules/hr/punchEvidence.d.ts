export type PunchPhoto = { base64_data?: string; file_url?: string; file_name: string; mime_type: string };
export type PunchPhotoRow = { extra_evidence?: unknown; metadata?: { identity_photo?: unknown; extra_evidence?: unknown; photo?: unknown; photo_name?: unknown } | null };
export function punchPhotoItems(row?: PunchPhotoRow): PunchPhoto[];
export function punchMonitorMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown>;
export function punchEvidenceCount(row?: PunchPhotoRow): number;
