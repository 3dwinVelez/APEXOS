import Link from "next/link";
import { VentasNav } from "@/components/ventas-nav";

export default function VentasPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">M-03 · Comercial</p>
        <h1 className="text-3xl font-semibold">Ventas</h1>
      </header>
      <VentasNav />
      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/dashboard/ventas/clientes" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Crear y gestionar clientes</Link>
        <Link href="/dashboard/ventas/ordenes/nueva" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Crear orden de venta</Link>
        <Link href="/dashboard/ventas/ordenes" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Seguimiento de órdenes</Link>
      </section>
    </div>
  );
}

