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

function fullName(row: { first_name?: string; last_name?: string; email?: string; id?: string }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || `Empleado ${String(row.id || "").slice(0, 8)}`;
}

async function supabaseApiFallback<T>(path: string): Promise<T | null> {
  const [pathname, queryString = ""] = path.split("?");
  const search = new URLSearchParams(queryString);
  const active = search.get("active");

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

  if (pathname === "/api/v1/transport/vehicles") {
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
    }>>("/rest/v1/vehicles?select=*&order=created_at.desc");

    return rows.map((row) => ({
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
    })) as T;
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
