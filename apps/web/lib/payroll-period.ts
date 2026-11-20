export function payrollPeriodError(type: string, start: string, end: string): string {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(start) || !validDate(end)) return "Selecciona fechas validas para el periodo de nomina.";
  if (end < start) return "La fecha final no puede ser menor que la inicial.";
  if (start.slice(0, 7) !== end.slice(0, 7)) return "El periodo de nomina debe pertenecer al mismo mes.";
  if (!["quincena", "mes"].includes(type)) return "Selecciona un tipo de periodo de nomina valido.";
  if (type === "quincena") {
    const last = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).getUTCDate();
    const firstDay = Number(start.slice(8)), lastDay = Number(end.slice(8));
    if (!((firstDay === 1 && lastDay === 15) || (firstDay === 16 && lastDay === last))) return "La nomina quincenal debe ir del 1 al 15 o del 16 al ultimo dia del mes.";
  }
  return "";
}
