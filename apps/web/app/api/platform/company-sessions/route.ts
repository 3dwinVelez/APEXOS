import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

type AnyRow = Record<string, unknown>;

class PlatformAccessError extends Error {
  statusCode = 403;
}

async function supabaseRequest(path: string, init: RequestInit & { token?: string; service?: boolean } = {}) {
  const { token, service, headers, ...rest } = init;
  const useServiceRole = service && Boolean(SUPABASE_SERVICE_ROLE_KEY);
  const key = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const bearer = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : token;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
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
  const companies = await supabaseRequest("/rest/v1/v_platform_companies?select=company_id&limit=1", {
    method: "GET",
    token
  }) as unknown[];
  if (!companies.length) throw new PlatformAccessError("Acceso exclusivo para superadministradores de plataforma.");
}

function minutesSince(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function latestTimestamp(...values: unknown[]) {
  let latest: string | null = null;
  let latestTime = 0;
  for (const value of values) {
    if (!value) continue;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) continue;
    if (date.getTime() > latestTime) {
      latestTime = date.getTime();
      latest = date.toISOString();
    }
  }
  return latest;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });
    await requirePlatformAdmin(token);

    const companyId = request.nextUrl.searchParams.get("company_id");
    if (!companyId) return NextResponse.json({ message: "Empresa requerida." }, { status: 400 });

    const windowMinutes = Math.max(5, Math.min(240, Number(request.nextUrl.searchParams.get("minutes") || 30)));
    const secureRead = SUPABASE_SERVICE_ROLE_KEY ? { method: "GET", service: true } : { method: "GET", token };
    const employees = await supabaseRequest(
      `/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,email,position,department,status,user_type,metadata&company_id=eq.${encodeURIComponent(companyId)}&order=first_name.asc&limit=500`,
      secureRead
    ) as AnyRow[];
    const memberships = await supabaseRequest(
      `/rest/v1/company_users?select=user_id,role,status,updated_at&company_id=eq.${encodeURIComponent(companyId)}&limit=1000`,
      secureRead
    ) as AnyRow[];
    const profileIds = memberships.map((membership) => String(membership.user_id || "")).filter(Boolean);
    const profiles = profileIds.length
      ? await supabaseRequest(
        `/rest/v1/profiles?select=id,full_name,email,status,updated_at&id=in.(${profileIds.map(encodeURIComponent).join(",")})`,
        secureRead
      ) as AnyRow[]
      : [];

    const authUsers = SUPABASE_SERVICE_ROLE_KEY
      ? await supabaseRequest("/auth/v1/admin/users?per_page=1000&page=1", { method: "GET", service: true }) as { users?: AnyRow[] }
      : { users: [] };
    const authById = new Map((authUsers.users || []).map((user) => [String(user.id), user]));
    const employeeByUserId = new Map(employees.filter((employee) => employee.user_id).map((employee) => [String(employee.user_id), employee]));
    const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));

    const users = memberships.map((membership) => {
      const userId = String(membership.user_id || "");
      const employee = userId ? employeeByUserId.get(userId) : null;
      const profile = userId ? profileById.get(userId) : null;
      const authUser = userId ? authById.get(userId) : null;
      const metadata = (employee?.metadata && typeof employee.metadata === "object" ? employee.metadata : {}) as AnyRow;
      const lastActivityAt = latestTimestamp(authUser?.last_sign_in_at, metadata.session_last_seen_at, membership.updated_at, profile?.updated_at);
      const lastSeenMinutes = minutesSince(lastActivityAt);
      const connected = lastSeenMinutes !== null && lastSeenMinutes <= windowMinutes;
      return {
        employee_id: employee?.id || `membership-${userId}`,
        user_id: userId || null,
        name: `${employee?.first_name || ""} ${employee?.last_name || ""}`.replace(/\s+/g, " ").trim() || profile?.full_name || authUser?.email || profile?.email || "Usuario",
        email: employee?.email || profile?.email || authUser?.email || "",
        role: (metadata.role_name as string) || String(membership.role || ""),
        position: employee?.position || "",
        department: employee?.department || "",
        status: employee?.status || membership.status || profile?.status || "active",
        user_type: employee?.user_type || "",
        auth_status: authUser || userId ? "linked" : "without_auth",
        connected,
        last_sign_in_at: authUser?.last_sign_in_at || null,
        last_seen_at: lastActivityAt,
        last_seen_minutes: lastSeenMinutes
      };
    });

    for (const employee of employees.filter((row) => !row.user_id)) {
      const userId = employee.user_id ? String(employee.user_id) : "";
      const authUser = userId ? authById.get(userId) : null;
      const lastSignInAt = authUser?.last_sign_in_at ? String(authUser.last_sign_in_at) : null;
      const lastSeenMinutes = minutesSince(lastSignInAt);
      const connected = lastSeenMinutes !== null && lastSeenMinutes <= windowMinutes;
      const metadata = (employee.metadata && typeof employee.metadata === "object" ? employee.metadata : {}) as AnyRow;
      users.push({
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
        last_seen_at: lastSignInAt,
        last_seen_minutes: lastSeenMinutes
      });
    }

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
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible consultar sesiones." }, { status: error instanceof PlatformAccessError ? error.statusCode : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { company_id?: string };
    const current = await supabaseRequest("/auth/v1/user", { method: "GET", token }) as { id?: string; email?: string };
    if (!current.id) return NextResponse.json({ message: "Usuario Auth no encontrado." }, { status: 401 });

    const memberships = await supabaseRequest(
      `/rest/v1/company_users?select=company_id,user_id,role,status&user_id=eq.${encodeURIComponent(current.id)}&status=eq.active&limit=20`,
      SUPABASE_SERVICE_ROLE_KEY ? { method: "GET", service: true } : { method: "GET", token }
    ) as AnyRow[];
    const membership = memberships.find((item) => body.company_id && item.company_id === body.company_id)
      || memberships.find((item) => ["owner", "admin", "superadmin"].includes(String(item.role || "").toLowerCase()))
      || memberships[0];
    if (!membership?.company_id) return NextResponse.json({ ok: false, reason: "without_company" });

    await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(current.id)}`, {
      method: "PATCH",
      token,
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ updated_at: new Date().toISOString() })
    }).catch(() => undefined);

    await supabaseRequest(
      `/rest/v1/company_users?company_id=eq.${encodeURIComponent(String(membership.company_id))}&user_id=eq.${encodeURIComponent(current.id)}`,
      {
        method: "PATCH",
        ...(SUPABASE_SERVICE_ROLE_KEY ? { service: true } : { token }),
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: membership.status || "active" })
      }
    ).catch(() => undefined);

    const employees = await supabaseRequest(
      `/rest/v1/employees?select=id,metadata&company_id=eq.${encodeURIComponent(String(membership.company_id))}&user_id=eq.${encodeURIComponent(current.id)}&limit=1`,
      SUPABASE_SERVICE_ROLE_KEY ? { method: "GET", service: true } : { method: "GET", token }
    ).catch(() => []) as AnyRow[];
    const employee = employees[0];
    if (employee?.id) {
      const metadata = (employee.metadata && typeof employee.metadata === "object" ? employee.metadata : {}) as AnyRow;
      await supabaseRequest(`/rest/v1/employees?id=eq.${encodeURIComponent(String(employee.id))}`, {
        method: "PATCH",
        ...(SUPABASE_SERVICE_ROLE_KEY ? { service: true } : { token }),
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ metadata: { ...metadata, session_last_seen_at: new Date().toISOString() } })
      }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, company_id: membership.company_id });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible registrar presencia." }, { status: 500 });
  }
}
