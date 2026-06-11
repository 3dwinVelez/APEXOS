"use client";

import { api } from "@/lib/api";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ServiceReference = { id: number | string; code: string; name: string; category: string; estimated_minutes: number; brand: string; model: string; parts: Array<{ id: number | string; name: string; quantity: number; unit: string }> };
type ServiceOrder = { id: number | string; number: string };
type ServiceOrderCreateResponse = ServiceOrder | { order?: ServiceOrder; data?: ServiceOrder };
type Technician = { id: number | string; code?: string; user?: { name?: string; email?: string } };
type OrderForm = {
  reference_id: string;
  technician_id: string;
  service_type: string;
  scheduled_date: string;
  cedi_delivery_date: string;
  customer_name: string;
  customer_document: string;
  customer_phone: string;
  customer_address: string;
  invoice_number: string;
  notes: string;
};

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
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrderForm>({ reference_id: "", technician_id: "", service_type: "montaje", scheduled_date: "", cedi_delivery_date: "", customer_name: "", customer_document: "", customer_phone: "", customer_address: "", invoice_number: "", notes: "" });

  useEffect(() => {
    if (localStorage.getItem("role_name")?.toLowerCase() === "tecnico") {
      router.replace("/dashboard/servicios");
      return;
    }
    Promise.all([
      api<ServiceReference[]>("/api/v1/services/references?active=true"),
      api<Technician[]>("/api/v1/services/technicians")
    ]).then(([referenceRows, technicianRows]) => {
      setReferences(referenceRows);
      setTechnicians(technicianRows);
    }).catch((error) => {
      setReferences([]);
      setTechnicians([]);
      setMessage(error instanceof Error ? error.message : "No fue posible cargar referencias.");
    });
  }, [router]);

  async function createOrder() {
    if (saving) return;
    const requiredFields: Array<[keyof OrderForm, string]> = [
      ["reference_id", "referencia"],
      ["technician_id", "tecnico asignado"],
      ["service_type", "tipo de servicio"],
      ["scheduled_date", "fecha programada del servicio"],
      ["cedi_delivery_date", "fecha de entrega del CEDI"],
      ["customer_name", "nombre del cliente"],
      ["customer_document", "cedula del cliente"],
      ["customer_phone", "telefono"],
      ["customer_address", "direccion"],
      ["invoice_number", "factura o pedido"],
      ["notes", "observaciones operativas"]
    ];
    const missing = requiredFields.filter(([key]) => !form[key].trim()).map(([, label]) => label);
    if (missing.length) {
      setMessage(`Completa los campos obligatorios: ${missing.join(", ")}.`);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const order = await api<ServiceOrderCreateResponse>("/api/v1/services/orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          reference_id: form.reference_id,
          technician_id: form.technician_id,
          metadata: {
            assignment: "selected_technician",
            customer_document: form.customer_document.trim(),
            cedi_delivery_date: form.cedi_delivery_date
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

  const ref = references.find((item) => String(item.id) === form.reference_id);

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
          <h2 className="text-base font-semibold">Referencia y programacion</h2>
          <span className="text-xs font-medium text-neutral-500">Todos los campos son obligatorios</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
            Referencia del producto *
            <select className="h-12 w-full min-w-0 rounded-md border border-line bg-white px-3 text-base md:h-10 md:text-sm" required value={form.reference_id} onChange={(event) => setForm((prev) => ({ ...prev, reference_id: event.target.value }))}>
              <option value="">Selecciona una referencia</option>
              {references.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
            Tipo de servicio *
            <select className="h-12 w-full min-w-0 rounded-md border border-line bg-white px-3 text-base md:h-10 md:text-sm" required value={form.service_type} onChange={(event) => setForm((prev) => ({ ...prev, service_type: event.target.value }))}>
              <option value="montaje">Montaje</option>
              <option value="desmontaje">Desmontaje</option>
              <option value="ambos">Montaje y desmontaje</option>
            </select>
          </label>
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
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
            Fecha de entrega del producto por el CEDI *
            <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" required type="date" value={form.cedi_delivery_date} onChange={(event) => setForm((prev) => ({ ...prev, cedi_delivery_date: event.target.value }))} />
          </label>
        </div>
        {ref ? (
          <div className="mt-3 rounded-md border border-line bg-paper p-3 text-sm text-neutral-700">
            {ref.parts.length} pieza(s) - {ref.estimated_minutes} min - {[ref.brand, ref.model].filter(Boolean).join(" / ") || ref.category}
          </div>
        ) : null}
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
            Factura o pedido *
            <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" required value={form.invoice_number} onChange={(event) => setForm((prev) => ({ ...prev, invoice_number: event.target.value }))} />
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
