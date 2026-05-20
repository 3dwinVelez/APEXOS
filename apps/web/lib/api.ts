import { assertActiveSession, clearSession, touchSession } from "./sessionSecurity";
import { supabaseFetch } from "./supabaseClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";

function isSupabaseSession() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("auth_provider") === "supabase") return true;
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.iss || "").includes("supabase") || String(payload.ref || "") === "jbirkghkekuifgfsgquq";
  } catch {
    return false;
  }
}

type AnyRow = Record<string, unknown>;

function fullName(row: { first_name?: string; last_name?: string; email?: string; id?: string; metadata?: AnyRow }) {
  const metadataName = typeof row.metadata?.name === "string" ? row.metadata.name : "";
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || metadataName || row.email || `Empleado ${String(row.id || "").slice(0, 8)}`;
}

function toNumberId(id: unknown) {
  const text = String(id || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  return Math.abs(hash) || 1;
}

function kpisForOrders(orders: Array<{ status?: string }>) {
  return {
    pending: orders.filter((order) => order.status === "pendiente").length,
    in_progress: orders.filter((order) => ["en_curso", "inspeccion", "ejecucion"].includes(String(order.status))).length,
    closed: orders.filter((order) => order.status === "cerrada").length,
    not_executed: orders.filter((order) => order.status === "no_ejecutada").length,
    total: orders.length
  };
}

async function supabaseApiFallback<T>(path: string): Promise<T | null> {
  const [pathname, queryString = ""] = path.split("?");
  const search = new URLSearchParams(queryString);
  const active = search.get("active");

  if (pathname === "/api/v1/hr/schedules") {
    return [] as T;
  }

  if (pathname === "/api/v1/hr/workdays") {
    return [] as T;
  }

  if (pathname === "/api/v1/hr/attendance") {
    const punches = await supabaseFetch<Array<{ id: string; user_name: string; punch_type: string; punched_at: string }>>("/rest/v1/time_punches?select=*&order=punched_at.desc");
    const grouped = new Map<string, Array<{ id: string; type: string; punched_at: string }>>();
    for (const punch of punches) {
      const list = grouped.get(punch.user_name) || [];
      list.push({ id: punch.id, type: punch.punch_type, punched_at: punch.punched_at });
      grouped.set(punch.user_name, list);
    }
    return Array.from(grouped.entries()).map(([user_name, punches]) => ({
      user_name,
      next_type: punches[0]?.type === "salida" ? null : "salida",
      punches
    })) as T;
  }

  if (pathname === "/api/v1/hr/operations-map") {
    const [routes, employees, pings] = await Promise.all([
      supabaseApiFallback<Array<{ id: string; vehicle_plate: string; employees: string[]; status: string }>>("/api/v1/hr/routes"),
      supabaseApiFallback<Array<{ id: string }>>("/api/v1/hr/employees?active=true"),
      supabaseFetch<Array<{ id: string; user_name: string; captured_at: string }>>("/rest/v1/gps_pings?select=*&order=captured_at.desc")
    ]);
    return {
      kpis: {
        online: pings.length,
        offline: Math.max(0, (employees?.length || 0) - pings.length),
        routes: routes?.length || 0,
        people: employees?.length || 0,
        without_gps: Math.max(0, (employees?.length || 0) - pings.length)
      },
      routes: routes || [],
      pings
    } as T;
  }

  if (pathname === "/api/v1/hr/routes/preop/metrics") {
    const [checklists, blocks] = await Promise.all([
      supabaseFetch<Array<{ id: string; checklist_status?: string }>>("/rest/v1/route_preoperational_checklists?select=*"),
      supabaseFetch<Array<{ id: string }>>("/rest/v1/route_block_events?select=*")
    ]);
    return {
      checklists_today: checklists.length,
      checklists_pending: checklists.filter((item) => item.checklist_status === "pendiente").length,
      routes_blocked: blocks.length,
      compliance_rate: checklists.length ? Math.round(((checklists.length - blocks.length) / checklists.length) * 100) : 100,
      approved_with_findings: 0
    } as T;
  }

  if (pathname === "/api/v1/hr/me") {
    const rows = await supabaseFetch<Array<{
      id: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      position?: string;
      user_type?: string;
      metadata?: AnyRow;
    }>>("/rest/v1/employees?select=*&order=created_at.desc&limit=1");
    const row = rows[0];
    if (!row) return null;
    const name = fullName(row);
    return {
      id: row.id,
      code: String(row.metadata?.code || row.id.slice(0, 8)),
      user_type: row.user_type || row.position || "operario",
      position: row.position || row.user_type || "operario",
      metadata: { ...(row.metadata || {}), name },
      user: { name, email: row.email || "" }
    } as T;
  }

  if (pathname === "/api/v1/hr/routes/preop/template") {
    return {
      sections: ["Documental", "Exterior", "Seguridad", "Conductor"],
      items: [
        { section: "Documental", item_key: "soat_vigente", label: "SOAT vigente", severity: "critica", blocks_route: true, evidence_required: false },
        { section: "Documental", item_key: "licencia_conductor_vigente", label: "Licencia del conductor vigente", severity: "critica", blocks_route: true, evidence_required: true },
        { section: "Exterior", item_key: "llantas_estado", label: "Llantas en buen estado", severity: "critica", blocks_route: true, evidence_required: true },
        { section: "Seguridad", item_key: "frenos", label: "Frenos funcionando correctamente", severity: "critica", blocks_route: true, evidence_required: true },
        { section: "Conductor", item_key: "conductor_apto", label: "Conductor apto", severity: "critica", blocks_route: true, evidence_required: false }
      ]
    } as T;
  }

  if (pathname === "/api/v1/hr/routes/preop/active") {
    return { checklist: null, template: await supabaseApiFallback("/api/v1/hr/routes/preop/template") } as T;
  }

  if (pathname === "/api/v1/hr/employees") {
    const statusFilter = active === "true" ? "&status=eq.active" : "";
    const rows = await supabaseFetch<Array<{
      id: string;
      first_name?: string;
      last_name?: string;
      document_number?: string;
      email?: string;
      position?: string;
      department?: string;
      status?: string;
      user_type?: string;
      metadata?: Record<string, unknown>;
    }>>(`/rest/v1/employees?select=*&order=created_at.desc${statusFilter}`);

    return rows.map((row) => {
      const name = fullName(row);
      const document = row.document_number || String(row.metadata?.document || "");
      return {
        id: row.id,
        code: String(row.metadata?.code || row.document_number || row.id.slice(0, 8)),
        user_type: row.user_type || row.position || String(row.metadata?.user_type || "operario"),
        position: row.position || row.user_type || "operario",
        department: row.department || "Operacion",
        metadata: {
          ...(row.metadata || {}),
          name,
          document,
          user_type: row.user_type || row.position || row.metadata?.user_type
        },
        user: { name, email: row.email || "" },
        active: row.status !== "inactive"
      };
    }) as T;
  }

  const vehicleDetailMatch = pathname.match(/^\/api\/v1\/transport\/vehicles\/([^/]+)$/);
  if (pathname === "/api/v1/transport/vehicles" || vehicleDetailMatch) {
    const idFilter = vehicleDetailMatch ? `&id=eq.${encodeURIComponent(vehicleDetailMatch[1])}` : "";
    const rows = await supabaseFetch<Array<{
      id: string;
      plate: string;
      type?: string;
      category?: string;
      brand?: string;
      model?: string;
      year?: number;
      color?: string;
      mileage?: number;
      owner?: string;
      ownership_type?: string;
      base_site?: string;
      authorized_driver_id?: string;
      authorized_driver_name?: string;
      authorized_driver_document?: string;
      authorized_driver_code?: string;
      status?: string;
      master_status?: string;
      document_status?: string;
      master_score?: number;
      metadata?: Record<string, unknown>;
    }>>(`/rest/v1/vehicles?select=*&order=created_at.desc${idFilter}`);

    const mapped = rows.map((row) => ({
      ...row,
      type: row.type || row.category || "vehiculo",
      brand: row.brand || "",
      model: row.model || "",
      ownership_type: row.ownership_type || "propio",
      base_site: row.base_site || String(row.metadata?.base_site || "Sede Demo SCJ"),
      status: row.status || "activo",
      master_status: row.master_status || row.document_status || "pendiente_documentacion",
      document_status: row.document_status || "pendiente_documentacion",
      master_score: row.master_score || 0,
      dashboard_metrics: {
        soat_days_remaining: null,
        technical_review_days_remaining: null,
        expired_documents: row.document_status === "vencido" ? 1 : 0,
        expiring_documents: row.document_status === "proximo_vencer" ? 1 : 0,
        score_label: row.master_status || "Demo"
      }
    }));
    return (vehicleDetailMatch ? mapped[0] || null : mapped) as T;
  }

  if (pathname === "/api/v1/hr/routes") {
    const routes = await supabaseFetch<Array<{
      id: string;
      code?: string;
      route_date: string;
      vehicle_plate?: string;
      start_time?: string;
      end_time?: string;
      status?: string;
      notes?: string;
    }>>("/rest/v1/operational_routes?select=*&order=route_date.desc");
    const assignments = await supabaseFetch<Array<{
      route_id: string;
      role?: string;
      employees?: { first_name?: string; last_name?: string; document_number?: string; metadata?: Record<string, unknown> };
    }>>("/rest/v1/route_assignments?select=route_id,role,employees(first_name,last_name,document_number,metadata)");

    return routes.map((route) => ({
      id: route.id,
      date: route.route_date,
      vehicle_plate: route.vehicle_plate || "",
      employees: assignments
        .filter((assignment) => assignment.route_id === route.id)
        .map((assignment) => fullName(assignment.employees || {}) || String(assignment.employees?.metadata?.code || assignment.employees?.document_number || "")),
      start_time: route.start_time || "",
      end_time: route.end_time || "",
      status: route.status || "planned",
      notes: route.notes || ""
    })) as T;
  }

  if (pathname === "/api/v1/transport/vehicles/metrics/dashboard") {
    const vehicles = await supabaseApiFallback<Array<{ master_status?: string; document_status?: string; master_score?: number }>>("/api/v1/transport/vehicles");
    const rows = vehicles || [];
    return {
      total: rows.length,
      active: rows.filter((vehicle) => !["bloqueado_documental", "bloqueado"].includes(String(vehicle.master_status))).length,
      blocked: rows.filter((vehicle) => ["bloqueado_documental", "bloqueado", "vencido"].includes(String(vehicle.master_status)) || vehicle.document_status === "vencido").length,
      pending_validation: rows.filter((vehicle) => String(vehicle.master_status).includes("pendiente")).length,
      expiring: rows.filter((vehicle) => ["proximo_vencer", "documento_proximo_a_vencer"].includes(String(vehicle.document_status)) || String(vehicle.master_status).includes("vencer")).length,
      reliable_records: rows.filter((vehicle) => Number(vehicle.master_score || 0) >= 80 || vehicle.document_status === "vigente").length,
      average_score: rows.length ? Math.round(rows.reduce((sum, vehicle) => sum + Number(vehicle.master_score || (vehicle.document_status === "vigente" ? 90 : 60)), 0) / rows.length) : 0
    } as T;
  }

  if (pathname === "/api/v1/services/references") {
    const activeFilter = active === "true" ? "&active=eq.true" : "";
    const refs = await supabaseFetch<Array<{
      id: string;
      code: string;
      name: string;
      category?: string;
      description?: string;
      estimated_minutes?: number;
      brand?: string;
      model?: string;
      active?: boolean;
      metadata?: AnyRow;
    }>>(`/rest/v1/service_references?select=*&order=code.asc${activeFilter}`);
    const parts = await supabaseFetch<Array<{ id: string; reference_id: string; name: string; quantity: number; unit: string; description?: string; display_order?: number }>>("/rest/v1/service_reference_parts?select=*&order=display_order.asc");

    return refs.map((ref) => ({
      ...ref,
      estimated_minutes: ref.estimated_minutes || 60,
      brand: ref.brand || "",
      model: ref.model || "",
      parts: parts.filter((part) => part.reference_id === ref.id),
      manuals: Array.isArray(ref.metadata?.manuals) ? ref.metadata.manuals : []
    })) as T;
  }

  const serviceOrderDetailMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)$/);
  if (pathname === "/api/v1/services/orders" || serviceOrderDetailMatch) {
    const status = search.get("status");
    const filters = [
      status ? `status=eq.${encodeURIComponent(status)}` : "",
      serviceOrderDetailMatch ? `id=eq.${encodeURIComponent(serviceOrderDetailMatch[1])}` : ""
    ].filter(Boolean).join("&");
    const orders = await supabaseFetch<Array<{
      id: string;
      number: string;
      reference_id?: string;
      technician_employee_id?: string;
      service_type?: string;
      status?: string;
      customer_name: string;
      customer_address: string;
      customer_phone?: string;
      invoice_number?: string;
      scheduled_date?: string;
      started_at?: string;
      closed_at?: string;
      notes?: string;
      metadata?: AnyRow;
    }>>(`/rest/v1/service_orders?select=*&order=created_at.desc${filters ? `&${filters}` : ""}`);
    const refs = await supabaseFetch<Array<{ id: string; code: string; name: string; category?: string; estimated_minutes?: number; brand?: string; model?: string; metadata?: AnyRow }>>("/rest/v1/service_references?select=*");
    const parts = await supabaseFetch<Array<{ id: string; reference_id: string; name: string; quantity: number; unit: string; display_order?: number }>>("/rest/v1/service_reference_parts?select=*&order=display_order.asc");
    const incidents = await supabaseFetch<Array<{ id: string; order_id: string; type?: string; description?: string; action?: string }>>("/rest/v1/service_incidents?select=*");
    const evidence = await supabaseFetch<Array<{ id: string; order_id: string; evidence_type?: string; file_url?: string; storage_path?: string }>>("/rest/v1/service_evidence?select=*");

    const mapped = orders.map((order) => {
      const reference = refs.find((ref) => ref.id === order.reference_id);
      const referenceWithParts = reference ? {
        ...reference,
        parts: parts.filter((part) => part.reference_id === reference.id),
        manuals: Array.isArray(reference.metadata?.manuals) ? reference.metadata.manuals : []
      } : null;
      return {
        ...order,
        reference: referenceWithParts,
        reference_id: order.reference_id || "",
        service_type: order.service_type || "servicio",
        status: order.status || "pendiente",
        customer_phone: order.customer_phone || "",
        scheduled_date: order.scheduled_date || "",
        incidents: incidents.filter((item) => item.order_id === order.id),
        photos: evidence.filter((item) => item.order_id === order.id),
        evidence: evidence.filter((item) => item.order_id === order.id),
        inspection_items: referenceWithParts?.parts?.map((part) => ({ part_id: part.id, name: part.name, status: "pendiente" })) || []
      };
    });

    return (serviceOrderDetailMatch ? mapped[0] || null : { data: mapped, kpis: kpisForOrders(mapped) }) as T;
  }

  if (pathname === "/api/v1/admin/permissions/catalog") {
    return [
      { key: "admin", label: "Administracion", actions: ["read", "write"] },
      { key: "hr", label: "Talento humano", actions: ["read", "write"] },
      { key: "services", label: "Servicios", actions: ["read", "write"] },
      { key: "transport", label: "Transporte", actions: ["read", "write"] }
    ] as T;
  }

  if (pathname === "/api/v1/admin/roles") {
    return [
      { id: 1, name: "Administrador demo", description: "Acceso demo SCJ", active: true, is_system: true, permissions: {} },
      { id: 2, name: "Piloto demo", description: "Conductores y auxiliares demo", active: true, is_system: true, permissions: {} }
    ] as T;
  }

  if (pathname === "/api/v1/admin/users") {
    const employees = await supabaseFetch<Array<{
      id: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      document_number?: string;
      position?: string;
      department?: string;
      status?: string;
      user_type?: string;
      metadata?: AnyRow;
    }>>("/rest/v1/employees?select=*&order=created_at.desc");
    return employees.map((employee) => {
      const name = fullName(employee);
      return {
        id: toNumberId(employee.id),
        name,
        email: employee.email || "",
        role_id: employee.user_type === "conductor" ? 2 : 1,
        role_name: employee.user_type === "conductor" ? "Piloto demo" : "Administrador demo",
        active: employee.status === "active",
        code: String(employee.metadata?.code || employee.document_number || employee.id.slice(0, 8)),
        document: employee.document_number || String(employee.metadata?.document || ""),
        company: "SCJ",
        position: employee.position || employee.user_type || "",
        department: employee.department || "",
        salary_base: 0,
        labor_status: employee.status || "active",
        operational_classification: employee.user_type || employee.position || "operario",
        base_site: "Sede Demo SCJ",
        site: "Sede Demo SCJ"
      };
    }) as T;
  }

  return null;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  assertActiveSession();
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  let response: Response;

  if ((!options.method || options.method === "GET") && isSupabaseSession()) {
    const fallback = await supabaseApiFallback<T>(path).catch(() => null);
    if (fallback) {
      touchSession();
      return fallback;
    }
  }

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error("API no disponible. Inicia el backend en http://localhost:3000.");
  }

  if (response.status === 401 && typeof window !== "undefined" && !isSupabaseSession()) {
    clearSession("unauthorized");
    window.location.href = "/login";
    throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error("API no disponible. Inicia el backend en http://localhost:3000.");
    }

    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || "La solicitud no pudo completarse");
  }
  touchSession();
  return response.json() as Promise<T>;
}
