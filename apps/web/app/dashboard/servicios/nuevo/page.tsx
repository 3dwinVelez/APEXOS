"use client";

import { api } from "@/lib/api";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ServiceReference = { id: number | string; code: string; name: string; category: string; estimated_minutes: number; brand: string; model: string; parts: Array<{ id: number | string; name: string; quantity: number; unit: string }> };
type ServiceOrder = { id: number | string; number: string };
type ServiceOrderCreateResponse = ServiceOrder | { order?: ServiceOrder; data?: ServiceOrder };

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
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ reference_id: "", service_type: "montaje", customer_name: "", customer_address: "", customer_phone: "", invoice_number: "", scheduled_date: "", notes: "" });

  useEffect(() => {
    api<ServiceReference[]>("/api/v1/services/references?active=true").then(setReferences).catch((error) => {
      setReferences([]);
      setMessage(error instanceof Error ? error.message : "No fue posible cargar referencias.");
    });
  }, []);

  async function createOrder() {
    if (saving) return;
    if (!form.reference_id || !form.customer_name || !form.customer_address) {
      setMessage("Referencia, cliente y direccion son obligatorios.");
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
          metadata: { assignment: "current_user" }
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
        <h2 className="mb-4 text-base font-semibold">Referencia y tipo</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <select className="h-12 w-full min-w-0 rounded-md border border-line bg-white px-3 text-base md:h-10 md:text-sm" value={form.reference_id} onChange={(event) => setForm((prev) => ({ ...prev, reference_id: event.target.value }))}>
            <option value="">Referencia *</option>
            {references.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
          </select>
          <select className="h-12 w-full min-w-0 rounded-md border border-line bg-white px-3 text-base md:h-10 md:text-sm" value={form.service_type} onChange={(event) => setForm((prev) => ({ ...prev, service_type: event.target.value }))}>
            <option value="montaje">Montaje</option>
            <option value="desmontaje">Desmontaje</option>
            <option value="ambos">Montaje y desmontaje</option>
          </select>
          <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" type="date" value={form.scheduled_date} onChange={(event) => setForm((prev) => ({ ...prev, scheduled_date: event.target.value }))} />
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
          <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" placeholder="Nombre cliente *" value={form.customer_name} onChange={(event) => setForm((prev) => ({ ...prev, customer_name: event.target.value }))} />
          <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" placeholder="Telefono" value={form.customer_phone} onChange={(event) => setForm((prev) => ({ ...prev, customer_phone: event.target.value }))} />
          <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:col-span-2 md:h-10 md:text-sm" placeholder="Direccion *" value={form.customer_address} onChange={(event) => setForm((prev) => ({ ...prev, customer_address: event.target.value }))} />
          <input className="h-12 w-full min-w-0 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" placeholder="Factura / pedido" value={form.invoice_number} onChange={(event) => setForm((prev) => ({ ...prev, invoice_number: event.target.value }))} />
          <textarea className="min-h-28 rounded-md border border-line px-3 py-3 text-base md:col-span-2 md:text-sm" placeholder="Observaciones operativas" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
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
