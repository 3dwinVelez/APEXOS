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

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Origenes extra para img-src. Solo hacen falta en desarrollo, donde el almacen de
// objetos del puesto (MinIO en http://localhost:9000) sirve los banners por http y la
// politica general solo permite https:. En produccion la lista se ignora: aflojar el
// CSP por variable de ambiente seria una puerta trasera. Se admite puerto (el almacen
// local lo usa) pero nunca un host que no sea loopback, ni rutas ni credenciales.
export function configuredImageOrigins(raw: string | undefined, isDevelopment: boolean): string {
  if (!isDevelopment || !raw) return "";
  const origins: string[] = [];
  for (const entry of String(raw).split(",")) {
    const value = entry.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      if (!LOOPBACK_HOSTS.has(url.hostname)) continue;
      if (url.username || url.password) continue;
      if (url.pathname !== "/" || url.search || url.hash) continue;
      if (!origins.includes(url.origin)) origins.push(url.origin);
    } catch {
      // Entrada mal formada: se descarta, no se abre la politica.
    }
  }
  return origins.length ? ` ${origins.join(" ")}` : "";
}

