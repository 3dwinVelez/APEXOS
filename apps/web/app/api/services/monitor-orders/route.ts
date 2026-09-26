import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

let rootEnvCache: Record<string, string> | null = null;
const AUTH_CONTEXT_TTL_MS = 30_000;
const authUserCache = new Map<string, { expiresAt: number; userId: string }>();
const membershipCache = new Map<string, { expiresAt: number; rows: UserCompany[] }>();
let localPrismaClient: PrismaClient | null = null;

type AnyRow = Record<string, unknown>;
type UserCompany = { company_id: string; role?: string };
type ServiceScope = {
  companyIds: string[];
  technicianEmployeeId?: string;
  technicianOnly: boolean;
  authorized: boolean;
};

const ACTIVE_SERVICE_ORDER_STATUS_FILTER = "status=in.(pendiente,en_curso,inspeccion,ejecucion)";
const ALLOWED_SERVICE_ORDER_STATUSES = new Set(["agendado", "pendiente", "en_curso", "inspeccion", "ejecucion", "cerrada", "no_ejecutada", "cancelada"]);
const MAX_RELATED_PAGES = 20;

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

function localDatabase() {
  try {
    const databaseUrl = new URL(envValue("DATABASE_URL"));
    return ["localhost", "127.0.0.1"].includes(databaseUrl.hostname);
  } catch {
    return false;
  }
}

function localPrisma() {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = envValue("DATABASE_URL");
  localPrismaClient ||= new PrismaClient();
  return localPrismaClient;
}

async function localMonitorOrders(request: NextRequest, companyName: string) {
  const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 100, 1, 200);
  const offset = boundedInteger(request.nextUrl.searchParams.get("offset"), 0, 0, 1_000_000);
  const q = String(request.nextUrl.searchParams.get("q") || "").trim().slice(0, 160);
  const status = String(request.nextUrl.searchParams.get("status") || "").trim();
  const dateFrom = String(request.nextUrl.searchParams.get("date_from") || "").trim();
  const dateTo = String(request.nextUrl.searchParams.get("date_to") || "").trim();
  const prisma = localPrisma();
  const tenant = await prisma.tenant.findFirst({
    where: { name: { equals: companyName, mode: "insensitive" }, active: true },
    select: { id: true }
  });
  if (!tenant) return { data: [], total: 0, offset, limit };
  const where = {
    tenant_id: tenant.id,
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo ? { scheduled_date: {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00Z`) } : {}),
      ...(dateTo ? { lt: new Date(`${nextUtcDay(dateTo)}T00:00:00Z`) } : {})
    } } : {}),
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" as const } },
      { customer_name: { contains: q, mode: "insensitive" as const } },
      { customer_address: { contains: q, mode: "insensitive" as const } },
      { customer_phone: { contains: q, mode: "insensitive" as const } },
      { invoice_number: { contains: q, mode: "insensitive" as const } },
      { reference: { is: { code: { contains: q, mode: "insensitive" as const } } } },
      { reference: { is: { name: { contains: q, mode: "insensitive" as const } } } }
    ] } : {})
  };
  const [data, total] = await Promise.all([prisma.serviceOrder.findMany({
    where,
    include: {
      reference: { include: { parts: true } },
      items: { include: { reference: { include: { parts: true } }, photos: true, incidents: true }, orderBy: { display_order: "asc" } },
      photos: true,
      incidents: true
    },
    orderBy: { created_at: "desc" },
    skip: offset,
    take: limit
  }), prisma.serviceOrder.count({ where })]);
  return { data, total, offset, limit };
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
  return (await supabaseResponse<T>(requestPath, init)).data;
}

async function supabaseResponse<T>(requestPath: string, init: RequestInit = {}) {
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
    throw new Error(`SUPABASE_REQUEST_FAILED:${response.status}`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const totalValue = contentRange.split("/")[1];
  return {
    data: body as T,
    total: totalValue && totalValue !== "*" ? Number(totalValue) : undefined
  };
}

async function currentAuthUserId(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return "";
  const cacheKey = crypto.createHash("sha256").update(token).digest("hex");
  const cached = authUserCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.userId;
  const config = supabaseConfig();
  if (!config.url || !config.anonKey) return "";
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return "";
  const data = await response.json().catch(() => ({})) as { id?: string };
  const userId = data.id || "";
  if (userId) {
    if (authUserCache.size >= 500) authUserCache.delete(authUserCache.keys().next().value as string);
    authUserCache.set(cacheKey, { expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS, userId });
  }
  return userId;
}

async function userCompaniesForUser(userId: string) {
  if (!userId) return [] as UserCompany[];
  const cached = membershipCache.get(userId);
  if (cached?.expiresAt > Date.now()) return cached.rows;
  const rows = await supabaseRequest<UserCompany[]>(
    `/rest/v1/company_users?select=company_id,role,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=20`
  ).catch(() => []);
  if (membershipCache.size >= 500) membershipCache.delete(membershipCache.keys().next().value as string);
  membershipCache.set(userId, { expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS, rows });
  return rows;
}

function isAdminCompanyRole(role: unknown) {
  return ["owner", "admin", "superadmin", "administrador", "administrador de empresa"].includes(String(role || "").trim().toLowerCase());
}

function serviceTechnicianEmployee(employee: { user_type?: string; metadata?: AnyRow }) {
  const metadata = employee.metadata || {};
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  const operational = metadata.operational && typeof metadata.operational === "object" ? metadata.operational as AnyRow : {};
  const values = [
    employee.user_type,
    metadata.profile_kind,
    metadata.role_name,
    access.profile_kind,
    access.role_name,
    operational.classification
  ].map((value) => String(value || "").trim().toLowerCase());
  return values.includes("tecnico")
    || values.includes("técnico")
    || metadata.services_assigned_only === true
    || operational.can_receive_services === true;
}

async function resolveServiceScope(request: NextRequest, userId: string, memberships: UserCompany[]): Promise<ServiceScope> {
  const requestedCompanyId = request.nextUrl.searchParams.get("company_id")?.trim() || "";
  const activeMemberships = memberships.filter((membership) => isUuid(membership.company_id));
  const eligibleMemberships = requestedCompanyId
    ? activeMemberships.filter((membership) => membership.company_id === requestedCompanyId)
    : activeMemberships;
  const administrativeCompanyIds = Array.from(new Set(
    eligibleMemberships.filter((membership) => isAdminCompanyRole(membership.role)).map((membership) => membership.company_id)
  ));
  if (!userId || !eligibleMemberships.length) {
    return { companyIds: [], technicianOnly: false, authorized: false };
  }
  if (administrativeCompanyIds.length) {
    return { companyIds: administrativeCompanyIds, technicianOnly: false, authorized: true };
  }
  const companyIds = Array.from(new Set(eligibleMemberships.map((membership) => membership.company_id)));
  const companyFilter = compactInFilter(companyIds);
  const employees = await supabaseRequest<Array<{
    id: string;
    company_id?: string;
    user_type?: string;
    metadata?: AnyRow;
  }>>(
    `/rest/v1/employees?select=id,company_id,user_type,metadata&user_id=eq.${encodeURIComponent(userId)}&company_id=in.(${companyFilter})&status=eq.active&limit=20`
  ).catch(() => []);
  const technician = employees.find(serviceTechnicianEmployee);
  if (!technician?.id) return { companyIds, technicianOnly: false, authorized: false };
  return {
    companyIds: technician.company_id && isUuid(technician.company_id) ? [technician.company_id] : companyIds,
    technicianEmployeeId: technician.id,
    technicianOnly: true,
    authorized: true
  };
}

function compactInFilter(values: Array<string | undefined>) {
  return values.filter(Boolean).map((value) => encodeURIComponent(String(value))).join(",");
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nextUtcDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function postgrestSearchValue(value: string) {
  return `"*${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}*"`;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function relatedRowsForOrders<T>(
  table: string,
  select: string,
  orderIds: string[],
  warnings: string[]
) {
  const rows: T[] = [];
  try {
    for (const orderIdBatch of chunks(orderIds, 50)) {
      let offset = 0;
      while (true) {
        const page = await supabaseRequest<T[]>(
          `/rest/v1/${table}?select=${select}&order_id=in.(${compactInFilter(orderIdBatch)})&order=created_at.asc&offset=${offset}&limit=500`
        );
        rows.push(...page);
        if (page.length < 500) break;
        offset += page.length;
        if (offset >= 500 * MAX_RELATED_PAGES) {
          warnings.push(`Se alcanzo el limite seguro de ${table === "service_evidence" ? "evidencias" : "novedades"}. Refina la consulta.`);
          break;
        }
      }
    }
  } catch {
    warnings.push(`No fue posible completar ${table === "service_evidence" ? "las evidencias" : "las novedades"}. Reintenta la consulta.`);
  }
  return rows;
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

function effectiveServiceOrderStatus(order: { status?: string; technician_employee_id?: string; metadata?: AnyRow }) {
  if (
    order.status === "pendiente"
    && !order.technician_employee_id
    && (order.metadata?.preorder_status === "agendado" || order.metadata?.requires_admin_completion === true)
  ) {
    return "agendado";
  }
  return order.status || "agendado";
}

export async function GET(request: NextRequest) {
  try {
    if (!request.headers.get("authorization")) {
      return jsonError("Sesion requerida para consultar el monitor de servicios.", 401);
    }
    const requestedDateFrom = String(request.nextUrl.searchParams.get("date_from") || "").trim();
    const requestedDateTo = String(request.nextUrl.searchParams.get("date_to") || "").trim();
    const requestedStatus = String(request.nextUrl.searchParams.get("status") || "").trim();
    if (requestedDateFrom && !validDate(requestedDateFrom)) return jsonError("date_from debe usar el formato YYYY-MM-DD.");
    if (requestedDateTo && !validDate(requestedDateTo)) return jsonError("date_to debe usar el formato YYYY-MM-DD.");
    if (requestedDateFrom && requestedDateTo && requestedDateFrom > requestedDateTo) return jsonError("date_from no puede ser posterior a date_to.");
    if (requestedStatus && !ALLOWED_SERVICE_ORDER_STATUSES.has(requestedStatus)) return jsonError("El estado solicitado no es valido.");
    if (localDatabase()) {
      const userId = await currentAuthUserId(request);
      if (!userId) return jsonError("La sesion local no corresponde a una identidad Supabase valida.", 401);
      const memberships = await userCompaniesForUser(userId);
      const requestedCompanyId = request.nextUrl.searchParams.get("company_id")?.trim() || "";
      const membership = memberships.find((item) => item.company_id === requestedCompanyId)
        || memberships.find((item) => isAdminCompanyRole(item.role))
        || memberships[0];
      if (!membership?.company_id) return jsonError("El usuario no tiene acceso a la empresa solicitada.", 403);
      const companies = await supabaseRequest<Array<{ name?: string }>>(
        `/rest/v1/companies?select=name&id=eq.${encodeURIComponent(membership.company_id)}&limit=1`
      );
      const companyName = String(companies[0]?.name || "").trim();
      if (!companyName) return jsonError("No se encontro la empresa autorizada para consultar ordenes.", 404);
      const result = await localMonitorOrders(request, companyName);
      const mapped = result.data.map((order) => ({
        ...order,
        status: effectiveServiceOrderStatus({
          status: order.status,
          metadata: order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
            ? order.metadata as AnyRow
            : {}
        })
      }));
      const nextOffset = result.offset + mapped.length;
      const hasMore = nextOffset < result.total;
      return NextResponse.json({
        data: mapped,
        total: result.total,
        has_more: hasMore,
        next_offset: hasMore ? nextOffset : null,
        warnings: [],
        kpis: kpisForOrders(mapped)
      });
    }
    const userId = await currentAuthUserId(request);
    if (!userId) return jsonError("La sesion no es valida para consultar el monitor de servicios.", 401);
    const memberships = await userCompaniesForUser(userId);
    if (!memberships.length) return jsonError("El usuario no tiene acceso a empresas habilitadas para este monitor.", 403);
    const scope = await resolveServiceScope(request, userId, memberships);
    if (!scope.authorized || !scope.companyIds.length) return jsonError("El usuario no tiene permiso para consultar este monitor.", 403);

    const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 100, 1, 200);
    const offset = boundedInteger(request.nextUrl.searchParams.get("offset"), 0, 0, 10_000);
    const q = String(request.nextUrl.searchParams.get("q") || "").trim().slice(0, 160);
    const status = String(request.nextUrl.searchParams.get("status") || "").trim();
    const dateFrom = String(request.nextUrl.searchParams.get("date_from") || "").trim();
    const dateTo = String(request.nextUrl.searchParams.get("date_to") || "").trim();
    if (dateFrom && !validDate(dateFrom)) return jsonError("date_from debe usar el formato YYYY-MM-DD.");
    if (dateTo && !validDate(dateTo)) return jsonError("date_to debe usar el formato YYYY-MM-DD.");
    if (dateFrom && dateTo && dateFrom > dateTo) return jsonError("date_from no puede ser posterior a date_to.");
    if (status && !ALLOWED_SERVICE_ORDER_STATUSES.has(status)) return jsonError("El estado solicitado no es valido.");

    const companyFilter = compactInFilter(scope.companyIds);
    const technicianFilter = scope.technicianEmployeeId ? `&technician_employee_id=eq.${encodeURIComponent(scope.technicianEmployeeId)}` : "";
    const statusFilter = scope.technicianOnly ? `&${ACTIVE_SERVICE_ORDER_STATUS_FILTER}` : "";
    const warnings: string[] = [];
    const requestedStatusFilter = status && !scope.technicianOnly ? `&status=eq.${encodeURIComponent(status)}` : "";
    const dateFilter = `${dateFrom ? `&scheduled_date=gte.${encodeURIComponent(dateFrom)}` : ""}${dateTo ? `&scheduled_date=lt.${encodeURIComponent(nextUtcDay(dateTo))}` : ""}`;
    let referenceIdsForSearch: string[] = [];
    if (q) {
      try {
        const search = encodeURIComponent(postgrestSearchValue(q));
        const references = await supabaseRequest<Array<{ id: string }>>(
          `/rest/v1/service_references?select=id&company_id=in.(${companyFilter})&or=(code.ilike.${search},name.ilike.${search},brand.ilike.${search},model.ilike.${search})&limit=500`
        );
        referenceIdsForSearch = references.map((reference) => reference.id);
      } catch {
        warnings.push("No fue posible ampliar la busqueda por referencia. Reintenta la consulta.");
      }
    }
    const search = q ? encodeURIComponent(postgrestSearchValue(q)) : "";
    const searchableFields = [
      "number",
      "customer_name",
      "customer_address",
      "customer_phone",
      "invoice_number",
      "metadata->>customer_document",
      "metadata->>customer_phone_secondary",
      "metadata->>customer_neighborhood",
      "metadata->>external_reference_code",
      "metadata->>external_reference_name",
      "metadata->>external_reference_label",
      "metadata->>product_reference",
      "metadata->>product_description"
    ];
    const searchTerms = q ? searchableFields.map((field) => `${field}.ilike.${search}`) : [];
    if (referenceIdsForSearch.length) searchTerms.push(`reference_id.in.(${compactInFilter(referenceIdsForSearch)})`);
    const searchFilter = searchTerms.length ? `&or=(${searchTerms.join(",")})` : "";
    const ordersResponse = await supabaseResponse<Array<{
      id: string;
      company_id: string;
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
    }>>(`/rest/v1/service_orders?select=id,company_id,number,reference_id,technician_employee_id,service_type,status,customer_name,customer_address,customer_phone,invoice_number,scheduled_date,started_at,closed_at,created_at,notes,metadata&company_id=in.(${companyFilter})${technicianFilter}${statusFilter}${requestedStatusFilter}${dateFilter}${searchFilter}&order=created_at.desc&offset=${offset}&limit=${limit}`, {
      headers: { Prefer: "count=exact" }
    });
    const orders = ordersResponse.data;
    const total = ordersResponse.total ?? offset + orders.length;

    const referenceIds = compactInFilter(orders.map((order) => order.reference_id));
    const technicianIds = compactInFilter(orders.map((order) => order.technician_employee_id));
    const orderIds = compactInFilter(orders.map((order) => order.id));
    const [references, incidents, evidence, technicians] = await Promise.all([
      referenceIds
        ? supabaseRequest<Array<{ id: string; code: string; name: string; category?: string; brand?: string; model?: string }>>(`/rest/v1/service_references?select=id,code,name,category,brand,model&company_id=in.(${companyFilter})&id=in.(${referenceIds})&limit=300`).catch(() => [])
        : Promise.resolve([]),
      orderIds
        ? relatedRowsForOrders<{ id: string; order_id: string; type?: string; description?: string; action?: string; created_at?: string }>("service_incidents", "id,order_id,type,description,action,created_at", orders.map((order) => order.id), warnings)
        : Promise.resolve([]),
      orderIds
        ? relatedRowsForOrders<{ id: string; order_id: string; evidence_type?: string; metadata?: AnyRow; created_at?: string }>("service_evidence", "id,order_id,evidence_type,metadata,created_at", orders.map((order) => order.id), warnings)
        : Promise.resolve([]),
      technicianIds
        ? supabaseRequest<Array<{ id: string; first_name?: string; last_name?: string; email?: string; metadata?: AnyRow }>>(`/rest/v1/employees?select=id,first_name,last_name,email,metadata&company_id=in.(${companyFilter})&id=in.(${technicianIds})&limit=300`).catch(() => [])
        : Promise.resolve([])
    ]);

    const referencesById = new Map<string, (typeof references)[number]>();
    const techniciansById = new Map<string, (typeof technicians)[number]>();
    const incidentsByOrder = new Map<string, typeof incidents>();
    const evidenceByOrder = new Map<string, typeof evidence>();
    for (const reference of references) referencesById.set(reference.id, reference);
    for (const technician of technicians) techniciansById.set(technician.id, technician);
    for (const incident of incidents) {
      const current = incidentsByOrder.get(incident.order_id) || [];
      current.push(incident);
      incidentsByOrder.set(incident.order_id, current);
    }
    for (const item of evidence) {
      const current = evidenceByOrder.get(item.order_id) || [];
      current.push(item);
      evidenceByOrder.set(item.order_id, current);
    }

    const mapped = orders.map((order) => {
      const reference = order.reference_id ? referencesById.get(order.reference_id) : undefined;
      const technician = order.technician_employee_id ? techniciansById.get(order.technician_employee_id) : undefined;
      const metadata = {
        ...(order.metadata || {}),
        external_reference_id: order.reference_id || "",
        external_reference_code: reference?.code || String(order.metadata?.external_reference_code || ""),
        external_reference_name: reference?.name || String(order.metadata?.external_reference_name || ""),
        external_reference_label: referenceLabel(reference) || String(order.metadata?.product_reference || order.metadata?.product_description || "")
      };
      const effectiveStatus = effectiveServiceOrderStatus(order);
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
        status: effectiveStatus,
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
        incidents: incidentsByOrder.get(order.id) || [],
        photos: (evidenceByOrder.get(order.id) || []).map((item) => ({
          ...item,
          type: String(item.metadata?.original_type || item.evidence_type || "")
        }))
      };
    });

    const nextOffset = offset + mapped.length;
    const hasMore = nextOffset < total;
    return NextResponse.json({
      data: mapped,
      total,
      has_more: hasMore,
      next_offset: hasMore ? nextOffset : null,
      warnings,
      kpis: kpisForOrders(mapped)
    });
  } catch (error) {
    const status = error instanceof Error && error.message.startsWith("SUPABASE_REQUEST_FAILED:")
      ? Number(error.message.split(":")[1]) || 500
      : 500;
    return NextResponse.json({ message: "No fue posible consultar las ordenes de servicio.", code: "SERVICE_MONITOR_UNAVAILABLE" }, { status: status >= 400 && status < 500 ? 502 : status });
  }
}
