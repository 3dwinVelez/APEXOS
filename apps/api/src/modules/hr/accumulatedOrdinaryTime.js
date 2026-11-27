const { adjustmentCalendarConcept } = require("./adjustmentCalendarConcept");

// Salary-equivalent hours for a reported total of ordinary days. Explicit hours
// and single worked days are handled by their existing paths in the caller.
function accumulatedOrdinaryMinutes(adjustment = {}, monthlyOrdinaryHours) {
  if (!adjustmentCalendarConcept(adjustment).accumulated) return null;
  const days = Number(adjustment.metadata?.days || adjustment.metadata?.dias || 0);
  const monthly = Number(monthlyOrdinaryHours);
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(monthly) || monthly <= 0) return null;
  return days * monthly * 60 / 30;
}

module.exports = { accumulatedOrdinaryMinutes };
