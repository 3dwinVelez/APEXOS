"use client";

import { TransportSearchSelect } from "@/components/transport/TransportSearchSelect";

export type CostCenterOption = {
  code: string;
  name: string;
  branch_code: string | null;
  branch_name: string | null;
  society_code: string | null;
  society_name: string | null;
};

export function costCenterLabel(centers: CostCenterOption[], code: string | null) {
  if (!code) return "Sin asignar";
  const match = centers.find((center) => center.code.toLowerCase() === code.toLowerCase());
  return match ? `${match.code} · ${match.name}` : code;
}

function optionLabel(center: CostCenterOption) {
  return center.branch_name ? `${center.code} · ${center.name} · ${center.branch_name}` : `${center.code} · ${center.name}`;
}

// El centro de costo se elige del maestro de Contabilidad > Estructura con el
// buscador inteligente compartido. Los valores heredados (texto libre anterior
// al maestro) se conservan visibles y marcados para no perder trazabilidad.
export function CostCenterSelect({ centers, disabled, label = "Centro de costo", onChange, value }: {
  centers: CostCenterOption[];
  disabled?: boolean;
  label?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const known = centers.some((center) => center.code.toLowerCase() === value.trim().toLowerCase());
  const hint = centers.length ? undefined : "No hay centros de costo activos en la estructura contable.";
  return (
    <label className="grid gap-1.5 text-sm font-medium text-content-strong">
      <span>{label}</span>
      <TransportSearchSelect
        aria-label={`Buscar ${label.toLowerCase()} por código, nombre o sucursal`}
        className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-content-strong"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Sin centro de costo</option>
        {value.trim() && !known ? <option value={value}>{value} (no está en la estructura)</option> : null}
        {centers.map((center) => (
          <option key={`${center.branch_code || ""}-${center.code}`} value={center.code}>{optionLabel(center)}</option>
        ))}
      </TransportSearchSelect>
      {hint ? <span className="text-xs font-normal text-content-muted">{hint}</span> : null}
    </label>
  );
}
