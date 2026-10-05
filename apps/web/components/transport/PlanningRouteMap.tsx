"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { Fragment, useEffect, useMemo, useState } from "react";

export type PlanningRouteStop = {
  label: string;
  latitude: number;
  longitude: number;
  kind: "origin" | "stop";
};

type RouteTrafficSegment = {
  start_index: number;
  end_index: number;
  speed: string;
  label: string;
  severity: "alta" | "media" | "baja" | "sin_lectura";
};

type PlanningRouteVariant = {
  id: string;
  label: string;
  polyline?: string | null;
  distance_km?: number | null;
  duration_min?: number | null;
  delay_min?: number | null;
  traffic_level?: "alto" | "medio" | "bajo" | "sin_lectura";
  traffic_segments?: RouteTrafficSegment[];
  pros?: string[];
  cons?: string[];
  issue_tags?: string[];
};

export type PlanningMapScenario = {
  id: string;
  name: string;
  stops: PlanningRouteStop[];
  distance_km: number;
  duration_min: number;
  encoded_polyline?: string | null;
  encoded_alternates?: string[];
  route_variants?: PlanningRouteVariant[];
  recommended?: boolean;
  alerts?: string[];
  benefits?: string[];
  tradeoffs?: string[];
};

type RenderedVariant = PlanningRouteVariant & {
  geometry: [number, number][];
};

type RenderedRoute = PlanningMapScenario & {
  geometry: [number, number][];
  alternates: [number, number][][];
  variants: RenderedVariant[];
  real_distance_km?: number;
  real_duration_min?: number;
  color: string;
  source: "google" | "osrm" | "planned";
};

type OsrmRoute = { distance: number; duration: number; geometry?: { coordinates?: number[][] } };

function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function detourViaPoint(from: [number, number], to: [number, number], offsetMeters: number) {
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const dy = to[0] - from[0];
  const dx = (to[1] - from[1]) * Math.cos((from[0] * Math.PI) / 180);
  const length = Math.hypot(dx, dy) || 1;
  const dLat = ((-dx / length) * offsetMeters) / 111320;
  const dLon = ((dy / length) * offsetMeters) / (111320 * Math.cos((mid[0] * Math.PI) / 180));
  return [mid[0] + dLat, mid[1] + dLon] as [number, number];
}

function longestLeg(stops: PlanningRouteStop[]) {
  let index = -1;
  let km = 0;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const legKm = haversineKm([stops[i].latitude, stops[i].longitude], [stops[i + 1].latitude, stops[i + 1].longitude]);
    if (legKm > km) { km = legKm; index = i; }
  }
  return { index, km };
}

async function fetchOsrmRoutes(path: string, { alternatives = false } = {}) {
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?${alternatives ? "alternatives=true&" : ""}overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(9000) });
    if (!response.ok) return [] as OsrmRoute[];
    const payload = await response.json() as { routes?: OsrmRoute[] };
    const routes: OsrmRoute[] = payload.routes || [];
    return routes;
  } catch {
    return [] as OsrmRoute[];
  }
}

function osrmVariantFromRoute(scenario: PlanningMapScenario, route: OsrmRoute, sequence: number): RenderedVariant | null {
  const coordinates = route.geometry?.coordinates;
  if (!coordinates?.length) return null;
  return {
    id: `${scenario.id}-osrm-${sequence}`,
    label: sequence === 1 ? "Ruta recomendada" : `Ruta alterna ${sequence}`,
    geometry: coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
    distance_km: Number((route.distance / 1000).toFixed(2)),
    duration_min: Math.max(1, Math.round(route.duration / 60)),
    delay_min: null,
    traffic_level: "sin_lectura" as const,
    traffic_segments: [],
    pros: ["Ruta vial real calculada por OSRM."],
    cons: ["Sin tráfico, obras o accidentes en vivo desde OSRM."],
    issue_tags: ["sin tráfico en vivo"],
  };
}

async function detourVariantFor(scenario: PlanningMapScenario, main: OsrmRoute, sequence: number, side: 1 | -1): Promise<RenderedVariant | null> {
  const { index, km } = longestLeg(scenario.stops);
  if (index < 0 || km < 1) return null;
  const from: [number, number] = [scenario.stops[index].latitude, scenario.stops[index].longitude];
  const to: [number, number] = [scenario.stops[index + 1].latitude, scenario.stops[index + 1].longitude];
  const via = detourViaPoint(from, to, Math.min(Math.max(km * 380, 650), 2600) * side);
  const waypoints = scenario.stops.map((stop) => `${stop.longitude.toFixed(6)},${stop.latitude.toFixed(6)}`);
  waypoints.splice(index + 1, 0, `${via[1].toFixed(6)},${via[0].toFixed(6)}`);
  const routes = await fetchOsrmRoutes(waypoints.join(";"));
  const route = routes[0];
  if (!route || !route.geometry?.coordinates?.length) return null;
  if (route.distance < main.distance * 1.04) return null;
  const variant = osrmVariantFromRoute(scenario, route, sequence);
  if (!variant) return null;
  variant.delay_min = Math.max(0, Math.round((route.duration - main.duration) / 60));
  variant.pros = ["Corredor vial real alternativo por vía desplazada (OSRM)."];
  variant.issue_tags = ["corredor desplazado", "sin tráfico en vivo"];
  return variant;
}

async function osrmVariantsForScenario(scenario: PlanningMapScenario): Promise<{ variants: RenderedVariant[]; distance_km: number; duration_min: number } | null> {
  if (scenario.stops.length < 2) return null;
  const routes = await fetchOsrmRoutes(coordinatePath(scenario.stops), { alternatives: true });
  const main = routes[0];
  if (!main) return null;
  const variants: RenderedVariant[] = [];
  const mainVariant = osrmVariantFromRoute(scenario, main, 1);
  if (mainVariant) variants.push(mainVariant);
  for (const alternate of routes.slice(1, 4)) {
    const variant = osrmVariantFromRoute(scenario, alternate, variants.length + 1);
    if (!variant) continue;
    variant.delay_min = Math.max(0, Math.round((alternate.duration - main.duration) / 60));
    variants.push(variant);
  }
  for (const side of [1, -1] as const) {
    if (variants.length >= 3) break;
    const detour = await detourVariantFor(scenario, main, variants.length + 1, side);
    if (detour) variants.push(detour);
  }
  if (!variants.length) return null;
  return { variants, distance_km: Number((main.distance / 1000).toFixed(2)), duration_min: Math.max(1, Math.round(main.duration / 60)) };
}

const COLORS = ["#146C63", "#2563eb", "#f59e0b", "#7c3aed", "#dc2626", "#0f766e", "#be123c", "#475569"];

function fallbackGeometry(stops: PlanningRouteStop[]) {
  return stops.map((stop) => [stop.latitude, stop.longitude] as [number, number]);
}

function coordinatePath(stops: PlanningRouteStop[]) {
  return stops.map((stop) => `${stop.longitude},${stop.latitude}`).join(";");
}

function decodeGooglePolyline(encoded: string) {
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates: [number, number][] = [];
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([latitude / 1e5, longitude / 1e5]);
  }
  return coordinates;
}

async function complementWithOsrmDetours(scenario: PlanningMapScenario, existing: RenderedVariant[]) {
  if (existing.length >= 3) return existing;
  const routes = await fetchOsrmRoutes(coordinatePath(scenario.stops));
  const main = routes[0];
  if (!main || !main.geometry?.coordinates?.length) return existing;
  const combined = [...existing];
  for (const side of [1, -1] as const) {
    if (combined.length >= 3) break;
    const detour = await detourVariantFor(scenario, main, combined.length + 1, side);
    if (!detour) continue;
    detour.id = `${scenario.id}-detour-${side > 0 ? "n" : "s"}${combined.length}`;
    detour.label = `Ruta alterna ${combined.length + 1}`;
    detour.delay_min = Math.max(0, (detour.duration_min ?? 0) - (existing[0]?.duration_min ?? 0));
    combined.push(detour);
  }
  return combined;
}

async function fetchRoute(scenario: PlanningMapScenario, index: number): Promise<RenderedRoute> {
  const fallback: RenderedRoute = { ...scenario, geometry: fallbackGeometry(scenario.stops), alternates: [], variants: [], color: COLORS[index % COLORS.length], source: "planned" };
  if (scenario.stops.length < 2) return fallback;
  const googleVariants = (scenario.route_variants || []).flatMap((variant) => {
    if (!variant.polyline) return [];
    const geometry = decodeGooglePolyline(variant.polyline);
    return geometry.length ? [{ ...variant, geometry }] : [];
  });
  if (googleVariants.length) {
    const variants = googleVariants.length >= 2 ? googleVariants : await complementWithOsrmDetours(scenario, googleVariants);
    return { ...fallback, geometry: variants[0].geometry, variants: variants.slice(0, 4), source: "google" };
  }
  if (scenario.encoded_polyline) {
    const geometry = decodeGooglePolyline(scenario.encoded_polyline);
    const alternates = (scenario.encoded_alternates || []).flatMap((encoded) => {
      const decoded = decodeGooglePolyline(encoded);
      return decoded.length ? [decoded] : [];
    });
    if (geometry.length) return { ...fallback, geometry, alternates, source: "google" };
  }
  const osrm = await osrmVariantsForScenario(scenario);
  if (osrm) {
    return { ...fallback, geometry: osrm.variants[0].geometry, variants: osrm.variants.slice(0, 4), real_distance_km: osrm.distance_km, real_duration_min: osrm.duration_min, source: "osrm" };
  }
  return fallback;
}

function trafficColor(severity?: RouteTrafficSegment["severity"]) {
  if (severity === "alta") return "#dc2626";
  if (severity === "media") return "#f59e0b";
  if (severity === "baja") return "#16a34a";
  return "#64748b";
}

function trafficLabel(value?: PlanningRouteVariant["traffic_level"]) {
  if (value === "alto") return "Alto";
  if (value === "medio") return "Medio";
  if (value === "bajo") return "Bajo";
  return "Sin lectura";
}

function segmentGeometry(geometry: [number, number][], segment: RouteTrafficSegment) {
  const start = Math.max(0, Math.min(segment.start_index, geometry.length - 1));
  const end = Math.max(start + 1, Math.min(segment.end_index || start + 1, geometry.length));
  return geometry.slice(start, end + 1);
}

function midpoint(geometry: [number, number][]) {
  return geometry[Math.max(0, Math.floor(geometry.length / 2))] || geometry[0];
}

function segmentPoint(geometry: [number, number][], segment: RouteTrafficSegment) {
  const points = segmentGeometry(geometry, segment);
  return midpoint(points.length ? points : geometry);
}

function issueLabel(segment: RouteTrafficSegment) {
  if (segment.severity === "alta") return "!";
  if (segment.severity === "media") return "~";
  return "OK";
}

function RoutePopup({ route, scenario }: { route: RenderedVariant; scenario: PlanningMapScenario }) {
  const pros = route.pros?.length ? route.pros : scenario.benefits || [];
  const cons = route.cons?.length ? route.cons : [...(scenario.tradeoffs || []), ...(scenario.alerts || [])];
  return <Popup>
    <div className="min-w-[240px] space-y-2 text-sm">
      <div>
        <p className="font-semibold">{route.label}</p>
        <p className="text-xs text-neutral-500">{scenario.name}</p>
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <span><strong className="block">{route.distance_km ?? scenario.distance_km} km</strong>distancia</span>
        <span><strong className="block">{route.duration_min ?? scenario.duration_min} min</strong>ETA</span>
        <span><strong className="block">{route.delay_min != null ? `+${route.delay_min} min` : "—"}</strong>demora</span>
        <span><strong className="block">{trafficLabel(route.traffic_level)}</strong>trafico</span>
      </div>
      {route.issue_tags?.length ? <div className="flex flex-wrap gap-1">{route.issue_tags.map((tag) => <span className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800" key={tag}>{tag}</span>)}</div> : null}
      <div>
        <p className="text-xs font-semibold uppercase text-emerald-700">Pros</p>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">{pros.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-amber-700">Contras</p>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">{(cons.length ? cons : ["Sin problemas reportados por el proveedor."]).slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </div>
  </Popup>;
}

function boundsFor(routes: RenderedRoute[], scenarios: PlanningMapScenario[]) {
  const points = [
    ...scenarios.flatMap((scenario) => scenario.stops.map((stop) => [stop.latitude, stop.longitude] as [number, number])),
    ...routes.flatMap((route) => [route.geometry, ...route.alternates, ...route.variants.map((variant) => variant.geometry)].flat()),
  ];
  return points.length ? points : [[4.65, -74.1] as [number, number]];
}

function FitBounds({ routes, scenarios }: { routes: RenderedRoute[]; scenarios: PlanningMapScenario[] }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(boundsFor(routes, scenarios), { padding: [28, 28], maxZoom: 14 });
  }, [map, routes, scenarios]);
  return null;
}

export default function PlanningRouteMap({ scenarios, selectedId, onSelect }: { scenarios: PlanningMapScenario[]; selectedId?: string; onSelect?: (id: string) => void }) {
  const [routes, setRoutes] = useState<RenderedRoute[]>([]);
  const [status, setStatus] = useState("Calculando rutas viales...");
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const routeKey = useMemo(() => scenarios.map((scenario) => `${scenario.id}:${coordinatePath(scenario.stops)}:${scenario.encoded_polyline || ""}:${scenario.route_variants?.map((variant) => variant.polyline || variant.id).join(",") || ""}`).join("|"), [scenarios]);
  const selected = selectedId || routes.find((route) => route.recommended)?.id || routes[0]?.id;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!scenarios.length) {
        setRoutes([]);
        setStatus("No hay escenarios para trazar.");
        return;
      }
      setStatus("Calculando rutas viales reales...");
      const next = await Promise.all(scenarios.map((scenario, index) => fetchRoute(scenario, index)));
      if (cancelled) return;
      setRoutes(next);
      setActiveVariantId(next.find((route) => route.id === selected)?.variants[0]?.id || next[0]?.variants[0]?.id || null);
      setStatus(next.some((route) => route.source === "google") ? "Rutas y alternativas calculadas con Google Routes desde backend." : next.some((route) => route.source === "osrm") ? "Rutas viales reales calculadas con OpenStreetMap/OSRM." : "Proveedor vial no disponible; se muestran rutas planeadas como respaldo.");
    }
    void load();
    return () => { cancelled = true; };
  }, [routeKey, scenarios]);

  const firstStop = scenarios[0]?.stops[0];
  const selectedRoute = routes.find((route) => route.id === selected) || routes[0];
  const activeVariant = selectedRoute?.variants.find((variant) => variant.id === activeVariantId) || selectedRoute?.variants[0];

  return (
    <section className="overflow-hidden rounded-md border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="font-semibold">Mapa de rutas y alternativas</h3>
          <p className="mt-1 text-xs text-neutral-500">{status}</p>
        </div>
        <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-apex">{selectedRoute?.variants.length || scenarios.length} ruta(s) reales visibles</span>
      </div>
      <div className="relative p-3">
        <MapContainer center={[firstStop?.latitude || 4.65, firstStop?.longitude || -74.1]} className="h-[680px] min-h-[520px] w-full rounded-md" scrollWheelZoom zoom={12}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds routes={routes} scenarios={scenarios} />
          {routes.map((route) => (
            <Fragment key={route.id}>
              {route.variants.map((variant, variantIndex) => (
                <Fragment key={variant.id}>
                  <Polyline pathOptions={{ color: COLORS[variantIndex % COLORS.length], opacity: activeVariant?.id === variant.id ? 0.98 : selected === route.id ? 0.42 : 0.18, weight: activeVariant?.id === variant.id ? 8 : 4 }} positions={variant.geometry} eventHandlers={{ click: () => { setActiveVariantId(variant.id); onSelect?.(route.id); }, mouseover: () => setActiveVariantId(variant.id) }}>
                    <Tooltip direction="top" opacity={0.94}>
                      <span className="text-[11px] font-semibold">{variant.label} · {variant.distance_km ?? route.distance_km} km · {variant.duration_min ?? route.duration_min} min{variant.delay_min ? ` · +${variant.delay_min} min` : ""} · Tráfico {trafficLabel(variant.traffic_level)}</span>
                    </Tooltip>
                    <RoutePopup route={variant} scenario={route} />
                  </Polyline>
                  {activeVariant?.id === variant.id ? (variant.traffic_segments || []).filter((segment) => segment.severity !== "sin_lectura").map((segment, segmentIndex) => {
                    const positions = segmentGeometry(variant.geometry, segment);
                    return positions.length > 1 ? <Polyline key={`${variant.id}-traffic-${segmentIndex}`} pathOptions={{ color: trafficColor(segment.severity), opacity: selected === route.id ? 0.9 : 0.35, weight: selected === route.id ? 8 : 5 }} positions={positions} eventHandlers={{ click: () => onSelect?.(route.id) }}>
                      <Popup><strong>{segment.label}</strong><br />{variant.label}<br />{trafficLabel(variant.traffic_level)}</Popup>
                    </Polyline> : null;
                  }) : null}
                  {activeVariant?.id === variant.id ? (variant.traffic_segments || []).filter((segment) => segment.severity !== "sin_lectura" && segment.severity !== "baja").map((segment, segmentIndex) => {
                    const point = segmentPoint(variant.geometry, segment);
                    return <CircleMarker center={point} key={`${variant.id}-issue-${segmentIndex}`} pathOptions={{ color: trafficColor(segment.severity), fillColor: "#ffffff", fillOpacity: 0.96, weight: 3 }} radius={14}>
                      <Tooltip direction="top" opacity={0.96} permanent>{issueLabel(segment)} {segment.label}</Tooltip>
                      <Popup><strong>{segment.label}</strong><br />{variant.label}<br />Revisar antes de confirmar.</Popup>
                    </CircleMarker>;
                  }) : null}
                </Fragment>
              ))}
              {route.alternates.map((alternate, alternateIndex) => <Polyline key={`${route.id}-alt-${alternateIndex}`} pathOptions={{ color: route.color, dashArray: "8 8", opacity: selected === route.id ? 0.35 : 0.12, weight: 3 }} positions={alternate} eventHandlers={{ click: () => onSelect?.(route.id) }} />)}
              {!route.variants.length ? <Polyline pathOptions={{ color: route.color, opacity: selected === route.id ? 0.95 : 0.45, weight: selected === route.id ? 7 : 4 }} positions={route.geometry} eventHandlers={{ click: () => onSelect?.(route.id) }} /> : null}
            </Fragment>
          ))}
          {scenarios[0]?.stops.map((stop, index) => (
            <CircleMarker center={[stop.latitude, stop.longitude]} key={`${stop.kind}-${index}`} pathOptions={{ color: "#146C63", fillColor: stop.kind === "origin" ? "#146C63" : "#ffffff", fillOpacity: 1, weight: 3 }} radius={stop.kind === "origin" ? 9 : 8}>
              <Popup>{stop.kind === "origin" ? "Origen" : `Parada ${index}`}<br />{stop.label}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
        {selectedRoute?.variants.length ? <div className="pointer-events-none absolute left-5 top-5 z-[460] grid max-w-[360px] gap-2">
          {selectedRoute.variants.map((variant, index) => <button className={`pointer-events-auto rounded-md border bg-white/95 px-3 py-2 text-left text-xs shadow-sm backdrop-blur ${activeVariant?.id === variant.id ? "border-apex ring-1 ring-apex" : "border-line"}`} key={variant.id} onClick={() => { setActiveVariantId(variant.id); onSelect?.(selectedRoute.id); }} type="button">
            <span className="flex items-center justify-between gap-3">
              <strong className="inline-flex items-center gap-2 text-sm"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{variant.label}</strong>
              <span className="rounded bg-paper px-2 py-0.5 font-semibold text-apex">{trafficLabel(variant.traffic_level)}</span>
            </span>
            <span className="mt-1 block text-neutral-600">{variant.duration_min ?? selectedRoute.duration_min} min · {variant.distance_km ?? selectedRoute.distance_km} km{variant.delay_min ? ` · +${variant.delay_min} min` : ""} · {variant.issue_tags?.slice(0, 2).join(" · ")}</span>
          </button>)}
          {selectedRoute.variants.length < 2 ? <div className="pointer-events-auto rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm backdrop-blur">
            Solo se pudo trazar {selectedRoute.variants.length} ruta vial real para este escenario. Las alternativas se calculan sobre calles reales (OSRM/Google); nunca se dibujan rutas inventadas.
          </div> : null}
        </div> : null}
        <div className="pointer-events-none absolute bottom-5 left-5 z-[460] flex flex-wrap gap-2 rounded-md bg-white/95 p-2 text-[11px] shadow-sm backdrop-blur">
          <span className="font-semibold text-neutral-700">Condiciones:</span>
          <span className="text-emerald-700">verde flujo</span>
          <span className="text-amber-700">ambar lento/obra posible</span>
          <span className="text-rose-700">rojo congestion/incidente posible</span>
        </div>
      </div>
    </section>
  );
}
