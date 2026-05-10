import { InventoryNav } from "@/components/inventory-nav";

export default function WmsPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario · WMS</p>
        <h1 className="text-3xl font-semibold">WMS</h1>
      </header>
      <InventoryNav />
      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-line bg-white p-4">Ubicaciones</div>
        <div className="rounded-md border border-line bg-white p-4">Recepciones</div>
        <div className="rounded-md border border-line bg-white p-4">Transferencias</div>
      </section>
    </div>
  );
}

