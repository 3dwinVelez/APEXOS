import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const API_BY_WEB_HOST: Record<string, string> = {
  "apexos-web-qa-production.up.railway.app": "https://apexos-api-qa-production.up.railway.app",
  "apexos-web-prod-production.up.railway.app": "https://apexos-api-prod-production.up.railway.app"
};

function configuredApiOrigin() {
  return String(process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "").replace(/\/+$/, "");
}

function apiOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hosts = [
    request.headers.get("host"),
    forwardedHost,
    request.nextUrl.hostname
  ].map((value) => String(value || "").split(":")[0].toLowerCase()).filter(Boolean);

  for (const host of hosts) {
    if (API_BY_WEB_HOST[host]) return API_BY_WEB_HOST[host];
  }

  const configured = configuredApiOrigin();
  if (configured) return configured;
  if (hosts.some((host) => host === "localhost" || host === "127.0.0.1")) return "http://127.0.0.1:3000";
  return "";
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const origin = apiOrigin(request);
  if (!origin) {
    return Response.json(
      { error: "API no configurada para este ambiente", code: "API_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const { path } = await context.params;
  const target = new URL(`/api/v1/${path.map(encodeURIComponent).join("/")}`, origin);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept", "x-request-id", "x-interaction-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = request.method.toUpperCase();
  const response = await fetch(target, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual"
  });

  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "x-request-id", "x-interaction-id", "server-timing"]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
