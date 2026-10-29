import { PygVehicleExpanded } from "@/components/accounting/PygVehicleExpanded";
import { isPygPeriod, parsePyVehicleSelection, PYG_PLATE_PARAM, PYG_PERIOD_PARAM } from "@/lib/pyg-expanded";
import type { Metadata } from "next";
import { Suspense } from "react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "PYG por vehículo · vista ampliada", robots: { index: false, follow: false } };

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// searchParams llega como promesa en Next 16. La placa (o el sentinel SIN_VEHICULO) se normaliza
// aquí y otra vez en el cliente; un período malformado queda nulo y muestra aviso, no se corrige solo.
export default async function PygVehicleExpandedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const rawPlate = firstValue(query[PYG_PLATE_PARAM]);
  const rawPeriod = firstValue(query[PYG_PERIOD_PARAM]);
  const initialPlate = parsePyVehicleSelection(rawPlate) || null;
  const initialPeriod = isPygPeriod(rawPeriod) ? rawPeriod : null;
  const plateRejected = !!rawPlate && !initialPlate;
  const periodRejected = !!rawPeriod && !initialPeriod;

  return (
    <Suspense fallback={<div className="apex-section-card p-12 text-center text-content-muted">Preparando la vista ampliada del PYG…</div>}>
      <PygVehicleExpanded initialPeriod={initialPeriod} initialPlate={initialPlate} periodRejected={periodRejected} plateRejected={plateRejected} />
    </Suspense>
  );
}
