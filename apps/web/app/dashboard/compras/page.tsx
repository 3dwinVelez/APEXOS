import Link from "next/link";
import { ArrowRight, BarChart3, ClipboardCheck, PackageCheck, Receipt, Search, Truck, Users, Warehouse } from "lucide-react";
import { ComprasNav } from "@/components/compras-nav";

const workspaces = [
  { href: "/dashboard/compras/ordenes/nueva", title: "Orden de compra", detail: "Crea, aprueba y dispara WMS desde un solo workspace.", icon: ClipboardCheck, action: "Abrir workspace" },
  { href: "/dashboard/compras/ordenes/recibir", title: "Recepcion", detail: "Controla parciales, diferencias y entrada a inventario.", icon: PackageCheck, action: "Recibir" },
  { href: "/dashboard/compras/proveedores", title: "Proveedores", detail: "Gestiona datos comerciales minimos y condiciones.", icon: Users, action: "Gestionar" },
  { href: "/dashboard/compras/facturas", title: "Factura proveedor", detail: "Registra factura con o sin OC y afecta CXP, contabilidad e inventario.", icon: Receipt, action: "Registrar" },
  { href: "/dashboard/compras/importaciones", title: "Importaciones", detail: "OC internacional, costos indirectos y costo puesto en bodega.", icon: Truck, action: "Gestionar" },
  { href: "/dashboard/compras/reportes/ordenes", title: "Reporte de órdenes", detail: "Analiza posiciones pedidas, recibidas y pendientes con sus costos.", icon: BarChart3, action: "Ver reporte" }
];

const flow = [
  ["Necesidad", "Stock critico o demanda"],
  ["OC", "Proveedor, costos y aprobacion"],
  ["WMS", "InboundOrder y recepcion"],
  ["Inventario", "Movimiento y stock"],
  ["Finanzas", "CxP y factura"]
];

export default function ComprasPage() {
  return (
    <div className="space-y-4">
      <header className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-apex">M-02 / Abastecimiento</p>
              <h1 className="mt-1 text-3xl font-semibold">Compras</h1>
              <p className="mt-1 max-w-3xl text-sm text-neutral-600">
                Convierte necesidades de inventario en ordenes aprobadas, recepciones WMS y trazabilidad financiera.
              </p>
            </div>
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/compras/ordenes/nueva">
              Nueva OC
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-3">
          <Kpi icon={Truck} label="Pendiente recepcion" value="WMS listo" />
          <Kpi icon={Receipt} label="Referencia financiera" value="CxP conectada" />
          <Kpi icon={BarChart3} label="Compra inteligente" value="Stock real" />
        </div>
      </header>

      <ComprasNav />

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="rounded-md border border-line bg-white">
            <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold">Workspaces principales</h2>
                <p className="text-sm text-neutral-500">Accesos claros para las acciones frecuentes del equipo de compras.</p>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-2.5 text-neutral-400" size={16} />
                <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar OC, proveedor o SKU" />
              </div>
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
                    <span className="mt-1 block min-h-10 text-sm text-neutral-500">{card.detail}</span>
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
                <Warehouse className="text-apex" size={18} />
                <h2 className="text-base font-semibold">Flujo conectado de abastecimiento</h2>
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
            <p className="mt-1 text-sm text-neutral-500">El usuario debe saber que hacer sin depender de consultores.</p>
            <div className="mt-4 space-y-2">
              <Step number="01" title="Crear OC" detail="Proveedor, bodega, entrega y productos." />
              <Step number="02" title="Aprobar" detail="Reglas simples por monto y prioridad." />
              <Step number="03" title="Recibir en WMS" detail="InboundOrder, conteo y putaway." />
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="text-base font-semibold">Accion recomendada</h2>
            <p className="mt-1 text-sm text-neutral-500">Centralizar la compra en la OC evita reprocesos entre compras, bodega y finanzas.</p>
            <Link className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/compras/ordenes/nueva">
              Abrir orden de compra
              <ArrowRight size={16} />
            </Link>
          </section>
        </aside>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Truck; label: string; value: string }) {
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
