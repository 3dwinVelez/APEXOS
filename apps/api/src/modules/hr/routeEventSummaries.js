function buildRouteEventSummaries({ routeIds = [], punchGroups = [], activityGroups = [], closedGroups = [], evidenceRows = [] }) {
  const byRoute = (rows) => new Map(rows.map((row) => [Number(row.route_id), row]));
  const punchesByRoute = byRoute(punchGroups);
  const activitiesByRoute = byRoute(activityGroups);
  const closedByRoute = byRoute(closedGroups);
  const evidenceByRoute = new Map();
  for (const row of evidenceRows) {
    const routeId = Number(row.activity?.route_id);
    if (routeId) evidenceByRoute.set(routeId, (evidenceByRoute.get(routeId) || 0) + 1);
  }

  return routeIds.map((routeId) => {
    const punch = punchesByRoute.get(Number(routeId));
    const activity = activitiesByRoute.get(Number(routeId));
    const punchCount = Number(punch?._count?._all || 0);
    const activityCount = Number(activity?._count?._all || 0);
    const timestamps = [punch?._max?.punched_at, activity?._max?.occurred_at]
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    return {
      route_id: routeId,
      punch_count: punchCount,
      activity_count: activityCount,
      evidence_count: evidenceByRoute.get(Number(routeId)) || 0,
      closed_count: Number(closedByRoute.get(Number(routeId))?._count?._all || 0),
      event_count: punchCount + activityCount,
      last_event_at: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
    };
  });
}

module.exports = { buildRouteEventSummaries };
