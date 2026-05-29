import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

type AnyRow = Record<string, unknown>;

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

async function requirePlatformAdmin(token: string) {
  await supabaseRequest("/rest/v1/v_platform_companies?select=company_id&limit=1", {
    method: "GET",
    token
  });
}

function minutesSince(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

export async function GET(request: NextRequest) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 500 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });
    await requirePlatformAdmin(token);

    const companyId = request.nextUrl.searchParams.get("company_id");
    if (!companyId) return NextResponse.json({ message: "Empresa requerida." }, { status: 400 });

    const windowMinutes = Math.max(5, Math.min(240, Number(request.nextUrl.searchParams.get("minutes") || 30)));
    const employees = await supabaseRequest(
      `/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,email,position,department,status,user_type,metadata&company_id=eq.${encodeURIComponent(companyId)}&order=first_name.asc&limit=500`,
      { method: "GET", service: true }
    ) as AnyRow[];

    const authUsers = await supabaseRequest("/auth/v1/admin/users?per_page=1000&page=1", {
      method: "GET",
      service: true
    }) as { users?: AnyRow[] };
    const authById = new Map((authUsers.users || []).map((user) => [String(user.id), user]));

    const users = employees.map((employee) => {
      const userId = employee.user_id ? String(employee.user_id) : "";
      const authUser = userId ? authById.get(userId) : null;
      const lastSignInAt = authUser?.last_sign_in_at || null;
      const lastSeenMinutes = minutesSince(lastSignInAt);
      const connected = lastSeenMinutes !== null && lastSeenMinutes <= windowMinutes;
      const metadata = (employee.metadata && typeof employee.metadata === "object" ? employee.metadata : {}) as AnyRow;
      return {
        employee_id: employee.id,
        user_id: userId || null,
        name: `${employee.first_name || ""} ${employee.last_name || ""}`.replace(/\s+/g, " ").trim() || employee.email || "Usuario",
        email: employee.email || authUser?.email || "",
        role: (metadata.role_name as string) || "",
        position: employee.position || "",
        department: employee.department || "",
        status: employee.status || "active",
        user_type: employee.user_type || "",
        auth_status: authUser ? "linked" : "without_auth",
        connected,
        last_sign_in_at: lastSignInAt,
        last_seen_minutes: lastSeenMinutes
      };
    });

    return NextResponse.json({
      company_id: companyId,
      generated_at: new Date().toISOString(),
      window_minutes: windowMinutes,
      totals: {
        users: users.length,
        connected: users.filter((user) => user.connected).length,
        active: users.filter((user) => user.status === "active").length,
        without_auth: users.filter((user) => user.auth_status === "without_auth").length
      },
      users
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible consultar sesiones." }, { status: 500 });
  }
}
