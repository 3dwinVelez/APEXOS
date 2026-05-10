import { InventoryNav } from "@/components/inventory-nav";
import Link from "next/link";

export default function InventarioHomePage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">M-01 · Operación</p>
        <h1 className="text-3xl font-semibold">Inventario</h1>
      </header>
      <InventoryNav />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link className="rounded-md border border-line bg-white p-4 hover:bg-paper" href="/dashboard/inventario/productos/nuevo">Productos</Link>
        <Link className="rounded-md border border-line bg-white p-4 hover:bg-paper" href="/dashboard/inventario/wms">WMS</Link>
        <Link className="rounded-md border border-line bg-white p-4 hover:bg-paper" href="/dashboard/inventario/stock">Stock</Link>
        <Link className="rounded-md border border-line bg-white p-4 hover:bg-paper" href="/dashboard/inventario/reportes">Reportes</Link>
      </section>
    </div>
  );
}

