"use client";

import "leaflet/dist/leaflet.css";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  Polyline,
  TileLayer,
} from "react-leaflet";
import { Fragment } from "react";

export type LiveUnit = {
  trip_id: number;
  trip_code: string;
  status: string;
  vehicle_plate?: string;
  signal_status: string;
  eta_minutes?: number | null;
  distance_to_stop_km?: number | null;
  route_deviation_m?: number | null;
  corridor_radius_m?: number | null;
  off_route?: boolean;
  route_coordinates?: number[][] | null;
  inside_geofence: boolean;
  latest?: { latitude: number; longitude: number; recorded_at: string } | null;
  next_stop?: {
    latitude?: number;
    longitude?: number;
    delivery_point?: {
      name: string;
      latitude?: number;
      longitude?: number;
      geofence_radius_m?: number;
    };
  } | null;
};

export default function TmsLiveMap({
  units,
  selectedId,
  onSelect,
}: {
  units: LiveUnit[];
  selectedId?: number;
  onSelect: (id: number) => void;
}) {
  const located = units.filter((unit) => unit.latest);
  const center: [number, number] = located[0]?.latest
    ? [located[0].latest.latitude, located[0].latest.longitude]
    : [4.65, -74.1];
  return (
    <MapContainer
      center={center}
      className="h-[560px] w-full rounded-xl"
      scrollWheelZoom
      zoom={11}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located.map((unit) => {
        const latest: [number, number] = [
          unit.latest!.latitude,
          unit.latest!.longitude,
        ];
        const target =
          unit.next_stop?.latitude != null
            ? unit.next_stop
            : unit.next_stop?.delivery_point;
        const destination: [number, number] | null =
          target?.latitude != null && target?.longitude != null
            ? [target.latitude, target.longitude]
            : null;
        const plannedRoute = unit.route_coordinates?.map(
          ([longitude, latitude]) => [latitude, longitude] as [number, number],
        );
        return (
          <Fragment key={unit.trip_id}>
            {plannedRoute?.length ? (
              <Polyline
                pathOptions={{
                  color: unit.off_route ? "#dc2626" : "#146C63",
                  weight: 5,
                  opacity: 0.7,
                }}
                positions={plannedRoute}
              />
            ) : null}
            <CircleMarker
              center={latest}
              eventHandlers={{ click: () => onSelect(unit.trip_id) }}
              pathOptions={{
                color: unit.off_route
                  ? "#dc2626"
                  : unit.signal_status === "activa"
                    ? "#146C63"
                    : "#dc2626",
                fillOpacity: selectedId === unit.trip_id ? 1 : 0.75,
              }}
              radius={selectedId === unit.trip_id ? 11 : 8}
            >
              <Popup>
                <strong>{unit.vehicle_plate || unit.trip_code}</strong>
                <br />
                {unit.status}
                <br />
                ETA: {unit.eta_minutes ?? "--"} min
                <br />
                Desvío: {unit.route_deviation_m ?? "--"} m
              </Popup>
            </CircleMarker>
            {destination ? (
              <>
                <Polyline
                  pathOptions={{
                    color: "#146C63",
                    dashArray: "6 8",
                    opacity: 0.65,
                  }}
                  positions={[latest, destination]}
                />
                <Circle
                  center={destination}
                  pathOptions={{
                    color: unit.inside_geofence ? "#16a34a" : "#f59e0b",
                    fillOpacity: 0.08,
                  }}
                  radius={
                    unit.next_stop?.delivery_point?.geofence_radius_m || 150
                  }
                />
              </>
            ) : null}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
