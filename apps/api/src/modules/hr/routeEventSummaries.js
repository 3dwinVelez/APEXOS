function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function bogotaDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function rowAliases(row) {
  const metadataAliases = Array.isArray(row?.metadata?.identity_aliases) ? row.metadata.identity_aliases : [];
  return [
    row?.employee_id,
    row?.user_name,
    row?.metadata?.employee_code,
    row?.metadata?.employee_name,
    row?.metadata?.supplied_user_name,
    row?.metadata?.user_email,
    ...metadataAliases
  ].map(normalizeKey).filter(Boolean);
}

function rowRouteKey(row) {
  return String(row?.metadata?.display_route_id || row?.metadata?.legacy_route_id || "").trim();
}

function matchesUnlinked(route, row, occurredAt) {
  if (bogotaDateKey(route.date) !== bogotaDateKey(occurredAt)) return false;
  const explicitRoute = rowRouteKey(row);
  if (explicitRoute) return explicitRoute === String(route.route_id);
  const assigned = new Set((route.assigned_aliases || []).map(normalizeKey));
  return rowAliases(row).some((alias) => assigned.has(alias));
}

function buildRouteEventSummaries({ routeContexts = [], punchGroups = [], activityGroups = [], closedGroups = [], evidenceRows = [], unlinkedPunches = [], unlinkedActivities = [] }) {
  const byRoute = (rows) => new Map(rows.map((row) => [Number(row.route_id), row]));
  const punchesByRoute = byRoute(punchGroups);
  const activitiesByRoute = byRoute(activityGroups);
  const closedByRoute = byRoute(closedGroups);
  const evidenceByRoute = new Map();
  for (const row of evidenceRows) {
    const routeId = Number(row.activity?.route_id);
    if (routeId) evidenceByRoute.set(routeId, (evidenceByRoute.get(routeId) || 0) + 1);
  }

  return routeContexts.map((route) => {
    const routeId = route.route_id;
    const punch = punchesByRoute.get(Number(routeId));
    const activity = activitiesByRoute.get(Number(routeId));
    const fallbackPunches = unlinkedPunches.filter((row) => matchesUnlinked(route, row, row.punched_at || row.date));
    const fallbackActivities = unlinkedActivities.filter((row) => matchesUnlinked(route, row, row.occurred_at));
    const punchCount = Number(punch?._count?._all || 0) + fallbackPunches.length;
    const activityCount = Number(activity?._count?._all || 0) + fallbackActivities.length;
    const timestamps = [punch?._max?.punched_at, activity?._max?.occurred_at, ...fallbackPunches.map((row) => row.punched_at), ...fallbackActivities.map((row) => row.occurred_at)]
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    return {
      route_id: routeId,
      punch_count: punchCount,
      activity_count: activityCount,
      evidence_count: (evidenceByRoute.get(Number(routeId)) || 0) + fallbackActivities.reduce((sum, row) => sum + Number(row._count?.evidence || 0), 0),
      closed_count: Number(closedByRoute.get(Number(routeId))?._count?._all || 0) + fallbackPunches.filter((row) => row.type === "salida").length,
      event_count: punchCount + activityCount,
      last_event_at: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
    };
  });
}

module.exports = { buildRouteEventSummaries };
