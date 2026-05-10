import Link from "next/link";
import { ComprasNav } from "@/components/compras-nav";

export default function ComprasPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">M-02 · Operación</p>
        <h1 className="text-3xl font-semibold">Compras</h1>
      </header>
      <ComprasNav />
      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/dashboard/compras/proveedores" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Crear y gestionar proveedores</Link>
        <Link href="/dashboard/compras/ordenes/nueva" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Crear orden de compra</Link>
        <Link href="/dashboard/compras/ordenes/recibir" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Recibir ordenes de compra</Link>
      </section>
    </div>
  );
}

