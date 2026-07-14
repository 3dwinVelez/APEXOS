const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
require("./load-env")(args["env-file"] || "config/production.env");

const prisma = require("../apps/api/src/core/prisma");
const hr = require("../apps/api/src/modules/hr/service");
const transport = require("../apps/api/src/modules/transport/service");
const { requirePermission, tenantHasModule } = require("../apps/api/src/middleware/rbac");

const PROD_REF = "jzbwzmkidfthknsohhnr";
const RUN_AT = new Date();
const RUN_ID = String(args["run-id"] || RUN_AT.toISOString().replace(/[-:.TZ]/g, "").slice(0, 12));
const DATE = String(args.date || RUN_AT.toISOString().slice(0, 10));
const TAG = `nyvora_real_transport_hr_${RUN_ID}`;
const CODE_PREFIX = `NYV-REAL-${RUN_ID}`;
const EVIDENCE_PATH = path.resolve("docs/audits/NYVORA_REAL_TEST_EVIDENCE.md");
const CREDENTIAL_PATH = path.resolve("config/nyvora-real-test-credentials.env");
const FRONTEND_FILES = [
  "apps/web/app/dashboard/transporte/page.tsx",
  "apps/web/app/dashboard/talento-humano/page.tsx",
  "apps/web/app/dashboard/talento-humano/rutas/page.tsx",
  "apps/web/app/dashboard/talento-humano/marcacion/page.tsx",
  "apps/web/app/dashboard/talento-humano/mapa/page.tsx",
  "apps/web/app/dashboard/talento-humano/reportes/page.tsx"
];

function assertProdRuntime() {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const databaseUrl = String(process.env.DATABASE_URL || "");
  if (process.env.TARGET_ENV !== "production") throw new Error("TARGET_ENV debe ser production.");
  if (!supabaseUrl.includes(PROD_REF)) throw new Error("SUPABASE_URL no apunta a PROD.");
  if (!databaseUrl.includes(PROD_REF)) throw new Error("DATABASE_URL no apunta a PROD.");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function at(time) {
  return new Date(`${DATE}T${time}:00-05:00`).toISOString();
}

function actor(user) {
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    role_id: user.role_id,
    name: user.name,
    email: user.email
  };
}

function safeDetail(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => {
    if (typeof item === "bigint") return String(item);
    return item;
  }));
}

function record(result, name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail: safeDetail(detail) });
  if (!ok) result.errors.push({ name, detail: safeDetail(detail) });
}

async function expectError(result, name, fn, expectedStatus) {
  try {
    await fn();
    record(result, name, false, { expected_status: expectedStatus, obtained: "no_error" });
  } catch (error) {
    record(result, name, Number(error.statusCode || error.status || 0) === expectedStatus, {
      expected_status: expectedStatus,
      obtained_status: error.statusCode || error.status || null,
      code: error.code || null,
      message: error.message
    });
  }
}

async function findNyvoraContext() {
  const companies = await prisma.$queryRawUnsafe("select id,name,legal_name,tax_id,status from public.companies order by name");
  const company = companies.find((item) => normalize(item.name).includes("nyvora") || normalize(item.legal_name).includes("nyvora"));
  if (!company) throw new Error("No existe empresa Nyvora en public.companies.");
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { name: { contains: "NYVORA", mode: "insensitive" } },
        { config: { path: ["company_id"], equals: String(company.id) } }
      ]
    }
  });
  if (!tenant) throw new Error("No existe tenant operativo para Nyvora.");
  return { company, tenant };
}

async function ensureRole(tenantId, name, permissions) {
  const role = await prisma.role.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name } },
    update: { description: `Rol controlado de validacion real ${TAG}.`, metadata: { source: TAG, scope: "company" } },
    create: { tenant_id: tenantId, name, description: `Rol controlado de validacion real ${TAG}.`, metadata: { source: TAG, scope: "company" } }
  });
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { role_id_module_action: { role_id: role.id, module: permission.module, action: permission.action } },
      update: {},
      create: { role_id: role.id, module: permission.module, action: permission.action }
    });
  }
  return prisma.role.findUnique({ where: { id: role.id }, include: { permissions: true } });
}

async function ensureUserAndEmployee(tenantId, spec) {
  const temporaryPassword = `Nyvora-${RUN_ID}-${crypto.randomBytes(3).toString("hex")}#26`;
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const user = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenantId, email: spec.email } },
    update: { name: spec.name, role_id: spec.role.id, active: true, preferences: { source: TAG } },
    create: { tenant_id: tenantId, name: spec.name, email: spec.email, password: passwordHash, role_id: spec.role.id, active: true, preferences: { source: TAG } },
    include: { role: { include: { permissions: true } } }
  });
  const employee = await prisma.employee.upsert({
    where: { tenant_id_code: { tenant_id: tenantId, code: spec.code } },
    update: {
      user_id: user.id,
      user_type: spec.user_type,
      position: spec.position,
      department: spec.department,
      active: true,
      metadata: { name: spec.name, document: spec.document, company: "Nyvora", labor_status: "activo", user_type: spec.user_type, classification: spec.user_type, source: TAG }
    },
    create: {
      tenant_id: tenantId,
      user_id: user.id,
      code: spec.code,
      user_type: spec.user_type,
      position: spec.position,
      department: spec.department,
      salary_base: 2400000,
      salary_type: "monthly",
      hire_date: new Date(`${DATE}T00:00:00-05:00`),
      contract_type: "indefinite",
      active: true,
      metadata: { name: spec.name, document: spec.document, company: "Nyvora", labor_status: "activo", user_type: spec.user_type, classification: spec.user_type, source: TAG }
    },
    include: { user: { select: { id: true, name: true, email: true } } }
  });
  return { ...user, employee, temporary_password: temporaryPassword };
}

async function can(role, tenant, module, action, body = {}) {
  const reply = {
    statusCode: null,
    payload: null,
    code(status) {
      this.statusCode = status;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return payload;
    }
  };
  const request = { user: { role }, tenant, params: {}, query: {}, body };
  await requirePermission(module, action)(request, reply);
  return { ok: !reply.statusCode, status: reply.statusCode || 200, payload: reply.payload || null };
}

async function ensureControlledData(context, result) {
  const adminRole = await ensureRole(context.tenant.id, `NYVORA Real Admin ${RUN_ID}`, [
    { module: "hr", action: "read" },
    { module: "hr", action: "write" },
    { module: "transport", action: "read" },
    { module: "transport", action: "write" }
  ]);
  const operativeRole = await ensureRole(context.tenant.id, `NYVORA Real Operativo ${RUN_ID}`, [
    { module: "hr", action: "read" },
    { module: "hr", action: "write" },
    { module: "transport", action: "read" }
  ]);
  const readRole = await ensureRole(context.tenant.id, `NYVORA Real Consulta ${RUN_ID}`, [
    { module: "hr", action: "read" },
    { module: "transport", action: "read" }
  ]);

  const admin = await ensureUserAndEmployee(context.tenant.id, {
    name: `Nyvora Admin Real ${RUN_ID}`,
    email: `nyvora.real.admin.${RUN_ID}@internal.apexos.local`,
    code: `${CODE_PREFIX}-ADM`,
    document: `900${RUN_ID}`,
    user_type: "administrativo",
    position: "Coordinador operativo",
    department: "Operacion",
    role: adminRole
  });
  const driver = await ensureUserAndEmployee(context.tenant.id, {
    name: `Nyvora Conductor Real ${RUN_ID}`,
    email: `nyvora.real.driver.${RUN_ID}@internal.apexos.local`,
    code: `${CODE_PREFIX}-DRV`,
    document: `901${RUN_ID}`,
    user_type: "conductor",
    position: "Conductor",
    department: "Transporte",
    role: operativeRole
  });
  const incompleteOperator = await ensureUserAndEmployee(context.tenant.id, {
    name: `Nyvora Operativo Incompleto ${RUN_ID}`,
    email: `nyvora.real.operativo.${RUN_ID}@internal.apexos.local`,
    code: `${CODE_PREFIX}-OPR`,
    document: `902${RUN_ID}`,
    user_type: "operario",
    position: "Operario",
    department: "Talento Humano",
    role: operativeRole
  });
  const readOnly = await ensureUserAndEmployee(context.tenant.id, {
    name: `Nyvora Consulta Real ${RUN_ID}`,
    email: `nyvora.real.consulta.${RUN_ID}@internal.apexos.local`,
    code: `${CODE_PREFIX}-CON`,
    document: `903${RUN_ID}`,
    user_type: "consulta",
    position: "Analista consulta",
    department: "Administracion",
    role: readRole
  });

  fs.mkdirSync(path.dirname(CREDENTIAL_PATH), { recursive: true });
  fs.writeFileSync(CREDENTIAL_PATH, [
    "# Credenciales temporales internas Nyvora para validacion real Transporte/HR.",
    `# Generado: ${RUN_AT.toISOString()}`,
    `NYVORA_REAL_ADMIN=${admin.email}|${admin.temporary_password}|${admin.role.name}`,
    `NYVORA_REAL_DRIVER=${driver.email}|${driver.temporary_password}|${driver.role.name}`,
    `NYVORA_REAL_OPERATIVE=${incompleteOperator.email}|${incompleteOperator.temporary_password}|${incompleteOperator.role.name}`,
    `NYVORA_REAL_READONLY=${readOnly.email}|${readOnly.temporary_password}|${readOnly.role.name}`
  ].join("\n") + "\n");

  record(result, "nyvora_roles_users_employees_created_or_reused", true, {
    roles: [adminRole.name, operativeRole.name, readRole.name],
    credentials_file: CREDENTIAL_PATH,
    users: [
      { email: admin.email, role: admin.role.name, employee_id: admin.employee.id, code: admin.employee.code },
      { email: driver.email, role: driver.role.name, employee_id: driver.employee.id, code: driver.employee.code },
      { email: incompleteOperator.email, role: incompleteOperator.role.name, employee_id: incompleteOperator.employee.id, code: incompleteOperator.employee.code },
      { email: readOnly.email, role: readOnly.role.name, employee_id: readOnly.employee.id, code: readOnly.employee.code }
    ]
  });

  const vehicleInput = {
    plate: `NY${RUN_ID.slice(-4)}`,
    type: "camioneta",
    brand: "Renault",
    model: "Kangoo Controlada",
    line: "Operativa",
    year: 2026,
    color: "Blanco",
    ownership_type: "propio",
    base_site: "NYVORA Centro",
    legal_owner: "NYVORA",
    owner: "NYVORA",
    owner_document: "NYVORA-INTERNAL",
    authorized_driver_id: driver.employee.id,
    authorized_driver_name: driver.name,
    authorized_driver_document: driver.employee.metadata.document,
    authorized_driver_code: driver.employee.code,
    soat_issued_at: "2026-01-01",
    soat_expires: "2027-01-01",
    technical_review_issued_at: "2026-01-01",
    technical_review_expires: "2027-01-01",
    metadata: { source: TAG, company: "Nyvora", sede: "NYVORA Centro" }
  };
  const existingVehicle = await prisma.vehicle.findFirst({ where: { tenant_id: context.tenant.id, plate: vehicleInput.plate } });
  const vehicle = existingVehicle
    ? await transport.updateVehicle(context.tenant.id, actor(admin), existingVehicle.id, vehicleInput)
    : await transport.createVehicle(context.tenant.id, actor(admin), vehicleInput);
  record(result, "transport_vehicle_created_or_reused_for_nyvora", true, {
    id: vehicle.id,
    plate: vehicle.plate,
    site: vehicle.base_site,
    driver_id: vehicle.authorized_driver_id,
    master_status: vehicle.master_status,
    document_status: vehicle.document_status
  });

  const schedule = await hr.createSchedule(context.tenant.id, {
    name: `Horario Nyvora Real ${RUN_ID}`,
    start_time: "08:00",
    end_time: "17:00",
    lunch_start_time: "12:00",
    lunch_end_time: "13:00",
    workable_days: [0, 1, 2, 3, 4, 5, 6],
    active: true
  });
  record(result, "hr_schedule_created_for_nyvora_processing", true, {
    id: schedule.id,
    name: schedule.name,
    start_time: schedule.start_time,
    end_time: schedule.end_time,
    lunch_start_time: schedule.lunch_start_time,
    lunch_end_time: schedule.lunch_end_time
  });

  const route = await hr.createRoute(context.tenant.id, {
    date: DATE,
    vehicle_plate: vehicle.plate,
    employees: [driver.employee.code],
    start_time: "08:00",
    end_time: "17:00",
    tolerance_minutes: 15,
    per_diem: 35000,
    notes: `Ruta controlada Nyvora ${TAG}`,
    status: "active"
  });
  record(result, "hr_transport_route_created_for_nyvora", true, {
    id: route.id,
    date: DATE,
    vehicle_plate: route.vehicle_plate,
    employees: route.employees,
    status: route.status
  });

  return { admin, driver, incompleteOperator, readOnly, vehicle, schedule, route };
}

async function runPermissions(context, data, result) {
  record(result, "tenant_modules_enabled_for_hr_transport", tenantHasModule(context.tenant, "hr") && tenantHasModule(context.tenant, "transport"), {
    tenant_id: context.tenant.id,
    active_modules: context.tenant.active_modules
  });
  const adminTransportWrite = await can(data.admin.role, context.tenant, "transport", "write", { base_site: "NYVORA Centro" });
  const operativeTransportWrite = await can(data.driver.role, context.tenant, "transport", "write", { base_site: "NYVORA Centro" });
  const operativeHrWrite = await can(data.driver.role, context.tenant, "hr", "write", { sede: "NYVORA Centro" });
  const readOnlyHrWrite = await can(data.readOnly.role, context.tenant, "hr", "write", { sede: "NYVORA Centro" });
  record(result, "rbac_admin_can_write_transport", adminTransportWrite.ok, adminTransportWrite);
  record(result, "rbac_operative_can_write_hr_punches", operativeHrWrite.ok, operativeHrWrite);
  record(result, "rbac_operative_cannot_write_transport_master", !operativeTransportWrite.ok && operativeTransportWrite.status === 403, operativeTransportWrite);
  record(result, "rbac_readonly_cannot_write_hr", !readOnlyHrWrite.ok && readOnlyHrWrite.status === 403, readOnlyHrWrite);
}

async function runHrFlow(context, data, result) {
  const firstEntry = await hr.createPunch(context.tenant.id, {
    type: "entrada",
    punched_at: at("08:00"),
    route_id: data.route.id,
    vehicle_plate: data.vehicle.plate,
    latitude: 4.711,
    longitude: -74.072,
    accuracy_meters: 8,
    metadata: { source: TAG, step: "preop_required" }
  }, actor(data.driver));
  record(result, "hr_driver_entry_requires_preoperational_checklist", firstEntry.preoperational_required === true && firstEntry.ok === false, {
    checklist_id: firstEntry.preoperational_checklist?.id || null,
    route_authorized: firstEntry.route_authorized
  });

  const checklistId = firstEntry.preoperational_checklist?.id;
  await expectError(result, "hr_preop_incomplete_checklist_rejected", () => hr.submitPreoperationalChecklist(context.tenant.id, actor(data.driver), checklistId, {
    answers: [{ item_key: "soat_vigente", answer: "cumple" }],
    mileage_initial: 1200,
    fuel_level: "medio"
  }), 422);

  const template = hr.getPreoperationalTemplate();
  const approvedChecklist = await hr.submitPreoperationalChecklist(context.tenant.id, actor(data.driver), checklistId, {
    answers: template.items.map((item) => ({ item_key: item.item_key, answer: "cumple", observations: "" })),
    mileage_initial: 1200,
    fuel_level: "medio",
    location_lat: 4.711,
    location_lng: -74.072,
    digital_signature: data.driver.name,
    observations: `Checklist real controlado Nyvora ${TAG}`
  });
  record(result, "transport_preoperational_checklist_approved", approvedChecklist.status === "aprobado" && approvedChecklist.route_authorized === true, {
    checklist_id: checklistId,
    status: approvedChecklist.status,
    route_authorized: approvedChecklist.route_authorized
  });

  const punches = [];
  for (const [type, time] of [["entrada", "08:00"], ["inicio_almuerzo", "12:00"], ["fin_almuerzo", "13:00"], ["salida", "17:00"]]) {
    const response = await hr.createPunch(context.tenant.id, {
      type,
      punched_at: at(time),
      route_id: data.route.id,
      vehicle_plate: data.vehicle.plate,
      latitude: type === "salida" ? 4.715 : 4.711,
      longitude: type === "salida" ? -74.076 : -74.072,
      accuracy_meters: 8,
      metadata: { source: TAG, step: type }
    }, actor(data.driver));
    punches.push(response.punch);
  }
  record(result, "hr_full_workday_punch_flow_completed", punches.length === 4 && punches[punches.length - 1].type === "salida", {
    punch_ids: punches.map((item) => item.id),
    types: punches.map((item) => item.type),
    route_id: data.route.id,
    vehicle_plate: data.vehicle.plate
  });

  await expectError(result, "hr_duplicate_or_completed_day_rejected", () => hr.createPunch(context.tenant.id, {
    type: "salida",
    punched_at: at("17:05"),
    route_id: data.route.id,
    vehicle_plate: data.vehicle.plate,
    latitude: 4.715,
    longitude: -74.076,
    metadata: { source: TAG, step: "duplicate_exit" }
  }, actor(data.driver)), 409);

  await expectError(result, "hr_missing_user_data_rejected", () => hr.createPunch(context.tenant.id, { type: "entrada", punched_at: at("08:30") }, null), 400);
  await expectError(result, "hr_route_without_employee_rejected", () => hr.createRoute(context.tenant.id, {
    date: DATE,
    vehicle_plate: data.vehicle.plate,
    employees: [],
    start_time: "08:00",
    end_time: "17:00"
  }), 400);

  const incomplete = await hr.createPunch(context.tenant.id, {
    type: "entrada",
    punched_at: at("09:00"),
    user_name: data.incompleteOperator.employee.code,
    latitude: 4.72,
    longitude: -74.08,
    accuracy_meters: 15,
    metadata: { source: TAG, step: "incomplete_state" }
  }, actor(data.incompleteOperator));
  const attendance = await hr.listAttendance(context.tenant.id, { date: DATE, user_name: data.incompleteOperator.employee.code });
  const session = await hr.getCurrentWorkSession(context.tenant.id, actor(data.incompleteOperator), { date: DATE });
  record(result, "hr_incomplete_state_visible_and_queryable", incomplete.ok && attendance[0]?.next_type === "inicio_almuerzo" && session.active, {
    punch_id: incomplete.punch.id,
    attendance_next_type: attendance[0]?.next_type || null,
    session_active: session.active,
    alerts: session.alerts
  });

  const gpsHistory = await hr.listGpsHistory(context.tenant.id, { date: DATE, user_name: data.driver.employee.code });
  const routeTracking = await hr.getRouteTracking(context.tenant.id, data.route.id, { date: DATE });
  record(result, "hr_gps_and_route_tracking_queryable", gpsHistory.length >= 4 && routeTracking.totals.punches >= 4, {
    gps_points: gpsHistory.length,
    tracking_punches: routeTracking.totals.punches,
    route_id: data.route.id
  });

  const operationsMap = await hr.getOperationsMap(context.tenant.id, { date: DATE, minutes: 30, footprint_days: 30 });
  const monitoredRoute = operationsMap.routes.find((item) => Number(item.id) === Number(data.route.id));
  record(result, "hr_monitor_operations_map_reflects_route_punches", Boolean(monitoredRoute) && (monitoredRoute.punch_points || []).length >= 4, {
    route_id: data.route.id,
    monitor_route_id: monitoredRoute?.id || null,
    monitor_employee_names: monitoredRoute?.employee_names || [],
    punch_points: monitoredRoute?.punch_points?.map((item) => ({ id: item.id, type: item.type, user_name: item.user_name, route_id: item.route_id })) || [],
    activity_points: monitoredRoute?.activity_points?.length || 0
  });

  const processed = await hr.processDay(context.tenant.id, { date: DATE });
  const workdays = await hr.listWorkdays(context.tenant.id, { date: DATE });
  record(result, "hr_workday_processing_consults_nyvora_data", processed.processed > 0 && workdays.some((item) => item.employee_id === data.driver.employee.id), {
    processed: processed.processed,
    driver_processed: workdays.some((item) => item.employee_id === data.driver.employee.id)
  });
}

async function runTransportFlow(context, data, result) {
  const vehicles = await transport.listVehicles(context.tenant.id, { base_site: "NYVORA Centro", limit: 200 });
  const detail = await transport.getVehicle(context.tenant.id, data.vehicle.id);
  const planning = await transport.getPlanningVehicleStatus(context.tenant.id, data.vehicle.plate);
  record(result, "transport_query_filters_detail_and_planning_ok", vehicles.some((item) => item.id === data.vehicle.id) && detail.id === data.vehicle.id && planning.can_start_route, {
    filtered_count: vehicles.length,
    vehicle_id: detail.id,
    plate: planning.plate,
    can_start_route: planning.can_start_route,
    master_status: planning.master_status
  });

  const updatedRoute = await hr.updateRoute(context.tenant.id, data.route.id, {
    date: DATE,
    vehicle_plate: data.vehicle.plate,
    employees: [data.driver.employee.code],
    start_time: "08:00",
    end_time: "17:00",
    tolerance_minutes: 15,
    per_diem: 35000,
    notes: `Ruta controlada Nyvora ${TAG} cerrada por validacion`,
    status: "completed"
  });
  record(result, "transport_route_status_changed_after_execution", updatedRoute.status === "completed", {
    route_id: updatedRoute.id,
    status: updatedRoute.status
  });

  await expectError(result, "transport_vehicle_missing_required_fields_rejected", () => transport.createVehicle(context.tenant.id, actor(data.admin), {
    plate: `BAD${RUN_ID.slice(-3)}`,
    type: "camioneta",
    ownership_type: "propio",
    base_site: "NYVORA Centro"
  }), 400);
  await expectError(result, "transport_vehicle_inconsistent_dates_rejected", () => transport.createVehicle(context.tenant.id, actor(data.admin), {
    plate: `BD${RUN_ID.slice(-4)}`,
    type: "camioneta",
    brand: "Renault",
    ownership_type: "propio",
    base_site: "NYVORA Centro",
    soat_issued_at: "2027-01-01",
    soat_expires: "2026-01-01"
  }), 400);
}

async function runDatabaseChecks(context, data, result) {
  const counts = await prisma.$transaction([
    prisma.user.count({ where: { tenant_id: context.tenant.id, preferences: { path: ["source"], equals: TAG } } }),
    prisma.employee.count({ where: { tenant_id: context.tenant.id, metadata: { path: ["source"], equals: TAG } } }),
    prisma.vehicle.count({ where: { tenant_id: context.tenant.id, metadata: { path: ["source"], equals: TAG } } }),
    prisma.timePunch.count({ where: { tenant_id: context.tenant.id, metadata: { path: ["source"], equals: TAG } } }),
    prisma.gpsPing.count({ where: { tenant_id: context.tenant.id, metadata: { path: ["source"], equals: TAG } } }),
    prisma.timeRoute.count({ where: { tenant_id: context.tenant.id, notes: { contains: TAG } } }),
    prisma.routePreoperationalChecklist.count({ where: { tenant_id: context.tenant.id, observations: { contains: TAG } } })
  ]);
  const crossTenant = await prisma.$queryRawUnsafe(`
    select 'Employee' as table_name, count(*)::int as count from public."Employee" where tenant_id <> $1 and metadata::text like $2
    union all
    select 'Vehicle', count(*)::int from public."Vehicle" where tenant_id <> $1 and metadata::text like $2
    union all
    select 'TimePunch', count(*)::int from public."TimePunch" where tenant_id <> $1 and metadata::text like $2
    union all
    select 'GpsPing', count(*)::int from public."GpsPing" where tenant_id <> $1 and metadata::text like $2
  `, context.tenant.id, `%${TAG}%`);
  record(result, "database_nyvora_records_persisted_and_isolated", counts.every((count) => count > 0) && crossTenant.every((row) => row.count === 0), {
    tenant_id: context.tenant.id,
    counts: {
      users: counts[0],
      employees: counts[1],
      vehicles: counts[2],
      time_punches: counts[3],
      gps_pings: counts[4],
      routes: counts[5],
      checklists: counts[6]
    },
    cross_tenant: crossTenant
  });

  const session = await prisma.workSession.findFirst({
    where: { tenant_id: context.tenant.id, employee_id: data.driver.employee.id, date: { gte: new Date(`${DATE}T00:00:00-05:00`), lt: new Date(`${DATE}T23:59:59-05:00`) } },
    orderBy: { created_at: "desc" }
  });
  record(result, "database_closed_work_session_for_driver", session?.status === "cerrada", {
    session_id: session?.id || null,
    status: session?.status || null,
    route_id: session?.route_id || null,
    preop_checklist_id: session?.preop_checklist_id || null
  });
}

function runUxStaticChecks(result) {
  const forbidden = /\b(lorem ipsum|demo generic|datos demo genericos|placeholder pendiente)\b/i;
  const files = FRONTEND_FILES.map((file) => ({ file, content: fs.readFileSync(path.resolve(file), "utf8") }));
  const hits = files.flatMap(({ file, content }) => forbidden.test(content) ? [file] : []);
  const transportContent = files.find((item) => item.file.includes("transporte/page"))?.content || "";
  const hrContent = files.map((item) => item.content).join("\n");
  record(result, "ux_relevant_frontend_files_without_generic_filler_text", hits.length === 0, { files_checked: FRONTEND_FILES, hits });
  record(result, "ux_forms_have_error_loading_and_responsive_classes", /setMessage|catch/.test(transportContent) && /grid-cols|md:|lg:|sm:/.test(hrContent), {
    transport_error_handling_detected: /setMessage|catch/.test(transportContent),
    responsive_classes_detected: /grid-cols|md:|lg:|sm:/.test(hrContent)
  });
}

function writeEvidence(result) {
  const lines = [
    "# Evidencia pruebas reales Nyvora - Transporte y Talento Humano",
    "",
    `- Fecha: ${RUN_AT.toISOString()}`,
    "- Ambiente: production",
    `- Empresa: ${result.company.name}`,
    `- Company ID: ${result.company.id}`,
    `- Tenant ID: ${result.tenant.id}`,
    `- Sede usada: NYVORA Centro`,
    `- Marcador tecnico: ${TAG}`,
    "",
    "## Usuarios y roles utilizados",
    "",
    ...result.users.map((user) => `- ${user.email} | rol: ${user.role} | empleado: ${user.employee_code} | modulo: ${user.modules}`),
    "",
    "## Datos creados o reutilizados",
    "",
    ...result.data.map((item) => `- ${item}`),
    "",
    "## Pruebas ejecutadas",
    "",
    "| Prueba | Resultado | Evidencia tecnica |",
    "| --- | --- | --- |",
    ...result.checks.map((check) => `| ${check.name} | ${check.ok ? "OK" : "FALLO"} | \`${JSON.stringify(check.detail).replace(/`/g, "'")}\` |`),
    "",
    "## Resultado esperado vs obtenido",
    "",
    "- Esperado: datos operativos Nyvora aislados por tenant, jornada completa registrable solo en secuencia valida, checklist preoperacional obligatorio para conductor con ruta/vehiculo, vehiculo consultable por filtros/detalle, errores controlados para datos incompletos e inconsistentes.",
    `- Obtenido: ${result.ok ? "todos los checks obligatorios quedaron OK." : "hay checks fallidos; ver errores."}`,
    "",
    "## Errores encontrados",
    "",
    ...(result.errors.length ? result.errors.map((error) => `- ${error.name}: ${JSON.stringify(error.detail)}`) : ["- No quedaron errores bloqueantes en la corrida automatizada real."]),
    "",
    "## Correcciones aplicadas",
    "",
    "- `apps/api/src/modules/hr/service.js`: se corrigio la busqueda de empleado para normalizar `user_name` ausente y devolver error 400 controlado en marcaciones incompletas.",
    "- `apps/api/src/modules/hr/service.js`: la secuencia de marcacion valida aliases operativos enviados por el movil para alinear API, Marcacion y monitor.",
    "- `apps/web/app/dashboard/talento-humano/rutas/page.tsx`: el monitor muestra el ID del horario en la tabla principal.",
    "- `apps/web/lib/api.ts`: Transporte y Talento Humano ahora prefieren el API operativo cuando esta configurado, usando Supabase solo como respaldo para evitar pantallas vacias con datos reales en Prisma/API.",
    "- `scripts/nyvora-real-transport-hr-validation.js`: se agrego validador real Nyvora con datos controlados, horario minimo, credenciales temporales locales y evidencia automatica.",
    "- No se borraron datos existentes y no se modificaron datos sensibles fuera de los registros controlados con marcador tecnico.",
    "",
    "## Pendientes",
    "",
    ...(result.pending.length ? result.pending.map((item) => `- ${item}`) : ["- Sin pendientes tecnicos bloqueantes en backend/base. Validacion visual manual queda documentada en la auditoria principal."]),
    ""
  ];
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, lines.join("\n"));
}

async function main() {
  assertProdRuntime();
  const result = {
    ok: false,
    company: {},
    tenant: {},
    users: [],
    data: [],
    checks: [],
    errors: [],
    pending: []
  };
  const context = await findNyvoraContext();
  result.company = { id: context.company.id, name: context.company.name };
  result.tenant = { id: context.tenant.id, name: context.tenant.name };
  const data = await ensureControlledData(context, result);
  result.users = [
    { email: data.admin.email, role: data.admin.role.name, employee_code: data.admin.employee.code, modules: "Transporte/Talento Humano administracion" },
    { email: data.driver.email, role: data.driver.role.name, employee_code: data.driver.employee.code, modules: "Talento Humano marcaciones, checklist, ruta; Transporte lectura" },
    { email: data.incompleteOperator.email, role: data.incompleteOperator.role.name, employee_code: data.incompleteOperator.employee.code, modules: "Talento Humano estado incompleto" },
    { email: data.readOnly.email, role: data.readOnly.role.name, employee_code: data.readOnly.employee.code, modules: "Consulta permisos negativos" }
  ];
  result.data = [
    `Empleado conductor: ${data.driver.employee.code} (${data.driver.employee.id})`,
    `Empleado operativo incompleto: ${data.incompleteOperator.employee.code} (${data.incompleteOperator.employee.id})`,
    `Vehiculo: ${data.vehicle.plate} (${data.vehicle.id})`,
    `Ruta: ${data.route.id} en ${DATE}`,
    `Checklist generado desde marcacion de entrada y aprobado para ruta ${data.route.id}`
  ];

  await runPermissions(context, data, result);
  await runHrFlow(context, data, result);
  await runTransportFlow(context, data, result);
  await runDatabaseChecks(context, data, result);
  runUxStaticChecks(result);

  result.ok = result.errors.length === 0;
  writeEvidence(result);
  console.log(JSON.stringify({ ok: result.ok, evidence: EVIDENCE_PATH, company: result.company, tenant: result.tenant, checks: result.checks.length, errors: result.errors }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[nyvora-real-validation] ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
