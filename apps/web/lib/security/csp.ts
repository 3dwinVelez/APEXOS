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

export function configuredWebSocketOrigin(
  wsUrl: string | undefined,
  apiUrl: string | undefined
): string {
  if (!apiUrl) return "";
  try {
    const api = new URL(apiUrl);
    if (!["http:", "https:"].includes(api.protocol) || !api.hostname || api.username || api.password) return "";
    const url = new URL(wsUrl || apiUrl.replace(/^http/, "ws"));
    if (!["ws:", "wss:"].includes(url.protocol)) return "";
    if (!url.hostname || url.username || url.password) return "";
    if (url.protocol === "wss:") return "";
    if (url.hostname !== api.hostname) return "";
    return url.origin;
  } catch {
    return "";
  }
}

