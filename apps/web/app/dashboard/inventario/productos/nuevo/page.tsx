import { InventoryNav } from "@/components/inventory-nav";
import { InventoryPanel } from "@/components/inventory-panel";

export default function NuevoProductoPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario · Productos</p>
        <h1 className="text-3xl font-semibold">Crear producto</h1>
      </header>
      <InventoryNav />
      <InventoryPanel />
    </div>
  );
}

