"use client";

import { api } from "@/lib/api";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ServiceReference = { id: number; code: string; name: string; category: string; estimated_minutes: number; brand: string; model: string; parts: Array<{ id: number; name: string; quantity: number; unit: string }> };
type Employee = { id: number; code: string; metadata: { name: string }; user: { name: string } };
type ServiceOrder = { id: number; number: string };

function techName(tech: Employee) {
  return tech.metadata.name || tech.user.name || tech.code || `Tecnico ${tech.id}`;
}

export default function NewServiceOrderPage() {
  const router = useRouter();
  const [references, setReferences] = useState<ServiceReference[]>([]);
  const [technicians, setTechnicians] = useState<Employee[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ reference_id: "", technician_id: "", service_type: "montaje", customer_name: "", customer_address: "", customer_phone: "", invoice_number: "", scheduled_date: "", notes: "" });

  useEffect(() => {
    Promise.all([
      api<ServiceReference[]>("/api/v1/services/referencesactive=true").catch(() => []),
      api<Employee[]>("/api/v1/hr/employeesposition=tecnico&active=true").catch(() => [])
    ]).then(([refs, techs]) => {
      setReferences(refs);
      setTechnicians(techs);
    });
  }, []);

  async function createOrder() {
    if (!form.reference_id || !form.customer_name || !form.customer_address) {
      setMessage("Referencia, cliente y direccion son obligatorios.");
      return;
    }
    const order = await api<ServiceOrder>("/api/v1/services/orders", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        reference_id: Number(form.reference_id),
        technician_id: form.technician_id ? Number(form.technician_id) : undefined
      })
    });
    router.push(`/dashboard/servicios/${order.id}`);
  }

  const ref = references.find((item) => String(item.id) === form.reference_id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/servicios"><ArrowLeft size={16} /> Volver al monitor</Link>
          <p className="text-sm font-medium text-apex">Servicios</p>
          <h1 className="text-3xl font-semibold">Nueva orden de servicio</h1>
          <p className="mt-2 text-sm text-neutral-600">Formulario auxiliar ligero, igual a la logica legacy: referencia, tecnico, datos del cliente y programacion.</p>
        </div>
      </header>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</div> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="mb-4 text-base font-semibold">Referencia y tipo</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.reference_id} onChange={(event) => setForm((prev) => ({ ...prev, reference_id: event.target.value }))}>
            <option value="">Referencia *</option>
            {references.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.service_type} onChange={(event) => setForm((prev) => ({ ...prev, service_type: event.target.value }))}>
            <option value="montaje">Montaje</option>
            <option value="desmontaje">Desmontaje</option>
            <option value="ambos">Montaje y desmontaje</option>
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.technician_id} onChange={(event) => setForm((prev) => ({ ...prev, technician_id: event.target.value }))}>
            <option value="">Tecnico asignado</option>
            {technicians.map((tech) => <option key={tech.id} value={tech.id}>{techName(tech)}</option>)}
          </select>
          <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={form.scheduled_date} onChange={(event) => setForm((prev) => ({ ...prev, scheduled_date: event.target.value }))} />
        </div>
        {ref ? (
          <div className="mt-3 rounded-md border border-line bg-paper p-3 text-sm text-neutral-700">
            {ref.parts.length} pieza(s) · {ref.estimated_minutes} min · {[ref.brand, ref.model].filter(Boolean).join(" / ") || ref.category}
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="mb-4 text-base font-semibold">Datos del cliente</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Nombre cliente *" value={form.customer_name} onChange={(event) => setForm((prev) => ({ ...prev, customer_name: event.target.value }))} />
          <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Telefono" value={form.customer_phone} onChange={(event) => setForm((prev) => ({ ...prev, customer_phone: event.target.value }))} />
          <input className="h-10 rounded-md border border-line px-3 text-sm md:col-span-2" placeholder="Direccion *" value={form.customer_address} onChange={(event) => setForm((prev) => ({ ...prev, customer_address: event.target.value }))} />
          <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Factura / pedido" value={form.invoice_number} onChange={(event) => setForm((prev) => ({ ...prev, invoice_number: event.target.value }))} />
          <textarea className="min-h-24 rounded-md border border-line px-3 py-2 text-sm md:col-span-2" placeholder="Observaciones operativas" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
        </div>
      </section>

      <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={createOrder} type="button">
        <ClipboardCheck size={17} /> Crear orden de servicio
      </button>
    </div>
  );
}
