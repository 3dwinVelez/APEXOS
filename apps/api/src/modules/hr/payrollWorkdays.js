const { processWorkday } = require('./timeLogic');

const minuteFields = ['ordinary_day_minutes', 'ordinary_night_minutes', 'ordinary_sunday_holiday_day_minutes', 'ordinary_sunday_holiday_night_minutes', 'overtime_day_minutes', 'overtime_night_minutes', 'overtime_sunday_holiday_day_minutes', 'overtime_sunday_holiday_night_minutes'];
const dateKey = value => new Date(value).toISOString().slice(0, 10);
const aliasKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

// Read-only projection: previews must not persist or refresh ProcessedWorkday.
// Explicit employee_id always wins; legacy names must identify exactly one employee.
function payrollWorkdays({ employees, punches, stored, schedules, routes, parameters, calendarDays, identityEmployees = employees }) {
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  const aliases = new Map();
  for (const employee of identityEmployees) {
    for (const value of [employee.code, employee.metadata?.name, employee.user?.name, employee.user?.email, ...(Array.isArray(employee.metadata?.identity_aliases) ? employee.metadata.identity_aliases : [])]) {
      const key = aliasKey(value);
      if (!key) continue;
      if (!aliases.has(key)) aliases.set(key, new Set());
      aliases.get(key).add(employee.id);
    }
  }
  const grouped = new Map();
  for (const punch of punches) {
    const candidates = aliases.get(aliasKey(punch.user_name));
    const id = punch.employee_id != null ? punch.employee_id : candidates?.size === 1 ? [...candidates][0] : null;
    if (!byId.has(id)) continue;
    const key = `${id}:${dateKey(punch.date)}`;
    if (!grouped.has(key)) grouped.set(key, { employee: byId.get(id), punches: [] });
    grouped.get(key).punches.push(punch);
  }
  const result = new Map(stored.map(day => [`${day.employee_id}:${dateKey(day.date)}`, day]));
  const routeById = new Map(routes.map(route => [route.id, route]));
  const scheduleById = new Map(schedules.map(schedule => [schedule.id, schedule]));
  const holidays = new Set([...calendarDays].filter(([, day]) => ['festivo', 'dominical', 'descanso'].includes(day.day_type)).map(([key]) => key));
  for (const [key, group] of grouped) {
    const previous = result.get(key);
    const route = routeById.get(group.punches.find(punch => punch.route_id)?.route_id);
    const assigned = scheduleById.get(previous?.schedule_id) || schedules[0];
    const routeSchedule = route?.start_time && route?.end_time && route.kind !== "descanso";
    const schedule = routeSchedule ? { id: null } : assigned || { id: null };
    const params = { ...parameters };
    if (routeSchedule) {
      const minutes = value => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
      let duration = minutes(route.end_time) - minutes(route.start_time);
      if (duration <= 0) duration += 1440;
      params.ordinary_hours_day = Math.max(1, duration - Number(params.lunch_minutes ?? 60)) / 60;
    }
    const day = processWorkday({ employee: group.employee, punches: group.punches, schedule, params, holidays, date: new Date(`${dateKey(group.punches[0].date)}T00:00:00-05:00`) });
    // Raw punches supersede stale cached hours, including incomplete/zero-minute days.
    result.delete(key);
    const breakMs = day?.exit_at ? Math.max(0, Math.min(+day.exit_at, +day.lunch_end_at) - Math.max(+day.entry_at, +day.lunch_start_at)) : 0;
    const paidMinutes = day?.exit_at ? Math.floor((day.exit_at - day.entry_at - breakMs) / 60000) : 0;
    if (day && !day.inconsistent && paidMinutes > 0 && minuteFields.reduce((sum, field) => sum + Number(day[field] || 0), 0) > 0) result.set(key, { ...day, source: 'time_punch' });
  }
  return [...result.values()].filter(day => !day.inconsistent && minuteFields.reduce((sum, field) => sum + Number(day[field] || 0), 0) > 0);
}

async function loadPayrollWorkdays({ db, tenantId, employees, start, endExclusive, parameters, calendarDays }) {
  if (!employees.length) return [];
  const range = { gte: start, lt: endExclusive };
  const routeQuery = { where: { tenant_id: tenantId, date: range }, select: { id: true, start_time: true, end_time: true } };
  const [stored, punches, schedules, routes, identityEmployees] = await Promise.all([
    db.processedWorkday.findMany({ where: { tenant_id: tenantId, employee_id: { in: employees.map(employee => employee.id) }, date: range } }),
    db.timePunch.findMany({ where: { tenant_id: tenantId, date: range }, select: { id: true, employee_id: true, user_name: true, type: true, date: true, time: true, punched_at: true, route_id: true, vehicle_plate: true }, orderBy: { punched_at: 'asc' } }),
    db.workSchedule.findMany({ where: { tenant_id: tenantId, active: true }, orderBy: { id: 'asc' } }),
    db.timeRoute.findMany({ ...routeQuery, select: { ...routeQuery.select, kind: true } }).catch(error => {
      // Older schemas have working hours but do not yet distinguish rest routes.
      if (error.code !== 'P2022' || error.meta?.column !== 'TimeRoute.kind') throw error;
      return db.timeRoute.findMany(routeQuery);
    }),
    db.employee.findMany({ where: { tenant_id: tenantId }, select: { id: true, code: true, metadata: true, user: { select: { name: true, email: true } } } })
  ]);
  return payrollWorkdays({ employees, stored, punches, schedules, routes, parameters, calendarDays, identityEmployees });
}

module.exports = { payrollWorkdays, loadPayrollWorkdays };
