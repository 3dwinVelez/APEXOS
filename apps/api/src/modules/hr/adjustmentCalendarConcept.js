// A reference date cannot classify every day of an accumulated ordinary period.
function adjustmentCalendarConcept(adjustment = {}, dayType = "ordinario") {
  const code = String(adjustment.concept_code || "").trim().toUpperCase();
  if (code !== "JORNADA_ORDINARIA") return { code, accumulated: false };
  const metadata = adjustment.metadata || {};
  const start = String(metadata.date_start || adjustment.date_start || "").slice(0, 10);
  const end = String(metadata.date_end || adjustment.date_end || "").slice(0, 10);
  const days = Number(metadata.days || metadata.dias || 0);
  const accumulated = days > 1 || Boolean(start && end && start !== end)
    || Number(adjustment.minutes || 0) > 1440;
  return {
    code: !accumulated && ["festivo", "dominical", "no_laboral"].includes(dayType) ? "DOM_FEST_DIURNO" : code,
    accumulated
  };
}

module.exports = { adjustmentCalendarConcept };
