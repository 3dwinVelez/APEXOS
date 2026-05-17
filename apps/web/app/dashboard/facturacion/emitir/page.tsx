"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FacturacionNav } from "@/components/facturacion-nav";
import { ActionCard } from "@/components/ui/ActionCard";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { FileText, Plus } from "lucide-react";

type SaleOrder = { id: number; number: string; status: string; total: number };

export default function EmitirFacturaPage() {
  const [saleOrders, setSaleOrders] = useState<SaleOrder[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [showIssue, setShowIssue] = useState(false);
  const [form, setForm] = useState({ sale_order_id: 0, location_id: 1, notes: "" });

  useEffect(() => {
    api<SaleOrder[]>("/api/v1/sales/orders")
      .then((rows) => setSaleOrders((rows || []).filter((r) => ["draft", "confirmed"].includes(r.status))))
      .catch((err) => setError(err instanceof Error ? err.message : "Error cargando órdenes"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    try {
      const res = await api<{ number: string }>("/api/v1/invoicing/invoice", { method: "POST", body: JSON.stringify(form) });
      setOk(`Factura generada: ${res.number}`);
      setShowIssue(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar factura");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Emitir factura</h1>
      <FacturacionNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-3 md:grid-cols-2">
        <ActionCard title="Emitir factura" detail="Generar documento desde una orden confirmada." icon={Plus} onClick={() => setShowIssue(true)} primary />
        <ActionCard title="Ordenes listas" detail={`${saleOrders.length} orden(es) disponibles para facturar.`} icon={FileText} onClick={() => undefined} />
      </section>

      {showIssue ? <ModalFrame title="Emitir factura" onClose={() => setShowIssue(false)}>
      <form className="grid gap-2 md:grid-cols-2" onSubmit={submit}>
        <select className="h-10 rounded-md border border-line px-3 text-sm md:col-span-2" value={form.sale_order_id} onChange={(e) => setForm((p) => ({ ...p, sale_order_id: Number(e.target.value) }))} required>
          <option value={0}>Selecciona orden de venta</option>
          {saleOrders.map((so) => <option key={so.id} value={so.id}>{so.number} · ${so.total}</option>)}
        </select>
        <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" min={1} value={form.location_id} onChange={(e) => setForm((p) => ({ ...p, location_id: Number(e.target.value) }))} placeholder="Ubicación salida" />
        <input className="h-10 rounded-md border border-line px-3 text-sm" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notas (opcional)" />
        <button className="h-10 rounded-md bg-apex px-4 text-sm text-white md:col-span-2" type="submit">Facturar</button>
      </form>
      </ModalFrame> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="mb-3 font-semibold">Ordenes pendientes de facturacion</h2>
        <div className="space-y-2 text-sm">
          {saleOrders.map((order) => <div className="rounded-md border border-line px-3 py-2" key={order.id}>{order.number} · ${order.total}</div>)}
          {!saleOrders.length ? <p className="text-neutral-500">No hay ordenes listas.</p> : null}
        </div>
      </section>
    </div>
  );
}

