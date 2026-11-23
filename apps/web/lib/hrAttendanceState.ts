export type AttendanceGroup<T> = { user_name: string; employee_id?: number | string; route_id?: number | string | null; punches: T[] };
const key = (value: unknown) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// /self/attendance is scoped by the server. Merge its name/code groups without
// crossing schedules or accepting a different explicit employee identity.
export function attendancePunches<T extends { type: string }>(groups: AttendanceGroup<T>[], employeeId: number | string | undefined, identities: string[], routeId: number | string | null | undefined, optimistic: T[] = []): T[] {
  const aliases = new Set(identities.filter(Boolean).map(key));
  const punches = groups.filter(group => {
    const sameEmployee = group.employee_id != null ? String(group.employee_id) === String(employeeId) : aliases.has(key(group.user_name));
    return sameEmployee && String(group.route_id ?? "") === String(routeId ?? "");
  }).flatMap(group => group.punches || []);
  const seen = new Set<string>();
  return [...punches, ...optimistic].filter(punch => {
    if (!punch.type || seen.has(punch.type)) return false;
    seen.add(punch.type);
    return true;
  });
}
