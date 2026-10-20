"use client";

import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import type { RateCard } from "@/app/dashboard/transporte/tarifas/page";
import { rateCostDraftFromSnapshot } from "@/lib/transportRateSnapshot";

const RateCostDesigner = dynamic(() => import("@/components/transport/RateCostDesigner").then(module => module.RateCostDesigner), { ssr: false });
type Criterion = { concept: string; quantity: number; unit_value: number; support?: string; annex_id: string };
type Report = {
  company: { name: string; tax_id?: string };
  package: { code: string; currency: string; status: string; carrier_name: string; created_at: string; updated_at: string; accounted_total: number; observation?: string; metadata?: { accounting_period?: string; cost_center?: string }; period?: { code: string }; accountings: { reference?: string; accounting_period?: string }[]; adjustments: { reason: string; delta: number }[]; items: { id: number; guide_reference: string; service?: string; route_description?: string; service_date?: string; adjusted_amount: number; criteria: Criterion[]; metadata?: { destination_snapshots?: { name: string; address: string; city: string }[]; destination_snapshot?: { name: string; address: string; city: string }; customer_snapshot?: { name: string; tax_id?: string } } }[] };
  annexes: { id: string; code: string; version: number; unit_value: number; definition: RateCard | null; metrics: { weight_kg?: number; volume_m3?: number; distance_km?: number; wait_minutes?: number }; provenance: string }[];
};
const noChange = () => {};
export default function SettlementPrintPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [captures, setCaptures] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id || !/^[1-9]\d*$/.test(id)) { setError("Selecciona una liquidación válida."); return; }
    setError(""); setReady(false); setReport(null); setCaptures({});
    api<Report>(`/api/v1/transport/settlement-packages/${id}/invoice-report`, { cache: "no-store" })
      .then(data => { if (active) { document.title = `${data.package.code}-soporte-facturacion`; setReport(data); } })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : "No fue posible cargar el documento."); });
    const clear = () => { if (!localStorage.getItem("token")) { setReport(null); setCaptures({}); setReady(false); setError("Inicia sesión para consultar la liquidación."); } };
    window.addEventListener("storage", clear);
    return () => { active = false; window.removeEventListener("storage", clear); };
  }, [attempt]);
  useEffect(() => {
    if (!report || !root.current) return;
    let active = true;
    const controller = new AbortController();
    import("@/lib/transportSettlementPrint").then(({ captureSettlementAnnexes }) => captureSettlementAnnexes(root.current!, controller.signal))
      .then(images => { if (active) { setCaptures(images); setReady(true); } })
      .catch(() => { if (active) setError("No fue posible preparar los anexos. Reintenta antes de guardar el PDF."); });
    return () => { active = false; controller.abort(); };
  }, [report]);
  async function printReport() {
    if (!report || !ready) return;
    setReady(false); setError("");
    try {
      const id = new URLSearchParams(window.location.search).get("id");
      const current = await api<Report>(`/api/v1/transport/settlement-packages/${id}/invoice-report`, { cache: "no-store" });
      if (JSON.stringify(current) !== JSON.stringify(report)) { setAttempt(value => value + 1); return; }
      await Promise.all(Array.from(root.current?.querySelectorAll("img.rate-capture-image") || []).map(image => (image as HTMLImageElement).decode()));
      window.print(); setReady(true);
    } catch (caught) { setReport(null); setCaptures({}); setError(caught instanceof Error ? caught.message : "No fue posible validar el documento."); }
  }
  if (!report) return <main className="p-6"><p role="status">{error || "Cargando liquidación…"}</p>{error ? <button type="button" onClick={() => setAttempt(value => value + 1)}>Reintentar</button> : null}</main>;
  const pkg = report.package;
  const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: pkg.currency, maximumFractionDigits: 2 }).format(Number(value || 0));
  const date = (value?: string) => value ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota" }).format(new Date(value)) : "—";
  return <main ref={root} className="settlement-print" data-pdf-ready={ready ? "true" : "false"}>
    <div className="print-toolbar"><div><strong>PDF para facturar</strong><p>Selecciona «Guardar como PDF» en el destino de impresión.</p>{error ? <p role="alert">{error}</p> : <p role="status">{ready ? "Documento y anexos preparados." : "Preparando anexos…"}</p>}</div><button type="button" disabled={!ready} onClick={() => void printReport()}>Guardar / imprimir PDF</button>{error ? <button type="button" onClick={() => setAttempt(value => value + 1)}>Reintentar</button> : null}</div>
    <style>{`
      @page { size: A4 portrait; margin:14mm; } @page annex { size: A4 landscape; }
      html,body {background:white!important;color:#193342!important;font:12px Arial,sans-serif!important;} body {margin:0!important;}
      .print-toolbar{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:14px;margin-bottom:18px;border:1px solid #cbdcdb;border-radius:8px;} .print-toolbar p{margin:4px 0;font-size:12px;} .print-toolbar button{background:#007f79;color:white;border:0;border-radius:6px;padding:10px;cursor:pointer;} .print-toolbar button:disabled{opacity:.5;cursor:wait;}
      .settlement-print {color:#193342;background:#fff;} .settlement-print * {box-sizing:border-box;}
      .report-header {display:flex;justify-content:space-between;gap:20px;background:#0c302d;color:white;padding:22px;border-bottom:5px solid #00857b;}
      .report-header h1 {font-size:21px;margin:0 0 6px;} .report-header p {margin:4px 0;font-size:11px;} .report-code {font-size:22px;font-weight:700;text-align:right;}
      .report-meta {display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0;} .report-meta div {border-bottom:1px solid #dce7e7;padding:9px;}
      .report-meta small {display:block;color:#607782;margin-bottom:5px;} .route-block {margin:18px 0;break-inside:avoid;}
      .route-block h2 {font-size:15px;background:#eef6f5;padding:10px;border-left:4px solid #00857b;} .route-block p {line-height:1.5;margin:7px 0;}
      .stores {font-size:11px;color:#455e6b;padding-left:18px;} table {width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px;margin:10px 0;} th {background:#126b62;color:#fff;text-align:left;padding:9px;} th:first-child{width:42%;} th:nth-child(2){width:8%;} th:nth-child(3),th:nth-child(4){width:20%;} th:last-child{width:10%;} td {overflow-wrap:anywhere;padding:9px;border-bottom:1px solid #e0e8e9;vertical-align:top;} tr {break-inside:avoid;} thead {display:table-header-group;}
      .amount {text-align:right;white-space:nowrap;} .support {font-size:10px;color:#526d79;margin-top:4px;} .grand-total {margin:20px 0 0 auto;width:65%;background:#0c302d;color:white;padding:18px;text-align:right;break-inside:avoid;} .grand-total strong {display:block;font-size:25px;margin-top:6px;color:#57e0bb;}
      .annex {page:annex;break-before:page;} .annex h2 {font-size:18px;margin:0 0 8px;color:#153c48;} .annex p {margin:5px 0 12px;font-size:11px;color:#536a76;} .rate-capture-image {width:100%;height:auto;max-height:167mm;object-fit:contain;object-position:top left;}
      [data-rate-capture] {width:1536px;min-height:700px;background:white;pointer-events:none;color:#193342;--surface:255 255 255;--surface-soft:248 250 253;--color-paper:245 248 252;--color-line:222 231 241;--color-apex:0 128 125;--text-strong:16 39 67;--text-body:28 52 81;--text-muted:106 128 163;}
      [data-rate-capture] [data-cost-panel="summary"] > p:first-child {color:#fff!important;}
      [data-rate-capture] fieldset {border:0;padding:0;margin:0;} .snapshot-title {padding:12px 18px;font:bold 20px Arial;color:#173f4a;background:#f0f6f7;}
      @media screen {.settlement-print {width:794px;margin:auto;padding:20px;}.annex {width:1080px;margin-top:32px;}} @media print {.settlement-print[data-pdf-ready="false"] > :not(style){display:none!important;} .settlement-print[data-pdf-ready="false"]::before{content:"Prepara el documento antes de imprimir.";} body > :not(.settlement-print){display:none!important;} .print-toolbar{display:none!important;} .settlement-print{width:auto;margin:0;padding:0;} .annex{width:auto;} }
    `}</style>
    <header className="report-header"><div><h1>{report.company.name}</h1><p>NIT {report.company.tax_id || "No registrado"}</p><p>APEXOS · Transporte</p></div><div><p>SOPORTE PARA FACTURACIÓN</p><div className="report-code">{pkg.code}</div><p>Liquidación de transporte · Liquidada</p></div></header>
    <div className="report-meta"><div><small>Vehículo / centro de costos</small><strong>{pkg.metadata?.cost_center || pkg.carrier_name}</strong></div><div><small>Periodo contable</small><strong>{pkg.metadata?.accounting_period || pkg.accountings[0]?.accounting_period || pkg.period?.code || "—"}</strong></div><div><small>Fecha de liquidación</small>{date(pkg.updated_at)}</div><div><small>Comprobante contable</small>{pkg.accountings.map(entry => entry.reference).filter(Boolean).join(", ") || "—"}</div></div>
    {pkg.items.map((item, index) => <section className="route-block" key={item.id}><h2>Recorrido {index + 1} · {item.metadata?.customer_snapshot?.name || item.service || "Cliente sin identificación histórica"}</h2><p><strong>Ruta:</strong> {item.route_description || "Sin descripción histórica"}</p><p><strong>Fecha del servicio:</strong> {date(item.service_date ? `${item.service_date.slice(0, 10)}T12:00:00Z` : undefined)}{item.metadata?.customer_snapshot?.tax_id ? ` · NIT cliente: ${item.metadata.customer_snapshot.tax_id}` : ""}</p><p><strong>Tiendas / lugares visitados</strong></p><ul className="stores">{(item.metadata?.destination_snapshots || (item.metadata?.destination_snapshot ? [item.metadata.destination_snapshot] : [])).map((point, pointIndex) => <li key={pointIndex}>{point.name} · {point.address} · {point.city}</li>)}</ul><table><thead><tr><th>Tarifario / concepto</th><th className="amount">Servicios</th><th className="amount">Valor unitario</th><th className="amount">Valor</th><th>Anexo</th></tr></thead><tbody>{item.criteria.map((row, rowIndex) => <tr key={rowIndex}><td>{row.concept}{row.support ? <div className="support">Soporte: {row.support}</div> : null}</td><td className="amount">{row.quantity}</td><td className="amount">{money(row.unit_value)}</td><td className="amount">{money(Math.round(Number(row.quantity) * Number(row.unit_value) * 100) / 100)}</td><td>{row.annex_id}</td></tr>)}</tbody></table><p className="amount"><strong>Total del recorrido: {money(item.adjusted_amount)}</strong></p></section>)}
    {pkg.adjustments.length ? <section><h2>Ajustes registrados</h2>{pkg.adjustments.map((entry, index) => <p key={index}>{entry.reason}: {money(entry.delta)}</p>)}</section> : null}
    {pkg.observation ? <p><strong>Observaciones:</strong> {pkg.observation}</p> : null}<div className="grand-total">TOTAL PARA FACTURAR<strong>{money(pkg.accounted_total)} {pkg.currency}</strong></div>
    {report.annexes.map(annex => { const draft = annex.definition ? rateCostDraftFromSnapshot(annex.definition) : null; if (draft) { if (annex.metrics.distance_km != null) draft.billable_km = String(annex.metrics.distance_km); if (annex.metrics.weight_kg != null) draft.preview_load = String(annex.metrics.weight_kg); if (annex.metrics.volume_m3 != null && draft.load_unit === "m3") draft.preview_load = String(annex.metrics.volume_m3); if (annex.metrics.wait_minutes != null) draft.preview_wait_min = String(annex.metrics.wait_minutes); if (draft.sim_origin_lat != null) draft.sim_origin_kind = "custom"; } return <section className="annex" key={annex.id}><h2>Anexo {annex.id} · Tarifario {annex.code} · v{annex.version || "—"}</h2><p>{annex.provenance} · Valor unitario aplicado: {money(annex.unit_value)}</p>{captures[annex.id] ? <img className="rate-capture-image" src={captures[annex.id]} alt={`Captura de etapa 4: ${annex.code}`} /> : draft ? <div data-rate-capture={annex.id}><div className="snapshot-title">Etapa 4 · Cálculo del costo · {annex.code} · v{annex.version}</div><fieldset disabled><RateCostDesigner draft={draft} onChange={noChange} sedes={[]} readOnly /></fieldset></div> : <p>No es posible capturar la etapa 4 de esta versión histórica. No se ha sustituido por otra tarifa.</p>}</section>; })}
  </main>;
}
