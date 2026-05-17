const prisma = require("../../core/prisma");
const { normalizePunchType, processWorkday } = require("./timeLogic");

const DEFAULT_PARAMS = {
  ordinary_hours_day: 8,
  lunch_minutes: 60,
  night_start: "21:00",
  night_end: "06:00"
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
  return new Date(date).toTimeString().slice(0, 5);
}

function minutesFromTime(value) {
  if (!value || !/^\d{2}:\d{2}/.test(String(value))) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function employeeDisplayName(employee) {
  return employee?.metadata?.name || employee?.user?.name || employee?.code || "";
}

function aliasesForEmployee(employee) {
  return [employee?.code, employee?.metadata?.name, employee?.user?.name, employee?.user?.email].filter(Boolean).map((value) => String(value));
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
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
    const rows = await prisma.timeRoute.findMany({
      where: day ? { date: { gte: day, lt: endOfDay(day) } } : {},
      orderBy: { date: "desc" },
      take: 100
    });
    return rows.map((route) => ({
      ...route,
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
    include: { user: true },
    orderBy: { id: "desc" },
    take: 200
  }));
}

async function createEmployee(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.employee.create({
    data: {
      code: input.code || `EMP-${Date.now()}`,
      position: input.position || "empleado",
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
        legacy: input.legacy || null
      }
    },
    include: { user: true }
  }));
}

async function createRoute(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.timeRoute.create({
    data: {
      date: startOfDay(input.date),
      vehicle_plate: input.vehicle_plate || "",
      employees: input.employees || [],
      start_time: input.start_time || "08:00",
      end_time: input.end_time || "17:00",
      tolerance_minutes: input.tolerance_minutes ?? 15,
      per_diem: Number(input.per_diem || 0),
      notes: input.notes || "",
      status: input.status || "active"
    }
  }));
}

async function findEmployee(input) {
  if (input.employee_id) return prisma.employee.findFirst({ where: { id: Number(input.employee_id) } });
  const name = input.user_name.trim();
  if (!name) return null;
  return prisma.employee.findFirst({
    where: {
      OR: [
        { code: name },
        { user: { name } },
        { user: { email: name } }
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
      position: "empleado",
      department: "Operacion",
      salary_base: 0,
      salary_type: "monthly",
      hire_date: new Date(),
      contract_type: "indefinite",
      metadata: { name, document: "", company: "APEX", labor_status: "activo", legacy: { autocreated_from: "marcacion" } }
    }
  });
}

async function createPunch(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const punchedAt = input.punched_at ? new Date(input.punched_at) : new Date();
    const employee = await resolveEmployeeForPunch(tenantId, input);
    const type = normalizePunchType(input.type || input.tipo_marca);
    const route = input.route_id ? await prisma.timeRoute.findFirst({ where: { id: Number(input.route_id) } }) : null;
    const extraMinutes = type === "salida" && route?.end_time
      ? Math.max(0, Math.round((punchedAt.getHours() * 60 + punchedAt.getMinutes()) - (Number(route.end_time.slice(0, 2)) * 60 + Number(route.end_time.slice(3, 5))) - Number(route.tolerance_minutes || 0)))
      : 0;
    const punch = await prisma.timePunch.create({
      data: {
        employee_id: employee.id,
        user_name: input.user_name,
        type,
        punched_at: punchedAt,
        date: startOfDay(punchedAt),
        time: timeString(punchedAt),
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy_meters: input.accuracy_meters,
        vehicle_plate: input.vehicle_plate || "",
        route_id: input.route_id,
        extra_minutes: extraMinutes,
        extra_reason: input.extra_reason,
        extra_detail: input.extra_detail,
        metadata: input.metadata || {}
      }
    });
    if (input.latitude != null && input.longitude != null) {
      await prisma.gpsPing.create({
        data: {
          employee_id: employee.id,
          user_name: input.user_name,
          vehicle_plate: input.vehicle_plate || "",
          route_id: input.route_id,
          latitude: Number(input.latitude),
          longitude: Number(input.longitude),
          accuracy_meters: input.accuracy_meters,
          source: "time_punch",
          captured_at: punchedAt,
          metadata: { type, ...(input.metadata || {}) }
        }
      });
    }
    return {
      ok: true,
      hora: timeString(punchedAt),
      es_extra: extraMinutes > 0,
      minutos_extra: extraMinutes,
      alerta: extraMinutes > 0,
      punch,
      next: nextPunchType(await latestPunchesForUser(input.user_name, punchedAt))
    };
  });
}

async function createGpsPing(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await resolveEmployeeForPunch(tenantId, input);
    return prisma.gpsPing.create({
      data: {
        employee_id: employee.id,
        user_name: input.user_name,
        vehicle_plate: input.vehicle_plate || "",
        route_id: input.route_id,
        latitude: Number(input.latitude),
        longitude: Number(input.longitude),
        accuracy_meters: input.accuracy_meters,
        source: input.source || "mobile",
        captured_at: input.captured_at ? new Date(input.captured_at) : new Date(),
        metadata: input.metadata || {}
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
    return {
      route: {
        ...route,
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
  const since = new Date(Date.now() - activeMinutes * 60000);
  const footprintSince = new Date(day.getTime() - footprintDays * 86400000);
  return prisma.runWithTenant(tenantId, async () => {
    const [routes, employees, pings, lastFootprints, punches] = await Promise.all([
      prisma.timeRoute.findMany({
        where: {
          date: { gte: day, lt: endOfDay(day) },
          status: { not: "cancelled" }
        },
        orderBy: { start_time: "asc" },
        take: 200
      }),
      prisma.employee.findMany({ where: { active: true }, include: { user: true }, take: 500 }),
      prisma.gpsPing.findMany({
        where: { captured_at: { gte: day, lt: endOfDay(day) } },
        orderBy: { captured_at: "desc" },
        take: 2000
      }),
      prisma.gpsPing.findMany({
        where: { captured_at: { gte: footprintSince, lt: endOfDay(day) } },
        orderBy: { captured_at: "desc" },
        take: 5000
      }),
      prisma.timePunch.findMany({
        where: { date: { gte: day, lt: endOfDay(day) } },
        orderBy: { punched_at: "desc" },
        take: 2000
      })
    ]);

    const employeeByAlias = new Map();
    for (const employee of employees) {
      for (const alias of aliasesForEmployee(employee)) employeeByAlias.set(normalizeKey(alias), employee);
    }

    const latestPingByUser = new Map();
    const pingsByRoute = new Map();
    for (const ping of pings) {
      const userKey = normalizeKey(ping.user_name);
      if (!latestPingByUser.has(userKey)) latestPingByUser.set(userKey, ping);
      if (ping.route_id) {
        if (!pingsByRoute.has(Number(ping.route_id))) pingsByRoute.set(Number(ping.route_id), []);
        pingsByRoute.get(Number(ping.route_id)).push(ping);
      }
    }

    const lastFootprintByUser = new Map();
    for (const ping of lastFootprints) {
      const userKey = normalizeKey(ping.user_name);
      if (!lastFootprintByUser.has(userKey)) lastFootprintByUser.set(userKey, ping);
    }

    const latestPunchByUser = new Map();
    const punchesByRoute = new Map();
    for (const punch of punches) {
      const userKey = normalizeKey(punch.user_name);
      if (!latestPunchByUser.has(userKey)) latestPunchByUser.set(userKey, punch);
      if (punch.route_id && punch.latitude != null && punch.longitude != null) {
        if (!punchesByRoute.has(Number(punch.route_id))) punchesByRoute.set(Number(punch.route_id), []);
        punchesByRoute.get(Number(punch.route_id)).push(punch);
      }
    }

    const people = [];
    for (const route of routes) {
      const assigned = Array.isArray(route.employees) ? route.employees : [];
      for (const assignedName of assigned) {
        const employee = employeeByAlias.get(normalizeKey(assignedName));
        const aliases = employee ? aliasesForEmployee(employee) : [assignedName];
        const latestLivePing = aliases.map((alias) => latestPingByUser.get(normalizeKey(alias))).find(Boolean);
        const lastFootprint = aliases.map((alias) => lastFootprintByUser.get(normalizeKey(alias))).find(Boolean);
        const latestPing = latestLivePing || lastFootprint;
        const latestPunch = aliases.map((alias) => latestPunchByUser.get(normalizeKey(alias))).find(Boolean);
        const ageSeconds = latestPing ? Math.max(0, Math.round((Date.now() - new Date(latestPing.captured_at).getTime()) / 1000)) : null;
        const isOnline = Boolean(latestLivePing && new Date(latestLivePing.captured_at) >= since);
        people.push({
          key: `${route.id}-${employee?.id || assignedName}`,
          employee_id: employee?.id || null,
          user_name: latestPing?.user_name || latestPunch?.user_name || employee?.code || assignedName,
          name: employeeDisplayName(employee) || assignedName,
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
          status: latestPing ? (isOnline ? punchStatus(latestPunch?.type) : "Sin senal") : latestPunch?.latitude != null ? "Ultima marca" : "Sin GPS",
          time_in_route_minutes: routeElapsedMinutes(route, latestPunch),
          route_start_time: route.start_time || "",
          route_end_time: route.end_time || ""
        });
      }
    }

    const routeSummaries = routes.map((route) => {
      const assigned = people.filter((person) => person.route_id === route.id);
      const routePings = (pingsByRoute.get(route.id) || []).sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
      const routePunches = (punchesByRoute.get(route.id) || []).sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at));
      const marksByUser = new Map();
      for (const punch of routePunches) {
        if (!marksByUser.has(punch.user_name)) marksByUser.set(punch.user_name, []);
        marksByUser.get(punch.user_name).push({
          id: punch.id,
          user_name: punch.user_name,
          type: punch.type,
          time: punch.time,
          punched_at: punch.punched_at,
          latitude: punch.latitude,
          longitude: punch.longitude,
          accuracy_meters: punch.accuracy_meters,
          vehicle_plate: punch.vehicle_plate,
          route_id: punch.route_id,
          extra_minutes: punch.extra_minutes,
          metadata: punch.metadata || {}
        });
      }
      return {
        ...route,
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
          user_name: punch.user_name,
          type: punch.type,
          time: punch.time,
          punched_at: punch.punched_at,
          latitude: punch.latitude,
          longitude: punch.longitude,
          accuracy_meters: punch.accuracy_meters,
          vehicle_plate: punch.vehicle_plate,
          route_id: punch.route_id,
          extra_minutes: punch.extra_minutes,
          metadata: punch.metadata || {}
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

async function latestPunchesForUser(userName, date = new Date()) {
  return prisma.timePunch.findMany({
    where: {
      user_name: userName,
      date: { gte: startOfDay(date), lt: endOfDay(date) }
    },
    orderBy: { punched_at: "asc" }
  });
}

function nextPunchType(punches) {
  const order = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
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
      if (!grouped.has(punch.user_name)) grouped.set(punch.user_name, []);
      grouped.get(punch.user_name).push(punch);
    }
    return Array.from(grouped.entries()).map(([user_name, rows]) => ({
      user_name,
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
      prisma.employee.findMany({ where: { active: true }, include: { user: true } }),
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
    include: { employee: { include: { user: true } }, schedule: true },
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
    const employees = await prisma.employee.findMany({ where: { active: true }, include: { user: true } });
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
      include: { employee: { include: { user: true } } },
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
  listEmployees,
  createEmployee,
  listRoutes,
  createRoute,
  getRouteTracking,
  getOperationsMap,
  createPunch,
  createGpsPing,
  listActiveGps,
  listGpsHistory,
  listAttendance,
  processDay,
  listWorkdays,
  processPayrollRange,
  listPayroll
};
