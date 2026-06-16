import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

type CreateCompanyBody = {
  name?: string;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  company_type?: string | null;
  parent_company_id?: string | null;
  business_line?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  status?: string;
  plan_id?: string | null;
  admin_full_name?: string;
  admin_email?: string;
  admin_password?: string;
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
  const companies = await supabaseRequest("/rest/v1/v_platform_companies?select=company_id&limit=1", {
    method: "GET",
    token
  }) as unknown[];
  if (!companies.length) throw new PlatformAccessError("Acceso exclusivo para superadministradores de plataforma.");
}

export async function POST(request: NextRequest) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para crear usuarios Supabase Auth." }, { status: 500 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });

    const body = (await request.json()) as CreateCompanyBody;
    const name = clean(body.name);
    const adminEmail = clean(body.admin_email)?.toLowerCase();
    const adminFullName = clean(body.admin_full_name);
    const adminPassword = body.admin_password || "";

    if (!name) return NextResponse.json({ message: "Nombre comercial requerido." }, { status: 400 });
    if (!adminEmail) return NextResponse.json({ message: "Correo del administrador requerido." }, { status: 400 });
    if (!adminFullName) return NextResponse.json({ message: "Nombre del administrador requerido." }, { status: 400 });
    if (adminPassword.length < 8) return NextResponse.json({ message: "La clave temporal debe tener minimo 8 caracteres." }, { status: 400 });

    await requirePlatformAdmin(token);

    const createdCompanies = await supabaseRequest("/rest/v1/companies?select=*", {
      method: "POST",
      token,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name,
        legal_name: clean(body.legal_name),
        tax_id: clean(body.tax_id),
        email: clean(body.email),
        phone: clean(body.phone),
        company_type: clean(body.company_type) || "company",
        parent_company_id: clean(body.parent_company_id),
        business_line: clean(body.business_line),
        country: clean(body.country),
        city: clean(body.city),
        address: clean(body.address),
        status: clean(body.status) || "active",
        plan_id: clean(body.plan_id)
      })
    }) as Array<{ id: string }>;

    const company = createdCompanies[0];
    if (!company?.id) throw new Error("La empresa fue creada sin id de respuesta.");

    const authUser = await supabaseRequest("/auth/v1/admin/users", {
      method: "POST",
      service: true,
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminFullName,
          company_id: company.id
        }
      })
    }) as { id: string; email?: string };

    await supabaseRequest("/rest/v1/profiles?on_conflict=id", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        id: authUser.id,
        full_name: adminFullName,
        email: adminEmail,
        status: "active"
      })
    });

    await supabaseRequest("/rest/v1/company_users?on_conflict=company_id,user_id", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        company_id: company.id,
        user_id: authUser.id,
        role: "admin",
        status: "active"
      })
    });

    await supabaseRequest("/rest/v1/company_admin_onboarding?on_conflict=company_id,email", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        company_id: company.id,
        user_id: authUser.id,
        full_name: adminFullName,
        email: adminEmail,
        role: "admin",
        status: "created"
      })
    });

    const platformRows = await supabaseRequest(`/rest/v1/v_platform_companies?company_id=eq.${company.id}&select=*&limit=1`, {
      method: "GET",
      token
    }) as unknown[];

    return NextResponse.json({ company: platformRows[0], admin_user_id: authUser.id });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible crear la empresa." }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 500 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });

    await requirePlatformAdmin(token);

    const body = (await request.json()) as CreateCompanyBody & { company_id?: string };
    const companyId = clean(body.company_id);
    const name = clean(body.name);
    if (!companyId) return NextResponse.json({ message: "Empresa requerida." }, { status: 400 });
    if (!name) return NextResponse.json({ message: "Nombre comercial requerido." }, { status: 400 });

    await supabaseRequest(`/rest/v1/companies?id=eq.${companyId}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        name,
        legal_name: clean(body.legal_name),
        tax_id: clean(body.tax_id),
        email: clean(body.email),
        phone: clean(body.phone),
        company_type: clean(body.company_type) || "company",
        parent_company_id: clean(body.parent_company_id),
        business_line: clean(body.business_line),
        country: clean(body.country),
        city: clean(body.city),
        address: clean(body.address),
        status: clean(body.status) || "active",
        plan_id: clean(body.plan_id)
      })
    });

    const platformRows = await supabaseRequest(`/rest/v1/v_platform_companies?company_id=eq.${companyId}&select=*&limit=1`, {
      method: "GET",
      token
    }) as unknown[];

    return NextResponse.json({ company: platformRows[0] });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible editar la empresa." }, { status: errorStatus(error) });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 500 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });

    await requirePlatformAdmin(token);

    const companyId = request.nextUrl.searchParams.get("company_id");
    if (!companyId) return NextResponse.json({ message: "Empresa requerida." }, { status: 400 });

    await supabaseRequest(`/rest/v1/companies?id=eq.${companyId}`, {
      method: "DELETE",
      service: true,
      headers: { Prefer: "return=minimal" }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible eliminar la empresa." }, { status: errorStatus(error) });
  }
}
