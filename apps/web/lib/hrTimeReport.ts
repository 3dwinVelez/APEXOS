type IdentityEmployee = { id: number | string; code: string; metadata?: { name?: string; identity_aliases?: string[] }; user?: { name?: string; email?: string } };
type IdentityPunch = { employee_id?: number | string | null; user_name: string };
const alias = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

export function reportEmployee<T extends IdentityEmployee>(punch: IdentityPunch, employees: T[]) {
  if (punch.employee_id != null) return employees.find(employee => String(employee.id) === String(punch.employee_id));
  const name = alias(punch.user_name);
  if (!name) return undefined;
  const matches = employees.filter(employee => [employee.id, employee.code, employee.metadata?.name, employee.user?.name, employee.user?.email, ...(employee.metadata?.identity_aliases || [])].some(value => alias(value) === name));
  return matches.length === 1 ? matches[0] : undefined;
}

export function reportIdentity(punch: IdentityPunch, employees: IdentityEmployee[]) {
  return String(punch.employee_id ?? reportEmployee(punch, employees)?.id ?? `legacy:${alias(punch.user_name)}`);
}

export const timeReportColumns = [
  { key: "overtime_day_minutes", label: "Extra diurna" },
  { key: "overtime_night_minutes", label: "Extra nocturna" },
  { key: "ordinary_night_minutes", label: "Recargo nocturno" },
  { key: "overtime_sunday_holiday_day_minutes", label: "Extra diurna dom/fest" },
  { key: "overtime_sunday_holiday_night_minutes", label: "Extra nocturna dom/fest" },
  { key: "ordinary_sunday_holiday_day_minutes", label: "Recargo dom/fest diurno" },
  { key: "ordinary_sunday_holiday_night_minutes", label: "Recargo dom/fest nocturno" }
] as const;
export type TimeReportSummary = { employee_id: number | string; date: string; worked_minutes: number; overtime_minutes: number; alerts: string[] } & Record<(typeof timeReportColumns)[number]["key"], number>;
