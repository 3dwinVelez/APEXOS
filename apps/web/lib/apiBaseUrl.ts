export function normalizeApiBaseUrl(value: string | undefined) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
