"use client";

import { api } from "@/lib/api";
import { ArrowLeft, CalendarDays, Clock, ExternalLink, LocateFixed, MapPin, RefreshCw, Route, Satellite, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PointerEvent } from "react";

type GpsPoint = {
  id: string;
  user_name: string;
  vehicle_plate: string;
  route_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  captured_at: string;
};

type OperatorPoint = {
  key: string;
  employee_id: string | null;
  user_name: string;
  name: string;
  route_id: string;
  route_label: string;
  vehicle_plate: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  captured_at: string | null;
  age_seconds: number | null;
  online: boolean;
  footprint_source: "live" | "last_known" | "punch" | "none";
  last_punch_type: string;
  last_punch_time: string;
  status: string;
  time_in_route_minutes: number | null;
  route_start_time: string;
  route_end_time: string;
};

type PunchPoint = {
  id: string;
  user_name: string;
  type: string;
  time: string;
  punched_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  vehicle_plate: string;
  route_id: string | null;
  extra_minutes: number;
  metadata?: Record<string, unknown>;
};

type RouteSummary = {
  id: string;
  vehicle_plate: string;
  employees: string[];
  start_time: string;
  end_time: string;
  status: string;
  assigned_count: number;
  online_count: number;
  with_gps_count: number;
  pings: GpsPoint[];
  punch_points: PunchPoint[];
  marks_by_user: Array<{ user_name: string; marks: PunchPoint[] }>;
};

type OperationsMap = {
  date: string;
  generated_at: string;
  active_window_minutes: number;
  people: OperatorPoint[];
  routes: RouteSummary[];
  totals: { routes: number; planned_people: number; online: number; without_gps: number; offline: number };
};

const TILE_SIZE = 256;
const LIVE_REFRESH_SECONDS = 10;
const DEFAULT_CENTER = { latitude: 4.711, longitude: -74.0721 };
const statusTone: Record<string, string> = {
  "En ruta": "bg-emerald-500",
  Trabajando: "bg-sky-500",
  Almuerzo: "bg-amber-500",
  Finalizo: "bg-violet-500",
  "Sin senal": "bg-red-500",
  "Sin GPS": "bg-neutral-400",
  "Ultima marca": "bg-orange-500",
  "Sin iniciar": "bg-neutral-400"
};
const punchLabel: Record<string, string> = {
  entrada: "Ingreso",
  inicio_almuerzo: "Almuerzo",
  fin_almuerzo: "Retorno",
  salida: "Cierre"
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function mapsUrl(point: { latitude: number | null; longitude: number | null }) {
  return point.latitude != null && point.longitude != null ? `https://www.google.com/maps?q=${point.latitude},${point.longitude}&z=17` : "";
}

function initials(name: string) {
  return (name || "--").split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function minutesLabel(minutes: number | null) {
  if (minutes == null) return "--";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function ageLabel(seconds: number | null) {
  if (seconds == null) return "sin GPS";
  if (seconds < 60) return "ahora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)}h`;
}

function currentAgeSeconds(person: OperatorPoint, now: number) {
  if (!person.captured_at) return person.age_seconds;
  return Math.max(0, Math.round((now - new Date(person.captured_at).getTime()) / 1000));
}

function project(latitude: number, longitude: number, zoom: number) {
  const sin = Math.sin((latitude * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  };
}

function unproject(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale)));
  return { latitude, longitude };
}

function tileUrl(x: number, y: number, zoom: number) {
  const n = 2 ** zoom;
  const wrappedX = ((x % n) + n) % n;
  return `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
}

function pointOffset(point: { latitude: number; longitude: number }, center: { latitude: number; longitude: number }, zoom: number) {
  const projected = project(point.latitude, point.longitude, zoom);
  const centerProjected = project(center.latitude, center.longitude, zoom);
  return { x: projected.x - centerProjected.x, y: projected.y - centerProjected.y };
}

function centerFrom(points: OperatorPoint[]) {
  const located = points.filter((point) => point.latitude != null && point.longitude != null);
  if (!located.length) return DEFAULT_CENTER;
  return {
    latitude: located.reduce((sum, point) => sum + Number(point.latitude), 0) / located.length,
    longitude: located.reduce((sum, point) => sum + Number(point.longitude), 0) / located.length
  };
}

function MapTiles({ center, zoom }: { center: { latitude: number; longitude: number }; zoom: number }) {
  const centerWorld = project(center.latitude, center.longitude, zoom);
  const centerTileX = Math.floor(centerWorld.x / TILE_SIZE);
  const centerTileY = Math.floor(centerWorld.y / TILE_SIZE);
  const tiles = [];
  for (let x = centerTileX - 4; x <= centerTileX + 4; x += 1) {
    for (let y = centerTileY - 3; y <= centerTileY + 3; y += 1) {
      if (y < 0 || y >= 2 ** zoom) continue;
      tiles.push({ x, y, left: x * TILE_SIZE - centerWorld.x, top: y * TILE_SIZE - centerWorld.y });
    }
  }
  return (
    <>
      {tiles.map((tile) => (
        <img
          alt=""
          className="absolute h-64 w-64 select-none"
          draggable={false}
          key={`${tile.x}-${tile.y}-${zoom}`}
          src={tileUrl(tile.x, tile.y, zoom)}
          style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }}
        />
      ))}
    </>
  );
}

function RouteTrail({ points, center, zoom, color = "#0ea5e9", dashed = false }: { points: Array<{ latitude: number; longitude: number }>; center: { latitude: number; longitude: number }; zoom: number; color?: string; dashed?: boolean }) {
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  if (valid.length < 2) return null;
  const coords = valid.map((point) => {
    const offset = pointOffset(point, center, zoom);
    return `${1000 + offset.x},${600 + offset.y}`;
  });
  return (
    <svg className="pointer-events-none absolute left-1/2 top-1/2 h-[1200px] w-[2000px] -translate-x-1/2 -translate-y-1/2" viewBox="0 0 2000 1200">
      <polyline fill="none" points={coords.join(" ")} stroke={color} strokeDasharray={dashed ? "10 8" : undefined} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
    </svg>
  );
}

export default function LiveGpsMapPage() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<OperationsMap | null>(null);
  const [mode, setMode] = useState<"vivo" | "historico">("vivo");
  const [selectedKey, setSelectedKey] = useState("");
  const [routeId, setRouteId] = useState<string | "all">("all");
  const [userName, setUserName] = useState("all");
  const [status, setStatus] = useState<"all" | "online" | "offline" | "nogps">("all");
  const [selectedMark, setSelectedMark] = useState<PunchPoint | null>(null);
  const [zoom, setZoom] = useState(13);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshIn, setRefreshIn] = useState(LIVE_REFRESH_SECONDS);
  const [now, setNow] = useState(Date.now());
  const [followSelected, setFollowSelected] = useState(true);
  const [drag, setDrag] = useState<{ x: number; y: number; center: { latitude: number; longitude: number } } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await api<OperationsMap>(`/api/v1/hr/operations-map?date=${date}&minutes=${mode === "vivo" ? 30 : 1440}&footprint_days=30`);
      setData(response);
      setLastUpdated(response.generated_at || new Date().toISOString());
      setRefreshIn(LIVE_REFRESH_SECONDS);
      setSelectedKey((current) => current || response.people.find((person) => person.latitude != null)?.key || "");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
    const timer = mode === "vivo" ? window.setInterval(() => load().catch(() => undefined), LIVE_REFRESH_SECONDS * 1000) : null;
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [date, mode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (mode === "vivo") setRefreshIn((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode === "vivo") setDate(today());
  }, [mode]);

  useEffect(() => {
    setSelectedMark(null);
    setSelectedKey("");
  }, [routeId, userName, status, date, mode]);

  const people = data?.people || [];
  const routes = data?.routes || [];
  const activeWindowSeconds = (data?.active_window_minutes || 30) * 60;
  const users = useMemo(() => Array.from(new Set(people.map((person) => person.user_name).filter(Boolean))).sort(), [people]);
  const filteredPeople = useMemo(() => people.filter((person) => {
    const liveOnline = currentAgeSeconds(person, now) != null && Number(currentAgeSeconds(person, now)) <= activeWindowSeconds;
    if (routeId !== "all" && person.route_id !== routeId) return false;
    if (userName !== "all" && person.user_name !== userName) return false;
    if (status === "online") return liveOnline;
    if (status === "offline") return person.latitude != null && person.longitude != null && !liveOnline;
    if (status === "nogps") return person.latitude == null || person.longitude == null;
    return true;
  }), [activeWindowSeconds, now, people, routeId, userName, status]);
  const selected = filteredPeople.find((person) => person.key === selectedKey) || filteredPeople[0] || null;
  const centerTarget = followSelected && selected?.latitude != null && selected.longitude != null
    ? { latitude: selected.latitude, longitude: selected.longitude }
    : centerFrom(filteredPeople);
  const [center, setCenter] = useState(centerTarget);
  useEffect(() => {
    setCenter(centerTarget);
  }, [centerTarget.latitude, centerTarget.longitude]);

  function startPan(event: PointerEvent<HTMLElement>) {
    if (event.target instanceof HTMLElement && event.target.closest("button,a,input,select")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFollowSelected(false);
    setDrag({ x: event.clientX, y: event.clientY, center });
  }

  function movePan(event: PointerEvent<HTMLElement>) {
    if (!drag) return;
    const projected = project(drag.center.latitude, drag.center.longitude, zoom);
    const next = unproject(projected.x - (event.clientX - drag.x), projected.y - (event.clientY - drag.y), zoom);
    setCenter(next);
  }

  function stopPan(event: PointerEvent<HTMLElement>) {
    if (drag) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
  }
  const routeTrails = (routeId === "all" ? routes : routes.filter((route) => route.id === routeId)).map((route) => ({
    ...route,
    punch_points: userName === "all" ? route.punch_points : (route.punch_points || []).filter((mark) => mark.user_name === userName),
    marks_by_user: userName === "all" ? route.marks_by_user : (route.marks_by_user || []).filter((group) => group.user_name === userName)
  }));
  const visibleMarks = routeTrails.flatMap((route) => route.punch_points || []);

  return (
    <div className="-m-4 flex h-[calc(100vh-64px)] flex-col bg-[#0d1b2a] text-neutral-900 md:-m-6">
      <header className="z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0d1b2a] px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <Link className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 hover:bg-white/10" href="/dashboard/talento-humano" aria-label="Volver">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Control operativo GPS</p>
            <h1 className="text-xl font-semibold">{mode === "vivo" ? "Mapa en vivo de rutas y marcaciones" : "Historico de rutas y marcaciones"}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-md bg-white/10 p-1">
            {(["vivo", "historico"] as const).map((item) => (
              <button className={`h-8 rounded-md px-3 text-xs font-semibold ${mode === item ? "bg-white text-[#0d1b2a]" : "text-white/70"}`} key={item} onClick={() => setMode(item)} type="button">
                {item === "vivo" ? "En vivo" : "Historico"}
              </button>
            ))}
          </div>
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/10 px-3 text-sm">
            <CalendarDays size={15} />
            <input className="bg-transparent outline-none disabled:opacity-60" disabled={mode === "vivo"} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          {mode === "vivo" ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
              Refresco {refreshIn}s
            </span>
          ) : null}
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={load} type="button">
            <RefreshCw className={loading ? "animate-spin" : ""} size={15} /> Actualizar
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="z-10 flex max-h-[42vh] flex-col overflow-hidden border-b border-white/10 bg-[#0d1b2a] text-white lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-4 gap-2 p-3">
            <Metric label="Rutas" value={data?.totals.routes || 0} />
            <Metric label="Equipo" value={data?.totals.planned_people || 0} />
            <Metric label="Online" value={data?.totals.online || 0} tone="text-emerald-300" />
            <Metric label="Sin GPS" value={data?.totals.without_gps || 0} tone="text-amber-300" />
          </div>

          <div className="space-y-2 border-y border-white/10 p-3">
            <select className="h-11 w-full rounded-md border border-white/10 bg-white/10 px-3 text-sm text-white" value={routeId} onChange={(event) => setRouteId(event.target.value === "all" ? "all" : event.target.value)}>
              <option className="text-neutral-900" value="all">Todas las rutas</option>
              {routes.map((route) => <option className="text-neutral-900" key={route.id} value={route.id}>{route.vehicle_plate || "Sin placa"} · Ruta {route.id}</option>)}
            </select>
            <select className="h-11 w-full rounded-md border border-white/10 bg-white/10 px-3 text-sm text-white" value={userName} onChange={(event) => setUserName(event.target.value)}>
              <option className="text-neutral-900" value="all">Todos los usuarios</option>
              {users.map((user) => <option className="text-neutral-900" key={user} value={user}>{user}</option>)}
            </select>
            <div className="grid grid-cols-4 gap-1 rounded-md bg-white/10 p-1">
              {[
                ["all", "Todo"],
                ["online", "Vivo"],
                ["offline", "Off"],
                ["nogps", "Sin GPS"]
              ].map(([key, label]) => (
                <button className={`h-9 rounded-md text-xs font-semibold ${status === key ? "bg-white text-[#0d1b2a]" : "text-white/70"}`} key={key} onClick={() => setStatus(key as typeof status)} type="button">
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-white/60">
              <span>{filteredPeople.length} persona(s)</span>
              <span>{lastUpdated ? `Actualizado ${new Date(lastUpdated).toLocaleTimeString()}` : "--"}</span>
            </div>
            <div className="space-y-2">
              {filteredPeople.map((person) => (
                <button className={`w-full rounded-md border p-3 text-left transition ${selected?.key === person.key ? "border-sky-300 bg-white/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`} key={person.key} onClick={() => setSelectedKey(person.key)} type="button">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${currentAgeSeconds(person, now) != null && Number(currentAgeSeconds(person, now)) <= activeWindowSeconds ? "animate-pulse bg-emerald-400" : statusTone[person.status] || "bg-neutral-400"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{person.name || person.user_name}</span>
                      <span className="block truncate text-xs text-white/60">{person.vehicle_plate || "Sin vehiculo"} · {person.route_label}</span>
                    </span>
                    <span className="text-xs font-semibold text-white/70">{ageLabel(currentAgeSeconds(person, now))}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/65">
                    <span><Clock className="mr-1 inline" size={12} />{minutesLabel(person.time_in_route_minutes)}</span>
                    <span>{person.last_punch_time || "--"} · {person.status}</span>
                  </div>
                </button>
              ))}
              {!filteredPeople.length ? <p className="rounded-md border border-white/10 bg-white/5 p-4 text-sm text-white/60">No hay personas para el filtro seleccionado.</p> : null}
            </div>
          </div>
        </aside>

        <section
          className={`relative min-h-[58vh] overflow-hidden bg-[#dfe8ef] lg:min-h-0 ${drag ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
        >
          <MapTiles center={center} zoom={zoom} />
          {routeTrails.map((route) => <RouteTrail center={center} key={`gps-${route.id}`} points={route.pings || []} zoom={zoom} />)}
          {routeTrails.flatMap((route) => (route.marks_by_user || []).map((group, index) => (
            <RouteTrail center={center} color={["#16a34a", "#f97316", "#8b5cf6", "#0f766e"][index % 4]} dashed key={`marks-${route.id}-${group.user_name}`} points={group.marks || []} zoom={zoom} />
          )))}

          {filteredPeople.filter((person) => person.latitude != null && person.longitude != null).map((person) => {
            const offset = pointOffset({ latitude: Number(person.latitude), longitude: Number(person.longitude) }, center, zoom);
            const active = selected?.key === person.key;
            const liveOnline = currentAgeSeconds(person, now) != null && Number(currentAgeSeconds(person, now)) <= activeWindowSeconds;
            return (
              <button
                className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border-2 bg-white px-3 py-2 text-xs font-bold shadow-lg transition-[left,top,transform] duration-700 ease-out ${active ? "border-apex text-apex" : "border-white text-neutral-800"}`}
                key={person.key}
                onClick={() => setSelectedKey(person.key)}
                style={{ left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)` }}
                type="button"
              >
                <span className="relative flex h-8 w-8 items-center justify-center">
                  {liveOnline ? <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/55" /> : null}
                  <span className={`relative flex h-8 w-8 items-center justify-center rounded-full text-white ${liveOnline ? "bg-emerald-500" : statusTone[person.status] || "bg-neutral-500"}`}>{initials(person.name)}</span>
                </span>
                <span className="hidden sm:block">{person.name}</span>
              </button>
            );
          })}

          {visibleMarks.map((mark) => {
            const offset = pointOffset({ latitude: Number(mark.latitude), longitude: Number(mark.longitude) }, center, zoom);
            const active = selectedMark?.id === mark.id;
            return (
              <button
                className={`absolute z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-black shadow-lg ${active ? "border-apex bg-apex text-white" : "border-white bg-neutral-900 text-white"}`}
                key={`mark-${mark.id}`}
                onClick={() => setSelectedMark(mark)}
                style={{ left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)` }}
                title={`${punchLabel[mark.type] || mark.type} ${mark.time}`}
                type="button"
              >
                {punchLabel[mark.type]?.[0] || "M"}
              </button>
            );
          })}

          <div className="absolute left-4 top-4 z-20 flex gap-2">
            <button className="h-10 rounded-md bg-white px-3 text-sm font-semibold shadow" onClick={() => setZoom((value) => Math.min(value + 1, 18))} type="button">+</button>
            <button className="h-10 rounded-md bg-white px-3 text-sm font-semibold shadow" onClick={() => setZoom((value) => Math.max(value - 1, 8))} type="button">-</button>
            <button className={`h-10 rounded-md px-3 text-sm font-semibold shadow ${followSelected ? "bg-apex text-white" : "bg-white text-neutral-800"}`} onClick={() => setFollowSelected((value) => !value)} type="button">
              {followSelected ? "Siguiendo" : "Centrar"}
            </button>
          </div>

          {mode === "vivo" ? (
            <div className="absolute left-4 top-16 z-20 rounded-md border border-emerald-200 bg-white/95 px-3 py-2 text-xs font-semibold text-emerald-700 shadow">
              <span className="mr-2 inline-block h-2 w-2 animate-ping rounded-full bg-emerald-500" />
              Rastreo en vivo activo
            </div>
          ) : null}

          <div className="absolute bottom-4 left-4 z-20 rounded-md bg-white/95 p-3 text-xs shadow-lg">
            <p className="font-semibold">OpenStreetMap · Zoom {zoom}</p>
            <p className="mt-1 text-neutral-500">{center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}</p>
          </div>

          {selected ? (
            <div className="absolute right-4 top-4 z-30 w-[min(360px,calc(100%-32px))] rounded-md border border-line bg-white p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-apex">{selected.route_label} · {selected.vehicle_plate || "Sin vehiculo"}</p>
                  <h2 className="mt-1 text-lg font-semibold">{selected.name}</h2>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold text-white ${statusTone[selected.status] || "bg-neutral-500"}`}>{selected.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Info icon={Clock} label="Tiempo en ruta" value={minutesLabel(selected.time_in_route_minutes)} />
                <Info icon={Satellite} label={selected.footprint_source === "last_known" ? "Ultima huella" : "Ultimo GPS"} value={ageLabel(currentAgeSeconds(selected, now))} />
                <Info icon={Route} label="Horario" value={`${selected.route_start_time || "--"} - ${selected.route_end_time || "--"}`} />
                <Info icon={Users} label="Marcacion" value={`${selected.last_punch_time || "--"} · ${selected.last_punch_type}`} />
              </div>
              {selected.latitude != null && selected.longitude != null ? (
                <div className="mt-3 rounded-md bg-paper p-3 text-sm text-neutral-600">
                  <LocateFixed className="mr-1 inline text-apex" size={14} />
                  {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)} · precision {Math.round(selected.accuracy_meters || 0)}m
                </div>
              ) : <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-900">Persona con ruta planeada, pendiente de primer GPS.</p>}
              {mapsUrl(selected) ? <a className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-apex text-sm font-semibold text-white" href={mapsUrl(selected)} target="_blank" rel="noreferrer">Abrir en Google Maps <ExternalLink size={14} /></a> : null}
            </div>
          ) : null}

          {selectedMark ? (
            <div className="absolute bottom-4 right-4 z-30 w-[min(340px,calc(100%-32px))] rounded-md border border-line bg-white p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-apex">{punchLabel[selectedMark.type] || selectedMark.type}</p>
                  <h3 className="mt-1 text-base font-semibold">{selectedMark.user_name}</h3>
                </div>
                <button className="rounded-md border border-line px-2 py-1 text-xs font-semibold" onClick={() => setSelectedMark(null)} type="button">Cerrar</button>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-neutral-700">
                <p className="rounded-md bg-paper p-3">Hora: <span className="font-semibold">{selectedMark.time}</span> · {new Date(selectedMark.punched_at).toLocaleString()}</p>
                <p className="rounded-md bg-paper p-3">Vehiculo: <span className="font-semibold">{selectedMark.vehicle_plate || "--"}</span> · Ruta {selectedMark.route_id || "--"}</p>
                <p className="rounded-md bg-paper p-3">GPS: {selectedMark.latitude.toFixed(6)}, {selectedMark.longitude.toFixed(6)} · {Math.round(selectedMark.accuracy_meters || 0)}m</p>
                {selectedMark.extra_minutes ? <p className="rounded-md bg-amber-50 p-3 text-amber-900">Extra: {selectedMark.extra_minutes} min</p> : null}
              </div>
              <a className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex text-sm font-semibold text-white" href={mapsUrl(selectedMark)} target="_blank" rel="noreferrer">Abrir marca en Google Maps <ExternalLink size={14} /></a>
            </div>
          ) : null}

          {!filteredPeople.some((person) => person.latitude != null && person.longitude != null) ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/65 p-6 text-center">
              <div className="rounded-md border border-line bg-white p-5 shadow-sm">
                <MapPin className="mx-auto text-apex" size={30} />
                <p className="mt-3 font-semibold">Sin ubicaciones GPS para mostrar</p>
                <p className="mt-1 text-sm text-neutral-500">Las personas con ruta planeada apareceran aqui cuando marquen o envien senal GPS.</p>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-2 text-center">
      <p className={`text-xl font-semibold ${tone}`}>{value}</p>
      <p className="text-[11px] text-white/55">{label}</p>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <p className="text-xs text-neutral-500"><Icon className="mr-1 inline" size={13} />{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
