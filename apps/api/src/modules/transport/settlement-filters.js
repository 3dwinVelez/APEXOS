// Inclusive calendar dates, using an exclusive next-day bound for timestamps.
function settlementDateRange(query = {}) {
  const parse = (value, name) => {
    if (value == null || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw Object.assign(new Error(`${name} debe ser una fecha válida (AAAA-MM-DD).`), { statusCode: 400, code: "TMS_SETTLEMENT_DATE_FILTER" });
    return new Date(value + "T00:00:00.000Z");
  };
  const from = parse(query.date_from, "Desde"), to = parse(query.date_to, "Hasta");
  if (from && to && from > to) throw Object.assign(new Error("La fecha inicial no puede ser posterior a la final."), { statusCode: 400, code: "TMS_SETTLEMENT_DATE_FILTER" });
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}) } : null;
}
module.exports = { settlementDateRange };
