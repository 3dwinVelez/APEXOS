import Link from "next/link";
import { VentasNav } from "@/components/ventas-nav";
import { ArrowRight, BarChart3, FileText, Plus, ReceiptText, Users } from "lucide-react";
import type { ReactNode } from "react";

export default function VentasPage() {
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-apex">M-03 · Comercial</p>
            <h1 className="text-3xl font-semibold">Ventas</h1>
            <p className="mt-1 text-sm text-neutral-600">Gestiona clientes, ordenes y seguimiento comercial desde accesos directos.</p>
          </div>
          <Link href="/dashboard/ventas/ordenes/nueva" className="apex-primary-action inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold">
            <Plus size={16} /> Crear orden
          </Link>
        </div>
      </header>
      <VentasNav />
      <section className="apex-dense-actions">
        <LobbyLink href="/dashboard/ventas/clientes" icon={<Users size={18} />} title="Clientes" detail="Crear y gestionar cartera comercial." />
        <LobbyLink href="/dashboard/ventas/ordenes/nueva" icon={<Plus size={18} />} title="Nueva orden" detail="Registrar una venta o pedido." primary />
        <LobbyLink href="/dashboard/ventas/ordenes" icon={<FileText size={18} />} title="Seguimiento" detail="Consultar ordenes y estados." />
        <LobbyLink href="/dashboard/ventas/facturas/nueva" icon={<ReceiptText size={18} />} title="Facturar" detail="Emitir factura de venta directa (sin pedido)." />
        <LobbyLink href="/dashboard/ventas/reportes" icon={<BarChart3 size={18} />} title="Reportes" detail="Ventas por cliente, SKU, fecha y detalle completo." />
      </section>
    </div>
  );
}

function LobbyLink({ href, icon, title, detail, primary = false }: { href: string; icon: ReactNode; title: string; detail: string; primary?: boolean }) {
  return (
    <Link href={href} className={`group flex items-center gap-3 rounded-lg border p-4 transition hover:border-apex hover:bg-paper ${primary ? "border-apex bg-apex/10 shadow-sm" : "border-line bg-white"}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${primary ? "bg-apex text-white" : "bg-paper text-apex"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-neutral-500">{detail}</span>
      </span>
      <ArrowRight className="text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-apex" size={16} />
    </Link>
  );
}
