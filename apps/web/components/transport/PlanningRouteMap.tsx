"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";

type Stop = { label: string; position: [number, number]; kind: "origin" | "stop"; sequence: number };

function FitRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => { if (positions.length > 1) map.fitBounds(latLngBounds(positions), { padding: [28, 28] }); }, [map, positions]);
  return null;
}

export default function PlanningRouteMap({ geometry, stops, tileUrl }: { geometry: number[][]; stops: Stop[]; tileUrl?: string }) {
  const positions = geometry.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
  const center = stops[0]?.position || [4.65, -74.1];
  return <MapContainer center={center} className="h-[360px] w-full" scrollWheelZoom zoom={11}>
    <TileLayer attribution="&copy; OpenStreetMap contributors" url={tileUrl || process.env.NEXT_PUBLIC_TMS_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"} />
    <Polyline pathOptions={{ color: "#146C63", opacity: 0.9, weight: 6 }} positions={positions} />
    {stops.map((stop) => <CircleMarker center={stop.position} key={`${stop.kind}-${stop.sequence}`} pathOptions={{ color: "#146C63", fillColor: stop.kind === "origin" ? "#146C63" : "#ffffff", fillOpacity: 1, weight: 3 }} radius={12}><Popup><strong>{stop.kind === "origin" ? "Origen" : `Parada ${stop.sequence}`}</strong><br />{stop.label}</Popup></CircleMarker>)}
    <FitRoute positions={positions} />
  </MapContainer>;
}
