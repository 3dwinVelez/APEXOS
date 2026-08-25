import { ArrowRightLeft, BarChart3, Boxes, FileUp, FolderTree, PackagePlus, ScanLine, Warehouse } from "lucide-react";
import { ActionCard } from "@/components/ui/ActionCard";

const actions = [
  { href: "/dashboard/inventario/productos/nuevo", title: "Nuevo producto", detail: "Registrar un SKU con sus datos comerciales y de inventario.", icon: PackagePlus, primary: true },
  { href: "/dashboard/inventario/productos", title: "Lista de productos", detail: "Buscar y exportar el maestro activo e histórico.", icon: ScanLine },
  { href: "/dashboard/inventario/familias", title: "Familias", detail: "Configurar clasificación y cuentas asociadas.", icon: FolderTree },
  { href: "/dashboard/inventario/bodegas", title: "Bodegas", detail: "Administrar centros de almacenamiento y consignación.", icon: Warehouse },
  { href: "/dashboard/inventario/stock", title: "Stock", detail: "Consultar existencias y movimientos por SKU.", icon: Boxes },
  { href: "/dashboard/inventario/wms", title: "WMS", detail: "Gestionar ubicaciones y tareas de bodega.", icon: Warehouse },
  { href: "/dashboard/inventario/cargue-inicial", title: "Cargue inicial", detail: "Validar e importar saldos iniciales desde Excel.", icon: FileUp },
  { href: "/dashboard/inventario/traslados", title: "Traslados", detail: "Despachar, recibir y consultar movimientos entre bodegas.", icon: ArrowRightLeft },
  { href: "/dashboard/inventario/reportes", title: "Reportes", detail: "Revisar kardex, valoración y análisis de inventario.", icon: BarChart3 }
] as const;

export default function InventarioHomePage() {
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div>
          <p className="text-sm font-medium text-apex">M-01 · Operación</p>
          <h1 className="text-3xl font-semibold">Inventario</h1>
          <p className="mt-1 text-sm text-neutral-600">Productos, bodegas, existencias y movimientos en un flujo operativo único.</p>
        </div>
      </header>
      <section aria-label="Herramientas activas de inventario" className="apex-dense-actions">
        {actions.map((action) => <ActionCard key={action.href} {...action} />)}
      </section>
    </div>
  );
}
