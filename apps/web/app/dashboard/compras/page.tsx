import { BarChart3, ClipboardCheck, PackageCheck, Receipt, Truck, Users } from "lucide-react";
import { ActionCard } from "@/components/ui/ActionCard";

const actions = [
  { href: "/dashboard/compras/ordenes/nueva", title: "Orden de compra", detail: "Crear, editar y aprobar órdenes de abastecimiento.", icon: ClipboardCheck, primary: true },
  { href: "/dashboard/compras/ordenes/recibir", title: "Recepción", detail: "Registrar recepciones parciales o completas en inventario.", icon: PackageCheck },
  { href: "/dashboard/compras/proveedores", title: "Proveedores", detail: "Crear, consultar y actualizar el maestro de proveedores.", icon: Users },
  { href: "/dashboard/compras/facturas", title: "Factura de proveedor", detail: "Registrar facturas y notas crédito con o sin orden.", icon: Receipt },
  { href: "/dashboard/compras/importaciones", title: "Importaciones", detail: "Administrar costos asociados a compras internacionales.", icon: Truck },
  { href: "/dashboard/compras/reportes/ordenes", title: "Reporte de órdenes", detail: "Consultar cantidades y costos pedidos, recibidos y pendientes.", icon: BarChart3 }
] as const;

export default function ComprasPage() {
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <p className="text-sm font-medium text-apex">M-02 · Abastecimiento</p>
        <h1 className="text-3xl font-semibold">Compras</h1>
        <p className="mt-1 text-sm text-neutral-600">Órdenes, recepciones, proveedores, facturas e importaciones organizados por tarea.</p>
      </header>
      <section aria-label="Herramientas activas de compras" className="apex-dense-actions">
        {actions.map((action) => <ActionCard key={action.href} {...action} />)}
      </section>
    </div>
  );
}
