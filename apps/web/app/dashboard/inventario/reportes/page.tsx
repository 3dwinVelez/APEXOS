import { InventoryNav } from "@/components/inventory-nav";

export default function ReportesInventarioPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario · Reportes</p>
        <h1 className="text-3xl font-semibold">Reportes</h1>
      </header>
      <InventoryNav />
      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4">Kardex por producto</div>
        <div className="rounded-md border border-line bg-white p-4">Stock crítico</div>
        <div className="rounded-md border border-line bg-white p-4">Clasificación ABC</div>
        <div className="rounded-md border border-line bg-white p-4">Rotación de inventario</div>
      </section>
    </div>
  );
}

