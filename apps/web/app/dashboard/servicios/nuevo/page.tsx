"use client";

import { api } from "@/lib/api";
import { ArrowLeft, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ServiceReference = { id: number | string; code: string; name: string; category: string; estimated_minutes: number; brand: string; model: string; parts: Array<{ id: number | string; name: string; quantity: number; unit: string }> };
type ServiceOrder = { id: number | string; number: string };
type ServiceOrderCreateResponse = ServiceOrder | { order?: ServiceOrder; data?: ServiceOrder };
type Technician = { id: number | string; code?: string; user?: { name?: string; email?: string } };
type ServiceType = { code: string; label: string; active?: boolean };
type OrderForm = {
  technician_id: string;
  scheduled_date: string;
  customer_name: string;
  customer_document: string;
  customer_phone: string;
  customer_address: string;
  invoice_number: string;
  notes: string;
};
type ServiceItemForm = { reference_id: string; service_type: string; quantity: string; description: string; observation: string };
const emptyItem = (serviceType = "montaje"): ServiceItemForm => ({ reference_id: "", service_type: serviceType, quantity: "1", description: "", observation: "" });

function createdOrderId(response: ServiceOrderCreateResponse | null | undefined) {
  if (!response) return null;
  if ("id" in response && response.id) return response.id;
  if ("order" in response && response.order?.id) return response.order.id;
  if ("data" in response && response.data?.id) return response.data.id;
  return null;
}

export default function NewServiceOrderPage() {
  const router = useRouter();
  const [references, setReferences] = useState<ServiceReference[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrderForm>({ technician_id: "", scheduled_date: "", customer_name: "", customer_document: "", customer_phone: "", customer_address: "", invoice_number: "", notes: "" });
  const [items, setItems] = useState<ServiceItemForm[]>([emptyItem()]);

  useEffect(() => {
    if (localStorage.getItem("role_name")?.toLowerCase() === "tecnico") {
      router.replace("/dashboard/servicios");
      return;
    }
    Promise.all([
      api<ServiceReference[]>("/api/v1/services/references?active=true"),
      api<Technician[]>("/api/v1/services/technicians"),
      api<ServiceType[]>("/api/v1/services/service-types")
    ]).then(([referenceRows, technicianRows, typeRows]) => {
      setReferences(referenceRows);
      setTechnicians(technicianRows);
      const activeTypes = typeRows.filter((item) => item.active !== false);
      setServiceTypes(activeTypes);
      if (activeTypes.length) {
        setItems((current) => current.map((item) => activeTypes.some((type) => type.code === item.service_type) ? item : { ...item, service_type: activeTypes[0].code }));
      }
    }).catch((error) => {
      setReferences([]);
      setTechnicians([]);
      setMessage(error instanceof Error ? error.message : "No fue posible cargar referencias.");
    });
  }, [router]);

  async function createOrder() {
    if (saving) return;
    const requiredFields: Array<[keyof OrderForm, string]> = [
      ["technician_id", "tecnico asignado"],
      ["scheduled_date", "fecha programada del servicio"],
      ["customer_name", "nombre del cliente"],
      ["customer_document", "cedula del cliente"],
      ["customer_phone", "telefono"],
      ["customer_address", "direccion"],
      ["notes", "observaciones operativas"]
    ];
    const missing = requiredFields.filter(([key]) => !form[key].trim()).map(([, label]) => label);
    if (missing.length) {
      setMessage(`Completa los campos obligatorios: ${missing.join(", ")}.`);
      return;
    }
    const invalidItem = items.findIndex((item) => !item.reference_id || !item.service_type || Number(item.quantity) <= 0);
    if (invalidItem >= 0) {
      setMessage(`Completa referencia, tipo de servicio y cantidad de la solicitud ${invalidItem + 1}.`);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const order = await api<ServiceOrderCreateResponse>("/api/v1/services/orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          technician_id: form.technician_id,
          reference_id: Number(items[0].reference_id),
          service_type: items[0].service_type,
          items: items.map((item, index) => ({ ...item, reference_id: Number(item.reference_id), quantity: Number(item.quantity), idempotency_key: `item-${index + 1}` })),
          metadata: {
            assignment: "selected_technician",
            customer_document: form.customer_document.trim()
          }
        })
      });
      const orderId = createdOrderId(order);
      if (!orderId) throw new Error("El servicio fue enviado, pero no se recibio el identificador de la orden.");
      router.push(`/dashboard/servicios/${orderId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible crear el servicio.");
    } finally {
      setSaving(false);
    }
  }

  const selectableServiceTypes = serviceTypes.length ? serviceTypes : [{ code: "montaje", label: "Montaje" }, { code: "desmontaje", label: "Desmontaje" }, { code: "ambos", label: "Montaje y desmontaje" }];
  function setItem(index: number, patch: Partial<ServiceItemForm>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-32 md:pb-6">
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <div>
          <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-neutral-600 hover:text-apex md:border-0 md:bg-transparent md:px-0" href="/dashboard/servicios"><ArrowLeft size={18} /> Volver</Link>
          <p className="text-sm font-medium text-apex">Servicios</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Nueva orden</h1>
        </div>
      </header>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">{message}</div> : null}

      <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold">Solicitudes de la orden</h2><p className="text-xs text-neutral-500">{items.length} solicitud(es), una sola OS</p></div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-50" disabled={items.length >= 20} onClick={() => setItems((current) => [...current, emptyItem(selectableServiceTypes[0]?.code)])} type="button"><Plus size={16} /> Agregar</button>
        </div>
        <div className="space-y-3">
          {items.map((item, index) => {
            const reference = references.find((row) => String(row.id) === item.reference_id);
            return <div className="rounded-md border border-line p-3" key={index}>
              <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Solicitud {index + 1}</span>{items.length > 1 ? <button aria-label={`Eliminar solicitud ${index + 1}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-rose-700" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><Trash2 size={16} /></button> : null}</div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_100px]">
                <label className="grid gap-1.5 text-sm font-medium text-neutral-700">Referencia *<select className="h-12 min-w-0 rounded-md border border-line bg-white px-3 text-base md:h-10 md:text-sm" value={item.reference_id} onChange={(event) => setItem(index, { reference_id: event.target.value })}><option value="">Selecciona</option>{references.map((row) => <option key={row.id} value={row.id}>{row.code} - {row.name}</option>)}</select></label>
                <label className="grid gap-1.5 text-sm font-medium text-neutral-700">Servicio *<select className="h-12 min-w-0 rounded-md border border-line bg-white px-3 text-base md:h-10 md:text-sm" value={item.service_type} onChange={(event) => setItem(index, { service_type: event.target.value })}>{selectableServiceTypes.map((row) => <option key={row.code} value={row.code}>{row.label}</option>)}</select></label>
                <label className="grid gap-1.5 text-sm font-medium text-neutral-700">Cantidad *<input className="h-12 min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" min="0.01" step="0.01" type="number" value={item.quantity} onChange={(event) => setItem(index, { quantity: event.target.value })} /></label>
                <label className="grid gap-1.5 text-sm font-medium text-neutral-700 md:col-span-3">Observacion especifica<input className="h-12 min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" value={item.observation} onChange={(event) => setItem(index, { observation: event.target.value })} /></label>
              </div>
              {reference ? <p className="mt-2 text-xs text-neutral-500">{reference.code} · {reference.parts.length} pieza(s) · {reference.estimated_minutes} min</p> : null}
            </div>;
          })}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700 md:col-span-2">
            Tecnico responsable *
            <select className="h-12 w-full min-w-0 rounded-md border border-line bg-white px-3 text-base md:h-10 md:text-sm" required value={form.technician_id} onChange={(event) => setForm((prev) => ({ ...prev, technician_id: event.target.value }))}>
              <option value="">Selecciona un tecnico operativo</option>
              {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.code || "TEC"} - {technician.user?.name || technician.user?.email || "Tecnico"}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
            Fecha programada del servicio *
            <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" required type="date" value={form.scheduled_date} onChange={(event) => setForm((prev) => ({ ...prev, scheduled_date: event.target.value }))} />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-4 text-base font-semibold">Datos del cliente</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
            Nombre completo *
            <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" required value={form.customer_name} onChange={(event) => setForm((prev) => ({ ...prev, customer_name: event.target.value }))} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
            Cedula del cliente *
            <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" inputMode="numeric" pattern="[0-9]*" required value={form.customer_document} onChange={(event) => setForm((prev) => ({ ...prev, customer_document: event.target.value.replace(/\D/g, "") }))} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
            Telefono *
            <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" inputMode="tel" required value={form.customer_phone} onChange={(event) => setForm((prev) => ({ ...prev, customer_phone: event.target.value }))} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
            Factura o pedido (opcional)
            <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" value={form.invoice_number} onChange={(event) => setForm((prev) => ({ ...prev, invoice_number: event.target.value }))} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700 md:col-span-2">
            Direccion completa del servicio *
            <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" required value={form.customer_address} onChange={(event) => setForm((prev) => ({ ...prev, customer_address: event.target.value }))} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700 md:col-span-2">
            Observaciones operativas *
            <textarea className="min-h-28 rounded-md border border-line px-3 py-3 text-base md:text-sm" required value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </label>
        </div>
      </section>

      <button className="hidden h-12 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-base font-semibold text-white disabled:opacity-60 md:inline-flex" disabled={saving} onClick={createOrder} type="button">
        <ClipboardCheck size={17} /> {saving ? "Creando..." : "Crear orden de servicio"}
      </button>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur md:hidden">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <Link className="inline-flex h-11 items-center justify-center rounded-md border border-line bg-white text-sm font-semibold" href="/dashboard/servicios">Cancelar</Link>
          <Link className="inline-flex h-11 items-center justify-center rounded-md border border-line bg-white text-sm font-semibold" href="/dashboard/servicios/referencias">Referencias</Link>
        </div>
        <button className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-base font-semibold text-white shadow-sm disabled:opacity-60" disabled={saving} onClick={createOrder} type="button">
          <ClipboardCheck size={18} /> {saving ? "Creando..." : "Crear orden"}
        </button>
      </div>
    </div>
  );
}
