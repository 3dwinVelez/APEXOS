"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { Fragment, useEffect, useMemo, useState } from "react";

export type PlanningRouteStop = {
  label: string;
  latitude: number;
  longitude: number;
  kind: "origin" | "stop";
};

export type PlanningMapScenario = {
  id: string;
  name: string;
  stops: PlanningRouteStop[];
  distance_km: number;
  duration_min: number;
  encoded_polyline?: string | null;
  encoded_alternates?: string[];
  recommended?: boolean;
  alerts?: string[];
  benefits?: string[];
  tradeoffs?: string[];
};

type RenderedRoute = PlanningMapScenario & {
  geometry: [number, number][];
  alternates: [number, number][][];
  real_distance_km?: number;
  real_duration_min?: number;
  color: string;
  source: "google" | "osrm" | "planned";
};

type OsrmRoute = { distance: number; duration: number; geometry?: { coordinates?: number[][] } };

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

async function fetchRoute(scenario: PlanningMapScenario, index: number): Promise<RenderedRoute> {
  const fallback: RenderedRoute = { ...scenario, geometry: fallbackGeometry(scenario.stops), alternates: [], color: COLORS[index % COLORS.length], source: "planned" };
  if (scenario.stops.length < 2) return fallback;
  if (scenario.encoded_polyline) {
    const geometry = decodeGooglePolyline(scenario.encoded_polyline);
    const alternates = (scenario.encoded_alternates || []).flatMap((encoded) => {
      const decoded = decodeGooglePolyline(encoded);
      return decoded.length ? [decoded] : [];
    });
    if (geometry.length) return { ...fallback, geometry, alternates, source: "google" };
  }
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinatePath(scenario.stops)}?alternatives=true&overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(9000) });
    if (!response.ok) return fallback;
    const payload = await response.json() as { routes?: OsrmRoute[] };
    const route = payload.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (!route || !coordinates?.length) return fallback;
    return {
      ...scenario,
      geometry: coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
      alternates: (payload.routes || []).slice(1, 4).flatMap((alternate) => {
        const alternateCoordinates = alternate.geometry?.coordinates;
        return alternateCoordinates?.length ? [alternateCoordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number])] : [];
      }),
      real_distance_km: Number((route.distance / 1000).toFixed(2)),
      real_duration_min: Math.max(1, Math.round(route.duration / 60)),
      color: COLORS[index % COLORS.length],
      source: "osrm",
    };
  } catch {
    return fallback;
  }
}

function boundsFor(routes: RenderedRoute[], scenarios: PlanningMapScenario[]) {
  const points = [
    ...scenarios.flatMap((scenario) => scenario.stops.map((stop) => [stop.latitude, stop.longitude] as [number, number])),
    ...routes.flatMap((route) => [route.geometry, ...route.alternates].flat()),
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
  const routeKey = useMemo(() => scenarios.map((scenario) => `${scenario.id}:${coordinatePath(scenario.stops)}:${scenario.encoded_polyline || ""}`).join("|"), [scenarios]);
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
      setStatus(next.some((route) => route.source === "google") ? "Rutas y alternativas calculadas con Google Routes desde backend." : next.some((route) => route.source === "osrm") ? "Rutas viales reales calculadas con OpenStreetMap/OSRM." : "Proveedor vial no disponible; se muestran rutas planeadas como respaldo.");
    }
    void load();
    return () => { cancelled = true; };
  }, [routeKey, scenarios]);

  const firstStop = scenarios[0]?.stops[0];

  return (
    <section className="overflow-hidden rounded-md border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="font-semibold">Mapa de rutas y alternativas</h3>
          <p className="mt-1 text-xs text-neutral-500">{status}</p>
        </div>
        <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-apex">{scenarios.length} escenario(s)</span>
      </div>
      <div className="p-3">
        <MapContainer center={[firstStop?.latitude || 4.65, firstStop?.longitude || -74.1]} className="h-[560px] min-h-[420px] w-full rounded-md" scrollWheelZoom zoom={12}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds routes={routes} scenarios={scenarios} />
          {routes.map((route) => (
            <Fragment key={route.id}>
              {route.alternates.map((alternate, alternateIndex) => <Polyline key={`${route.id}-alt-${alternateIndex}`} pathOptions={{ color: route.color, dashArray: "8 8", opacity: selected === route.id ? 0.35 : 0.12, weight: 3 }} positions={alternate} eventHandlers={{ click: () => onSelect?.(route.id) }} />)}
              <Polyline pathOptions={{ color: route.color, opacity: selected === route.id ? 0.95 : 0.45, weight: selected === route.id ? 7 : 4 }} positions={route.geometry} eventHandlers={{ click: () => onSelect?.(route.id) }} />
            </Fragment>
          ))}
          {scenarios[0]?.stops.map((stop, index) => (
            <CircleMarker center={[stop.latitude, stop.longitude]} key={`${stop.kind}-${index}`} pathOptions={{ color: "#146C63", fillColor: stop.kind === "origin" ? "#146C63" : "#ffffff", fillOpacity: 1, weight: 3 }} radius={stop.kind === "origin" ? 9 : 8}>
              <Popup>{stop.kind === "origin" ? "Origen" : `Parada ${index}`}<br />{stop.label}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </section>
  );
}
