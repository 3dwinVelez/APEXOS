import { assertActiveSession, clearSession, touchSession } from "./sessionSecurity";
import { supabaseFetch } from "./supabaseClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
const SUPABASE_PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || "";
const API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 20000);

function isSupabaseSession() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("auth_provider") === "supabase") return true;
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.iss || "").includes("supabase") || (!!SUPABASE_PROJECT_REF && String(payload.ref || "") === SUPABASE_PROJECT_REF);
  } catch {
    return false;
  }
}

type AnyRow = Record<string, unknown>;

const fallbackActivityTypes = [
  "Cargue de mercancia en bodega",
  "Inicio de ruta",
  "Entrega en tienda",
  "Entrega en cliente",
  "Recogida de mercancia",
  "Devolucion de mercancia",
  "Novedad en ruta",
  "Vehiculo varado",
  "Espera en punto",
  "Reintento de entrega",
  "Finalizacion de ruta",
  "Apoyo operativo"
].map((name, index) => ({ id: index + 1, name, active: true, sort_order: (index + 1) * 10 }));

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

const adminPermissionCatalog = [
  { key: "dashboard", label: "Inicio y tablero", actions: ["access", "view"] },
  { key: "personal", label: "Usuarios y colaboradores", actions: ["access", "view", "create", "edit"] },
  { key: "roles", label: "Roles y permisos", actions: ["access", "view", "create", "edit"] },
  { key: "servicios", label: "Servicios", actions: ["access", "view", "create", "edit", "export"] },
  { key: "horarios", label: "Marcaciones y rutas", actions: ["access", "view", "create", "edit", "approve"] },
  { key: "vehiculos", label: "Vehiculos", actions: ["access", "view", "create", "edit"] },
  { key: "referencias", label: "Referencias de servicio", actions: ["access", "view", "create", "edit"] },
  { key: "proyectos", label: "Proyectos", actions: ["access", "view", "create", "edit"] },
  { key: "contabilidad", label: "Contabilidad", actions: ["access", "view", "create", "edit", "export", "approve"] },
  { key: "reportes", label: "Reportes", actions: ["access", "view", "export"] },
  { key: "configuracion", label: "Configuracion tenant", actions: ["access", "view", "create", "edit"] },
  { key: "nomina", label: "Nomina futura", actions: ["access", "view", "create", "edit", "export"] }
];

function emptyAdminPermissions() {
  return Object.fromEntries(adminPermissionCatalog.map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, false]))
  ]));
}

function defaultAdminRoles() {
  const all = Object.fromEntries(adminPermissionCatalog.map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, true]))
  ]));
  return [
    { id: 1, name: "Administrador SCJ", description: "Administra usuarios, roles y operacion de la empresa.", active: true, is_system: true, permissions: all },
    { id: 2, name: "Conductor / Operario", description: "Registra jornada, actividades y consulta servicios asignados.", active: true, is_system: true, permissions: { ...emptyAdminPermissions(), dashboard: { access: true, view: true }, horarios: { access: true, view: true, create: true, edit: false, approve: false }, servicios: { access: true, view: true, create: false, edit: true, export: false } } }
  ];
}

function storedAdminRoles() {
  if (typeof window === "undefined") return defaultAdminRoles();
  const raw = localStorage.getItem("apexos_admin_roles_qa");
  if (!raw) return defaultAdminRoles();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : defaultAdminRoles();
  } catch {
    return defaultAdminRoles();
  }
}

function saveStoredAdminRoles(roles: ReturnType<typeof defaultAdminRoles>) {
  if (typeof window !== "undefined") localStorage.setItem("apexos_admin_roles_qa", JSON.stringify(roles));
}

function nextPunchFrom(types: string[]) {
  if (!types.includes("entrada")) return "entrada";
  if (!types.includes("inicio_almuerzo")) return "inicio_almuerzo";
  if (!types.includes("fin_almuerzo")) return "fin_almuerzo";
  if (!types.includes("salida")) return "salida";
  return null;
}

function localDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function safeDevLog(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[apexos] ${message}`, error instanceof Error ? error.message : String(error));
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("La plataforma no respondio a tiempo. Reintenta en unos segundos.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function currentSupabaseUserId() {
  if (typeof window === "undefined") return "";
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.sub || "");
  } catch {
    return "";
  }
}

async function currentSupabaseEmployee() {
  const userId = currentSupabaseUserId();
  const userFilter = userId ? `&user_id=eq.${userId}` : "";
  const rows = await supabaseFetch<Array<{
    id: string;
    company_id?: string;
    user_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    position?: string;
    user_type?: string;
    metadata?: AnyRow;
  }>>(`/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,email,position,user_type,metadata&status=eq.active${userFilter}&order=created_at.desc&limit=1`);
  return rows[0] || null;
}

async function currentSupabaseCompanyUser() {
  const userId = currentSupabaseUserId();
  if (!userId) return null;
  const rows = await supabaseFetch<Array<{ company_id: string; role?: string }>>(`/rest/v1/company_users?select=company_id,role&user_id=eq.${userId}&status=eq.active&limit=1`);
  return rows[0] || null;
}

async function supabaseApiFallback<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const [pathname, queryString = ""] = path.split("?");
  const search = new URLSearchParams(queryString);
  const active = search.get("active");
  const method = String(options.method || "GET").toUpperCase();

  if (pathname === "/api/v1/hr/activity-types") {
    return fallbackActivityTypes as T;
  }

  if (pathname === "/api/v1/hr/work-sessions/current") {
    const employee = await currentSupabaseEmployee();
    if (!employee) return { session: null, active: false, activities: [], alerts: [] } as T;
    const name = fullName(employee);
    const code = String(employee.metadata?.code || employee.id.slice(0, 8));
    const aliases = new Set([employee.id, employee.user_id, name, code, String(employee.metadata?.name || ""), String(employee.email || "")].filter(Boolean).map(String));
    const punches = (await supabaseFetch<Array<{ id: string; employee_id?: string; user_id?: string; user_name: string; punch_type: string; punched_at: string; punch_time?: string; vehicle_plate?: string; route_id?: string; latitude?: number; longitude?: number; accuracy_meters?: number }>>(
      `/rest/v1/time_punches?select=id,employee_id,user_id,user_name,punch_type,punched_at,punch_time,vehicle_plate,route_id,latitude,longitude,accuracy_meters&punch_date=eq.${localDate()}&order=punched_at.asc&limit=80`
    ).catch((error) => {
      safeDevLog("No fue posible consultar marcaciones Supabase.", error);
      return [];
    })).filter((punch) => aliases.has(String(punch.employee_id || "")) || aliases.has(String(punch.user_id || "")) || aliases.has(String(punch.user_name || "")));
    const types = punches.map((punch) => punch.punch_type);
    const activeSession = types.includes("entrada") && !types.includes("salida");
    const activityRows = (await supabaseFetch<Array<{ id: string; employee_id?: string; user_id?: string; user_name: string; latitude: number; longitude: number; accuracy_meters?: number; captured_at: string; metadata?: AnyRow }>>(
      "/rest/v1/gps_pings?select=id,employee_id,user_id,user_name,latitude,longitude,accuracy_meters,captured_at,metadata&source=eq.work_activity&order=captured_at.desc&limit=120"
    ).catch((error) => {
      safeDevLog("No fue posible consultar actividades Supabase.", error);
      return [];
    })).filter((row) => aliases.has(String(row.employee_id || "")) || aliases.has(String(row.user_id || "")) || aliases.has(String(row.user_name || "")));
    const activities = activityRows.map((row, index) => ({
      id: toNumberId(row.id),
      activity_type_name: String(row.metadata?.activity_type_name || "Actividad operativa"),
      observation: String(row.metadata?.observation || ""),
      occurred_at: row.captured_at,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy_meters: Number(row.accuracy_meters || 0),
      evidence: row.metadata?.photo ? [{ base64_data: row.metadata.photo, file_name: String(row.metadata?.photo_name || "evidencia.jpg") }] : []
    }));
    const entry = punches.find((punch) => punch.punch_type === "entrada");
    return {
      session: activeSession ? {
        id: toNumberId(entry?.id || employee.id),
        status: "activa",
        started_at: entry?.punched_at || new Date().toISOString(),
        user_name: code || name
      } : null,
      active: activeSession,
      activities,
      alerts: activeSession && !activities.length ? [{ type: "sin_actividades", severity: "warning", message: "Jornada activa sin actividades registradas." }] : []
    } as T;
  }

  if (pathname === "/api/v1/hr/time-punches" && method === "POST") {
    const employee = await currentSupabaseEmployee();
    if (!employee?.company_id) return null;
    const body = JSON.parse(String(options.body || "{}"));
    const now = body.punched_at ? new Date(body.punched_at) : new Date();
    const name = fullName(employee);
    let extraMinutes = 0;
    if ((body.type || body.tipo_marca) === "salida" && body.route_id) {
      const routeRows = await supabaseFetch<Array<{ route_date?: string; end_time?: string }>>(`/rest/v1/operational_routes?select=route_date,end_time&id=eq.${body.route_id}&limit=1`).catch((error) => {
        safeDevLog("No fue posible consultar el horario de la ruta para hora extra.", error);
        return [];
      });
      const route = routeRows[0];
      if (route?.route_date && route?.end_time) {
        const plannedEnd = new Date(`${route.route_date}T${route.end_time}:00-05:00`);
        extraMinutes = Math.max(0, Math.round((now.getTime() - plannedEnd.getTime()) / 60000));
      }
    }
    const extraEvidence = body.extra_evidence ? {
      name: body.extra_evidence.name,
      type: body.extra_evidence.type,
      size: body.extra_evidence.size,
      base64_data: body.extra_evidence.base64
    } : {};
    const row = {
      company_id: employee.company_id,
      employee_id: employee.id,
      user_id: employee.user_id || null,
      route_id: body.route_id || null,
      user_name: body.user_name || name,
      punch_type: body.type || body.tipo_marca,
      punched_at: now.toISOString(),
      punch_date: localDate(now),
      punch_time: now.toISOString().slice(11, 19),
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      accuracy_meters: body.accuracy_meters ?? null,
      extra_minutes: extraMinutes,
      extra_reason: body.extra_reason || null,
      extra_detail: body.extra_detail || null,
      extra_evidence: extraEvidence,
      metadata: { ...(body.metadata || {}), extra_evidence: extraEvidence }
    };
    let inserted: Array<Record<string, unknown>>;
    try {
      inserted = await supabaseFetch<Array<Record<string, unknown>>>("/rest/v1/time_punches?select=*", {
        method: "POST",
        body: JSON.stringify(row),
        headers: { Prefer: "return=representation" }
      });
    } catch (error) {
      if (!String(error).includes("extra_evidence")) throw error;
      const { extra_evidence: _extraEvidence, ...fallbackRow } = row;
      inserted = await supabaseFetch<Array<Record<string, unknown>>>("/rest/v1/time_punches?select=*", {
        method: "POST",
        body: JSON.stringify(fallbackRow),
        headers: { Prefer: "return=representation" }
      });
    }
    const punches = await supabaseFetch<Array<{ punch_type: string }>>(`/rest/v1/time_punches?select=punch_type&employee_id=eq.${employee.id}&punch_date=eq.${localDate(now)}&order=punched_at.asc&limit=12`).catch((error) => {
      safeDevLog("No fue posible recalcular siguiente marcacion.", error);
      return [];
    });
    return {
      ok: true,
      hora: row.punch_time,
      punch: inserted[0],
      next: nextPunchFrom(punches.map((punch) => punch.punch_type)),
      route_authorized: true,
      preoperational_required: false,
      preoperational_checklist: null
    } as T;
  }

  if (pathname === "/api/v1/hr/work-activities" && method === "POST") {
    const employee = await currentSupabaseEmployee();
    if (!employee?.company_id) return null;
    const body = JSON.parse(String(options.body || "{}"));
    const type = fallbackActivityTypes.find((item) => item.id === Number(body.activity_type_id)) || fallbackActivityTypes[0];
    const now = body.occurred_at ? new Date(body.occurred_at) : new Date();
    const row = {
      company_id: employee.company_id,
      employee_id: employee.id,
      user_id: employee.user_id || null,
      route_id: body.route_id || null,
      user_name: fullName(employee),
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy_meters: body.accuracy_meters ?? null,
      source: "work_activity",
      captured_at: now.toISOString(),
      metadata: {
        ...(body.metadata || {}),
        activity_type_id: type.id,
        activity_type_name: type.name,
        observation: body.observation,
        photo: body.photo?.base64,
        photo_name: body.photo?.name
      }
    };
    const inserted = await supabaseFetch<Array<{ id: string }>>("/rest/v1/gps_pings?select=*", {
      method: "POST",
      body: JSON.stringify(row),
      headers: { Prefer: "return=representation" }
    });
    return {
      id: toNumberId(inserted[0]?.id || now.toISOString()),
      activity_type_name: type.name,
      observation: body.observation,
      occurred_at: now.toISOString(),
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      accuracy_meters: Number(body.accuracy_meters || 0),
      evidence: body.photo ? [{ base64_data: body.photo.base64, file_name: body.photo.name }] : []
    } as T;
  }

  if (pathname === "/api/v1/hr/schedules") {
    return [] as T;
  }

  if (pathname === "/api/v1/hr/workdays") {
    return [] as T;
  }

  if (pathname === "/api/v1/hr/attendance") {
    const punches = await supabaseFetch<Array<{ id: string; user_name: string; punch_type: string; punched_at: string }>>("/rest/v1/time_punches?select=id,user_name,punch_type,punched_at&order=punched_at.desc&limit=200");
    const grouped = new Map<string, Array<{ id: string; type: string; punched_at: string }>>();
    for (const punch of punches) {
      const list = grouped.get(punch.user_name) || [];
      list.push({ id: punch.id, type: punch.punch_type, punched_at: punch.punched_at });
      grouped.set(punch.user_name, list);
    }
    return Array.from(grouped.entries()).map(([user_name, punches]) => ({
      user_name,
      next_type: nextPunchFrom(punches.map((punch) => punch.type)),
      punches
    })) as T;
  }

  if (pathname === "/api/v1/hr/operations-map") {
    const [routes, employees, assignments, pings, punches] = await Promise.all([
      supabaseFetch<Array<{ id: string; code?: string; route_date: string; vehicle_plate?: string; start_time?: string; end_time?: string; status?: string }>>("/rest/v1/operational_routes?select=id,code,route_date,vehicle_plate,start_time,end_time,status&order=route_date.desc&limit=120"),
      supabaseFetch<Array<{ id: string; first_name?: string; last_name?: string; document_number?: string; user_type?: string; position?: string; metadata?: AnyRow }>>("/rest/v1/employees?select=id,first_name,last_name,document_number,user_type,position,metadata&status=eq.active&limit=250"),
      supabaseFetch<Array<{ route_id: string; employee_id: string; role?: string }>>("/rest/v1/route_assignments?select=route_id,employee_id,role&limit=500"),
      supabaseFetch<Array<{ id: string; employee_id?: string; user_name: string; route_id?: string; vehicle_id?: string; latitude: number; longitude: number; accuracy_meters?: number; source?: string; captured_at: string; metadata?: AnyRow }>>("/rest/v1/gps_pings?select=id,employee_id,user_name,route_id,vehicle_id,latitude,longitude,accuracy_meters,source,captured_at,metadata&order=captured_at.desc&limit=500"),
      supabaseFetch<Array<{ id: string; employee_id?: string; user_name: string; punch_type: string; punch_time?: string; punched_at: string; route_id?: string; vehicle_id?: string; vehicle_plate?: string; latitude?: number; longitude?: number; accuracy_meters?: number; extra_minutes?: number; extra_reason?: string; extra_detail?: string; extra_evidence?: AnyRow; metadata?: AnyRow }>>("/rest/v1/time_punches?select=id,employee_id,user_name,punch_type,punch_time,punched_at,route_id,vehicle_id,vehicle_plate,latitude,longitude,accuracy_meters,extra_minutes,extra_reason,extra_detail,extra_evidence,metadata&order=punched_at.desc&limit=500")
    ]);

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const latestPingByEmployee = new Map<string, (typeof pings)[number]>();
    for (const ping of pings) {
      const key = ping.employee_id || ping.user_name;
      if (key && !latestPingByEmployee.has(key)) latestPingByEmployee.set(key, ping);
    }
    const latestPunchByEmployee = new Map<string, (typeof punches)[number]>();
    for (const punch of punches) {
      const key = punch.employee_id || punch.user_name;
      if (key && !latestPunchByEmployee.has(key)) latestPunchByEmployee.set(key, punch);
    }

    const people = assignments.map((assignment) => {
      const employee = employeeById.get(assignment.employee_id);
      const route = routes.find((item) => item.id === assignment.route_id);
      const name = fullName(employee || {});
      const ping = latestPingByEmployee.get(assignment.employee_id) || latestPingByEmployee.get(name);
      const punch = latestPunchByEmployee.get(assignment.employee_id) || latestPunchByEmployee.get(name);
      const capturedAt = ping?.captured_at || punch?.punched_at || null;
      const ageSeconds = capturedAt ? Math.max(0, Math.round((Date.now() - new Date(capturedAt).getTime()) / 1000)) : null;
      const online = ageSeconds != null && ageSeconds <= Number(search.get("minutes") || 30) * 60;
      const latitude = ping?.latitude ?? punch?.latitude ?? null;
      const longitude = ping?.longitude ?? punch?.longitude ?? null;
      return {
        key: `${assignment.route_id}-${assignment.employee_id}`,
        employee_id: assignment.employee_id,
        user_name: name,
        name,
        route_id: assignment.route_id,
        route_label: route?.code || `Ruta ${String(assignment.route_id).slice(0, 8)}`,
        vehicle_plate: route?.vehicle_plate || "",
        latitude,
        longitude,
        accuracy_meters: ping?.accuracy_meters ?? punch?.accuracy_meters ?? null,
        captured_at: capturedAt,
        age_seconds: ageSeconds,
        online,
        footprint_source: ping ? "live" : punch ? "punch" : "none",
        last_punch_type: punch?.punch_type || "Sin iniciar",
        last_punch_time: punch?.punch_time || (punch?.punched_at ? new Date(punch.punched_at).toLocaleTimeString() : ""),
        status: online ? "En ruta" : latitude != null && longitude != null ? "Ultima marca" : "Sin GPS",
        time_in_route_minutes: null,
        route_start_time: route?.start_time || "",
        route_end_time: route?.end_time || ""
      };
    });

    const routeSummaries = routes.map((route) => {
      const routeAssignments = assignments.filter((assignment) => assignment.route_id === route.id);
      const routePeople = people.filter((person) => person.route_id === route.id);
      const routePings = pings.filter((ping) => ping.route_id === route.id);
      const routeActivities = pings
        .filter((ping) => ping.route_id === route.id && ping.source === "work_activity")
        .map((activity) => ({
          id: activity.id,
          user_name: activity.user_name,
          type: String(activity.metadata?.activity_type_name || "Actividad operativa"),
          time: activity.captured_at ? new Date(activity.captured_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "",
          occurred_at: activity.captured_at,
          latitude: Number(activity.latitude),
          longitude: Number(activity.longitude),
          accuracy_meters: activity.accuracy_meters ?? null,
          vehicle_plate: route.vehicle_plate || "",
          route_id: route.id,
          observation: String(activity.metadata?.observation || ""),
          evidence: activity.metadata?.photo ? [{ base64_data: String(activity.metadata.photo), file_name: String(activity.metadata?.photo_name || "evidencia.jpg") }] : [],
          metadata: activity.metadata || {}
        }));
      const routePunches = punches
        .filter((punch) => punch.route_id === route.id && punch.latitude != null && punch.longitude != null)
        .map((punch) => ({
          id: punch.id,
          user_name: punch.user_name,
          type: punch.punch_type,
          time: punch.punch_time || "",
          punched_at: punch.punched_at,
          latitude: Number(punch.latitude),
          longitude: Number(punch.longitude),
          accuracy_meters: punch.accuracy_meters ?? null,
          vehicle_plate: route.vehicle_plate || "",
          route_id: route.id,
          extra_minutes: punch.extra_minutes || 0,
          extra_reason: punch.extra_reason || "",
          extra_detail: punch.extra_detail || "",
          extra_evidence: punch.extra_evidence || punch.metadata?.extra_evidence || {},
          metadata: punch.metadata || {}
        }));
      const userNames = Array.from(new Set(routePunches.map((punch) => punch.user_name)));
      return {
        id: route.id,
        vehicle_plate: route.vehicle_plate || "",
        employees: routeAssignments.map((assignment) => fullName(employeeById.get(assignment.employee_id) || {})),
        start_time: route.start_time || "",
        end_time: route.end_time || "",
        status: route.status || "planned",
        assigned_count: routeAssignments.length,
        online_count: routePeople.filter((person) => person.online).length,
        with_gps_count: routePeople.filter((person) => person.latitude != null && person.longitude != null).length,
        pings: routePings.map((ping) => ({ ...ping, vehicle_plate: route.vehicle_plate || "", route_id: route.id })),
        punch_points: routePunches,
        activity_points: routeActivities,
        marks_by_user: userNames.map((user_name) => ({ user_name, marks: routePunches.filter((punch) => punch.user_name === user_name) }))
      };
    });

    return {
      date: search.get("date") || new Date().toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      active_window_minutes: Number(search.get("minutes") || 30),
      people,
      routes: routeSummaries,
      totals: {
        routes: routeSummaries.length,
        planned_people: people.length,
        online: people.filter((person) => person.online).length,
        without_gps: people.filter((person) => person.latitude == null || person.longitude == null).length,
        offline: people.filter((person) => !person.online).length
      },
      kpis: {
        online: people.filter((person) => person.online).length,
        offline: people.filter((person) => !person.online).length,
        routes: routeSummaries.length,
        people: people.length,
        without_gps: people.filter((person) => person.latitude == null || person.longitude == null).length
      },
      pings
    } as T;
  }

  if (pathname === "/api/v1/hr/routes/preop/metrics") {
    const [checklists, blocks] = await Promise.all([
      supabaseFetch<Array<{ id: string; checklist_status?: string }>>("/rest/v1/route_preoperational_checklists?select=id,checklist_status&created_at=gte." + localDate() + "T00:00:00-05:00&limit=200"),
      supabaseFetch<Array<{ id: string }>>("/rest/v1/route_block_events?select=id&created_at=gte." + localDate() + "T00:00:00-05:00&limit=200")
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
    const row = await currentSupabaseEmployee();
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
    }>>(`/rest/v1/employees?select=id,first_name,last_name,document_number,email,position,department,status,user_type,metadata&order=created_at.desc${statusFilter}&limit=250`);

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
    }>>(`/rest/v1/vehicles?select=id,plate,type,category,brand,model,year,color,mileage,owner,ownership_type,base_site,authorized_driver_id,authorized_driver_name,authorized_driver_document,authorized_driver_code,status,master_status,document_status,master_score,metadata&order=created_at.desc${idFilter}&limit=${vehicleDetailMatch ? 1 : 100}`);

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
    }>>("/rest/v1/operational_routes?select=id,code,route_date,vehicle_plate,start_time,end_time,status,notes&order=route_date.desc&limit=120");
    const assignments = await supabaseFetch<Array<{
      route_id: string;
      role?: string;
      employees?: { first_name?: string; last_name?: string; document_number?: string; metadata?: Record<string, unknown> };
    }>>("/rest/v1/route_assignments?select=route_id,role,employees(first_name,last_name,document_number,metadata)&limit=500");

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
    }>>(`/rest/v1/service_references?select=id,code,name,category,description,estimated_minutes,brand,model,active,metadata&order=code.asc${activeFilter}&limit=200`);
    const parts = await supabaseFetch<Array<{ id: string; reference_id: string; name: string; quantity: number; unit: string; description?: string; display_order?: number }>>("/rest/v1/service_reference_parts?select=id,reference_id,name,quantity,unit,description,display_order&order=display_order.asc&limit=1000");

    return refs.map((ref) => ({
      ...ref,
      estimated_minutes: ref.estimated_minutes || 60,
      brand: ref.brand || "",
      model: ref.model || "",
      parts: parts.filter((part) => part.reference_id === ref.id),
      manuals: Array.isArray(ref.metadata?.manuals) ? ref.metadata.manuals : []
    })) as T;
  }

  if (pathname === "/api/v1/projects/operational-center") {
    const now = new Date().toISOString();
    const project = {
      id: 1,
      name: "Implementacion operacional APEXOS",
      objective: "Coordinar compromisos, entregables, bloqueos y recursos bajo MODELO APEX.",
      status: "activo",
      priority: "alta",
      owner_name: "Direccion Operativa Demo",
      target_date: "2026-06-15T05:00:00.000Z",
      apex_score: 72,
      score_status: "estable",
      progress: 58,
      validated_progress: 50,
      commitments: [
        { id: 1, title: "Validar flujo operativo de campo", description: "Servicios y marcaciones desde celular.", responsible_name: "Coordinador Demo", priority: "alta", target_date: "2026-05-24T05:00:00.000Z", status: "validacion" },
        { id: 2, title: "Resolver visibilidad de ambiente", description: "Asegurar que el despliegue muestre cambios recientes.", responsible_name: "Soporte Demo", priority: "critica", target_date: "2026-05-20T05:00:00.000Z", status: "bloqueado" }
      ],
      deliverables: [
        { id: 1, name: "Centro Operacional APEX", description: "Vista ejecutiva sin Gantt pesado.", responsible_name: "Producto Demo", target_date: "2026-05-28T05:00:00.000Z", status: "activo", validation: "Pendiente aprobacion", evidence_status: "pendiente" }
      ],
      risks: [
        { id: 1, kind: "bloqueo", description: "Ambiente no refleja cambios hasta reconstruir contenedor.", impact: "alto", priority: "critica", responsible_name: "Soporte Demo", action_recommended: "Reconstruir web y validar hash.", status: "activo" }
      ],
      resources: [
        { id: 1, person_id: 101, person_name: "Coordinador Demo", role: "Responsable de resultado", load_level: 70, availability: "disponible", responsibilities: "Cierre de compromisos", assignment_summary: { commitments: 1, deliverables: 0, risks: 0, open_items: 1 }, assignments: { commitments: [{ id: 1, title: "Validar flujo operativo de campo", status: "validacion", target_date: "2026-05-24T05:00:00.000Z" }], deliverables: [], risks: [] } },
        { id: 2, person_id: null, person_name: "Soporte Demo", role: "Desbloqueo", load_level: 90, availability: "saturado", responsibilities: "Ambiente y despliegue", metadata: { source: "participante_externo", organization: "Aliado Demo" }, assignment_summary: { commitments: 1, deliverables: 0, risks: 1, open_items: 2 }, assignments: { commitments: [{ id: 2, title: "Resolver visibilidad de ambiente", status: "bloqueado", target_date: "2026-05-20T05:00:00.000Z" }], deliverables: [], risks: [{ id: 1, kind: "bloqueo", description: "Ambiente no refleja cambios hasta reconstruir contenedor.", status: "activo" }] } }
      ],
      generated_alerts: [
        { type: "bloqueo_activo", title: "Bloqueo activo", description: "Ambiente no refleja cambios hasta reconstruir contenedor.", severity: "warning", action_suggested: "Reconstruir web y validar hash." }
      ],
      logs: [
        { id: "1", action: "demo.supabase", summary: "Datos demo MODELO APEX cargados para sesion Supabase.", created_at: now }
      ],
      indicators: { open_commitments: 2, pending_deliverables: 1, active_blocks: 1, critical_risks: 1, saturated_resources: 1, next_commitments: 2 }
    };
    return {
      active_project: project,
      projects: [project],
      portfolio: { total: 1, active: 1, blocked: 1, validation: 0, average_score: 72 },
      next_actions: [{ title: "Atender bloqueo activo", description: "Ambiente no refleja cambios.", action: "Reconstruir y validar.", severity: "warning" }]
    } as T;
  }

  const serviceOrderActionMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)\/(start|inspection|execution|close|close-not-executed)$/);
  const serviceOrderIncidentsMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)\/incidents$/);
  const serviceOrderPhotosMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)\/photos$/);
  const serviceOrderDetailMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)$/);
  if (pathname === "/api/v1/services/orders" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}"));
    const employee = await currentSupabaseEmployee();
    const membership = employee?.company_id ? null : await currentSupabaseCompanyUser();
    const companyId = employee?.company_id || membership?.company_id;
    if (!companyId) throw new Error("No se encontro una empresa activa para crear el servicio.");
    const referenceId = body.reference_id || body.reference_item_id || null;
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const row = {
      company_id: companyId,
      number: `OS-${Date.now()}`,
      reference_id: referenceId,
      technician_employee_id: employee?.id || null,
      technician_user_id: employee?.user_id || currentSupabaseUserId() || null,
      service_type: body.service_type || "montaje",
      status: "pendiente",
      customer_name: body.customer_name,
      customer_address: body.customer_address,
      customer_phone: body.customer_phone || "",
      invoice_number: body.invoice_number || "",
      scheduled_date: body.scheduled_date || localDate(),
      notes: body.notes || "",
      metadata: { ...metadata, created_from: "apexos_web_supabase" }
    };
    await supabaseFetch<void>("/rest/v1/service_orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row)
    });
    const inserted = await supabaseFetch<Array<{
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
      notes?: string;
      metadata?: AnyRow;
    }>>(`/rest/v1/service_orders?select=id,number,reference_id,technician_employee_id,service_type,status,customer_name,customer_address,customer_phone,invoice_number,scheduled_date,notes,metadata&number=eq.${encodeURIComponent(row.number)}&limit=1`);
    if (!inserted[0]?.id) throw new Error("El servicio se envio, pero la politica RLS no permitio leer la orden creada.");
    return inserted[0] as T;
  }

  if (serviceOrderActionMatch && method === "PATCH") {
    const [, orderId, action] = serviceOrderActionMatch;
    const body = JSON.parse(String(options.body || "{}"));
    const rows = await supabaseFetch<Array<{ id: string; company_id: string; started_at?: string; metadata?: AnyRow }>>(
      `/rest/v1/service_orders?select=id,company_id,started_at,metadata&id=eq.${encodeURIComponent(orderId)}&limit=1`
    );
    const current = rows[0];
    if (!current) throw new Error("No se encontro el servicio o no tienes permisos para actualizarlo.");
    const now = new Date().toISOString();
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const patch: AnyRow = { metadata: { ...metadata, ...(body.metadata || {}) } };

    if (action === "start") {
      patch.status = "en_curso";
      patch.started_at = now;
      patch.start_latitude = body.latitude ?? null;
      patch.start_longitude = body.longitude ?? null;
      patch.metadata = { ...metadata, ...(body.metadata || {}), start_accuracy_meters: body.accuracy_meters ?? null };
    }
    if (action === "inspection") {
      const items = Array.isArray(body.items) ? body.items.map((item: AnyRow) => ({
        part_id: item.part_id,
        name: item.name,
        quantity: Number(item.quantity || 1),
        unit: item.unit || "und",
        status: item.status || "ok",
        comment: item.comment || "",
        action: item.action || "ninguna"
      })) : [];
      patch.status = "inspeccion";
      patch.metadata = {
        ...metadata,
        inspection: {
          items,
          decision: body.decision || "pendiente",
          problem_count: items.filter((item: AnyRow) => item.status !== "ok").length,
          inspected_at: now,
          ...(body.metadata || {})
        }
      };
    }
    if (action === "execution") {
      patch.status = "ejecucion";
      patch.metadata = {
        ...metadata,
        inspection: {
          ...((metadata.inspection as AnyRow) || {}),
          decision: "armable",
          moved_to_execution_at: now
        }
      };
    }
    if (action === "close" || action === "close-not-executed") {
      const evidence = await supabaseFetch<Array<{ evidence_type?: string; metadata?: AnyRow }>>(
        `/rest/v1/service_evidence?select=evidence_type,metadata&order_id=eq.${encodeURIComponent(orderId)}&limit=100`
      );
      const available = new Set(evidence.map((item) => String(item.metadata?.original_type || item.evidence_type || "")));
      const required = action === "close" ? ["producto_abierto", "producto_cerrado", "cliente", "firma_cliente"] : ["no_ejecutada", "firma_cliente"];
      const missing = required.filter((item) => !available.has(item));
      if (missing.length) throw new Error(`Faltan evidencias para cerrar: ${missing.join(", ")}.`);
      if (action === "close-not-executed" && !String(body.no_execution_reason || "").trim()) throw new Error("El motivo de no ejecucion es obligatorio.");
      patch.status = action === "close" ? "cerrada" : "no_ejecutada";
      patch.closed_at = now;
      patch.close_latitude = body.latitude ?? null;
      patch.close_longitude = body.longitude ?? null;
      patch.no_execution_reason = action === "close-not-executed" ? body.no_execution_reason : null;
      patch.metadata = { ...metadata, ...(body.metadata || {}), close_accuracy_meters: body.accuracy_meters ?? null };
      if (action === "close-not-executed") {
        await supabaseFetch<void>("/rest/v1/service_incidents", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            company_id: current.company_id,
            order_id: orderId,
            type: "no_ejecutada",
            description: body.no_execution_reason,
            action: "cierre_no_ejecutado",
            metadata: body.metadata || {}
          })
        });
      }
    }

    await supabaseFetch<void>(`/rest/v1/service_orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch)
    });
    return await supabaseApiFallback<T>(`/api/v1/services/orders/${orderId}`);
  }

  if (serviceOrderIncidentsMatch && method === "POST") {
    const orderId = serviceOrderIncidentsMatch[1];
    const body = JSON.parse(String(options.body || "{}"));
    const rows = await supabaseFetch<Array<{ company_id: string }>>(`/rest/v1/service_orders?select=company_id&id=eq.${encodeURIComponent(orderId)}&limit=1`);
    if (!rows[0]) throw new Error("No se encontro el servicio o no tienes permisos para registrar novedades.");
    await supabaseFetch<void>("/rest/v1/service_incidents", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        company_id: rows[0].company_id,
        order_id: orderId,
        type: body.type || "averia",
        description: body.description,
        action: body.action || "",
        photo_url: body.photo_url || "",
        metadata: body.metadata || {}
      })
    });
    const inserted = await supabaseFetch<Array<{ id: string; order_id: string; type?: string; description?: string; action?: string; created_at?: string }>>(
      `/rest/v1/service_incidents?select=id,order_id,type,description,action,created_at&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc&limit=1`
    );
    if (!inserted[0]?.id) throw new Error("La novedad se envio, pero no fue posible leer el registro creado.");
    return inserted[0] as T;
  }

  if (serviceOrderPhotosMatch) {
    const orderId = serviceOrderPhotosMatch[1];
    if (method === "GET") {
      const photos = await supabaseFetch<Array<{ id: string; evidence_type?: string; file_url?: string; storage_path?: string; mime_type?: string; size_bytes?: number; metadata?: AnyRow; created_at?: string }>>(
        `/rest/v1/service_evidence?select=id,evidence_type,file_url,storage_path,mime_type,size_bytes,metadata,created_at&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc&limit=100`
      );
      return photos.map((photo) => ({ ...photo, type: String(photo.metadata?.original_type || photo.evidence_type || ""), base64_data: photo.file_url?.startsWith("data:") ? photo.file_url : "" })) as T;
    }
    if (method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      const rows = await supabaseFetch<Array<{ company_id: string }>>(`/rest/v1/service_orders?select=company_id&id=eq.${encodeURIComponent(orderId)}&limit=1`);
      if (!rows[0]) throw new Error("No se encontro el servicio o no tienes permisos para cargar evidencia.");
      const originalType = String(body.type || body.evidence_type || "novedad");
      const allowedType = ["fachada", "producto_abierto", "producto_cerrado", "cliente", "firma_cliente", "no_ejecutada"].includes(originalType) ? originalType : "novedad";
      await supabaseFetch<void>("/rest/v1/service_evidence", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          company_id: rows[0].company_id,
          order_id: orderId,
          evidence_type: allowedType,
          file_url: body.file_url || body.base64_data || "",
          storage_path: body.storage_path || "",
          mime_type: body.mime_type || "",
          size_bytes: Number(body.size_bytes || 0),
          metadata: { ...(body.metadata || {}), original_type: originalType, file_name: body.file_name || "" }
        })
      });
      const inserted = await supabaseFetch<Array<{ id: string; evidence_type?: string; file_url?: string; storage_path?: string; mime_type?: string; size_bytes?: number; metadata?: AnyRow; created_at?: string }>>(
        `/rest/v1/service_evidence?select=id,evidence_type,file_url,storage_path,mime_type,size_bytes,metadata,created_at&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc&limit=1`
      );
      const photo = inserted[0];
      if (!photo?.id) throw new Error("La evidencia se envio, pero no fue posible leer el registro creado.");
      return { ...photo, type: originalType, base64_data: photo?.file_url?.startsWith("data:") ? photo.file_url : "" } as T;
    }
  }

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
    }>>(`/rest/v1/service_orders?select=id,number,reference_id,technician_employee_id,service_type,status,customer_name,customer_address,customer_phone,invoice_number,scheduled_date,started_at,closed_at,notes,metadata&order=created_at.desc${filters ? `&${filters}` : ""}&limit=${serviceOrderDetailMatch ? 1 : 150}`);
    if (serviceOrderDetailMatch && !orders[0]) return null as T;
    const orderIds = orders.map((order) => order.id);
    const orderFilter = orderIds.length ? `&order_id=in.(${orderIds.join(",")})` : "&order_id=is.null";
    const refs = await supabaseFetch<Array<{ id: string; code: string; name: string; category?: string; estimated_minutes?: number; brand?: string; model?: string; metadata?: AnyRow }>>("/rest/v1/service_references?select=id,code,name,category,estimated_minutes,brand,model,metadata&limit=200").catch((error) => {
      safeDevLog("No fue posible consultar referencias de servicios Supabase.", error);
      return [];
    });
    const parts = await supabaseFetch<Array<{ id: string; reference_id: string; name: string; quantity: number; unit: string; display_order?: number }>>("/rest/v1/service_reference_parts?select=id,reference_id,name,quantity,unit,display_order&order=display_order.asc&limit=1000").catch((error) => {
      safeDevLog("No fue posible consultar partes de referencias Supabase.", error);
      return [];
    });
    const incidents = await supabaseFetch<Array<{ id: string; order_id: string; type?: string; description?: string; action?: string }>>(`/rest/v1/service_incidents?select=id,order_id,type,description,action${orderFilter}&limit=500`).catch((error) => {
      safeDevLog("No fue posible consultar novedades de servicios Supabase.", error);
      return [];
    });
    const evidence = await supabaseFetch<Array<{ id: string; order_id: string; evidence_type?: string; file_url?: string; storage_path?: string; mime_type?: string; size_bytes?: number; metadata?: AnyRow; created_at?: string }>>(`/rest/v1/service_evidence?select=id,order_id,evidence_type,file_url,storage_path,mime_type,size_bytes,metadata,created_at${orderFilter}&limit=500`).catch((error) => {
      safeDevLog("No fue posible consultar evidencias de servicios Supabase.", error);
      return [];
    });

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
        photos: evidence.filter((item) => item.order_id === order.id).map((item) => ({ ...item, type: String(item.metadata?.original_type || item.evidence_type || ""), base64_data: item.file_url?.startsWith("data:") ? item.file_url : "" })),
        evidence: evidence.filter((item) => item.order_id === order.id).map((item) => ({ ...item, type: String(item.metadata?.original_type || item.evidence_type || ""), base64_data: item.file_url?.startsWith("data:") ? item.file_url : "" })),
        inspection_items: referenceWithParts?.parts?.map((part) => ({ part_id: part.id, name: part.name, status: "pendiente" })) || []
      };
    });

    return (serviceOrderDetailMatch ? mapped[0] || null : { data: mapped, kpis: kpisForOrders(mapped) }) as T;
  }

  if (pathname === "/api/v1/admin/permissions/catalog") {
    return adminPermissionCatalog as T;
  }

  if (pathname === "/api/v1/admin/roles") {
    const roles = storedAdminRoles();
    if (method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      const role = {
        id: Math.max(0, ...roles.map((item) => Number(item.id))) + 1,
        name: body.name || body.nombre || "Nuevo rol",
        description: body.description || body.descripcion || "",
        active: body.active !== false && body.activo !== false,
        is_system: false,
        permissions: body.permissions || emptyAdminPermissions()
      };
      const next = [...roles, role];
      saveStoredAdminRoles(next);
      return role as T;
    }
    return roles as T;
  }

  const adminRoleMatch = pathname.match(/^\/api\/v1\/admin\/roles\/(\d+)(?:\/status)?$/);
  if (adminRoleMatch) {
    const roles = storedAdminRoles();
    const roleId = Number(adminRoleMatch[1]);
    const body = JSON.parse(String(options.body || "{}"));
    const next = roles.map((role) => role.id === roleId ? {
      ...role,
      name: role.is_system ? role.name : (body.name || body.nombre || role.name),
      description: body.description || body.descripcion || role.description,
      active: pathname.endsWith("/status") ? Boolean(body.active ?? body.activo) : (body.active !== false && body.activo !== false),
      permissions: body.permissions || role.permissions
    } : role);
    saveStoredAdminRoles(next);
    return (next.find((role) => role.id === roleId) || null) as T;
  }

  if (pathname === "/api/v1/admin/users") {
    const roles = storedAdminRoles();
    if (method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      const fullName = body.name || `${body.first_names || ""} ${body.last_names || ""}`.trim() || body.email || "Usuario demo";
      const role = roles.find((item) => item.id === Number(body.role_id)) || roles[0];
      const row = {
        company_id: body.company_id || undefined,
        first_name: body.first_names || fullName.split(" ")[0] || fullName,
        last_name: body.last_names || fullName.split(" ").slice(1).join(" "),
        document_type: body.document_type || "CC",
        document_number: body.document || `QA-${Date.now()}`,
        email: body.email,
        phone: body.phone || "",
        position: body.position || body.operational_classification || "operario",
        department: body.department || body.area || "Operacion",
        hire_date: body.hire_date || localDate(),
        status: body.user_status === "inactivo" ? "inactive" : "active",
        user_type: body.operational_classification || "operario",
        metadata: {
          is_demo: true,
          demo_batch: "apexos_admin_user_created",
          name: fullName,
          code: body.code || `USR-${Date.now()}`,
          role_id: role.id,
          role_name: role.name,
          document: body.document || "",
          company: body.company || "SCJ",
          access: { email: body.access_email || body.email, role_id: role.id, role_name: role.name, site: body.site || body.base_site || "", area: body.area || body.department || "" },
          employment: { cost_center: body.cost_center || "", contract_type: body.contract_type || "" },
          operational: { classification: body.operational_classification || "operario", base_site: body.base_site || "", zone: body.operation_zone || "" }
        }
      };
      const companies = await supabaseFetch<Array<{ id: string }>>("/rest/v1/companies?select=id&name=eq.SCJ&limit=1").catch((error) => {
        safeDevLog("No fue posible consultar empresa SCJ.", error);
        return [];
      });
      const payload = { ...row, company_id: row.company_id || companies[0]?.id };
      const inserted = payload.company_id ? await supabaseFetch<Array<AnyRow>>("/rest/v1/employees?select=id,email,document_number,position,department,status,user_type,metadata", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { Prefer: "return=representation" }
      }).catch((error) => {
        safeDevLog("No fue posible crear empleado Supabase.", error);
        return null;
      }) : null;
      const employee = inserted?.[0] || { ...payload, id: crypto.randomUUID?.() || String(Date.now()) };
      return {
        id: toNumberId(employee.id),
        name: fullName,
        email: String(employee.email || ""),
        role_id: role.id,
        role_name: role.name,
        active: employee.status === "active",
        code: String((employee.metadata as AnyRow)?.code || ""),
        document: String(employee.document_number || ""),
        company: "SCJ",
        position: String(employee.position || ""),
        department: String(employee.department || ""),
        operational_classification: String(employee.user_type || "")
      } as T;
    }
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
    }>>("/rest/v1/employees?select=id,first_name,last_name,email,document_number,position,department,status,user_type,metadata&order=created_at.desc&limit=250");
    return employees.map((employee) => {
      const name = fullName(employee);
      const roleId = Number(employee.metadata?.role_id || (employee.user_type === "conductor" ? 2 : 1));
      const role = roles.find((item) => item.id === roleId) || roles[0];
      return {
        id: toNumberId(employee.id),
        name,
        email: employee.email || "",
        role_id: role?.id || roleId,
        role_name: String(employee.metadata?.role_name || role?.name || ""),
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

  if (isSupabaseSession()) {
    const fallback = await supabaseApiFallback<T>(path, options);
    if (fallback !== null) {
      touchSession();
      return fallback;
    }
  }

  try {
    response = await fetchWithTimeout(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("API no disponible. Revisa el servicio backend.");
  }

  if (response.status === 401 && typeof window !== "undefined" && !isSupabaseSession()) {
    clearSession("unauthorized");
    window.location.href = "/login";
    throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  }

  if (!response.ok) {
    if (isSupabaseSession()) {
      const fallback = await supabaseApiFallback<T>(path, options);
      if (fallback !== null) {
        touchSession();
        return fallback;
      }
    }

    if (response.status >= 500) {
      throw new Error("API no disponible. Revisa el servicio backend.");
    }

    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || "La solicitud no pudo completarse");
  }
  touchSession();
  return response.json() as Promise<T>;
}
