type DisplayDocument = {
  days_worked?: number; ordinary_hours?: number; overtime_hrs?: number;
  gross: number; deductions: number; net: number;
  source_summary?: Record<string, unknown>;
};

export function payrollHours(value: unknown) {
  const minutes = Math.round(Number(value || 0) * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function payrollDisplayRows<T extends DisplayDocument>(rows: T[]): T[] {
  return rows.filter((row) => [row.days_worked, row.ordinary_hours, row.overtime_hrs,
    row.source_summary?.days_worked, row.source_summary?.ordinary_hours,
    row.gross, row.deductions, row.net].some((value) => Number(value || 0) !== 0));
}

export function payrollDisplayTotals(rows: DisplayDocument[]) {
  return rows.reduce<{ days: number; ordinaryHours: number; overtimeHours: number; gross: number; deductions: number; net: number; negativeCount: number }>((total, row) => ({
    days: total.days + Number(row.days_worked ?? row.source_summary?.days_worked ?? 0),
    ordinaryHours: total.ordinaryHours + Number(row.ordinary_hours ?? row.source_summary?.ordinary_hours ?? 0),
    overtimeHours: total.overtimeHours + Number(row.overtime_hrs || 0),
    gross: total.gross + Number(row.gross || 0),
    deductions: total.deductions + Number(row.deductions || 0),
    net: total.net + Number(row.net || 0),
    negativeCount: total.negativeCount + (Number(row.net) < 0 ? 1 : 0)
  }), { days: 0, ordinaryHours: 0, overtimeHours: 0, gross: 0, deductions: 0, net: 0, negativeCount: 0 });
}
