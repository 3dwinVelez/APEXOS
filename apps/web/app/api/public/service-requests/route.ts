import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

let rootEnvCache: Record<string, string> | null = null;

type PublicServiceRequest = {
  company_id?: string;
  company_name?: string;
  customer_name?: string;
  customer_document?: string;
  customer_phone?: string;
  customer_email?: string;
  invoice_number?: string;
  service_type?: string;
  reference_id?: string;
  product_reference?: string;
  product_description?: string;
  customer_address?: string;
  notes?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function clean(value: unknown) {
  const next = typeof value === "string" ? value.trim() : "";
  return next || "";
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
    url: envValue("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: envValue("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: envValue("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
    publicCompanyId: envValue("APEXOS_PUBLIC_SERVICE_COMPANY_ID", "NEXT_PUBLIC_APEXOS_PUBLIC_COMPANY_ID")
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isStatusConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("service_orders_status_check") || message.includes("violates check constraint");
}

function isUniqueNumberError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("service_orders_company_number_unique") || message.includes("duplicate key value");
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.anonKey || !config.serviceRoleKey) {
    const missing = [
      !config.url ? "SUPABASE_URL" : "",
      !config.anonKey ? "SUPABASE_ANON_KEY" : "",
      !config.serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : ""
    ].filter(Boolean).join(", ");
    throw new Error(`Falta configuracion de Supabase para recibir solicitudes publicas: ${missing}.`);
  }
  const response = await fetch(`${config.url}${path}`, {
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

async function resolveCompanyId(body: PublicServiceRequest, request: NextRequest) {
  const { publicCompanyId } = supabaseConfig();
  if (publicCompanyId && isUuid(publicCompanyId)) return publicCompanyId;

  const companyName = clean(body.company_name) || clean(request.nextUrl.searchParams.get("empresa"));
  const preferredName = companyName || "SCJ";
  const filter = `or=(name.ilike.*${encodeURIComponent(preferredName)}*,legal_name.ilike.*${encodeURIComponent(preferredName)}*,tax_id.eq.${encodeURIComponent(preferredName)})&`;
  const companies = await supabaseRequest<Array<{ id: string }>>(
    `/rest/v1/companies?select=id&${filter}status=eq.active&order=created_at.asc&limit=1`
  );
  if (companies[0]?.id) return companies[0].id;

  const fallbackCompanies = await supabaseRequest<Array<{ id: string }>>(
    "/rest/v1/companies?select=id&status=eq.active&order=created_at.asc&limit=1"
  );
  return fallbackCompanies[0]?.id || "";
}

async function resolveReferenceId(companyId: string, referenceId: string, productReference: string) {
  if (referenceId && isUuid(referenceId)) {
    const references = await supabaseRequest<Array<{ id: string }>>(
      `/rest/v1/service_references?select=id&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&id=eq.${encodeURIComponent(referenceId)}&limit=1`
    ).catch(() => []);
    if (references[0]?.id) return references[0].id;
  }
  if (!productReference) return null;
  const references = await supabaseRequest<Array<{ id: string }>>(
    `/rest/v1/service_references?select=id&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&or=(code.ilike.*${encodeURIComponent(productReference)}*,name.ilike.*${encodeURIComponent(productReference)}*)&limit=1`
  ).catch(() => []);
  return references[0]?.id || null;
}

async function nextOrderNumber(companyId: string, offset = 1) {
  const rows = await supabaseRequest<Array<{ number: string }>>(
    `/rest/v1/service_orders?select=number&company_id=eq.${encodeURIComponent(companyId)}&number=like.OS-*&order=created_at.desc&limit=200`
  ).catch(() => []);
  let max = 0;
  for (const row of rows) {
    const match = String(row.number || "").match(/^OS-(\d{1,5})$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `OS-${String(max + offset).padStart(5, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const companyId = await resolveCompanyId({}, request);
    if (!companyId) return jsonError("No se encontro una empresa activa para consultar referencias.", 404);
    const references = await supabaseRequest<Array<{ id: string; code: string; name: string; category?: string; brand?: string; model?: string }>>(
      `/rest/v1/service_references?select=id,code,name,category,brand,model&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&order=code.asc&limit=500`
    );
    return NextResponse.json({ ok: true, references });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible consultar las referencias." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PublicServiceRequest;
    const required = [
      ["customer_name", "nombre completo"],
      ["customer_document", "cedula"],
      ["customer_phone", "telefono"],
      ["service_type", "tipo de servicio"],
      ["customer_address", "direccion"],
      ["reference_id", "referencia del producto"]
    ] as const;
    const missing = required.filter(([key]) => !clean(body[key])).map(([, label]) => label);
    if (missing.length) return jsonError(`Completa los campos obligatorios: ${missing.join(", ")}.`);
    if (!/^\d{5,12}$/.test(clean(body.customer_document))) return jsonError("La cedula debe contener entre 5 y 12 numeros.");
    if (!/^[0-9+()\-\s]{7,20}$/.test(clean(body.customer_phone))) return jsonError("Registra un telefono valido para confirmar la visita.");

    const companyId = await resolveCompanyId(body, request);
    if (!companyId) return jsonError("No se encontro una empresa activa para registrar la solicitud.", 404);

    const productReference = clean(body.product_reference) || clean(body.product_description);
    const referenceId = await resolveReferenceId(companyId, clean(body.reference_id), productReference);
    if (!referenceId) return jsonError("Selecciona una referencia activa para el producto que se va a instalar.");
    const notes = clean(body.notes) || "Solicitud creada por formulario publico. Requiere revision administrativa.";
    const metadata: Record<string, unknown> = {
      created_from: "public_service_request",
      public_request: true,
      requires_admin_completion: true,
      preorder_status: "agendado",
      customer_document: clean(body.customer_document),
      customer_email: clean(body.customer_email),
      product_reference: clean(body.product_reference),
      product_description: clean(body.product_description),
      received_at: new Date().toISOString()
    };
    const payload = {
      company_id: companyId,
      number: await nextOrderNumber(companyId),
      reference_id: referenceId,
      technician_employee_id: null,
      technician_user_id: null,
      service_type: clean(body.service_type) || "montaje",
      status: "agendado",
      customer_name: clean(body.customer_name),
      customer_address: clean(body.customer_address),
      customer_phone: clean(body.customer_phone),
      invoice_number: clean(body.invoice_number) || null,
      scheduled_date: null,
      notes,
      metadata
    };
    const insertOrder = (nextPayload: typeof payload) => supabaseRequest<Array<{ id: string; number: string }>>("/rest/v1/service_orders?select=id,number", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(nextPayload)
    });
    const inserted = await insertOrder(payload).catch(async (error) => {
      if (isStatusConstraintError(error)) {
        throw new Error("Supabase no permite el estado agendado. Aplica la migracion 20260623173000_service_orders_agendado_status.sql antes de recibir solicitudes externas.");
      }
      if (!isUniqueNumberError(error)) throw error;
      return insertOrder({
        ...payload,
        number: await nextOrderNumber(companyId, 2)
      });
    });

    const order = inserted[0];
    if (!order?.id) throw new Error("La solicitud fue enviada, pero no se recibio confirmacion de la orden.");
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible registrar la solicitud." }, { status: 500 });
  }
}
