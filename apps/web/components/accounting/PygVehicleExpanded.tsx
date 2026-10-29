"use client";

import { getTransportPygReport, type TransportPygReport } from "@/lib/api";
import {
  isPygPeriod, parsePyVehicleSelection, PYG_UNASSIGNED_CODE, pygBackHref, pygExpandedHref
} from "@/lib/pyg-expanded";
import { AlertTriangle, Expand, Minimize2, RefreshCw, Scale, Truck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SourceNote, UnassignedKpis, UnmappedNotice, VehicleKpis } from "./PygVehicleReadings";
import { StatementTable } from "./PygStatementTable";

type FullscreenState = "unsupported" | "off" | "on";

// La Fullscreen API solo se detecta en el cliente (useEffect); el primer render no depende de
// `document`, así servidor y cliente coinciden y el botón aparece tras la hidratación.
function detectFullscreenSupport() {
  if (typeof document === "undefined") return false;
  return typeof document.documentElement?.requestFullscreen === "function";
}

type Props = {
  initialPeriod: string | null;
  initialPlate: string | null;
  periodRejected: boolean;
  plateRejected: boolean;
};

// Pestaña nueva con la vista ampliada (enlace nativo «Abrir en otra ventana»). La Fullscreen API
// es opcional: se ofrece un botón explícito de entrar/salir y la vista ampliada siempre queda disponible.
export function PygVehicleExpanded({ initialPeriod, initialPlate, periodRejected, plateRejected }: Props) {
  const [report, setReport] = useState<TransportPygReport | null>(null);
  // El período solo se lee del enlace: si falta o no es válido, no se consulta ningún otro mes.
  const [period, setPeriod] = useState(() => (isPygPeriod(initialPeriod) ? initialPeriod : ""));
  const [loading, setLoading] = useState(() => isPygPeriod(initialPeriod));
  const [error, setError] = useState("");
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
  // La selección de la URL manda: placa real o SIN_VEHICULO.
  const [selection, setSelection] = useState(() => parsePyVehicleSelection(initialPlate));
  const [fullscreen, setFullscreen] = useState<FullscreenState>("unsupported");
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async (targetPeriod: string) => {
    if (!isPygPeriod(targetPeriod)) return;
    const seq = ++loadSeq.current;
    setLoading(true); setError("");
    setLoadedPeriod(null);
    try {
      const data = await getTransportPygReport(targetPeriod);
      if (seq !== loadSeq.current) return;
      if (data.source !== "accounting" || data.report_source !== "ledger") {
        throw new Error("La consulta no devolvió el libro contable. Actualiza la ventana antes de continuar.");
      }
      if (data.period !== targetPeriod) {
        throw new Error("El período recibido no coincide con el solicitado. Actualiza la consulta.");
      }
      setReport(data);
      setLoadedPeriod(targetPeriod);
    } catch (value) {
      if (seq !== loadSeq.current) return;
      setError(value instanceof Error ? value.message : "No fue posible leer el PYG contable por vehículo.");
    } finally { if (seq === loadSeq.current) setLoading(false); }
  }, []);

  useEffect(() => { if (isPygPeriod(period)) void load(period); }, [load, period]);

  useEffect(() => {
    const supported = detectFullscreenSupport();
    setFullscreenSupported(supported);
    if (!supported) { setFullscreen("unsupported"); return; }
    const sync = () => setFullscreen(document.fullscreenElement ? "on" : "off");
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const vehicles = report?.vehicles ?? null;
  const unassigned = report?.unassigned ?? null;
  const options = useMemo(() => {
    const list = (vehicles ?? []).map((vehicle) => ({ key: vehicle.plate, label: vehicle.vehicle_label ? `${vehicle.plate} · ${vehicle.vehicle_label}` : vehicle.plate }));
    if (unassigned) list.push({ key: PYG_UNASSIGNED_CODE, label: "Sin vehículo / sin asignar" });
    return list;
  }, [vehicles, unassigned]);

  const periodValid = isPygPeriod(period);
  const reportReady = !!report && !loading && !error && periodValid && loadedPeriod === period;
  const showLoadingCard = loading || (!error && !reportReady);
  const unassignedSelected = !!unassigned && (selection === PYG_UNASSIGNED_CODE || selection === unassigned.plate);
  const vehicle = selection ? vehicles?.find((item) => item.plate === selection) ?? null : null;
  const optionsReady = reportReady && options.length > 0;
  const selectionKnown = unassignedSelected || !!vehicle;
  // Selección pedida por el enlace que no existe en este período: no se sustituye por otra placa.
  const unknownPlate = reportReady && !!selection && !selectionKnown;
  const missingSelection = reportReady && !selection;

  // Placa (o SIN_VEHICULO) y período viven en la URL: recargar (F5), abrir desde el historial o
  // compartir repite la lectura. Solo se refleja la selección que el usuario eligió o el sentinel.
  useEffect(() => {
    if (!reportReady || !report || !optionsReady) return;
    const href = pygExpandedHref({ plate: selection, period: report.period });
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, "", href);
  }, [reportReady, report, optionsReady, selection]);

  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      setFullscreenError("No fue posible cambiar a pantalla completa. La vista ampliada sigue disponible.");
    }
  }

  const fullscreenTitle = vehicle
    ? `PYG Vehículo ${vehicle.plate}`
    : unassignedSelected
      ? "PYG Sin vehículo / sin asignar"
      : unknownPlate
        ? `PYG · placa ${selection} sin lectura`
        : "PYG por Vehículo";

  const selectValue = options.some((option) => option.key === selection) ? selection : "";

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-4 text-content-body [&:fullscreen]:max-w-none [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-paper [&:fullscreen]:p-4" ref={rootRef}>
      <header className="apex-section-card overflow-hidden">
        <div className="border-b border-line bg-surface-muted p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="rounded-xl bg-apex p-3 text-white"><Scale /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-apex">M-07 · Contabilidad · Rentabilidad</p>
                <h1 className="text-2xl font-semibold text-content-strong">{fullscreenTitle}</h1>
                <p className="text-sm text-content-muted">Vista ampliada sin menú lateral, con datos del mismo libro contable (asientos publicados del periodo seleccionado).</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-content-muted">Vehículo
                <select
                  className="mt-1 block h-9 w-56 max-w-full rounded-md border border-line bg-surface px-2 text-content-strong disabled:opacity-60"
                  disabled={!optionsReady}
                  onChange={(event) => setSelection(event.target.value)}
                  value={selectValue}
                >
                  {!optionsReady || !selectValue ? <option value="">{options.length === 0 && reportReady ? "Sin vehículos" : "Selecciona un vehículo"}</option> : null}
                  {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-content-muted">Periodo
                <input aria-invalid={!periodValid} aria-required="true" className={`mt-1 block h-9 rounded-md border bg-surface px-2 text-content-strong ${periodValid ? "border-line" : "border-amber-500/60"}`} onChange={(event) => setPeriod(event.target.value)} type="month" value={period} />
              </label>
              <button aria-label="Actualizar" className="h-9 rounded-md border border-line bg-surface px-3 disabled:opacity-50" disabled={!periodValid} onClick={() => void load(period)} type="button"><RefreshCw size={16} /></button>
              {fullscreenSupported ? (
                <button aria-pressed={fullscreen === "on"} className="inline-flex h-9 items-center gap-2 rounded-md border border-apex px-3 text-sm font-semibold text-apex" onClick={() => void toggleFullscreen()} type="button">
                  {fullscreen === "on" ? <><Minimize2 size={16} /> Salir de pantalla completa</> : <><Expand size={16} /> Pantalla completa</>}
                </button>
              ) : (
                <span className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-3 text-xs text-content-muted">Vista ampliada (pantalla completa no disponible en este navegador)</span>
              )}
              <Link className="inline-flex h-9 items-center rounded-md px-2 text-sm font-semibold text-apex hover:underline" href={pygBackHref()} prefetch={false}>Volver al PYG</Link>
            </div>
          </div>
        </div>
      </header>

      {fullscreenError ? <p aria-live="polite" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">{fullscreenError}</p> : null}
      {periodRejected && !periodValid ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          El período del enlace no es válido. Elige un mes y año para leer el libro contable.
        </p>
      ) : null}
      {!periodValid ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          Selecciona un período válido (mes y año) para leer el libro contable. No se consulta la API hasta entonces.
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">{reportReady && report ? `Lectura cargada: periodo ${report.period}${vehicle ? `, placa ${vehicle.plate}` : ""}` : loading ? "Leyendo el libro contable" : ""}</p>
      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-400" role="alert">{error}</div> : null}

      {reportReady && report ? (
        <>
          {options.length === 0 ? (
            <div className="apex-section-card p-4 text-sm text-content-muted">
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 shrink-0 text-content-subtle" size={20} />
                <div><p className="font-semibold text-content-strong">No hay vehículos activos en la flota.</p><p>Crea los vehículos en Transporte → Vehículos y documentos para habilitar el PYG por placa.</p></div>
              </div>
            </div>
          ) : unknownPlate ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
              La placa {selection} no tiene lectura en el período {report.period}. No se muestra otra placa: elige un vehículo en «Vehículo» para ver su PYG.
            </p>
          ) : !selectionKnown ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
              Selecciona un vehículo en «Vehículo» para ver su PYG del período {report.period}.
            </p>
          ) : null}
          {plateRejected && !unknownPlate && !missingSelection ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">El enlace traía una placa no válida; elige un vehículo en «Vehículo».</p>
          ) : null}
          {(report.warnings?.length || 0) > 0 ? (
            <details className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold"><AlertTriangle size={16} /> {report.warnings?.length} aviso(s) del PYG por vehículo (libro contable)</summary>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                {report.warnings?.map((warning) => <li key={`${warning.code}-${warning.message}`}><strong>{warning.code}:</strong> {warning.message}</li>)}
              </ul>
            </details>
          ) : null}
          <UnmappedNotice report={report} />
          {unassignedSelected && unassigned ? (
            <>
              <UnassignedKpis unassigned={unassigned} />
              <StatementTable caption="Centros de costo del libro sin vehículo asignado; nunca se asignan dos veces ni desaparecen del consolidado." rows={unassigned.rows} tall title={`Sin vehículo / sin asignar · ${report.period}`} />
            </>
          ) : vehicle ? (
            <>
              <VehicleKpis vehicle={vehicle} />
              <StatementTable caption={`Estado de resultados de la placa ${vehicle.plate} en ${report.period}, leído del libro contable (asientos publicados del periodo).`} rows={vehicle.rows} tall title={`PYG ${vehicle.plate} · ${report.period}`} />
            </>
          ) : null}
          <SourceNote period={report.period} />
        </>
      ) : showLoadingCard ? (
        <div className="apex-section-card p-12 text-center text-content-muted">{loading ? "Leyendo el libro contable del periodo…" : !periodValid ? "Selecciona un período (mes y año) para leer el libro contable." : "Construyendo el estado de resultados…"}</div>
      ) : null}
    </div>
  );
}
