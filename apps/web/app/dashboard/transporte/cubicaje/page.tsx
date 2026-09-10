"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { TransportCard, TransportMetric, transportInput, transportButton } from "@/components/transport/TransportUI";
import { VehicleProfilePicker, type StandardVehicleProfile } from "@/components/transport/VehicleProfilePicker";
import type { CargoContainer, CargoItem, PackingPlan } from "@/components/transport/packing-types";

const CargoScene = dynamic(() => import("@/components/transport/CargoScene"), {
  ssr: false,
  loading: () => <div className="grid h-[480px] place-items-center rounded-xl border border-line bg-paper text-sm text-neutral-500">Preparando ilustrador 3D…</div>
});

type Need = {
  id: number;
  code: string;
  lines: { id: number; sku: string; quantity: number; weight_kg: number; metadata?: { packing?: Partial<CargoItem> } }[];
};
type Workbench = {
  needs: Need[];
  vehicles: { id: number; plate: string; metadata?: { cargo_space?: CargoContainer } }[];
  trips: { id: number; code: string; vehicle_id?: number; needs: { need_id: number }[]; metadata?: { packing?: PackingPlan } }[];
  profiles: { id: string; name: string; container: CargoContainer }[];
  standard_profiles: StandardVehicleProfile[];
};

const initialContainer: CargoContainer = { length: 6, width: 2.4, height: 2.4, max_weight: 8000 };
const blankItem = (id: string): CargoItem => ({ id, label: "Producto", quantity: 1, length: 0.6, width: 0.4, height: 0.4, weight: 15, rotation: "upright", stackable: true, max_top_load: 60, stop: 1 });

export default function CubicajePage() {
  const [work, setWork] = useState<Workbench>({ needs: [], vehicles: [], trips: [], profiles: [], standard_profiles: [] });
  const [container, setContainer] = useState<CargoContainer>(initialContainer);
  const [items, setItems] = useState<CargoItem[]>([]);
  const [needIds, setNeedIds] = useState<number[]>([]);
  const [vehicle, setVehicle] = useState("");
  const [tripId, setTripId] = useState("");
  const [plan, setPlan] = useState<PackingPlan | null>(null);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unit, setUnit] = useState("cm");
  const [respectStops, setRespectStops] = useState(true);
  const [advanced, setAdvanced] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileId, setProfileId] = useState("");
  const [panel, setPanel] = useState<"space" | "orders" | "products" | null>(null);
  const generation = useRef(0);
  const canWrite = hasStoredRolePermission("transport", "write");
  const factor = unit === "m" ? 1 : unit === "cm" ? 0.01 : 0.001;

  const load = useCallback(async () => {
    try {
      setWork(await api<Workbench>("/api/v1/transport/packing/workbench", { cache: "no-store" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible cargar pedidos.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!panel) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPanel(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [panel]);

  const payload = useMemo(() => ({ container, items, need_ids: needIds, vehicle_id: vehicle ? Number(vehicle) : undefined, respect_stops: respectStops }), [container, items, needIds, vehicle, respectStops]);

  const evaluate = useCallback(async () => {
    const run = ++generation.current;
    setPlan(null);
    setError("");
    if (!items.length) return;
    setBusy(true);
    try {
      const result = await api<PackingPlan>("/api/v1/transport/packing/evaluate", { method: "POST", body: JSON.stringify(payload) });
      if (run === generation.current) { setPlan(result); setStep(result.placements.length); setSelected(""); }
    } catch (e) {
      if (run === generation.current) setError(e instanceof Error ? e.message : "No fue posible calcular.");
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }, [items.length, payload]);

  useEffect(() => {
    const effectGeneration = generation.current + 1;
    generation.current = effectGeneration;
    setPlan(null);
    setNotice("");
    if (!canWrite) return;
    const timer = setTimeout(() => { void evaluate(); }, 450);
    return () => {
      clearTimeout(timer);
      if (generation.current === effectGeneration) generation.current = effectGeneration + 1;
    };
  }, [evaluate, canWrite]);

  function loadNeeds(ids: number[]) {
    setNeedIds(ids);
    setItems(ids.flatMap((id, index) => {
      const n = work.needs.find(row => row.id === id);
      return n?.lines.map(line => ({
        ...blankItem(`${id}:${line.id}`),
        length: 0, width: 0, height: 0,
        ...line.metadata?.packing,
        id: `${id}:${line.id}`,
        order_id: id,
        label: `${n.code} · ${line.sku}`,
        sku: line.sku,
        quantity: Number(line.quantity),
        weight: Number(line.metadata?.packing?.weight ?? Number(line.weight_kg) / Number(line.quantity)),
        stop: index + 1
      })) || [];
    }));
  }

  function selectTrip(value: string) {
    setTripId(value);
    const trip = work.trips.find(t => t.id === Number(value));
    if (trip) {
      loadNeeds(trip.needs.map(n => n.need_id));
      if (trip.vehicle_id) setVehicle(String(trip.vehicle_id));
      if (trip.metadata?.packing) { setContainer(trip.metadata.packing.container); setItems(trip.metadata.packing.items); }
    }
  }

  function changeItem(id: string, patch: Partial<CargoItem>) { setItems(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r)); }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/v1/transport/trips/${tripId}/packing`, { method: "POST", body: JSON.stringify(payload) });
      setNotice("Cubicaje guardado en el viaje con versión y trazabilidad.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  function applyProfile(profile: { id: string; name: string; container: CargoContainer }) { setProfileId(profile.id); setContainer(profile.container); }

  async function saveProfile() {
    setError("");
    try {
      await api("/api/v1/transport/packing/profiles", { method: "POST", body: JSON.stringify({ id: profileName.trim().toLowerCase().replace(/\s+/g, "-"), name: profileName, container }) });
      setNotice("Perfil de espacio guardado para esta empresa.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar perfil.");
    }
  }

  function exportPlan() {
    if (!plan) return;
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cubicaje.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedBox = plan?.placements.find(p => p.unit_id === selected);

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div>
          <p className="text-sm font-medium text-apex">M-14 · Planeación de carga</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Cubicaje inteligente</h1>
          <p className="mt-1 text-sm text-neutral-600">Carga virtualmente tus pedidos. Comprueba qué cabe, cómo se acomoda y qué requiere otra solución.</p>
        </div>
      </header>

      {error ? <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-apex p-3 text-sm text-apex">{notice}</p> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TransportMetric label="Bultos ubicados" value={plan ? `${plan.placements.length} / ${plan.requested_units}` : "—"} percent={plan?.requested_units ? plan.placements.length / plan.requested_units * 100 : 0} safeWhenFull />
        <TransportMetric label="Volumen ocupado" value={plan ? `${plan.volume_utilization_pct.toFixed(1)}%` : "—"} percent={plan?.volume_utilization_pct || 0} hint={plan ? `${plan.packed_volume.toFixed(2)} m³` : undefined} />
        <TransportMetric label="Carga útil utilizada" value={plan ? `${plan.weight_utilization_pct.toFixed(1)}%` : "—"} percent={plan?.weight_utilization_pct || 0} hint={plan ? `${plan.total_weight.toLocaleString()} kg` : undefined} />
        <TransportMetric label="Resultado" value={busy ? "Calculando…" : plan?.feasible ? "Cabe" : plan ? "Revisar" : "Sin carga"} />
      </section>

      <section className="flex flex-wrap gap-2 rounded-xl border border-line bg-white p-2" aria-label="Configurar cubicaje">
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-apex hover:text-apex" onClick={() => setPanel("space")}>1. Espacio y vehículo</button>
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-apex hover:text-apex" onClick={() => setPanel("orders")}>2. Pedidos y viaje <span className="ml-1 rounded-full bg-paper px-2 py-0.5 text-xs">{needIds.length}</span></button>
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-apex hover:text-apex" onClick={() => setPanel("products")}>3. Productos <span className="ml-1 rounded-full bg-paper px-2 py-0.5 text-xs">{items.length}</span></button>
      </section>

      <div className="min-w-0">
        <section className="min-w-0 space-y-4">
          <CargoScene container={plan?.container || container} plan={plan} step={step} selected={selected} onSelect={setSelected} />

          {plan ? (
            <div className="rounded-xl border border-line bg-white p-4">
              <label className="flex flex-wrap items-center gap-3 text-sm">
                Cargue virtual: {step} de {plan.placements.length}
                <input aria-label="Paso de cargue" className="min-w-40 flex-1 accent-apex" type="range" min="0" max={plan.placements.length} value={step} onChange={e => setStep(Number(e.target.value))} />
              </label>
              <p className="mt-2 text-xs text-neutral-500">
                {selectedBox
                  ? `${selectedBox.label} · ${selectedBox.weight} kg · posición ${selectedBox.x.toFixed(2)}, ${selectedBox.y.toFixed(2)}, ${selectedBox.z.toFixed(2)} m · carga superior ${selectedBox.load_above.toFixed(1)} kg`
                  : "Selecciona un bulto en el camión o en la tabla para inspeccionarlo. Punto rojo: centro de gravedad de la carga."}
              </p>
            </div>
          ) : null}

          {plan?.unplaced.length ? (
            <TransportCard title="Bultos que requieren otra solución">
              <ul className="space-y-1 text-sm">
                {plan.unplaced.slice(0, 30).map(p => <li key={p.unit_id}>{p.label} · {p.unit_id}: {p.reason}</li>)}
              </ul>
            </TransportCard>
          ) : null}

          {plan ? (
            <details className="rounded-xl border border-line bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold">Ver posiciones y secuencia de cargue</summary>
              <div className="mt-3 max-h-72 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr><th>Bulto</th><th>X / Y / Z (m)</th><th>Espacio</th><th>Apoyo</th></tr></thead>
                  <tbody>
                    {plan.placements.map((p, i) => (
                      <tr key={p.unit_id} className="border-t border-line">
                        <td><button className="py-2 text-apex" onClick={() => { setSelected(p.unit_id); setStep(Math.max(step, i + 1)); }}>{i + 1}. {p.label}</button></td>
                        <td>{[p.x, p.y, p.z].map(v => v.toFixed(2)).join(" / ")}</td>
                        <td>{p.space_id}</td>
                        <td>{p.support_id || "Piso"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
            <p className="max-w-lg text-xs text-neutral-500">Acomodo factible por búsqueda heurística; no garantiza óptimo global. Verifica sujeción, estabilidad dinámica y límites por eje antes de cargar físicamente.</p>
            <div className="flex gap-2">
              <button disabled={!plan || busy} className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-40" onClick={exportPlan}>Exportar</button>
              <button className={transportButton} disabled={!canWrite || !tripId || !plan?.feasible || busy} onClick={() => void save()}>Guardar en viaje</button>
            </div>
          </footer>
        </section>

        {panel ? <aside aria-label="Configuración de cubicaje" aria-modal="true" role="dialog" className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-3 backdrop-blur-sm sm:p-6" onMouseDown={() => setPanel(null)}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-line bg-paper p-3 shadow-2xl sm:p-5" onMouseDown={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-4 px-1">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Cubicaje inteligente</p><h2 className="text-xl font-semibold">{panel === "space" ? "Espacio y vehículo" : panel === "orders" ? "Pedidos y viaje" : "Productos y restricciones"}</h2></div>
              <button aria-label="Cerrar configuración" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-xl hover:border-apex" onClick={() => setPanel(null)}>×</button>
            </div>
          <div className={panel === "space" ? "block" : "hidden"}>
          <TransportCard title="1. Espacio de carga">
            <fieldset disabled={!canWrite} className="space-y-3">
              <label className="block text-sm">Vehículo
                <select className={transportInput} value={vehicle} onChange={e => { setVehicle(e.target.value); const c = work.vehicles.find(v => v.id === Number(e.target.value))?.metadata?.cargo_space; if (c) setContainer(c); }}>
                  <option value="">Simular un espacio</option>
                  {work.vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                </select>
              </label>
              <div className="space-y-1">
                <span className="block text-sm font-medium">Tipo de vehículo estándar</span>
                <VehicleProfilePicker profiles={work.standard_profiles} selected={profileId} onSelect={applyProfile} />
              </div>
              {work.profiles.length ? (
                <label className="block text-sm">Perfil de la empresa
                  <select className={transportInput} value="" onChange={e => { const p = work.profiles.find(p => p.id === e.target.value); if (p) applyProfile(p); }}>
                    <option value="">Seleccionar perfil guardado</option>
                    {work.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="block text-sm">Unidad de dimensiones
                <select value={unit} className={transportInput} onChange={e => setUnit(e.target.value)}>
                  <option value="cm">Centímetros</option>
                  <option value="m">Metros</option>
                  <option value="mm">Milímetros</option>
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([[
                  "length", "Largo"
                ], [
                  "width", "Ancho"
                ], [
                  "height", "Alto"
                ]] as const).map(([key, label]) => (
                  <label className="text-xs" key={key}>{label} ({unit})
                    <input aria-label={`${label} interior`} type="number" min="0.01" step="any" className={transportInput} value={Number((container[key] / factor).toFixed(4))} onChange={e => setContainer(c => ({ ...c, [key]: Number(e.target.value) * factor }))} />
                  </label>
                ))}
              </div>
              <label className="block text-sm">Carga útil máxima (kg)
                <input type="number" min="1" className={transportInput} value={container.max_weight} onChange={e => setContainer(c => ({ ...c, max_weight: Number(e.target.value) }))} />
              </label>
              <details>
                <summary className="cursor-pointer text-sm text-apex">Compartimientos y obstáculos</summary>
                <p className="mt-2 text-xs text-neutral-500">Coordenadas en metros desde la cabina. Espacios separados pueden restringir grupos y temperatura. Un espacio elevado se interpreta como un piso estructural.</p>
                <textarea aria-label="Configuración de espacios" className="mt-2 min-h-36 w-full rounded border border-line bg-white p-2 font-mono text-xs" placeholder={'{"spaces":[{"id":"principal","x":0,"y":0,"z":0,"length":6,"width":2.4,"height":2.4}],"obstacles":[]}'} value={advanced} onChange={e => setAdvanced(e.target.value)} />
                <button type="button" className="mt-2 text-sm text-apex" onClick={() => {
                  try {
                    const value = JSON.parse(advanced);
                    if (!Array.isArray(value.spaces) || !Array.isArray(value.obstacles)) throw Error("Se requieren listas spaces y obstacles.");
                    setContainer(c => ({ ...c, spaces: value.spaces, obstacles: value.obstacles }));
                    setError("");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Configuración inválida");
                  }
                }}>Aplicar espacios</button>
              </details>
              <details>
                <summary className="cursor-pointer text-sm text-apex">Guardar como perfil</summary>
                <input aria-label="Nombre del perfil" className={transportInput} placeholder="Ej. Furgón seco 8 toneladas" value={profileName} onChange={e => setProfileName(e.target.value)} />
                <button className="mt-2 text-sm text-apex" onClick={() => void saveProfile()} disabled={!profileName.trim()}>Guardar perfil</button>
              </details>
            </fieldset>
          </TransportCard>
          </div>
          <div className={panel === "orders" ? "block" : "hidden"}>
          <TransportCard title="2. Pedidos y viaje">
            <label className="block text-sm">Viaje para guardar
              <select className={transportInput} value={tripId} onChange={e => selectTrip(e.target.value)}>
                <option value="">Escenario sin viaje</option>
                {work.trips.map(t => <option key={t.id} value={t.id}>{t.code}</option>)}
              </select>
            </label>
            <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
              {work.needs.map(n => (
                <label key={n.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={needIds.includes(n.id)} disabled={!canWrite || !!tripId} onChange={e => loadNeeds(e.target.checked ? [...needIds, n.id] : needIds.filter(id => id !== n.id))} />
                  <span>{n.code}<small className="block text-neutral-500">{n.lines.length} productos{!n.lines.length ? " · Falta detalle" : ""}</small></span>
                </label>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={respectStops} onChange={e => setRespectStops(e.target.checked)} />
              Respetar orden de descarga
            </label>
            <p className="mt-2 text-xs text-neutral-500">La primera entrega queda accesible desde la puerta trasera. Cantidades de pedidos protegidas contra cambios accidentales.</p>
          </TransportCard>
          </div>
          <div className={panel === "products" ? "block" : "hidden"}>
          <TransportCard title="3. Productos y restricciones">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-neutral-500">Dimensiones por bulto ({unit}) · Peso por bulto (kg) · Máximo 250 bultos.</p>
              {!needIds.length ? <button disabled={!canWrite} className="text-sm font-semibold text-apex" onClick={() => setItems(rows => [...rows, blankItem(`manual-${Date.now()}`)])}>Añadir producto</button> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr>{["Producto", "Bultos", "Largo", "Ancho", "Alto", "kg", "Orientación", "Carga encima (kg)", "Entrega", ""].map((name, i) => <th key={i} className="px-1 pb-2">{name}</th>)}</tr></thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td className="min-w-36 px-1"><input aria-label={`Producto ${item.id}`} className={transportInput} value={item.label} disabled={!!item.order_id || !canWrite} onChange={e => changeItem(item.id, { label: e.target.value })} /></td>
                      <td className="min-w-16 px-1"><input aria-label={`Cantidad ${item.label}`} className={transportInput} type="number" min="1" max="250" value={item.quantity} disabled={!!item.order_id || !canWrite} onChange={e => changeItem(item.id, { quantity: Number(e.target.value) })} /></td>
                      {(["length", "width", "height"] as const).map(key => (
                        <td key={key} className="min-w-20 px-1"><input aria-label={`${key} ${item.label}`} className={transportInput} type="number" min="0.01" step="any" value={Number((item[key] / factor).toFixed(4))} disabled={!canWrite} onChange={e => changeItem(item.id, { [key]: Number(e.target.value) * factor })} /></td>
                      ))}
                      <td className="min-w-20 px-1"><input aria-label={`Peso ${item.label}`} className={transportInput} type="number" min="0.01" step="any" value={item.weight} disabled={!canWrite} onChange={e => changeItem(item.id, { weight: Number(e.target.value) })} /></td>
                      <td className="px-1">
                        <select aria-label={`Orientación ${item.label}`} className={transportInput} value={item.rotation} disabled={!canWrite} onChange={e => changeItem(item.id, { rotation: e.target.value as CargoItem["rotation"] })}>
                          <option value="upright">Vertical</option>
                          <option value="free">Libre</option>
                          <option value="none">Fija</option>
                        </select>
                      </td>
                      <td className="min-w-24 px-1"><input aria-label={`Carga superior ${item.label}`} className={transportInput} type="number" min="0" value={item.stackable ? item.max_top_load : 0} disabled={!canWrite} onChange={e => changeItem(item.id, { max_top_load: Number(e.target.value), stackable: Number(e.target.value) > 0 })} /></td>
                      <td className="min-w-16 px-1"><input aria-label={`Entrega ${item.label}`} className={transportInput} type="number" min="1" value={item.stop} disabled={!!item.order_id || !canWrite} onChange={e => changeItem(item.id, { stop: Number(e.target.value) })} /></td>
                      <td>{!item.order_id && <button aria-label={`Quitar ${item.label}`} className="px-2 text-rose-700" disabled={!canWrite} onClick={() => setItems(rows => rows.filter(r => r.id !== item.id))}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!items.length ? <p className="py-6 text-center text-sm text-neutral-500">Selecciona pedidos o añade productos para comenzar.</p> : null}
            <p className="mt-3 text-xs text-neutral-500">Carga encima = 0 impide apilar sobre el bulto. Vertical conserva su altura. No se admiten piezas flotantes ni solapamientos.</p>
          </TransportCard>
          </div>
          </div>
        </aside> : null}
      </div>
    </div>
  );
}
