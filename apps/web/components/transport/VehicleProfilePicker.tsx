"use client";
import type { CargoContainer } from "./packing-types";

export type StandardVehicleProfile = {
  id: string;
  name: string;
  kind: string;
  description: string;
  vehicle_type: string;
  container: CargoContainer;
};

const kindLabel: Record<string, string> = {
  liviano: "Liviano",
  furgon: "Furgón",
  estacas: "Estacas",
  camion: "Camión",
  plataforma: "Plataforma",
  tractomula: "Tractomula"
};

function dimensions(container: CargoContainer) {
  const { length, width, height } = container;
  return `${length.toFixed(2)} × ${width.toFixed(2)} × ${height.toFixed(2)} m`;
}

export function VehicleProfilePicker({
  profiles,
  selected,
  onSelect
}: {
  profiles: StandardVehicleProfile[];
  selected: string;
  onSelect: (profile: StandardVehicleProfile) => void;
}) {
  if (!profiles.length) return null;
  const active = profiles.find((profile) => profile.id === selected);
  return (
    <div className="space-y-2">
      <select
        aria-label="Tipo de vehículo estándar"
        className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium outline-none transition focus:border-apex focus:ring-2 focus:ring-apex/20"
        value={selected}
        onChange={(event) => {
          const profile = profiles.find((item) => item.id === event.target.value);
          if (profile) onSelect(profile);
        }}
      >
        <option value="">Seleccionar tipo de vehículo</option>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>{profile.name} · {dimensions(profile.container)}</option>
        ))}
      </select>
      {active ? (
        <div className="rounded-lg border border-apex/30 bg-apex/5 p-3" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{active.name}</p>
              <p className="mt-0.5 text-xs text-neutral-600">{active.description}</p>
            </div>
            <span className="shrink-0 rounded-md bg-paper px-2 py-1 text-[11px] font-semibold text-neutral-600">{kindLabel[active.kind] || active.kind}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-neutral-500">Espacio interior</dt><dd className="mt-0.5 font-semibold">{dimensions(active.container)}</dd></div>
            <div><dt className="text-neutral-500">Carga útil</dt><dd className="mt-0.5 font-semibold">{active.container.max_weight.toLocaleString("es-CO")} kg</dd></div>
          </dl>
        </div>
      ) : <p className="text-xs text-neutral-500">Elige una referencia y después ajusta sus medidas si tu vehículo es diferente.</p>}
    </div>
  );
}
