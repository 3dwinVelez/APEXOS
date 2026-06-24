import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

let rootEnvCache: Record<string, string> | null = null;

type AnyRow = Record<string, unknown>;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function rootEnv() {
  if (rootEnvCache) return rootEnvCache;
  let currentDir = process.cwd();
  let envPath = "";
  for (let index = 0; index < 6; index += 1) {
    const candidate = path.join(currentDir, ".env");
    if (fs.existsSync(candidate)) {
      envPath = candidate;
      break;
    }
    const nextDir = path.dirname(currentDir);
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }
  if (!fs.existsSync(envPath)) {
    rootEnvCache = {};
    return rootEnvCache;
  }
  rootEnvCache = Object.fromEntries(fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
    }));
  return rootEnvCache;
}

function envValue(...keys: string[]) {
  const fallback = rootEnv();
  for (const key of keys) {
    const value = process.env[key] || fallback[key];
    if (value) return value;
  }
  return "";
}

function supabaseConfig() {
  return {
    url: envValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    anonKey: envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"),
    serviceRoleKey: envValue("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
    publicCompanyId: envValue("APEXOS_PUBLIC_SERVICE_COMPANY_ID", "NEXT_PUBLIC_APEXOS_PUBLIC_COMPANY_ID")
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function referenceLabel(reference?: { code?: string; name?: string } | null) {
  return [reference?.code, reference?.name].filter(Boolean).join(" - ");
}

async function supabaseRequest<T>(requestPath: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.anonKey || !config.serviceRoleKey) {
    const missing = [
      !config.url ? "SUPABASE_URL" : "",
      !config.anonKey ? "SUPABASE_ANON_KEY" : "",
      !config.serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : ""
    ].filter(Boolean).join(", ");
    throw new Error(`Falta configuracion de Supabase para consultar ordenes: ${missing}.`);
  }
  const response = await fetch(`${config.url}${requestPath}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || response.statusText;
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  return body as T;
}

async function resolveCompanyId(request: NextRequest) {
  const { publicCompanyId } = supabaseConfig();
  if (publicCompanyId && isUuid(publicCompanyId)) return publicCompanyId;

  const companyName = request.nextUrl.searchParams.get("empresa")?.trim() || "SCJ";
  const value = encodeURIComponent(companyName);
  const filter = `or=(name.ilike.*${value}*,legal_name.ilike.*${value}*,tax_id.eq.${value})&`;
  const companies = await supabaseRequest<Array<{ id: string }>>(
    `/rest/v1/companies?select=id&${filter}status=eq.active&order=created_at.asc&limit=1`
  );
  if (companies[0]?.id) return companies[0].id;

  const fallbackCompanies = await supabaseRequest<Array<{ id: string }>>(
    "/rest/v1/companies?select=id&status=eq.active&order=created_at.asc&limit=1"
  );
  return fallbackCompanies[0]?.id || "";
}

function compactInFilter(values: Array<string | undefined>) {
  return values.filter(Boolean).map((value) => encodeURIComponent(String(value))).join(",");
}

function kpisForOrders(orders: Array<{ status?: string }>) {
  return {
    total: orders.length,
    scheduled: orders.filter((order) => order.status === "agendado").length,
    pending: orders.filter((order) => order.status === "pendiente").length,
    in_progress: orders.filter((order) => ["en_curso", "inspeccion", "ejecucion"].includes(String(order.status))).length,
    closed: orders.filter((order) => order.status === "cerrada").length
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!request.headers.get("authorization")) {
      return jsonError("Sesion requerida para consultar el monitor de servicios.", 401);
    }
    const companyId = await resolveCompanyId(request);
    if (!companyId) return jsonError("No se encontro una empresa activa para consultar ordenes.", 404);

    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 200), 1), 300);
    const orders = await supabaseRequest<Array<{
      id: string;
      number: string;
      reference_id?: string;
      technician_employee_id?: string;
      service_type?: string;
      status?: string;
      customer_name?: string;
      customer_address?: string;
      customer_phone?: string;
      invoice_number?: string;
      scheduled_date?: string | null;
      started_at?: string | null;
      closed_at?: string | null;
      created_at?: string;
      notes?: string;
      metadata?: AnyRow;
    }>>(`/rest/v1/service_orders?select=id,number,reference_id,technician_employee_id,service_type,status,customer_name,customer_address,customer_phone,invoice_number,scheduled_date,started_at,closed_at,created_at,notes,metadata&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=${limit}`);

    const referenceIds = compactInFilter(orders.map((order) => order.reference_id));
    const technicianIds = compactInFilter(orders.map((order) => order.technician_employee_id));
    const orderIds = compactInFilter(orders.map((order) => order.id));
    const [references, incidents, evidence, technicians] = await Promise.all([
      referenceIds
        ? supabaseRequest<Array<{ id: string; code: string; name: string; category?: string; brand?: string; model?: string }>>(`/rest/v1/service_references?select=id,code,name,category,brand,model&id=in.(${referenceIds})&limit=300`).catch(() => [])
        : Promise.resolve([]),
      orderIds
        ? supabaseRequest<Array<{ id: string; order_id: string; type?: string; description?: string; action?: string }>>(`/rest/v1/service_incidents?select=id,order_id,type,description,action&order_id=in.(${orderIds})&limit=500`).catch(() => [])
        : Promise.resolve([]),
      orderIds
        ? supabaseRequest<Array<{ id: string; order_id: string; evidence_type?: string; metadata?: AnyRow; created_at?: string }>>(`/rest/v1/service_evidence?select=id,order_id,evidence_type,metadata,created_at&order_id=in.(${orderIds})&limit=500`).catch(() => [])
        : Promise.resolve([]),
      technicianIds
        ? supabaseRequest<Array<{ id: string; first_name?: string; last_name?: string; email?: string; metadata?: AnyRow }>>(`/rest/v1/employees?select=id,first_name,last_name,email,metadata&id=in.(${technicianIds})&limit=300`).catch(() => [])
        : Promise.resolve([])
    ]);

    const mapped = orders.map((order) => {
      const reference = references.find((item) => item.id === order.reference_id);
      const technician = technicians.find((item) => item.id === order.technician_employee_id);
      const metadata = {
        ...(order.metadata || {}),
        external_reference_id: order.reference_id || "",
        external_reference_code: reference?.code || String(order.metadata?.external_reference_code || ""),
        external_reference_name: reference?.name || String(order.metadata?.external_reference_name || ""),
        external_reference_label: referenceLabel(reference) || String(order.metadata?.product_reference || order.metadata?.product_description || "")
      };
      return {
        id: order.id,
        number: order.number,
        reference_id: order.reference_id || "",
        reference: reference ? { ...reference, parts: [], manuals: [] } : null,
        technician_employee_id: order.technician_employee_id || "",
        technician: technician ? {
          id: technician.id,
          user: {
            name: [technician.first_name, technician.last_name].filter(Boolean).join(" ").trim() || String(technician.metadata?.name || technician.email || "Tecnico"),
            email: technician.email || ""
          }
        } : null,
        service_type: order.service_type || "servicio",
        status: order.status || "agendado",
        customer_name: order.customer_name || "",
        customer_address: order.customer_address || "",
        customer_phone: order.customer_phone || "",
        invoice_number: order.invoice_number || "",
        scheduled_date: order.scheduled_date || "",
        started_at: order.started_at || "",
        closed_at: order.closed_at || "",
        created_at: order.created_at || "",
        notes: order.notes || "",
        metadata,
        incidents: incidents.filter((item) => item.order_id === order.id),
        photos: evidence.filter((item) => item.order_id === order.id).map((item) => ({
          ...item,
          type: String(item.metadata?.original_type || item.evidence_type || "")
        }))
      };
    });

    return NextResponse.json({ data: mapped, kpis: kpisForOrders(mapped) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible consultar ordenes de servicios." }, { status: 500 });
  }
}
