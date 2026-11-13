"use client";
import { TransportSearchSelect } from "@/components/transport/TransportSearchSelect";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
export type RateMetrics = { distance_km?: number; weight_kg?: number; volume_m3?: number; stop_count?: number; wait_minutes?: number };
export type ChargeCriterion = { concept: string; quantity: number; unit_value: number; support: string; rate_card_id?: number; rate_version?: number; rate_code?: string; metrics?: RateMetrics; _key?: string; pricing?: boolean; price_error?: string };
type RateOption = { id: number; code: string; name: string; version: number; currency: string; valid_from: string; valid_to?: string; unit_amount: number | null; default_metrics: RateMetrics; requires_distance: boolean; requires_weight: boolean; requires_volume: boolean; has_stops: boolean; has_wait: boolean; route_description: string };
const newCriterion = (): ChargeCriterion => ({ concept: "", quantity: 1, unit_value: 0, support: "", _key: crypto.randomUUID() });
export type SettlementDocumentDraft = { id?: number; delivery_point_id?: number; delivery_point_ids?: number[]; customer_id?: number; guide_reference: string; service: string; route_description: string; service_date: string; charge_criteria: ChargeCriterion[] };
export const newSettlementDocument = (): SettlementDocumentDraft => ({ guide_reference: "", service: "", route_description: "", service_date: "", charge_criteria: [newCriterion()] });
export const documentTotal = (doc: SettlementDocumentDraft) => doc.charge_criteria.reduce((total, row) => total + Math.round(Math.round(row.unit_value * 100) * row.quantity) / 100, 0);
const cop = (amount: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(amount);
const input = "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm";

export const settlementDocumentPayload = (doc: SettlementDocumentDraft) => ({ ...doc, guide_reference: doc.guide_reference || undefined, service_date: doc.service_date || undefined, charge_criteria: doc.charge_criteria.map(({ concept, quantity, unit_value, support, rate_card_id, rate_version, metrics }) => ({ concept, quantity, unit_value, support, rate_card_id, rate_version, metrics })) });

export function SettlementDocumentsEditor({ documents, onChange, vehicleId, currency = "COP", onReadyChange }: { documents: SettlementDocumentDraft[]; onChange: (value: SettlementDocumentDraft[]) => void; vehicleId?: number; currency?: string; onReadyChange: (ready: boolean) => void }) {
  const [destinations, setDestinations] = useState<{ id: number; code: string; name: string; city: string; address: string; customer_party_id?: number }[]>([]);
  const [storeSearch, setStoreSearch] = useState<Record<number, string>>({});
  const [openStoreSearch, setOpenStoreSearch] = useState<number | null>(null);
  const [activeStoreOption, setActiveStoreOption] = useState(0);
  const storeListId = useRef(`stores-${crypto.randomUUID()}`);
  const [destinationError, setDestinationError] = useState("");
  useEffect(() => { let active = true; api<typeof destinations>("/api/v1/transport/settlement-destinations").then(rows => { if (active) setDestinations(rows); }).catch(error => { if (active) setDestinationError(error instanceof Error ? error.message : "No fue posible cargar destinos."); }); return () => { active = false; }; }, []);
  const [customers, setCustomers] = useState<{ id: number; name: string; tax_id?: string }[]>([]);
  const [customerError, setCustomerError] = useState("");
  useEffect(() => { let active = true; api<{ id: number; name: string; tax_id?: string }[]>("/api/v1/transport/settlement-customers").then(rows => { if (active) setCustomers(rows); }).catch(error => { if (active) setCustomerError(error instanceof Error ? error.message : "No fue posible cargar los clientes."); }); return () => { active = false; }; }, []);
  const [rates, setRates] = useState<RateOption[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const latest = useRef({ documents, onChange, vehicleId, currency });
  latest.current = { documents, onChange, vehicleId, currency };
  const requests = useRef(new Map<string, number>());
  const requestSequence = useRef(0);
  useEffect(() => {
    let current = true;
    requests.current.clear(); setRates([]); setCatalogError("");
    if (!vehicleId) return;
    setCatalogLoading(true);
    api<RateOption[]>(`/api/v1/transport/settlement-rate-options?vehicle_id=${vehicleId}&currency=${currency}`).then(rows => { if (current) setRates(rows); }).catch(error => { if (current) setCatalogError(error instanceof Error ? error.message : "No fue posible cargar los tarifarios."); }).finally(() => { if (current) setCatalogLoading(false); });
    return () => { current = false; };
  }, [vehicleId, currency]);
  useEffect(() => { onReadyChange(Boolean(vehicleId) && documents.every(doc => Boolean(doc.delivery_point_ids?.length || doc.delivery_point_id) && Boolean(doc.customer_id) && doc.charge_criteria.every(row => Boolean(row.rate_card_id) && !row.pricing && !row.price_error))); }, [documents, vehicleId, onReadyChange]);
  const update = (index: number, patch: Partial<SettlementDocumentDraft>) => latest.current.onChange(latest.current.documents.map((doc, i) => i === index ? { ...doc, ...patch } : doc));
  const criterion = (index: number, row: number, patch: Partial<ChargeCriterion>) => update(index, { charge_criteria: latest.current.documents[index].charge_criteria.map((entry, i) => i === row ? { ...entry, ...patch } : entry) });
  async function assign(index: number, r: number, rateId: number, metrics?: RateMetrics) {
    const current = latest.current; const row = current.documents[index]?.charge_criteria[r];
    if (!row) return;
    const key = row._key || crypto.randomUUID();
    const request = ++requestSequence.current; requests.current.set(key, request);
    const rate = rates.find(rate => rate.id === rateId);
    criterion(index, r, { _key: key, rate_card_id: rateId || undefined, rate_version: rate?.version, concept: rate ? `${rate.code} · ${rate.name}` : "", unit_value: 0, metrics: metrics || rate?.default_metrics, pricing: Boolean(rate), price_error: "" });
    if (!rate) return;
    try {
      const quote = await api<ChargeCriterion>("/api/v1/transport/settlement-criterion-quote", { method: "POST", body: JSON.stringify({ rate_card_id: rate.id, rate_version: rate.version, vehicle_id: current.vehicleId, currency: current.currency, service_date: current.documents[index].service_date || undefined, metrics: metrics || rate.default_metrics }) });
      if (requests.current.get(key) !== request || latest.current.vehicleId !== current.vehicleId) return;
      latest.current.onChange(latest.current.documents.map(doc => ({ ...doc, route_description: doc.charge_criteria.some(entry => entry._key === key) ? doc.route_description || rate.route_description : doc.route_description, charge_criteria: doc.charge_criteria.map(entry => entry._key === key ? { ...entry, ...quote, support: entry.support, quantity: entry.quantity, pricing: false, price_error: "" } : entry) })));
    } catch (error) {
      if (requests.current.get(key) !== request || latest.current.vehicleId !== current.vehicleId) return;
      latest.current.onChange(latest.current.documents.map(doc => ({ ...doc, charge_criteria: doc.charge_criteria.map(entry => entry._key === key ? { ...entry, pricing: false, unit_value: 0, price_error: error instanceof Error ? error.message : "No fue posible calcular la tarifa." } : entry) })));
    }
  }
  return <section className="space-y-3" aria-label="Destinos y criterios de cobro">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Destinos y criterios de cobro</h3><button type="button" className="rounded-md border border-line px-3 py-2 text-sm" disabled={documents.length >= 500} onClick={() => onChange([...documents, newSettlementDocument()])}>Agregar recorrido</button></div>
    {!vehicleId ? <p className="text-sm text-amber-800">Selecciona primero el vehículo del paquete.</p> : catalogLoading ? <p role="status">Cargando tarifarios…</p> : catalogError ? <p role="alert" className="text-sm text-rose-700">{catalogError}</p> : !rates.length ? <p className="text-sm text-amber-800">No hay tarifarios activos para este vehículo y moneda. Parametrízalos en Costos y tarifas.</p> : null}
    <p className="text-sm"><a className="text-apex underline" href="/dashboard/administracion?catalog=transport_destinations" target="_blank" rel="noreferrer">Configurar destinos / tiendas</a> · <button type="button" className="text-apex underline" onClick={() => { setDestinationError(""); void api<typeof destinations>("/api/v1/transport/settlement-destinations").then(setDestinations).catch(error => setDestinationError(error.message)); }}>Actualizar destinos</button></p>
    {destinationError ? <p role="alert">{destinationError}</p> : !destinations.length ? <p>No hay destinos activos. Configura tus tiendas en el maestro.</p> : null}
    {customerError ? <p role="alert" className="text-sm text-rose-700">{customerError}</p> : !customers.length ? <p className="text-sm text-amber-800">No hay clientes disponibles. Regístralos en Ventas → Clientes y vuelve a abrir el paquete.</p> : null}
    {documents.map((doc, index) => <fieldset className="min-w-0 space-y-3 rounded-lg border border-line p-3" key={index}>
      <legend className="px-1 text-sm font-semibold">Recorrido {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(() => {
          const selected = doc.delivery_point_ids || (doc.delivery_point_id ? [doc.delivery_point_id] : []);
          const query = storeSearch[index] || "";
          const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const matches = destinations.filter(point => !selected.includes(point.id) && (!point.customer_party_id || !doc.customer_id || point.customer_party_id === doc.customer_id) && normalize(`${point.name} ${point.city} ${point.code}`).includes(normalize(query.trim()))).slice(0, 20);
          const expanded = openStoreSearch === index && Boolean(query.trim());
          const listId = `${storeListId.current}-${index}`;
          const choose = (point: typeof destinations[number]) => {
            const customer = customers.find(customer => customer.id === point.customer_party_id);
            update(index, { delivery_point_ids: [...new Set([...selected, point.id])], delivery_point_id: undefined, ...(customer ? { customer_id: customer.id, service: customer.name } : {}) });
            setStoreSearch(current => ({ ...current, [index]: "" })); setActiveStoreOption(0);
          };
          return <div className="min-w-0 sm:col-span-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpenStoreSearch(null); }}>
            <label className="text-sm" htmlFor={`${listId}-search`}>Destinos / tiendas visitadas *</label>
            <div className="mt-1 rounded-md border border-line bg-surface p-2 focus-within:border-apex focus-within:ring-1 focus-within:ring-apex">
              {selected.length ? <div className="mb-2 flex flex-wrap gap-2">{selected.map(id => { const point = destinations.find(point => point.id === id); const name = point?.name || `Tienda #${id}`; return <span key={id} className="inline-flex max-w-full items-center gap-2 rounded-full border settlement-store-tag border-line px-3 py-1 text-sm"><span className="truncate" title={point ? `${point.name} · ${point.city} · ${point.code}` : name}>{name}</span><button type="button" aria-label={`Quitar tienda ${index + 1}: ${name}`} className="rounded-full px-1 font-semibold hover:bg-paper focus-visible:outline focus-visible:outline-2" onClick={() => update(index, { delivery_point_ids: selected.filter(value => value !== id), delivery_point_id: undefined })}>×</button></span>; })}</div> : null}
              <input id={`${listId}-search`} aria-label={`Buscar tiendas del recorrido ${index + 1}`} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId} aria-activedescendant={expanded && matches.length ? `${listId}-${matches[Math.min(activeStoreOption, matches.length - 1)].id}` : undefined} autoComplete="off" className="settlement-store-search w-full min-w-0 bg-transparent px-1 py-1 text-sm outline-none" placeholder="Buscar tienda por nombre, ciudad o código…" value={query} onFocus={() => setOpenStoreSearch(index)} onChange={event => { setStoreSearch(current => ({ ...current, [index]: event.target.value })); setOpenStoreSearch(index); setActiveStoreOption(0); }} onKeyDown={event => {
                if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpenStoreSearch(null); return; }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpenStoreSearch(index); setActiveStoreOption(current => Math.max(0, Math.min(matches.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
                if (event.key === "Enter") { event.preventDefault(); if (expanded && matches.length) choose(matches[Math.min(activeStoreOption, matches.length - 1)]); }
              }} />
            </div>
            {expanded ? <div id={listId} role="listbox" aria-label={`Resultados de tiendas ${index + 1}`} className="mt-1 max-h-48 overflow-y-auto rounded-md border border-line bg-surface shadow-sm">{matches.length ? matches.map((point, option) => <button id={`${listId}-${point.id}`} key={point.id} type="button" role="option" aria-selected={activeStoreOption === option} aria-label={`Agregar tienda ${index + 1}: ${point.name} · ${point.code}`} className={`block w-full px-3 py-2 text-left text-sm hover:bg-paper ${activeStoreOption === option ? "bg-paper" : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(point)}><span className="block font-medium">{point.name}</span><span className="block text-xs text-content-muted">{point.city} · {point.code}</span></button>) : <p role="status" className="p-3 text-sm text-content-muted">No hay tiendas disponibles que coincidan.</p>}</div> : null}
            <p className="mt-1 text-xs text-content-muted">{selected.length} tienda(s) seleccionada(s).</p>
          </div>;
        })()}

        <label className="text-sm">Fecha del servicio<input className={input} type="date" value={doc.service_date} onChange={(e) => update(index, { service_date: e.target.value, charge_criteria: doc.charge_criteria.map(row => { if (row._key) requests.current.set(row._key, ++requestSequence.current); return { ...row, rate_card_id: undefined, unit_value: 0, pricing: false, price_error: "" }; }) })} /></label>
        <label className="text-sm">Cliente del servicio *<TransportSearchSelect aria-label={`Cliente del servicio ${index + 1}`} className={input} required value={doc.customer_id || ""} onChange={(e) => { const customer = customers.find(row => row.id === Number(e.target.value)); update(index, { customer_id: customer?.id, service: customer?.name || "", delivery_point_id: undefined, delivery_point_ids: [] }); }}><option value="">Selecciona un cliente...</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.tax_id ? ` · ${customer.tax_id}` : ""}</option>)}</TransportSearchSelect>{!doc.customer_id && doc.service ? <span className="text-xs text-amber-800">Servicio histórico: {doc.service}. Asigna su cliente para guardar.</span> : null}</label>
        <label className="text-sm">Recorrido del tarifario<input aria-label="Recorrido del tarifario" className={`${input} bg-paper`} maxLength={240} readOnly value={[...new Set(doc.charge_criteria.map(row => rates.find(rate => rate.id === row.rate_card_id)?.route_description).filter(Boolean))].join(" / ") || doc.route_description} /></label>
      </div>
      {doc.charge_criteria.map((row, r) => <div className="grid gap-2 rounded-md bg-paper p-3 sm:grid-cols-6" key={r}>
        <label className="text-sm sm:col-span-2">Flete / tarifario *<TransportSearchSelect aria-label={`Criterio ${index + 1}.${r + 1}`} className={input} required disabled={!vehicleId || catalogLoading} value={row.rate_card_id || ""} onChange={(e) => void assign(index, r, Number(e.target.value))}><option value="">Selecciona un tarifario...</option>{rates.filter(rate => { const date = new Date(doc.service_date || new Date()); return new Date(rate.valid_from) <= date && (!rate.valid_to || new Date(rate.valid_to) >= date); }).map(rate => <option key={rate.id} value={rate.id}>{rate.code} · {rate.name} · v{rate.version}{rate.unit_amount != null ? ` · ${cop(rate.unit_amount)}` : " · Según recorrido"}</option>)}</TransportSearchSelect></label>
        <label className="text-sm">Servicios *<input aria-label={`Cantidad ${index + 1}.${r + 1}`} className={input} type="number" required min="0.0001" max={1000000} step="0.0001" value={row.quantity} onChange={(e) => criterion(index, r, { quantity: Number(e.target.value) })} /></label>
        <label className="text-sm sm:col-span-2">Valor por servicio (COP)<input aria-label={`Valor ${index + 1}.${r + 1}`} className={`${input} bg-paper`} type="number" readOnly value={row.unit_value} />{row.pricing ? <span role="status" className="text-xs text-content-muted">Calculando…</span> : null}</label>
        <button className="self-end rounded-md border border-line p-2 text-sm disabled:opacity-40" disabled={doc.charge_criteria.length === 1} type="button" onClick={() => update(index, { charge_criteria: doc.charge_criteria.filter((_, i) => i !== r) })}>Quitar criterio</button>
        {(() => { const rate = rates.find(rate => rate.id === row.rate_card_id); return ([
          ["distance_km", "Kilómetros del recorrido", rate?.requires_distance], ["weight_kg", "Peso (kg)", rate?.requires_weight], ["volume_m3", "Volumen (m³)", rate?.requires_volume], ["stop_count", "Entregas / paradas", rate?.has_stops], ["wait_minutes", "Tiempo de espera (min)", rate?.has_wait]
        ] as const).filter(([, , enabled]) => enabled).map(([key, label]) => <label className="text-sm sm:col-span-2" key={key}>{label}<input aria-label={`${label} ${index + 1}.${r + 1}`} className={input} type="number" min={key === "stop_count" || key === "wait_minutes" ? 0 : 0.0001} max={1e9} step={key === "stop_count" ? 1 : "0.0001"} value={row.metrics?.[key] ?? 0} readOnly /></label>); })()}
        {row.price_error ? <p role="alert" className="text-sm text-rose-700 sm:col-span-6">{row.price_error}</p> : null}
        <label className="text-sm sm:col-span-6">Soporte del cobro en este destino *<input aria-label={`Soporte ${index + 1}.${r + 1}`} className={input} placeholder="Referencia o comprobante" required maxLength={1000} value={row.support} onChange={(e) => criterion(index, r, { support: e.target.value })} /></label>
      </div>)}
      <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className="rounded-md border border-line px-3 py-2 text-sm" disabled={doc.charge_criteria.length >= 50} onClick={() => update(index, { charge_criteria: [...doc.charge_criteria, newCriterion()] })}>Agregar criterio</button><strong>{cop(documentTotal(doc))}</strong><button type="button" className="text-sm text-rose-700 disabled:opacity-40" disabled={documents.length === 1 || Boolean(doc.id)} onClick={() => onChange(documents.filter((_, i) => i !== index))}>Quitar recorrido</button></div>
    </fieldset>)}

    <p className="text-right font-semibold">Total del paquete: {cop(documents.reduce((total, doc) => total + documentTotal(doc), 0))}</p>
  </section>;
}
