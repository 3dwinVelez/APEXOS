import Link from "next/link";
import { BarChart3, FilePlus2, FileText, Plus, ReceiptText, Users } from "lucide-react";
import { VentasNav } from "@/components/ventas-nav";
import { ActionCard } from "@/components/ui/ActionCard";

const actions = [
  { href: "/dashboard/ventas/ordenes/nueva", title: "Nueva orden", detail: "Registrar un pedido con cliente, producto, cantidad y precio.", icon: Plus, primary: true },
  { href: "/dashboard/ventas/ordenes", title: "Órdenes", detail: "Consultar consecutivos y estado de los pedidos.", icon: FileText },
  { href: "/dashboard/ventas/facturas/nueva", title: "Nueva factura", detail: "Emitir una factura directa con impuestos y retenciones.", icon: FilePlus2 },
  { href: "/dashboard/ventas/facturas", title: "Facturas", detail: "Consultar documentos, estados y trazabilidad.", icon: ReceiptText },
  { href: "/dashboard/ventas/clientes", title: "Clientes", detail: "Crear y consultar el maestro comercial.", icon: Users },
  { href: "/dashboard/ventas/reportes", title: "Reportes", detail: "Analizar ventas por cliente, SKU y fecha.", icon: BarChart3 }
] as const;

export default function VentasPage() {
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-apex">M-03 · Comercial</p>
            <h1 className="text-3xl font-semibold">Ventas</h1>
            <p className="mt-1 text-sm text-neutral-600">Clientes, pedidos, facturación y reportes organizados por tarea.</p>
          </div>
          <Link className="apex-primary-action inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold" href="/dashboard/ventas/ordenes/nueva">
            <Plus size={16} /> Nueva orden
          </Link>
        </div>
      </header>
      <VentasNav />
      <section aria-label="Herramientas activas de ventas" className="apex-dense-actions">
        {actions.map((action) => <ActionCard key={action.href} {...action} />)}
      </section>
    </div>
  );
}
