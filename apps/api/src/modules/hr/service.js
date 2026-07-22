const prisma = require("../../core/prisma");
const { MAX_EVIDENCE_BYTES, assertSafeFile, normalizeFileName, secureStoragePath } = require("../../security/policy");
const { normalizePunchType, processWorkday } = require("./timeLogic");

const DEFAULT_PARAMS = {
  ordinary_hours_day: 8,
  lunch_minutes: 60,
  night_start: "21:00",
  night_end: "06:00"
};

const DEFAULT_PAYROLL_CONFIG = {
  parameters: {
    country: "CO",
    ordinary_hours_day: 8,
    ordinary_hours_week: 42,
    night_start: "19:00",
    night_end: "06:00",
    health_employee_percent: 4,
    pension_employee_percent: 4,
    health_employer_percent: 8.5,
    pension_employer_percent: 12,
    transport_allowance_enabled: true,
    arl_default_percent: 0.522
  },
  overtime_rates: [
    { code: "HORA_DIURNA", name: "Hora ordinaria diurna", percent: 0, multiplier: 1, starts_at: "06:00", ends_at: "19:00", active: true },
    { code: "RECARGO_NOCTURNO", name: "Recargo nocturno ordinario", percent: 35, multiplier: 1.35, starts_at: "19:00", ends_at: "06:00", active: true },
    { code: "HED", name: "Hora extra diurna", percent: 25, multiplier: 1.25, active: true },
    { code: "HEN", name: "Hora extra nocturna", percent: 75, multiplier: 1.75, active: true },
    { code: "DOM_FEST_2026_H1", name: "Dominical/festivo hasta junio 2026", percent: 80, multiplier: 1.8, active: true },
    { code: "DOM_FEST_2026_H2", name: "Dominical/festivo desde julio 2026", percent: 90, multiplier: 1.9, active: true },
    { code: "HEDD", name: "Hora extra diurna dominical/festiva", percent: 105, multiplier: 2.05, active: true },
    { code: "HEND", name: "Hora extra nocturna dominical/festiva", percent: 155, multiplier: 2.55, active: true }
  ],
  concepts: [
    { code: "SALARIO_BASICO", name: "Salario basico", type: "earning", basis: "salary", account_code: "", active: true },
    { code: "AUX_TRANSPORTE", name: "Auxilio de transporte", type: "earning", basis: "transport_allowance", account_code: "", active: true },
    { code: "HORA_DIURNA", name: "Hora diurna", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "RECARGO_NOCTURNO", name: "Recargo nocturno", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "HED", name: "Hora extra diurna", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "HEN", name: "Hora extra nocturna", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "DOM_FEST", name: "Dominical / festivo", type: "earning", basis: "hours", account_code: "", active: true },
    { code: "DED_SALUD", name: "Deduccion salud empleado", type: "deduction", basis: "ibc", account_code: "", active: true },
    { code: "DED_PENSION", name: "Deduccion pension empleado", type: "deduction", basis: "ibc", account_code: "", active: true },
    { code: "APORTE_SALUD", name: "Aporte salud empleador", type: "employer_cost", basis: "ibc", account_code: "", active: true },
    { code: "APORTE_PENSION", name: "Aporte pension empleador", type: "employer_cost", basis: "ibc", account_code: "", active: true },
    { code: "APORTE_ARL", name: "Aporte ARL", type: "employer_cost", basis: "ibc", account_code: "", active: true },
    { code: "CAJA_COMPENSACION", name: "Caja de compensacion", type: "employer_cost", basis: "ibc", account_code: "", active: true }
  ]
};

const OPERATING_TIMEZONE = "America/Bogota";
const OPERATING_OFFSET = "-05:00";

function startOfDay(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00${OPERATING_OFFSET}`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value)).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00${OPERATING_OFFSET}`);
}

function endOfDay(value = new Date()) {
  const date = startOfDay(value);
  return new Date(date.getTime() + 86400000);
}

function timeString(date) {
  return new Intl.DateTimeFormat("es-CO", { timeZone: OPERATING_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
}

function minutesFromTime(value) {
  if (!value || !/^\d{2}:\d{2}/.test(String(value))) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function validationError(message, statusCode = 400, code = "VALIDATION_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function employeeDisplayName(employee) {
  const metadataName = String(employee?.metadata?.name || "").trim();
  const genericMetadata = isGenericEmployeeAlias(metadataName);
  return (!genericMetadata && metadataName) || employee?.user?.name || employee?.code || metadataName || "";
}

function isGenericEmployeeAlias(value) {
  return /^(usuario[-\s]\d+|usr-\d+)$/i.test(String(value || "").trim());
}

function employeeUserName(employee, fallback = "") {
  const code = String(employee?.code || "").trim();
  const metadataName = String(employee?.metadata?.name || "").trim();
  const safeFallback = !isGenericEmployeeAlias(fallback) ? fallback : "";
  return (!isGenericEmployeeAlias(code) && code)
    || (!isGenericEmployeeAlias(metadataName) && metadataName)
    || employee?.user?.name
    || safeFallback
    || employee?.user?.email
    || employeeDisplayName(employee)
    || code
    || "";
}

function aliasesForEmployee(employee) {
  const metadataAliases = Array.isArray(employee?.metadata?.identity_aliases) ? employee.metadata.identity_aliases : [];
  return Array.from(new Set([
    employee?.id,
    employee?.code,
    employee?.metadata?.name,
    employee?.metadata?.document,
    employee?.metadata?.employee_code,
    employee?.metadata?.employee_name,
    employee?.metadata?.supplied_user_name,
    employee?.metadata?.supabase_employee_id,
    employee?.metadata?.supabase_user_id,
    employee?.user?.name,
    employee?.user?.email,
    ...metadataAliases
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function aliasesForOperationalRow(row) {
  const metadataAliases = Array.isArray(row?.metadata?.identity_aliases) ? row.metadata.identity_aliases : [];
  return Array.from(new Set([
    row?.employee_id,
    row?.user_name,
    row?.metadata?.employee_code,
    row?.metadata?.employee_name,
    row?.metadata?.supplied_user_name,
    row?.metadata?.user_email,
    ...metadataAliases
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function inputIdentityAliases(input = {}) {
  const metadataAliases = Array.isArray(input.metadata?.identity_aliases) ? input.metadata.identity_aliases : [];
  return Array.from(new Set([
    input.user_name,
    input.employee_id,
    input.metadata?.supplied_user_name,
    input.metadata?.employee_code,
    input.metadata?.employee_name,
    input.metadata?.user_email,
    ...metadataAliases
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function operationalRouteKey(row) {
  return String(row?.route_id || row?.metadata?.display_route_id || row?.metadata?.legacy_route_id || "").trim();
}

function displayNameForOperationalRow(row, fallback = "") {
  const metadataName = String(row?.metadata?.employee_name || row?.metadata?.name || "").trim();
  const supplied = String(row?.metadata?.supplied_user_name || "").trim();
  const userName = String(row?.user_name || "").trim();
  return (!isGenericEmployeeAlias(metadataName) && metadataName)
    || (!isGenericEmployeeAlias(supplied) && supplied)
    || (!isGenericEmployeeAlias(userName) && userName)
    || fallback
    || userName;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function numericId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function optionalNumericId(value) {
  return value == null || value === "" ? null : numericId(value);
}

function operationalRouteNumericId(input = {}) {
  return optionalNumericId(input.route_id)
    || optionalNumericId(input.metadata?.display_route_id)
    || optionalNumericId(input.metadata?.route_code)
    || optionalNumericId(input.metadata?.legacy_route_id);
}

function routeEventMetadata(input = {}, routeId = null) {
  const metadata = input.metadata || {};
  const displayRouteId = metadata.display_route_id || metadata.route_code || input.route_id || routeId || "";
  return {
    ...metadata,
    display_route_id: displayRouteId ? String(displayRouteId) : "",
    route_code: metadata.route_code ? String(metadata.route_code) : (displayRouteId ? String(displayRouteId) : ""),
    source_route_id: metadata.source_route_id ? String(metadata.source_route_id) : "",
    legacy_route_id: metadata.legacy_route_id ? String(metadata.legacy_route_id) : ""
  };
}

function routeScopeWhere(routeId = null) {
  if (!routeId) return {};
  const routeKey = String(routeId);
  const routeNumericId = optionalNumericId(routeId);
  return {
    OR: [
      ...(routeNumericId ? [{ route_id: routeNumericId }] : []),
      { metadata: { path: ["display_route_id"], equals: routeKey } },
      { metadata: { path: ["route_code"], equals: routeKey } },
      { metadata: { path: ["legacy_route_id"], equals: routeKey } },
      { metadata: { path: ["source_route_id"], equals: routeKey } }
    ]
  };
}

function employeeType(employee) {
  return normalizeKey(employee?.user_type || employee?.position || employee?.metadata?.user_type || employee?.metadata?.classification);
}

function isDriver(employee) {
  return ["conductor", "driver", "chofer", "operador de ruta", "operador_ruta", "transportador"].includes(employeeType(employee));
}

function mergePayrollConfig(config = {}) {
  return {
    ...DEFAULT_PAYROLL_CONFIG,
    ...config,
    parameters: { ...DEFAULT_PAYROLL_CONFIG.parameters, ...(config.parameters || {}) },
    overtime_rates: Array.isArray(config.overtime_rates) && config.overtime_rates.length ? config.overtime_rates : DEFAULT_PAYROLL_CONFIG.overtime_rates,
    concepts: Array.isArray(config.concepts) && config.concepts.length ? config.concepts : DEFAULT_PAYROLL_CONFIG.concepts
  };
}

async function getPayrollConfig(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
    return mergePayrollConfig(config.payroll || {});
  });
}

async function savePayrollConfig(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
    const current = mergePayrollConfig(config.payroll || {});
    const next = mergePayrollConfig({
      ...current,
      ...(input || {}),
      parameters: { ...current.parameters, ...((input || {}).parameters || {}) },
      overtime_rates: Array.isArray(input?.overtime_rates) ? input.overtime_rates : current.overtime_rates,
      concepts: Array.isArray(input?.concepts) ? input.concepts : current.concepts
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { config: { ...config, payroll: next } } });
    return next;
  });
}

function punchStatus(type) {
  const labels = {
    entrada: "En ruta",
    inicio_almuerzo: "Almuerzo",
    fin_almuerzo: "Trabajando",
    salida: "Finalizo"
  };
  return labels[type] || "Sin iniciar";
}

const PREOP_TEMPLATE = [
  { section: "Documental", item_key: "soat_vigente", label: "SOAT vigente", severity: "critica", blocks_route: true, evidence_required: false },
  { section: "Documental", item_key: "tecnicomecanica_vigente", label: "Revision tecnico-mecanica vigente", severity: "critica", blocks_route: true, evidence_required: false },
  { section: "Documental", item_key: "licencia_conductor_vigente", label: "Licencia del conductor vigente", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Documental", item_key: "tarjeta_propiedad", label: "Licencia de transito / tarjeta disponible", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Exterior", item_key: "llantas_estado", label: "Llantas en buen estado", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Exterior", item_key: "placas_visibles", label: "Placas visibles y legibles", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Exterior", item_key: "sin_fugas_visibles", label: "Sin fugas visibles de aceite, combustible, refrigerante o aire", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Luces", item_key: "luces_freno", label: "Luces de freno funcionando", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Luces", item_key: "direccionales", label: "Direccionales funcionando", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Luces", item_key: "luces_delanteras_traseras", label: "Luces delanteras y traseras funcionando", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Seguridad", item_key: "frenos", label: "Frenos funcionando correctamente", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Seguridad", item_key: "direccion", label: "Direccion sin fallas", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Seguridad", item_key: "cinturon", label: "Cinturon de seguridad en buen estado", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Seguridad", item_key: "tablero_testigos", label: "Tablero sin testigos criticos encendidos", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Fluidos", item_key: "niveles_fluidos", label: "Aceite, refrigerante, frenos e hidraulico en nivel aceptable", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Emergencia", item_key: "extintor", label: "Extintor vigente y cargado", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Emergencia", item_key: "kit_carretera", label: "Botiquin, gato, cruceta, tacos y senalizacion disponibles", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Precargue", item_key: "zona_carga_segura", label: "Zona de carga segura y vehiculo apto para cargar", severity: "media", blocks_route: false, evidence_required: false },
  { section: "Precargue", item_key: "carga_asegurada", label: "Carga distribuida, asegurada y sin sobrepeso aparente", severity: "critica", blocks_route: true, evidence_required: true },
  { section: "Conductor", item_key: "conductor_apto", label: "Conductor apto, sin fatiga extrema ni condicion insegura", severity: "critica", blocks_route: true, evidence_required: false },
  { section: "Conductor", item_key: "declaracion_responsable", label: "Acepta responsabilidad de inspeccion y no estar bajo efectos de alcohol o sustancias", severity: "critica", blocks_route: true, evidence_required: false }
];

const DEFAULT_ACTIVITY_TYPES = [
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
];

const safeUserSelect = { id: true, name: true, email: true };

function getPreoperationalTemplate() {
  return { sections: Array.from(new Set(PREOP_TEMPLATE.map((item) => item.section))), items: PREOP_TEMPLATE };
}

function routeElapsedMinutes(route, latestPunch) {
  if (latestPunch?.type === "salida") return null;
  const start = latestPunch?.type ? minutesFromTime(latestPunch.time) : minutesFromTime(route.start_time);
  if (start == null) return null;
  const now = new Date();
  return Math.max(0, now.getHours() * 60 + now.getMinutes() - start);
}

async function listSchedules(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.workSchedule.findMany({
    where: query.active == null ? {} : { active: query.active === "true" || query.active === true },
    orderBy: { name: "asc" }
  }));
}

async function createSchedule(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.workSchedule.create({
    data: {
      name: input.name,
      start_time: input.start_time,
      end_time: input.end_time,
      lunch_start_time: input.lunch_start_time || "",
      lunch_end_time: input.lunch_end_time || "",
      workable_days: input.workable_days || [0, 1, 2, 3, 4],
      active: input.active !== false
    }
  }));
}

async function updateSchedule(tenantId, id, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.workSchedule.update({
    where: { id: Number(id) },
    data: {
      name: input.name,
      start_time: input.start_time,
      end_time: input.end_time,
      lunch_start_time: input.lunch_start_time || "",
      lunch_end_time: input.lunch_end_time || "",
      workable_days: input.workable_days || [0, 1, 2, 3, 4],
      active: input.active !== false
    }
  }));
}

async function listRoutes(tenantId, query = {}) {
  const day = query.date ? startOfDay(query.date) : null;
  return prisma.runWithTenant(tenantId, async () => {
    const [rows, employees] = await Promise.all([
      prisma.timeRoute.findMany({
        where: day ? { date: { gte: day, lt: endOfDay(day) } } : {},
        orderBy: { date: "desc" },
        take: 100
      }),
      prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } }, take: 500 })
    ]);
    const employeeByAlias = new Map();
    for (const employee of employees) {
      for (const alias of aliasesForEmployee(employee)) employeeByAlias.set(normalizeKey(alias), employee);
    }
    const resolveAssignedEmployee = (value) => employeeByAlias.get(normalizeKey(value));
    return rows.map((route) => ({
      ...route,
      employee_ids: (Array.isArray(route.employees) ? route.employees : []).map((value) => String(resolveAssignedEmployee(value)?.id || value)),
      employee_names: (Array.isArray(route.employees) ? route.employees : []).map((value) => employeeDisplayName(resolveAssignedEmployee(value)) || String(value)),
      placa: route.vehicle_plate,
      equipo: route.employees,
      h_inicio: route.start_time,
      h_fin: route.end_time,
      viaticos: route.per_diem,
      tolerancia_minutos: route.tolerance_minutes
    }));
  });
}

async function listEmployees(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.employee.findMany({
    where: {
      ...(query.position ? { position: query.position } : {}),
      ...(query.active == null ? {} : { active: query.active === "true" || query.active === true })
    },
    include: { user: { select: safeUserSelect } },
    orderBy: { id: "desc" },
    take: 500
  }));
}

async function createEmployee(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.employee.create({
    data: {
      code: input.code || `EMP-${Date.now()}`,
      user_type: input.user_type || input.position || "operario",
      position: input.position || input.user_type || "operario",
      department: input.department || "Operacion",
      salary_base: Number(input.salary_base || 0),
      salary_type: input.salary_type || "monthly",
      hire_date: input.hire_date ? new Date(input.hire_date) : new Date(),
      contract_type: input.contract_type || "indefinite",
      metadata: {
        name: input.name || "",
        document: input.document || "",
        company: input.company || "",
        labor_status: input.labor_status || "activo",
        user_type: input.user_type || input.position || "operario",
        classification: input.user_type || input.position || "operario",
        legacy: input.legacy || null
      }
    },
    include: { user: { select: safeUserSelect } }
  }));
}

async function createRoute(tenantId, input) {
  validateRouteInput(input);
  return prisma.runWithTenant(tenantId, async () => {
    const employees = await normalizeRouteEmployees(input.employees);
    return prisma.timeRoute.create({
      data: {
        date: startOfDay(input.date),
        vehicle_plate: input.vehicle_plate || "",
        employees,
        start_time: input.start_time || "08:00",
        end_time: input.end_time || "17:00",
        tolerance_minutes: input.tolerance_minutes ?? 15,
        per_diem: 0,
        notes: input.notes || "",
        status: input.status || "active"
      }
    });
  });
}

async function updateRoute(tenantId, id, input) {
  validateRouteInput(input);
  return prisma.runWithTenant(tenantId, async () => {
    const employees = await normalizeRouteEmployees(input.employees);
    return prisma.timeRoute.update({
      where: { id: Number(id) },
      data: {
        date: startOfDay(input.date),
        vehicle_plate: input.vehicle_plate || "",
        employees,
        start_time: input.start_time || "08:00",
        end_time: input.end_time || "17:00",
        tolerance_minutes: input.tolerance_minutes ?? 15,
        per_diem: 0,
        notes: input.notes || "",
        status: input.status || "active"
      }
    });
  });
}

function validateRouteInput(input = {}) {
  if (!input.date) throw validationError("La fecha del horario es obligatoria.");
  if (!Array.isArray(input.employees) || !input.employees.filter((item) => String(item || "").trim()).length) {
    throw validationError("Selecciona al menos una persona para asignar el horario.");
  }
  const start = minutesFromTime(input.start_time || "08:00");
  const end = minutesFromTime(input.end_time || "17:00");
  if (start === null || end === null) throw validationError("Define horas validas en formato HH:mm.");
  if (end === start) throw validationError("La hora de inicio y la hora de fin no pueden ser iguales.");
  if (Number(input.tolerance_minutes ?? 15) < 0) throw validationError("La tolerancia no puede ser negativa.");
}

async function normalizeRouteEmployees(inputEmployees = []) {
  const values = Array.isArray(inputEmployees) ? inputEmployees.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (!values.length) return [];
  const employees = await prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } }, take: 1000 });
  const employeeByAlias = new Map();
  for (const employee of employees) {
    for (const alias of aliasesForEmployee(employee)) employeeByAlias.set(normalizeKey(alias), employee);
  }
  return values.map((value) => {
    const employee = employeeByAlias.get(normalizeKey(value));
    return employee ? employeeUserName(employee, value) : value;
  });
}

function datesForRouteRange(input) {
  const start = startOfDay(input.start_date);
  const end = startOfDay(input.end_date);
  if (end < start) {
    const error = new Error("La fecha final no puede ser menor que la fecha inicial.");
    error.statusCode = 400;
    throw error;
  }
  const weekdays = Array.isArray(input.weekdays) && input.weekdays.length
    ? new Set(input.weekdays.map((day) => Number(day)))
    : new Set([1, 2, 3, 4, 5]);
  const dates = [];
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    if (weekdays.has(cursor.getDay())) dates.push(new Date(cursor));
  }
  return dates;
}

async function createRoutesBulk(tenantId, input) {
  validateRouteInput({ ...input, date: input.start_date });
  const dates = datesForRouteRange(input);
  if (!dates.length) return { created: 0, routes: [] };
  return prisma.runWithTenant(tenantId, async () => {
    const employees = await normalizeRouteEmployees(input.employees);
    const routes = await prisma.$transaction(dates.map((date) => prisma.timeRoute.create({
      data: {
        date,
        vehicle_plate: input.vehicle_plate || "",
        employees,
        start_time: input.start_time || "08:00",
        end_time: input.end_time || "17:00",
        tolerance_minutes: input.tolerance_minutes ?? 15,
        per_diem: 0,
        notes: input.notes || "",
        status: input.status || "active"
      }
    })));
    return { created: routes.length, routes };
  });
}

async function findEmployee(input) {
  if (input.employee_id) {
    const id = numericId(input.employee_id);
    if (id) return prisma.employee.findFirst({ where: { id } });
    const key = String(input.employee_id).trim();
    // Supabase sessions can send UUIDs; Prisma employee/user ids are numeric, so only match stable aliases here.
    return prisma.employee.findFirst({
      where: {
        OR: [
          { code: key },
          { metadata: { path: ["supabase_employee_id"], equals: key } },
          { metadata: { path: ["supabase_user_id"], equals: key } }
        ]
      }
    });
  }
  const name = String(input.user_name || "").trim();
  if (!name) return null;
  const aliases = [
    name,
    input.metadata?.employee_code,
    input.metadata?.employee_name,
    input.metadata?.supplied_user_name,
    input.metadata?.user_email
  ].filter(Boolean).map((value) => String(value).trim());
  return prisma.employee.findFirst({
    where: {
      OR: [
        ...aliases.map((alias) => ({ code: alias })),
        ...aliases.map((alias) => ({ metadata: { path: ["name"], equals: alias } })),
        ...aliases.map((alias) => ({ metadata: { path: ["employee_code"], equals: alias } })),
        ...aliases.map((alias) => ({ metadata: { path: ["employee_name"], equals: alias } })),
        ...aliases.map((alias) => ({ user: { name: alias } })),
        ...aliases.map((alias) => ({ user: { email: alias } }))
      ]
    }
  });
}

async function resolveEmployeeForPunch(tenantId, input) {
  const employee = await findEmployee(input);
  if (employee) return employee;
  const name = input.user_name?.trim();
  if (!name) {
    const err = new Error("Usuario requerido para registrar marcacion");
    err.statusCode = 400;
    throw err;
  }
  return prisma.employee.create({
    data: {
      tenant_id: tenantId,
      code: name,
      user_type: input.user_type || "operario",
      position: input.position || "operario",
      department: "Operacion",
      salary_base: 0,
      salary_type: "monthly",
      hire_date: new Date(),
      contract_type: "indefinite",
      metadata: { name, document: "", company: "APEX", labor_status: "activo", user_type: input.user_type || "operario", classification: input.user_type || "operario", legacy: { autocreated_from: "marcacion" } }
    }
  });
}

async function getCurrentEmployee(tenantId, user) {
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { user_id: user?.id },
          { user: { email: user?.email || "" } },
          { user: { name: user?.name || "" } }
        ]
      },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    if (employee) return employee;
    if (!user?.id) {
      const err = new Error("El usuario conectado no tiene empleado asociado.");
      err.statusCode = 404;
      err.code = "EMPLEADO_NO_ASOCIADO";
      throw err;
    }
    const roleName = String(user.role?.name || "").toLowerCase();
    const inferredType = roleName.includes("conductor") || roleName.includes("driver")
      ? "conductor"
      : roleName.includes("transport")
        ? "transportador"
        : "operario";
    return prisma.employee.create({
      data: {
        tenant_id: tenantId,
        user_id: user.id,
        code: user.name || user.email || `usuario-${user.id}`,
        user_type: inferredType,
        position: inferredType,
        department: "Operacion",
        salary_base: 0,
        salary_type: "monthly",
        hire_date: new Date(),
        contract_type: "indefinite",
        metadata: {
          name: user.name || user.email || `Usuario ${user.id}`,
          document: "",
          company: "APEX",
          labor_status: "activo",
          user_type: inferredType,
          classification: inferredType,
          legacy: { autocreated_from: "hr_current_employee" }
        }
      },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
  });
}

async function resolveVehicleForRoute(plate) {
  if (!plate) return null;
  return prisma.vehicle.findFirst({ where: { plate } }).catch(() => null);
}

async function ensurePreoperationalChecklist({ tenantId, user, employee, route, punch, input }) {
  if (!isDriver(employee) || !route?.vehicle_plate || normalizePunchType(input.type || input.tipo_marca) !== "entrada") return null;
  const existing = await prisma.routePreoperationalChecklist.findFirst({
    where: {
      route_id: route.id,
      driver_id: employee.id,
      checklist_status: { in: ["pendiente", "en_proceso", "aprobado", "aprobado_con_novedad", "bloqueado"] }
    },
    include: { answers: true, evidence: true, findings: true },
    orderBy: { created_at: "desc" }
  });
  if (existing) return existing;

  const vehicle = await resolveVehicleForRoute(route.vehicle_plate);
  const checklist = await prisma.routePreoperationalChecklist.create({
    data: {
      route_id: route.id,
      punch_id: punch?.id || null,
      driver_id: employee.id,
      driver_name: employeeDisplayName(employee),
      user_id: user?.id || null,
      vehicle_id: vehicle?.id || null,
      plate: route.vehicle_plate,
      sede: vehicle?.base_site || "",
      checklist_status: "pendiente",
      risk_level: "pendiente",
      created_by: user?.id || null,
      location_lat: input.latitude,
      location_lng: input.longitude,
      metadata: {
        source: "time_punch",
        pesv_reference: "Resolucion 20223040040595 de 2022",
        vehicle_master: vehicle ? {
          master_status: vehicle.master_status,
          document_status: vehicle.document_status,
          master_score: vehicle.master_score,
          type: vehicle.type,
          capacity: vehicle.capacity_value || vehicle.load_capacity,
          base_site: vehicle.base_site
        } : null
      }
    }
  });
  await prisma.routeStartAuthorization.create({
    data: {
      route_id: route.id,
      checklist_id: checklist.id,
      driver_id: employee.id,
      plate: route.vehicle_plate,
      status: "bloqueada",
      reason: "Checklist preoperacional pendiente"
    }
  });
  return prisma.routePreoperationalChecklist.findFirst({
    where: { id: checklist.id },
    include: { answers: true, evidence: true, findings: true }
  });
}

async function getActivePreoperationalChecklist(tenantId, user, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await getCurrentEmployee(tenantId, user).catch(() => null);
    const where = {
      ...(query.route_id ? { route_id: Number(query.route_id) } : {}),
      ...(employee ? { driver_id: employee.id } : {}),
      checklist_status: { in: ["pendiente", "en_proceso", "bloqueado"] }
    };
    const checklist = await prisma.routePreoperationalChecklist.findFirst({
      where,
      include: { answers: true, evidence: true, findings: true },
      orderBy: { created_at: "desc" }
    });
    return { checklist, template: getPreoperationalTemplate() };
  });
}

function answerIsFailure(answer) {
  return ["no_cumple", "no cumple", "fail", "falla"].includes(normalizeKey(answer));
}

async function submitPreoperationalChecklist(tenantId, user, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const checklist = await prisma.routePreoperationalChecklist.findFirstOrThrow({ where: { id: Number(id) } });
    const templateByKey = new Map(PREOP_TEMPLATE.map((item) => [item.item_key, item]));
    const answers = input.answers || [];
    if (answers.length < PREOP_TEMPLATE.length) {
      const err = new Error("Debes responder todo el checklist preoperacional.");
      err.statusCode = 422;
      throw err;
    }
    const failures = [];
    const evidenceRows = [];
    for (const answer of answers) {
      const item = templateByKey.get(answer.item_key);
      if (!item) continue;
      if (answerIsFailure(answer.answer)) {
        const hasEvidence = Array.isArray(answer.evidence) && answer.evidence.length > 0;
        if (!String(answer.observations || "").trim()) {
          const err = new Error(`La novedad "${item.label}" requiere observacion.`);
          err.statusCode = 422;
          throw err;
        }
        if ((item.blocks_route || item.evidence_required) && !hasEvidence) {
          const err = new Error(`La novedad "${item.label}" requiere evidencia.`);
          err.statusCode = 422;
          throw err;
        }
        failures.push({ item, answer });
      }
      for (const evidence of answer.evidence || []) {
        assertSafeFile(evidence, { maxBytes: MAX_EVIDENCE_BYTES });
        const fileName = normalizeFileName(evidence.file_name || `${answer.item_key}.jpg`);
        evidenceRows.push({
          checklist_id: checklist.id,
          item_key: answer.item_key,
          evidence_type: evidence.evidence_type || "photo",
          file_name: fileName,
          file_url: evidence.file_url || "",
          base64_data: evidence.base64_data || "",
          mime_type: evidence.mime_type || "",
          file_size: evidence.file_size || null,
          storage_path: evidence.storage_path || secureStoragePath({ tenantId, module: "hr", entity: "preoperational", entityId: checklist.id, fileName }),
          uploaded_by: user?.id || null
        });
      }
    }
    const criticalFailures = failures.filter((failure) => failure.item.blocks_route || failure.item.severity === "critica");
    const mediumFailures = failures.filter((failure) => !criticalFailures.includes(failure));
    const status = criticalFailures.length ? "bloqueado" : mediumFailures.length ? "aprobado_con_novedad" : "aprobado";
    const riskLevel = criticalFailures.length ? "critica" : mediumFailures.length ? "media" : "sin_riesgo";

    await prisma.routePreoperationalChecklistAnswer.deleteMany({ where: { checklist_id: checklist.id } });
    await prisma.routePreoperationalChecklistEvidence.deleteMany({ where: { checklist_id: checklist.id } });
    await prisma.routePreoperationalFinding.deleteMany({ where: { checklist_id: checklist.id } });
    await prisma.routePreoperationalChecklistAnswer.createMany({
      data: answers.map((answer) => {
        const item = templateByKey.get(answer.item_key) || {};
        return {
          checklist_id: checklist.id,
          section: item.section || "General",
          item_key: answer.item_key,
          label: item.label || answer.item_key,
          answer: answer.answer,
          severity: item.severity || "baja",
          blocks_route: Boolean(item.blocks_route),
          evidence_required: Boolean(item.evidence_required),
          observations: answer.observations || ""
        };
      })
    });
    if (evidenceRows.length) await prisma.routePreoperationalChecklistEvidence.createMany({ data: evidenceRows });
    if (failures.length) {
      await prisma.routePreoperationalFinding.createMany({
        data: failures.map(({ item, answer }) => ({
          checklist_id: checklist.id,
          route_id: checklist.route_id,
          plate: checklist.plate,
          driver_id: checklist.driver_id,
          item_key: item.item_key,
          finding_type: item.section,
          severity: item.severity,
          description: answer.observations || item.label,
          action_taken: criticalFailures.some((failure) => failure.item.item_key === item.item_key) ? "Ruta bloqueada automaticamente" : "Continua con novedad registrada",
          status: criticalFailures.some((failure) => failure.item.item_key === item.item_key) ? "bloqueada" : "abierta"
        }))
      });
    }

    const updated = await prisma.routePreoperationalChecklist.update({
      where: { id: checklist.id },
      data: {
        checklist_status: status,
        risk_level: riskLevel,
        completed_at: new Date(),
        approved_at: status !== "bloqueado" ? new Date() : null,
        blocked_at: status === "bloqueado" ? new Date() : null,
        mileage_initial: input.mileage_initial,
        fuel_level: input.fuel_level || "",
        location_lat: input.location_lat,
        location_lng: input.location_lng,
        digital_signature: input.digital_signature || "",
        observations: input.observations || ""
      },
      include: { answers: true, evidence: true, findings: true }
    });
    await prisma.routeStartAuthorization.updateMany({
      where: { checklist_id: checklist.id },
      data: {
        status: status === "bloqueado" ? "bloqueada" : "autorizada",
        reason: status === "bloqueado" ? "Falla critica en checklist preoperacional" : "Checklist preoperacional aprobado",
        authorized_by: status === "bloqueado" ? null : user?.id || null,
        authorized_at: status === "bloqueado" ? null : new Date()
      }
    });
    if (status === "bloqueado") {
      await prisma.routeBlockEvent.create({
        data: {
          route_id: checklist.route_id,
          checklist_id: checklist.id,
          driver_id: checklist.driver_id,
          plate: checklist.plate,
          reason: criticalFailures.map((failure) => failure.item.label).join("; "),
          severity: "critica",
          created_by: user?.id || null
        }
      });
    }
    return { checklist: updated, route_authorized: status !== "bloqueado", status, risk_level: riskLevel };
  });
}

async function ensureActivityTypes() {
  const current = await prisma.activityType.findMany({ take: 1 });
  if (current.length) return;
  await prisma.activityType.createMany({
    data: DEFAULT_ACTIVITY_TYPES.map((name, index) => ({
      name,
      description: "Catalogo operativo inicial APEXOS",
      sort_order: (index + 1) * 10,
      active: true,
      metadata: { source: "apexos_operational_traceability" }
    })),
    skipDuplicates: true
  });
}

async function listActivityTypes(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    await ensureActivityTypes();
    return prisma.activityType.findMany({
      where: query.active == null ? {} : { active: query.active === "true" || query.active === true },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }]
    });
  });
}

async function createActivityType(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.activityType.create({
    data: {
      name: input.name,
      description: input.description || "",
      active: input.active !== false,
      sort_order: Number(input.sort_order || 100),
      metadata: input.metadata || {}
    }
  }));
}

async function updateActivityType(tenantId, id, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.activityType.update({
    where: { id: Number(id) },
    data: {
      name: input.name,
      description: input.description || "",
      active: input.active !== false,
      sort_order: Number(input.sort_order || 100),
      metadata: input.metadata || {}
    }
  }));
}

async function findCurrentWorkSession({ employee, userName, routeId = null, date = new Date() }) {
  const identityAliases = Array.from(new Set([
    ...(employee ? aliasesForEmployee(employee) : []),
    userName
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
  return prisma.workSession.findFirst({
    where: {
      ...operationalIdentityRouteWhere(employee, userName, routeId, identityAliases),
      date: { gte: startOfDay(date), lt: endOfDay(date) },
      status: "activa"
    },
    orderBy: { started_at: "desc" },
    include: { activities: { include: { activity_type: true, evidence: true }, orderBy: { occurred_at: "desc" }, take: 50 } }
  });
}

function punchIdentityWhere(employee, userName, extraAliases = []) {
  const aliases = Array.from(new Set([
    ...(employee ? aliasesForEmployee(employee) : []),
    userName,
    ...extraAliases
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
  const OR = [
    ...(employee?.id ? [{ employee_id: employee.id }] : []),
    ...(aliases.length ? [{ user_name: { in: aliases } }] : [])
  ];
  return OR.length ? { OR } : { user_name: userName || "" };
}

function operationalIdentityRouteWhere(employee, userName, routeId = null, extraAliases = []) {
  return {
    AND: [
      punchIdentityWhere(employee, userName, extraAliases),
      routeScopeWhere(routeId)
    ].filter((item) => Object.keys(item).length)
  };
}

async function latestPunchesForEmployee(employee, userName, date = new Date(), routeId = null, extraAliases = []) {
  return prisma.timePunch.findMany({
    where: {
      ...operationalIdentityRouteWhere(employee, userName, routeId, extraAliases),
      date: { gte: startOfDay(date), lt: endOfDay(date) }
    },
    orderBy: { punched_at: "asc" }
  });
}

async function ensureWorkSessionFromPunches({ employee, userName, routeId = null, date = new Date(), vehiclePlate = "", extraAliases = [] }) {
  const punches = await latestPunchesForEmployee(employee, userName, date, routeId, extraAliases);
  if (!punches.length || !punches.some((punch) => punch.type === "entrada") || punches.some((punch) => punch.type === "salida")) return null;
  const entry = punches.find((punch) => punch.type === "entrada");
  const lunchStart = punches.find((punch) => punch.type === "inicio_almuerzo");
  const lunchEnd = punches.find((punch) => punch.type === "fin_almuerzo");
  const resolvedRouteId = routeId || entry?.route_id || null;
  const resolvedUserName = userName || entry?.user_name || employeeUserName(employee, "");
  const existing = await prisma.workSession.findFirst({
    where: {
      ...operationalIdentityRouteWhere(employee, resolvedUserName, resolvedRouteId, extraAliases),
      date: { gte: startOfDay(date), lt: endOfDay(date) },
      status: "activa"
    },
    orderBy: { started_at: "desc" },
    include: { activities: { include: { activity_type: true, evidence: true }, orderBy: { occurred_at: "desc" }, take: 50 } }
  });
  if (existing) return existing;
  const session = await prisma.workSession.create({
    data: {
      employee_id: employee?.id || entry?.employee_id || null,
      user_name: resolvedUserName,
      date: startOfDay(date),
      status: "activa",
      started_at: entry?.punched_at || new Date(),
      lunch_started_at: lunchStart?.punched_at || null,
      lunch_ended_at: lunchEnd?.punched_at || null,
      entry_punch_id: entry?.id || null,
      route_id: resolvedRouteId ? Number(resolvedRouteId) : null,
      vehicle_plate: vehiclePlate || entry?.vehicle_plate || "",
      metadata: {
        repaired_from: "time_punches",
        employee_name: employeeDisplayName(employee) || resolvedUserName,
        identity_aliases: employee ? aliasesForEmployee(employee) : [resolvedUserName].filter(Boolean)
      }
    },
    include: { activities: { include: { activity_type: true, evidence: true }, orderBy: { occurred_at: "desc" }, take: 50 } }
  });
  return session;
}

async function getCurrentWorkSession(tenantId, user, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await getCurrentEmployee(tenantId, user).catch(() => null);
    const userName = query.user_name || employeeUserName(employee, user?.name || user?.email || "");
    const routeId = optionalNumericId(query.route_id);
    const session = await findCurrentWorkSession({ employee, userName, routeId, date: query.date || new Date() })
      || await ensureWorkSessionFromPunches({ employee, userName, routeId, date: query.date || new Date() });
    const activities = session?.activities || [];
    return {
      session,
      active: Boolean(session),
      activities,
      alerts: buildSessionAlerts(session, activities)
    };
  });
}

function buildSessionAlerts(session, activities = []) {
  const alerts = [];
  if (session && !activities.length) alerts.push({ type: "sin_actividades", severity: "warning", message: "Jornada activa sin actividades registradas." });
  if (session && new Date().getTime() - new Date(session.started_at).getTime() > 12 * 3600000) alerts.push({ type: "jornada_sin_cierre", severity: "critica", message: "Jornada activa por mas de 12 horas sin cierre." });
  for (const activity of activities) {
    if (String(activity.activity_type_name || "").toLowerCase().includes("varado")) alerts.push({ type: "vehiculo_varado", severity: "critica", message: "Vehiculo varado reportado." });
    if (String(activity.activity_type_name || "").toLowerCase().includes("novedad")) alerts.push({ type: "novedad_ruta", severity: "warning", message: "Novedad en ruta registrada." });
    if (Number(activity.accuracy_meters || 0) > 80) alerts.push({ type: "gps_baja_precision", severity: "warning", message: "Actividad con baja precision GPS." });
    if (!activity.evidence?.length) alerts.push({ type: "evidencia_faltante", severity: "warning", message: "Actividad sin evidencia." });
  }
  return alerts.slice(0, 10);
}

async function listWorkActivities(tenantId, query = {}) {
  const day = query.date ? startOfDay(query.date) : startOfDay();
  return prisma.runWithTenant(tenantId, async () => prisma.workActivity.findMany({
    where: {
      occurred_at: { gte: day, lt: endOfDay(day) },
      ...(query.user_name ? { user_name: query.user_name } : {}),
      ...(query.session_id ? { session_id: Number(query.session_id) } : {}),
      ...(query.activity_type_id ? { activity_type_id: Number(query.activity_type_id) } : {})
    },
    include: { activity_type: true, evidence: true },
    orderBy: { occurred_at: "desc" },
    take: Math.min(Number(query.limit || 200), 500)
  }));
}

async function createWorkActivity(tenantId, user, input) {
  return prisma.runWithTenant(tenantId, async () => {
    if (input.latitude == null || input.longitude == null) {
      const err = new Error("GPS obligatorio para registrar actividad.");
      err.statusCode = 422;
      throw err;
    }
    if (!String(input.observation || "").trim()) {
      const err = new Error("La observacion es obligatoria.");
      err.statusCode = 422;
      throw err;
    }
    if (!input.photo?.base64) {
      const err = new Error("La foto es obligatoria.");
      err.statusCode = 422;
      throw err;
    }
    assertSafeFile({ base64_data: input.photo.base64, file_name: input.photo.name, mime_type: input.photo.type, file_size: input.photo.size }, { maxBytes: MAX_EVIDENCE_BYTES });
    const employeeId = optionalNumericId(input.employee_id);
    const inputRouteId = operationalRouteNumericId(input);
    const employee = employeeId
      ? await prisma.employee.findFirst({ where: { id: employeeId, tenant_id: tenantId }, include: { user: { select: { name: true, email: true } } } })
      : await getCurrentEmployee(tenantId, user).catch(() => null);
    const requestAliases = inputIdentityAliases(input);
    const explicitUserName = String(input.user_name || "").trim();
    const userName = (!isGenericEmployeeAlias(explicitUserName) && explicitUserName) || employeeUserName(employee, user?.name || user?.email || "");
    const session = await findCurrentWorkSession({ employee, userName, routeId: inputRouteId })
      || await ensureWorkSessionFromPunches({ employee, userName, routeId: inputRouteId, vehiclePlate: input.vehicle_plate || "", extraAliases: requestAliases });
    if (!session) {
      const err = new Error("No hay jornada activa. Marca Entrada antes de registrar actividades.");
      err.statusCode = 422;
      err.code = "JORNADA_ACTIVA_REQUERIDA";
      throw err;
    }
    if (session.closed_at || session.status === "cerrada") {
      const err = new Error("La jornada ya esta cerrada. No se pueden agregar actividades.");
      err.statusCode = 422;
      throw err;
    }
    const activityType = await prisma.activityType.findFirstOrThrow({ where: { id: Number(input.activity_type_id), active: true } });
    const activity = await prisma.workActivity.create({
      data: {
        session_id: session.id,
        activity_type_id: activityType.id,
        activity_type_name: activityType.name,
        employee_id: employee?.id || session.employee_id,
        user_name: userName || session.user_name,
        route_id: inputRouteId || session.route_id,
        vehicle_plate: input.vehicle_plate || session.vehicle_plate || "",
        occurred_at: input.occurred_at ? new Date(input.occurred_at) : new Date(),
        latitude: Number(input.latitude),
        longitude: Number(input.longitude),
        accuracy_meters: input.accuracy_meters,
        approximate_address: input.approximate_address || "",
        observation: input.observation,
        alert_level: Number(input.accuracy_meters || 0) > 80 || activityType.name.toLowerCase().includes("varado") || activityType.name.toLowerCase().includes("novedad") ? "warning" : "normal",
        metadata: {
          ...routeEventMetadata(input, inputRouteId || session.route_id),
          supplied_user_name: input.user_name || "",
          employee_code: employee?.code || "",
          employee_name: employeeDisplayName(employee) || userName || session.user_name,
          user_email: employee?.user?.email || user?.email || "",
          identity_aliases: Array.from(new Set([...(employee ? aliasesForEmployee(employee) : []), ...requestAliases, userName || session.user_name].filter(Boolean)))
        }
      }
    });
    const fileName = normalizeFileName(input.photo.name || `actividad-${activity.id}.jpg`);
    const uploaderKey = String(user?.id || session.employee_id || "operador").replace(/[^a-zA-Z0-9_-]/g, "");
    await prisma.activityEvidence.create({
      data: {
        activity_id: activity.id,
        evidence_type: "photo",
        file_name: fileName,
        base64_data: input.photo.base64,
        mime_type: input.photo.type,
        file_size: input.photo.size,
        storage_path: secureStoragePath({ tenantId, module: "hr", entity: `work-sessions/${session.id}/users/${uploaderKey}/activities`, entityId: activity.id, fileName }),
        uploaded_by: user?.id || null,
        metadata: { storage_hint: "company_id/module/work_session_id/user_id/activity_id/file" }
      }
    });
    await prisma.gpsPing.create({
      data: {
        employee_id: employee?.id || session.employee_id,
        user_name: userName || session.user_name,
        vehicle_plate: input.vehicle_plate || session.vehicle_plate || "",
        route_id: inputRouteId || session.route_id,
        latitude: Number(input.latitude),
        longitude: Number(input.longitude),
        accuracy_meters: input.accuracy_meters,
        source: "work_activity",
        captured_at: activity.occurred_at,
        metadata: {
          activity_id: activity.id,
          activity_type: activityType.name,
          ...routeEventMetadata(input, inputRouteId || session.route_id),
          supplied_user_name: input.user_name || "",
          employee_code: employee?.code || "",
          employee_name: employeeDisplayName(employee) || userName || session.user_name,
          user_email: employee?.user?.email || user?.email || "",
          identity_aliases: Array.from(new Set([...(employee ? aliasesForEmployee(employee) : []), ...requestAliases, userName || session.user_name].filter(Boolean)))
        }
      }
    });
    return prisma.workActivity.findFirst({
      where: { id: activity.id },
      include: { activity_type: true, evidence: true }
    });
  });
}

async function getPreoperationalMetrics(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const from = query.date ? startOfDay(query.date) : startOfDay();
    const to = endOfDay(from);
    const [today, pending, blocked, findings, routes] = await Promise.all([
      prisma.routePreoperationalChecklist.findMany({ where: { created_at: { gte: from, lt: to } } }),
      prisma.routePreoperationalChecklist.count({ where: { checklist_status: { in: ["pendiente", "en_proceso"] } } }),
      prisma.routePreoperationalChecklist.count({ where: { checklist_status: "bloqueado", created_at: { gte: from, lt: to } } }),
      prisma.routePreoperationalFinding.findMany({ where: { created_at: { gte: from, lt: to } } }),
      prisma.timeRoute.findMany({ where: { date: { gte: from, lt: to } } })
    ]);
    const completed = today.filter((item) => ["aprobado", "aprobado_con_novedad", "bloqueado"].includes(item.checklist_status));
    const avgMinutes = completed.length
      ? Math.round(completed.reduce((sum, item) => sum + Math.max(0, ((item.completed_at || item.updated_at).getTime() - item.started_at.getTime()) / 60000), 0) / completed.length)
      : 0;
    const by = (field) => findings.reduce((acc, item) => ({ ...acc, [item[field] || "sin_dato"]: (acc[item[field] || "sin_dato"] || 0) + 1 }), {});
    return {
      checklists_today: today.length,
      checklists_pending: pending,
      routes_blocked: blocked,
      critical_vehicle_findings: findings.filter((item) => item.severity === "critica").length,
      drivers_without_route: 0,
      average_completion_minutes: avgMinutes,
      compliance_rate: routes.length ? Math.round((completed.length / routes.length) * 100) : 100,
      approved_with_findings: today.filter((item) => item.checklist_status === "aprobado_con_novedad").length,
      findings_by_type: by("finding_type"),
      findings_by_plate: by("plate"),
      findings_by_driver: by("driver_id")
    };
  });
}

async function createPunch(tenantId, input, user) {
  return prisma.runWithTenant(tenantId, async () => {
    const punchedAt = input.punched_at ? new Date(input.punched_at) : new Date();
    const currentEmployee = user?.id ? await prisma.employee.findFirst({
      where: { OR: [{ user_id: user.id }, { user: { email: user.email || "" } }] },
      include: { user: { select: { name: true, email: true } } }
    }) : null;
    const employee = currentEmployee || await resolveEmployeeForPunch(tenantId, input);
    const type = normalizePunchType(input.type || input.tipo_marca);
    const inputRouteId = operationalRouteNumericId(input);
    const route = inputRouteId ? await prisma.timeRoute.findFirst({ where: { id: inputRouteId } }) : null;
    const preopApproved = isDriver(employee) && route?.vehicle_plate && type === "entrada"
      ? await prisma.routePreoperationalChecklist.findFirst({
        where: {
          route_id: route.id,
          driver_id: employee.id,
          checklist_status: { in: ["aprobado", "aprobado_con_novedad"] }
        },
        orderBy: { completed_at: "desc" }
      })
      : null;
    if (isDriver(employee) && route?.vehicle_plate && type === "entrada" && !preopApproved) {
      const preop = await ensurePreoperationalChecklist({ tenantId, user, employee, route, punch: null, input });
      return {
        ok: false,
        preoperational_required: true,
        preoperational_checklist: preop ? { ...preop, id: Number(preop.id) } : null,
        route_authorized: false,
        message: "Checklist preoperacional obligatorio antes de iniciar jornada."
      };
    }
    const requestAliases = inputIdentityAliases(input);
    const explicitUserName = String(input.user_name || "").trim();
    const resolvedUserName = (!isGenericEmployeeAlias(explicitUserName) && explicitUserName) || employeeUserName(employee, explicitUserName);
    const identityAliases = Array.from(new Set([...aliasesForEmployee(employee), ...requestAliases, resolvedUserName].filter(Boolean)));
    const punchesToday = await latestPunchesForEmployee(employee, resolvedUserName, punchedAt, route?.id || inputRouteId, identityAliases);
    const expectedType = nextPunchType(punchesToday);
    if (!expectedType) {
      throw validationError("La jornada ya esta completa para hoy.", 409, "JORNADA_COMPLETA");
    }
    if (type !== expectedType) {
      throw validationError(`La siguiente marcacion permitida es ${expectedType}.`, 409, "MARCACION_FUERA_DE_SECUENCIA");
    }
    const extraMinutes = type === "salida" && route?.end_time
      ? (() => {
          const colParts = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATING_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(punchedAt);
          const currentMinutes = Number(colParts.find((p) => p.type === "hour")?.value || punchedAt.getHours()) * 60
            + Number(colParts.find((p) => p.type === "minute")?.value || punchedAt.getMinutes());
          return Math.max(0, currentMinutes - (Number(route.end_time.slice(0, 2)) * 60 + Number(route.end_time.slice(3, 5))) - Number(route.tolerance_minutes || 0));
        })()
      : 0;
    if (extraMinutes > 0 && (!String(input.extra_reason || "").trim() || !String(input.extra_detail || "").trim())) {
      const err = new Error("Justifica por que estas marcando fuera de tu horario habitual.");
      err.statusCode = 422;
      err.code = "JUSTIFICACION_HORA_EXTRA_REQUERIDA";
      err.details = { extra_minutes: extraMinutes };
      throw err;
    }
    if (extraMinutes > 0 && !input.extra_evidence?.base64) {
      const err = new Error("Adjunta evidencia fotografica para sustentar la extension de horario.");
      err.statusCode = 422;
      err.code = "EVIDENCIA_HORA_EXTRA_REQUERIDA";
      err.details = { extra_minutes: extraMinutes };
      throw err;
    }
    if (input.extra_evidence?.base64) {
      assertSafeFile({
        base64_data: input.extra_evidence.base64,
        file_name: input.extra_evidence.name,
        mime_type: input.extra_evidence.type,
        file_size: input.extra_evidence.size
      }, { maxBytes: MAX_EVIDENCE_BYTES });
    }
    const punch = await prisma.timePunch.create({
      data: {
        employee_id: employee.id,
        user_name: resolvedUserName,
        type,
        punched_at: punchedAt,
        date: startOfDay(punchedAt),
        time: timeString(punchedAt),
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy_meters: input.accuracy_meters,
        vehicle_plate: input.vehicle_plate || "",
        route_id: route?.id || inputRouteId,
        extra_minutes: extraMinutes,
        extra_reason: input.extra_reason,
        extra_detail: input.extra_detail,
        extra_evidence: input.extra_evidence?.base64 ? {
          name: normalizeFileName(input.extra_evidence.name || `extension-${employee.id}.jpg`),
          type: input.extra_evidence.type || "image/jpeg",
          size: input.extra_evidence.size || null,
          base64_data: input.extra_evidence.base64,
          storage_path: secureStoragePath({
            tenantId,
            module: "hr",
            entity: "overtime-extensions",
            entityId: employee.id,
            fileName: input.extra_evidence.name || `extension-${employee.id}.jpg`
          })
        } : {},
        metadata: {
          ...routeEventMetadata(input, route?.id || inputRouteId),
          supplied_user_name: input.user_name || "",
          employee_code: employee.code || "",
          employee_name: employeeDisplayName(employee) || resolvedUserName,
          user_email: employee.user?.email || user?.email || "",
          identity_aliases: identityAliases
        }
      }
    });
    if (input.latitude != null && input.longitude != null) {
      await prisma.gpsPing.create({
        data: {
          employee_id: employee.id,
          user_name: resolvedUserName,
          vehicle_plate: input.vehicle_plate || "",
          route_id: route?.id || inputRouteId,
          latitude: Number(input.latitude),
          longitude: Number(input.longitude),
          accuracy_meters: input.accuracy_meters,
          source: "time_punch",
          captured_at: punchedAt,
          metadata: {
            type,
            ...routeEventMetadata(input, route?.id || inputRouteId),
            supplied_user_name: input.user_name || "",
            employee_code: employee.code || "",
            employee_name: employeeDisplayName(employee) || resolvedUserName,
            user_email: employee.user?.email || user?.email || "",
            identity_aliases: identityAliases
          }
        }
      });
    }
    const sessionData = {
      employee_id: employee.id,
      user_name: resolvedUserName,
      date: startOfDay(punchedAt),
      route_id: route?.id || inputRouteId,
      vehicle_plate: input.vehicle_plate || "",
      metadata: {
        source: "time_punch",
        ...routeEventMetadata(input, route?.id || inputRouteId),
        supplied_user_name: input.user_name || "",
        employee_code: employee.code || "",
        employee_name: employeeDisplayName(employee) || resolvedUserName,
        user_email: employee.user?.email || user?.email || "",
        identity_aliases: identityAliases
      }
    };
    if (type === "entrada") {
      const approvedChecklist = await prisma.routePreoperationalChecklist.findFirst({
        where: {
          route_id: route?.id || inputRouteId || undefined,
          driver_id: employee.id,
          checklist_status: { in: ["aprobado", "aprobado_con_novedad"] }
        },
        orderBy: { completed_at: "desc" }
      }).catch(() => null);
      const existing = await prisma.workSession.findFirst({
        where: { ...operationalIdentityRouteWhere(employee, resolvedUserName, route?.id || inputRouteId, identityAliases), date: { gte: startOfDay(punchedAt), lt: endOfDay(punchedAt) }, status: "activa" },
        orderBy: { started_at: "desc" }
      });
      if (existing) {
        await prisma.workSession.update({
          where: { id: existing.id },
          data: { entry_punch_id: punch.id, started_at: punchedAt, route_id: route?.id || inputRouteId, vehicle_plate: input.vehicle_plate || existing.vehicle_plate, preop_checklist_id: approvedChecklist?.id || existing.preop_checklist_id }
        });
      } else {
        await prisma.workSession.create({
          data: { ...sessionData, status: "activa", started_at: punchedAt, entry_punch_id: punch.id, preop_checklist_id: approvedChecklist?.id || null }
        });
      }
    } else {
      const session = await prisma.workSession.findFirst({
        where: { ...operationalIdentityRouteWhere(employee, resolvedUserName, route?.id || inputRouteId, identityAliases), date: { gte: startOfDay(punchedAt), lt: endOfDay(punchedAt) }, status: "activa" },
        orderBy: { started_at: "desc" }
      });
      if (session) {
        const data = type === "inicio_almuerzo"
          ? { lunch_started_at: punchedAt }
          : type === "fin_almuerzo"
            ? { lunch_ended_at: punchedAt }
            : type === "salida"
              ? { closed_at: punchedAt, exit_punch_id: punch.id, status: "cerrada" }
              : {};
        if (Object.keys(data).length) await prisma.workSession.update({ where: { id: session.id }, data });
      }
    }
    const preop = await ensurePreoperationalChecklist({ tenantId, user, employee, route, punch, input });
    return {
      ok: true,
      hora: timeString(punchedAt),
      es_extra: extraMinutes > 0,
      minutos_extra: extraMinutes,
      alerta: extraMinutes > 0,
      punch,
      next: nextPunchType(await latestPunchesForEmployee(employee, resolvedUserName, punchedAt, route?.id || inputRouteId, identityAliases)),
      preoperational_required: Boolean(preop),
      preoperational_checklist: preop ? { ...preop, id: Number(preop.id) } : null,
      route_authorized: preop ? ["aprobado", "aprobado_con_novedad"].includes(preop.checklist_status) : true
    };
  });
}

async function createGpsPing(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    // Solo buscar empleado existente — NO auto-crear. GPS pings son datos de presencia,
    // no deben contaminar el maestro de empleados con registros dummy.
    let employeeId = null;
    const employee = await findEmployee(input).catch(() => null);
    const resolvedName = employeeUserName(employee, input.user_name) || "desconocido";
    if (employee) employeeId = employee.id;
    return prisma.gpsPing.create({
      data: {
        employee_id: employeeId,
        user_name: resolvedName,
        vehicle_plate: input.vehicle_plate || "",
        route_id: operationalRouteNumericId(input),
        latitude: Number(input.latitude),
        longitude: Number(input.longitude),
        accuracy_meters: input.accuracy_meters,
        source: input.source || "mobile",
        captured_at: input.captured_at ? new Date(input.captured_at) : new Date(),
        metadata: {
          ...routeEventMetadata(input, operationalRouteNumericId(input)),
          supplied_user_name: input.user_name || "",
          employee_code: employee?.code || "",
          employee_name: employeeDisplayName(employee) || resolvedName,
          identity_aliases: employee ? aliasesForEmployee(employee) : [resolvedName].filter(Boolean)
        }
      }
    });
  });
}

async function listActiveGps(tenantId, query = {}) {
  const minutes = Math.min(Number(query.minutes || 30), 240);
  const since = new Date(Date.now() - minutes * 60000);
  return prisma.runWithTenant(tenantId, async () => {
    const pings = await prisma.gpsPing.findMany({
      where: { captured_at: { gte: since } },
      orderBy: { captured_at: "desc" },
      take: 500
    });
    const latest = new Map();
    for (const ping of pings) {
      if (!latest.has(ping.user_name)) latest.set(ping.user_name, ping);
    }
    return Array.from(latest.values()).map((ping) => ({
      ...ping,
      age_seconds: Math.max(0, Math.round((Date.now() - new Date(ping.captured_at).getTime()) / 1000))
    }));
  });
}

async function listGpsHistory(tenantId, query = {}) {
  const day = query.date ? startOfDay(query.date) : startOfDay();
  return prisma.runWithTenant(tenantId, async () => prisma.gpsPing.findMany({
    where: {
      ...(query.user_name ? { user_name: query.user_name } : {}),
      captured_at: { gte: day, lt: endOfDay(day) }
    },
    orderBy: { captured_at: "asc" },
    take: Math.min(Number(query.limit || 300), 1000)
  }));
}

async function getRouteTracking(tenantId, id, query = {}) {
  const day = query.date ? startOfDay(query.date) : null;
  return prisma.runWithTenant(tenantId, async () => {
    const route = await prisma.timeRoute.findFirstOrThrow({ where: { id: Number(id) } });
    const dateStart = day || startOfDay(route.date);
    const pings = await prisma.gpsPing.findMany({
      where: {
        route_id: Number(id),
        captured_at: { gte: dateStart, lt: endOfDay(dateStart) }
      },
      orderBy: { captured_at: "asc" },
      take: Math.min(Number(query.limit || 800), 1500)
    });
    const punches = await prisma.timePunch.findMany({
      where: {
        route_id: Number(id),
        punched_at: { gte: dateStart, lt: endOfDay(dateStart) }
      },
      orderBy: { punched_at: "asc" },
      take: 500
    });
    const latestByUser = new Map();
    for (const ping of pings) latestByUser.set(ping.user_name, ping);
    const assigned = (Array.isArray(route.employees) ? route.employees : []).map((name) => ({ user_name: String(name), name: String(name) }));
    return {
      route: {
        ...route,
        employee_ids: assigned.map((person) => String(person.employee_id || person.user_name)).filter(Boolean),
        employee_names: assigned.map((person) => person.name || person.user_name).filter(Boolean),
        placa: route.vehicle_plate,
        equipo: route.employees,
        h_inicio: route.start_time,
        h_fin: route.end_time,
        viaticos: route.per_diem,
        tolerancia_minutos: route.tolerance_minutes
      },
      pings,
      punches,
      latest: Array.from(latestByUser.values()),
      totals: {
        pings: pings.length,
        punches: punches.length,
        active_users: latestByUser.size
      }
    };
  });
}

async function getOperationsMap(tenantId, query = {}) {
  const day = query.date ? startOfDay(query.date) : startOfDay();
  const activeMinutes = Math.min(Number(query.minutes || 30), 240);
  const footprintDays = Math.min(Number(query.footprint_days || 14), 60);
  const isLiveWindow = activeMinutes <= 60;
  const pingLimit = Math.min(Math.max(Number(query.ping_limit || (isLiveWindow ? 300 : 1000)), 100), 2000);
  const punchLimit = Math.min(Math.max(Number(query.punch_limit || (isLiveWindow ? 300 : 1000)), 100), 2000);
  const activityLimit = Math.min(Math.max(Number(query.activity_limit || (isLiveWindow ? 100 : 1000)), 100), 2000);
  const since = new Date(Date.now() - activeMinutes * 60000);
  return prisma.runWithTenant(tenantId, async () => {
    const [routes, employees, pings, punches, activities] = await Promise.all([
      prisma.timeRoute.findMany({
        where: {
          date: { gte: day, lt: endOfDay(day) },
          status: { not: "cancelled" }
        },
        orderBy: { start_time: "asc" },
        take: 200
      }),
      prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } }, take: 500 }),
      prisma.gpsPing.findMany({
        where: { captured_at: { gte: day, lt: endOfDay(day) } },
        orderBy: { captured_at: "desc" },
        take: pingLimit
      }),
      prisma.timePunch.findMany({
        where: { date: { gte: day, lt: endOfDay(day) } },
        orderBy: { punched_at: "desc" },
        take: punchLimit
      }),
      prisma.workActivity.findMany({
        where: { occurred_at: { gte: day, lt: endOfDay(day) } },
        include: { activity_type: true, evidence: true },
        orderBy: { occurred_at: "desc" },
        take: activityLimit
      })
    ]);

    // Solo obtener huella extendida si es modo historico; en vivo los pings de hoy son suficientes
    const lastFootprints = footprintDays > 0 && !isLiveWindow && query.footprint_days !== "0"
      ? await prisma.gpsPing.findMany({
          where: { captured_at: { gte: new Date(day.getTime() - footprintDays * 86400000), lt: endOfDay(day) } },
          orderBy: { captured_at: "desc" },
          take: 1000
        })
      : pings;

    const employeeByAlias = new Map();
    for (const employee of employees) {
      for (const alias of aliasesForEmployee(employee)) employeeByAlias.set(normalizeKey(alias), employee);
    }
    const resolveAssignedEmployee = (value) => employeeByAlias.get(normalizeKey(value));

    const latestPingByUser = new Map();
    const pingsByRoute = new Map();
    for (const ping of pings) {
      for (const alias of aliasesForOperationalRow(ping)) {
        const userKey = normalizeKey(alias);
        if (!latestPingByUser.has(userKey)) latestPingByUser.set(userKey, ping);
      }
      if (ping.route_id) {
        if (!pingsByRoute.has(Number(ping.route_id))) pingsByRoute.set(Number(ping.route_id), []);
        pingsByRoute.get(Number(ping.route_id)).push(ping);
      }
    }

    const lastFootprintByUser = new Map();
    for (const ping of lastFootprints) {
      for (const alias of aliasesForOperationalRow(ping)) {
        const userKey = normalizeKey(alias);
        if (!lastFootprintByUser.has(userKey)) lastFootprintByUser.set(userKey, ping);
      }
    }

    const latestPunchByUser = new Map();
    const punchesByRoute = new Map();
    for (const punch of punches) {
      for (const alias of aliasesForOperationalRow(punch)) {
        const userKey = normalizeKey(alias);
        if (!latestPunchByUser.has(userKey)) latestPunchByUser.set(userKey, punch);
      }
      if (punch.route_id && punch.latitude != null && punch.longitude != null) {
        if (!punchesByRoute.has(Number(punch.route_id))) punchesByRoute.set(Number(punch.route_id), []);
        punchesByRoute.get(Number(punch.route_id)).push(punch);
      }
    }

    const activitiesByRoute = new Map();
    const latestActivityByUser = new Map();
    for (const activity of activities) {
      for (const alias of aliasesForOperationalRow(activity)) {
        const userKey = normalizeKey(alias);
        if (!latestActivityByUser.has(userKey)) latestActivityByUser.set(userKey, activity);
      }
      if (activity.route_id && activity.latitude != null && activity.longitude != null) {
        if (!activitiesByRoute.has(Number(activity.route_id))) activitiesByRoute.set(Number(activity.route_id), []);
        activitiesByRoute.get(Number(activity.route_id)).push(activity);
      }
    }

    const people = [];
    for (const route of routes) {
      const assigned = Array.isArray(route.employees) ? route.employees : [];
      for (const assignedName of assigned) {
        const employee = resolveAssignedEmployee(assignedName);
        const aliases = employee ? aliasesForEmployee(employee) : [assignedName];
        const latestLivePing = aliases.map((alias) => latestPingByUser.get(normalizeKey(alias))).find(Boolean);
        const lastFootprint = aliases.map((alias) => lastFootprintByUser.get(normalizeKey(alias))).find(Boolean);
        const latestPing = latestLivePing || lastFootprint;
        const latestPunch = aliases.map((alias) => latestPunchByUser.get(normalizeKey(alias))).find(Boolean);
        const latestActivity = aliases.map((alias) => latestActivityByUser.get(normalizeKey(alias))).find(Boolean);
        const ageSeconds = latestPing ? Math.max(0, Math.round((Date.now() - new Date(latestPing.captured_at).getTime()) / 1000)) : null;
        const isOnline = Boolean(latestLivePing && new Date(latestLivePing.captured_at) >= since);
        const displayName = employeeDisplayName(employee)
          || displayNameForOperationalRow(latestPunch)
          || displayNameForOperationalRow(latestPing)
          || assignedName;
        const displayUserName = displayNameForOperationalRow(latestPunch)
          || displayNameForOperationalRow(latestPing)
          || (!isGenericEmployeeAlias(latestPing?.user_name) ? latestPing?.user_name : "")
          || (!isGenericEmployeeAlias(employee?.code) ? employee?.code : "")
          || displayName
          || assignedName;
        people.push({
          key: `${route.id}-${employee?.id || assignedName}`,
          employee_id: employee?.id || null,
          user_name: displayUserName,
          name: displayName,
          route_id: route.id,
          route_label: `Ruta ${route.id}`,
          vehicle_plate: route.vehicle_plate || latestPing?.vehicle_plate || latestPunch?.vehicle_plate || "",
          latitude: latestPing?.latitude || latestPunch?.latitude || null,
          longitude: latestPing?.longitude || latestPunch?.longitude || null,
          accuracy_meters: latestPing?.accuracy_meters || latestPunch?.accuracy_meters || null,
          captured_at: latestPing?.captured_at || latestPunch?.punched_at || null,
          age_seconds: ageSeconds,
          online: isOnline,
          footprint_source: isOnline ? "live" : latestPing ? "last_known" : latestPunch?.latitude != null ? "punch" : "none",
          last_punch_type: latestPunch?.type || "sin_marcar",
          last_punch_time: latestPunch?.time || "",
          last_activity_type: latestActivity?.activity_type_name || "",
          last_activity_time: latestActivity ? timeString(latestActivity.occurred_at) : "",
          status: latestPing ? (isOnline ? punchStatus(latestPunch?.type) : "Sin senal") : latestPunch?.latitude != null ? "Ultima marca" : "Sin GPS",
          time_in_route_minutes: routeElapsedMinutes(route, latestPunch),
          route_start_time: route.start_time || "",
          route_end_time: route.end_time || ""
        });
      }
    }

    const routeSummaries = routes.map((route) => {
      const assigned = people.filter((person) => person.route_id === route.id);
      const assignedAliases = new Set(assigned.flatMap((person) => [person.employee_id, person.user_name, person.name]).filter(Boolean).map((value) => normalizeKey(value)));
      const routeKey = String(route.id);
      const matchesAssigned = (row) => {
        const rowRouteKey = operationalRouteKey(row);
        if (rowRouteKey) return rowRouteKey === routeKey;
        return aliasesForOperationalRow(row).some((alias) => assignedAliases.has(normalizeKey(alias)));
      };
      const routePings = pings.filter(matchesAssigned).sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
      const routePunches = punches.filter((punch) => matchesAssigned(punch) && punch.latitude != null && punch.longitude != null).sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at));
      const routeActivities = activities.filter((activity) => matchesAssigned(activity) && activity.latitude != null && activity.longitude != null).sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
      const marksByUser = new Map();
      for (const punch of routePunches) {
        const displayUserName = displayNameForOperationalRow(punch);
        if (!marksByUser.has(displayUserName)) marksByUser.set(displayUserName, []);
        marksByUser.get(displayUserName).push({
          id: punch.id,
          user_name: displayNameForOperationalRow(punch),
          type: punch.type,
          time: punch.time,
          punched_at: punch.punched_at,
          latitude: punch.latitude,
          longitude: punch.longitude,
          accuracy_meters: punch.accuracy_meters,
          vehicle_plate: punch.vehicle_plate,
          route_id: punch.route_id,
          extra_minutes: punch.extra_minutes,
          extra_reason: punch.extra_reason,
          extra_detail: punch.extra_detail,
          extra_evidence: punch.extra_evidence || {},
          metadata: punch.metadata || {}
        });
      }
      return {
        ...route,
        employee_ids: assigned.map((person) => String(person.employee_id || person.user_name)).filter(Boolean),
        employee_names: assigned.map((person) => person.name || person.user_name).filter(Boolean),
        placa: route.vehicle_plate,
        equipo: route.employees,
        h_inicio: route.start_time,
        h_fin: route.end_time,
        assigned_count: assigned.length,
        online_count: assigned.filter((person) => person.online).length,
        with_gps_count: assigned.filter((person) => person.latitude != null && person.longitude != null).length,
        pings: routePings,
        punch_points: routePunches.map((punch) => ({
          id: punch.id,
          user_name: displayNameForOperationalRow(punch),
          type: punch.type,
          time: punch.time,
          punched_at: punch.punched_at,
          latitude: punch.latitude,
          longitude: punch.longitude,
          accuracy_meters: punch.accuracy_meters,
          vehicle_plate: punch.vehicle_plate,
          route_id: punch.route_id,
          extra_minutes: punch.extra_minutes,
          extra_reason: punch.extra_reason,
          extra_detail: punch.extra_detail,
          extra_evidence: punch.extra_evidence || {},
          metadata: punch.metadata || {}
        })),
        activity_points: routeActivities.map((activity) => ({
          id: activity.id,
          user_name: displayNameForOperationalRow(activity),
          type: activity.activity_type_name,
          time: timeString(activity.occurred_at),
          occurred_at: activity.occurred_at,
          latitude: activity.latitude,
          longitude: activity.longitude,
          accuracy_meters: activity.accuracy_meters,
          vehicle_plate: activity.vehicle_plate,
          route_id: activity.route_id,
          observation: activity.observation,
          evidence: activity.evidence || [],
          metadata: activity.metadata || {}
        })),
        marks_by_user: Array.from(marksByUser.entries()).map(([user_name, marks]) => ({ user_name, marks }))
      };
    });

    return {
      date: day.toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      active_window_minutes: activeMinutes,
      footprint_window_days: footprintDays,
      people,
      routes: routeSummaries,
      totals: {
        routes: routes.length,
        planned_people: people.length,
        online: people.filter((person) => person.online).length,
        without_gps: people.filter((person) => person.latitude == null || person.longitude == null).length,
        offline: people.filter((person) => person.latitude != null && person.longitude != null && !person.online).length
      }
    };
  });
}

async function latestPunchesForUser(userName, date = new Date(), routeId = null) {
  return prisma.timePunch.findMany({
    where: {
      user_name: userName,
      ...(routeId ? { route_id: Number(routeId) } : {}),
      date: { gte: startOfDay(date), lt: endOfDay(date) }
    },
    orderBy: { punched_at: "asc" }
  });
}

function nextPunchType(punches) {
  const order = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
  if (!punches.length) return "entrada";
  const last = punches[punches.length - 1].type;
  if (!last) return "entrada";
  const idx = order.indexOf(last);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
}

async function listAttendance(tenantId, query = {}) {
  const day = query.date || query.fecha ? startOfDay(query.date || query.fecha) : startOfDay();
  const start = query.fecha_inicio ? startOfDay(query.fecha_inicio) : day;
  const end = query.fecha_fin ? endOfDay(query.fecha_fin) : endOfDay(day);
  return prisma.runWithTenant(tenantId, async () => {
    const punches = await prisma.timePunch.findMany({
      where: {
        date: { gte: start, lt: end },
        ...(query.user_name || query.usuario ? { user_name: query.user_name || query.usuario } : {})
      },
      orderBy: [{ user_name: "asc" }, { punched_at: "asc" }]
    });
    if (query.flat === "1" || query.legacy === "1") {
      return punches.map((punch) => ({
        usuario: punch.user_name,
        user_name: punch.user_name,
        placa: punch.vehicle_plate,
        vehiculo_placa: punch.vehicle_plate,
        tipo: punch.type,
        tipo_marca: punch.type,
        hora: punch.time,
        fecha: punch.date.toISOString().slice(0, 10),
        es_extra: punch.extra_minutes > 0,
        minutos_extra: punch.extra_minutes
      }));
    }
    const grouped = new Map();
    for (const punch of punches) {
      const key = `${punch.user_name}::${punch.route_id || "sin_horario"}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(punch);
    }
    return Array.from(grouped.values()).map((rows) => ({
      user_name: rows[0]?.user_name || "",
      route_id: rows[0]?.route_id || null,
      last_type: rows[rows.length - 1].type || "sin_marcar",
      next_type: nextPunchType(rows),
      punches: rows
    }));
  });
}

async function processDay(tenantId, input = {}) {
  const day = startOfDay(input.date || new Date());
  return prisma.runWithTenant(tenantId, async () => {
    const [employees, schedules, punches] = await Promise.all([
      prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } } }),
      prisma.workSchedule.findMany({ where: { active: true } }),
      prisma.timePunch.findMany({ where: { date: { gte: day, lt: endOfDay(day) } }, orderBy: { punched_at: "asc" } })
    ]);
    const defaultSchedule = schedules[0];
    const holidays = new Set((input.holidays || []).map(String));
    const processed = [];
    for (const employee of employees) {
      const aliases = new Set([employee.code, employee.metadata?.name, employee.user?.name, employee.user?.email].filter(Boolean));
      const employeePunches = punches.filter((punch) => aliases.has(punch.user_name) || punch.employee_id === employee.id);
      const workday = processWorkday({ employee, schedule: defaultSchedule, punches: employeePunches, params: DEFAULT_PARAMS, holidays, date: day });
      if (!workday) continue;
      const row = await prisma.processedWorkday.upsert({
        where: { tenant_id_employee_id_date: { tenant_id: tenantId, employee_id: employee.id, date: day } },
        update: workday,
        create: { tenant_id: tenantId, ...workday }
      });
      processed.push(row);
    }
    return { ok: true, date: day.toISOString().slice(0, 10), processed: processed.length, data: processed };
  });
}

async function listWorkdays(tenantId, query = {}) {
  const day = query.date ? startOfDay(query.date) : null;
  return prisma.runWithTenant(tenantId, async () => prisma.processedWorkday.findMany({
    where: day ? { date: { gte: day, lt: endOfDay(day) } } : {},
    include: { employee: { include: { user: { select: safeUserSelect } } }, schedule: true },
    orderBy: { date: "desc" },
    take: 100
  }));
}

function periodFromRange(input = {}) {
  const start = input.fecha_inicio || input.start_date || input.date_start;
  const end = input.fecha_fin || input.end_date || input.date_end;
  if (!start || !end) {
    const err = new Error("fecha_inicio y fecha_fin son requeridas");
    err.statusCode = 400;
    throw err;
  }
  return { start: startOfDay(start), end: startOfDay(end), key: `${start}_${end}` };
}

async function processPayrollRange(tenantId, input = {}) {
  const { start, end, key } = periodFromRange(input);
  const endExclusive = endOfDay(end);
  return prisma.runWithTenant(tenantId, async () => {
    const employees = await prisma.employee.findMany({ where: { active: true }, include: { user: { select: safeUserSelect } } });
    const payrolls = [];
    for (const employee of employees) {
      const workdays = await prisma.processedWorkday.findMany({
        where: { employee_id: employee.id, date: { gte: start, lt: endExclusive } },
        orderBy: { date: "asc" }
      });
      const daysWorked = workdays.length;
      const overtimeMinutes = workdays.reduce((sum, day) => sum +
        day.overtime_day_minutes +
        day.overtime_night_minutes +
        day.overtime_sunday_holiday_day_minutes +
        day.overtime_sunday_holiday_night_minutes, 0);
      const salaryBase = Number(employee.salary_base || 0);
      const base = Math.round(((salaryBase / 30) * daysWorked) * 100) / 100;
      const hourly = salaryBase ? salaryBase / 240 : 0;
      const overtime = Math.round((overtimeMinutes / 60) * hourly * 1.25 * 100) / 100;
      const gross = Math.round((base + overtime) * 100) / 100;
      const deductions = 0;
      const detail = {
        empleado: employee.metadata?.name || employee.user?.name || employee.code,
        fecha_inicio: start.toISOString().slice(0, 10),
        fecha_fin: end.toISOString().slice(0, 10),
        salario_proporcional: base,
        horas_extra: overtime,
        alertas: daysWorked === 0 ? ["sin_jornadas"] : []
      };
      const payroll = await prisma.payroll.upsert({
        where: { employee_id_period: { employee_id: employee.id, period: key } },
        update: {
          days_worked: daysWorked,
          overtime_hrs: Math.round((overtimeMinutes / 60) * 100) / 100,
          gross,
          deductions,
          net: gross - deductions,
          employer_cost: gross,
          detail
        },
        create: {
          tenant_id: tenantId,
          employee_id: employee.id,
          period: key,
          days_worked: daysWorked,
          overtime_hrs: Math.round((overtimeMinutes / 60) * 100) / 100,
          absences: 0,
          gross,
          deductions,
          net: gross - deductions,
          employer_cost: gross,
          detail
        }
      });
      payrolls.push(payroll);
    }
    return { ok: true, fecha_inicio: start.toISOString().slice(0, 10), fecha_fin: end.toISOString().slice(0, 10), liquidaciones: payrolls };
  });
}

async function listPayroll(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.payroll.findMany({
      where: query.period ? { period: query.period } : {},
      include: { employee: { include: { user: { select: safeUserSelect } } } },
      orderBy: { created_at: "desc" },
      take: Math.min(Number(query.limit || 100), 300)
    });
    return rows.map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      empleado: row.detail?.empleado || row.employee.metadata?.name || row.employee.user?.name || row.employee.code,
      period: row.period,
      dias_trabajados: row.days_worked,
      overtime_hrs: row.overtime_hrs,
      total_devengado: row.gross,
      deducciones: row.deductions,
      neto_pagar: row.net,
      status: row.status,
      detail: row.detail
    }));
  });
}

module.exports = {
  listSchedules,
  createSchedule,
  updateSchedule,
  getPayrollConfig,
  savePayrollConfig,
  listEmployees,
  getCurrentEmployee,
  createEmployee,
  listRoutes,
  createRoute,
  updateRoute,
  createRoutesBulk,
  getPreoperationalTemplate,
  getActivePreoperationalChecklist,
  submitPreoperationalChecklist,
  getPreoperationalMetrics,
  getRouteTracking,
  getOperationsMap,
  createPunch,
  createGpsPing,
  listActivityTypes,
  createActivityType,
  updateActivityType,
  getCurrentWorkSession,
  listWorkActivities,
  createWorkActivity,
  listActiveGps,
  listGpsHistory,
  listAttendance,
  processDay,
  listWorkdays,
  processPayrollRange,
  listPayroll
};
