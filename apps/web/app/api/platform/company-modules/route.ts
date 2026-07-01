import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

type ModuleAccessBody = {
  company_id?: string;
  module_id?: string;
  enabled?: boolean;
};

class PlatformAccessError extends Error {
  statusCode = 403;
}

function errorStatus(error: unknown) {
  return error instanceof PlatformAccessError ? error.statusCode : 500;
}

async function supabaseRequest(path: string, init: RequestInit & { token?: string; service?: boolean } = {}) {
  const { token, service, headers, ...rest } = init;
  const key = service ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest,
    headers: {
      apikey: key,
      Authorization: `Bearer ${service ? SUPABASE_SERVICE_ROLE_KEY : token}`,
      "Content-Type": "application/json",
      ...headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || response.statusText;
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  return body;
}

function clean(value?: string | null) {
  const next = value?.trim();
  return next ? next : null;
}

async function requirePlatformAdmin(token: string) {
  const currentUser = await supabaseRequest("/auth/v1/user", {
    method: "GET",
    token
  }) as { id?: string };

  if (!currentUser?.id) {
    throw new PlatformAccessError("Sesion invalida.");
  }

  const platformAdmins = await supabaseRequest(`/rest/v1/platform_admins?select=user_id,status&user_id=eq.${encodeURIComponent(currentUser.id)}&status=eq.active&limit=1`, {
    method: "GET",
    service: true
  }) as Array<{ user_id?: string; status?: string }>;

  if (!platformAdmins.length) {
    throw new PlatformAccessError("Acceso exclusivo para superadministradores de plataforma.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para administrar modulos." }, { status: 500 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });

    await requirePlatformAdmin(token);

    const body = (await request.json()) as ModuleAccessBody;
    const companyId = clean(body.company_id);
    const moduleId = clean(body.module_id);

    if (!companyId) return NextResponse.json({ message: "Empresa requerida." }, { status: 400 });
    if (!moduleId) return NextResponse.json({ message: "Modulo requerido." }, { status: 400 });
    if (typeof body.enabled !== "boolean") return NextResponse.json({ message: "Estado de modulo requerido." }, { status: 400 });

    const rows = await supabaseRequest("/rest/v1/company_modules?on_conflict=company_id,module_id&select=*", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        company_id: companyId,
        module_id: moduleId,
        enabled: body.enabled,
        source: "manual"
      })
    }) as unknown[];

    return NextResponse.json({ module_access: rows[0] || null });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible cambiar el modulo." }, { status: errorStatus(error) });
  }
}
