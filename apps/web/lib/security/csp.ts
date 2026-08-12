export function configuredConnectOrigin(
  apiUrl: string | undefined,
  frontendOrigin?: string
): string {
  if (!apiUrl) return "";
  try {
    const url = new URL(apiUrl);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (!url.hostname || url.username || url.password) return "";
    const origin = url.origin;
    return frontendOrigin && origin === new URL(frontendOrigin).origin ? "" : origin;
  } catch {
    return "";
  }
}

