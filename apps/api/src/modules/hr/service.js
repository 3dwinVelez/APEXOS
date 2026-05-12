const prisma = require("../../core/prisma");
const { normalizePunchType, processWorkday } = require("./timeLogic");

const DEFAULT_PARAMS = {
  ordinary_hours_day: 8,
  lunch_minutes: 60,
  night_start: "21:00",
  night_end: "06:00"
};

function startOfDay(value = new Date()) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(value = new Date()) {
  const date = startOfDay(value);
  return new Date(date.getTime() + 86400000);
}

function timeString(date) {
  return new Date(date).toTimeString().slice(0, 5);
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
  return prisma.runWithTenant(tenantId, async () => prisma.timeRoute.findMany({
    where: day ? { date: { gte: day, lt: endOfDay(day) } } : {},
    orderBy: { date: "desc" },
    take: 100
  }));
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

async function createPunch(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const punchedAt = input.punched_at ? new Date(input.punched_at) : new Date();
    const employee = await findEmployee(input);
    const punch = await prisma.timePunch.create({
      data: {
        employee_id: employee.id,
        user_name: input.user_name,
        type: normalizePunchType(input.type),
        punched_at: punchedAt,
        date: startOfDay(punchedAt),
        time: timeString(punchedAt),
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy_meters: input.accuracy_meters,
        vehicle_plate: input.vehicle_plate || "",
        route_id: input.route_id,
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
          metadata: { type: normalizePunchType(input.type), ...(input.metadata || {}) }
        }
      });
    }
    return {
      ok: true,
      punch,
      next: nextPunchType(await latestPunchesForUser(input.user_name, punchedAt))
    };
  });
}

async function createGpsPing(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const employee = await findEmployee(input);
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
  const day = query.date ? startOfDay(query.date) : startOfDay();
  return prisma.runWithTenant(tenantId, async () => {
    const punches = await prisma.timePunch.findMany({
      where: { date: { gte: day, lt: endOfDay(day) } },
      orderBy: [{ user_name: "asc" }, { punched_at: "asc" }]
    });
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
      const aliases = new Set([employee.code, employee.user.name, employee.user.email].filter(Boolean));
      const employeePunches = punches.filter((punch) => aliases.has(punch.user_name) || punch.employee_id === employee.id);
      const workday = processWorkday({ employee, schedule: defaultSchedule, punches: employeePunches, params: DEFAULT_PARAMS, holidays, date: day });
      if (!workday) continue;
      const row = await prisma.processedWorkday.upsert({
        where: { tenant_id_employee_id_date: { tenant_id: tenantId, employee_id: employee.id, date: day } },
        update: workday,
        create: workday
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

module.exports = {
  listSchedules,
  createSchedule,
  updateSchedule,
  listEmployees,
  createEmployee,
  listRoutes,
  createRoute,
  createPunch,
  createGpsPing,
  listActiveGps,
  listGpsHistory,
  listAttendance,
  processDay,
  listWorkdays
};
