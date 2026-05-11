import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, ClipboardList, PackagePlus, Radio, ScanLine, Warehouse } from "lucide-react";
import { InventoryNav } from "@/components/inventory-nav";

const workspaces = [
  { href: "/dashboard/inventario/productos/nuevo", title: "Productos", detail: "Maestro transversal para comprar, vender, producir, costear y mover.", icon: PackagePlus, action: "Crear o gestionar" },
  { href: "/dashboard/inventario/wms", title: "WMS", detail: "Layout 2D, ubicaciones, tareas, recepcion, picking y putaway.", icon: Warehouse, action: "Abrir WMS" },
  { href: "/dashboard/inventario/stock", title: "Stock", detail: "Movimientos, ajustes, saldos y confiabilidad operativa.", icon: Boxes, action: "Ver stock" },
  { href: "/dashboard/inventario/reportes", title: "Analitica", detail: "Rotacion, ABC, alertas, criticidad y decisiones de reposicion.", icon: BarChart3, action: "Ver reportes" }
];

const flow = [
  ["Producto", "SKU, unidad, precio, costo"],
  ["Compra", "Proveedor, lead time, OC"],
  ["WMS", "Ubicacion, recibo y putaway"],
  ["Venta", "Precio, impuestos y disponibilidad"],
  ["Finanzas", "Costo, margen e inventario"]
];

export default function InventarioHomePage() {
  return (
    <div className="space-y-4">
      <header className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-apex">M-01 / Operacion</p>
              <h1 className="mt-1 text-3xl font-semibold">Inventario</h1>
              <p className="mt-1 max-w-3xl text-sm text-neutral-600">
                Controla productos, ubicaciones, stock y trazabilidad desde una vista limpia, operativa y conectada con toda la plataforma.
              </p>
            </div>
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/inventario/productos/nuevo">
              Nuevo producto
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-3">
          <Kpi icon={ScanLine} label="Maestro unico" value="SKU transversal" />
          <Kpi icon={Warehouse} label="WMS conectado" value="Ubicacion real" />
          <Kpi icon={Radio} label="Operacion viva" value="Stock + eventos" />
        </div>
      </header>

      <InventoryNav />

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="rounded-md border border-line bg-white">
            <div className="border-b border-line p-4">
              <h2 className="text-base font-semibold">Workspaces de inventario</h2>
              <p className="text-sm text-neutral-500">Cada entrada representa una responsabilidad operativa clara, sin repetir la navegacion superior.</p>
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-4">
              {workspaces.map((card) => {
                const Icon = card.icon;
                return (
                  <Link className="group rounded-md border border-line bg-paper p-4 hover:border-apex hover:bg-white" href={card.href} key={card.href}>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white text-apex group-hover:bg-[#146C6312]">
                      <Icon size={18} />
                    </span>
                    <span className="mt-4 block font-semibold">{card.title}</span>
                    <span className="mt-1 block min-h-14 text-sm text-neutral-500">{card.detail}</span>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-apex">
                      {card.action}
                      <ArrowRight size={15} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-md border border-line bg-white">
            <div className="border-b border-line p-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="text-apex" size={18} />
                <h2 className="text-base font-semibold">Flujo transversal del producto</h2>
              </div>
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-5">
              {flow.map(([title, detail], index) => (
                <div className="rounded-md border border-line bg-paper p-3" key={title}>
                  <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-xs font-semibold text-apex">{index + 1}</span>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs text-neutral-500">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="text-base font-semibold">Panel operativo</h2>
            <p className="mt-1 text-sm text-neutral-500">Simplicidad es poder: crear un producto debe habilitar toda la cadena, no llenar una ficha infinita.</p>
            <div className="mt-4 space-y-2">
              <Step number="01" title="Identificar" detail="SKU, nombre, tipo y unidad." />
              <Step number="02" title="Controlar" detail="Stock minimo, maximo y WMS." />
              <Step number="03" title="Conectar" detail="Compras, ventas, costos y reportes." />
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="text-base font-semibold">Accion recomendada</h2>
            <p className="mt-1 text-sm text-neutral-500">Empieza por productos: todo flujo operativo necesita un maestro limpio y confiable.</p>
            <Link className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/inventario/productos/nuevo">
              Abrir productos
              <ArrowRight size={16} />
            </Link>
          </section>
        </aside>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof ScanLine; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-paper px-3 py-2">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-apex">
        <Icon size={16} />
      </span>
      <span>
        <span className="block text-xs text-neutral-500">{label}</span>
        <span className="block text-sm font-semibold">{value}</span>
      </span>
    </div>
  );
}

function Step({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-paper p-3">
      <span className="text-xs font-semibold text-apex">{number}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-neutral-500">{detail}</span>
      </span>
    </div>
  );
}
