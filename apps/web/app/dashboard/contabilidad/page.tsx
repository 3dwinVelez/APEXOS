import Link from "next/link";
import { ArrowRight, Banknote, BookOpen, Building2, ClipboardList, FileText, ReceiptText, Users } from "lucide-react";
import { ContabilidadNav } from "@/components/contabilidad-nav";

const modules = [
  {
    href: "/dashboard/contabilidad/plan-cuentas",
    title: "Plan de cuentas PUCC",
    detail: "Cuentas, naturaleza, estado y estructura base Colombia.",
    icon: BookOpen,
    status: "Configurado"
  },
  {
    href: "/dashboard/contabilidad/terceros",
    title: "Terceros contables",
    detail: "Clientes, proveedores, empleados, NIT, DV y responsabilidades.",
    icon: Users,
    status: "Maestro"
  },
  {
    href: "/dashboard/contabilidad/estructura",
    title: "Estructura organizacional",
    detail: "Sociedad, sucursales y centros de costo enlazados para imputacion contable.",
    icon: Building2,
    status: "Estructura"
  },
  {
    href: "/dashboard/contabilidad/reportes",
    title: "Reportes financieros",
    detail: "Balance, resultados, mayor, auxiliares, impuestos y cartera.",
    icon: ClipboardList,
    status: "Disponible"
  },
  {
    href: "/dashboard/contabilidad/reportes",
    title: "Impuestos y cierres",
    detail: "IVA, retenciones, periodos abiertos, revision y cierre controlado.",
    icon: ReceiptText,
    status: "Preparado"
  },
  {
    href: "/dashboard/contabilidad/reportes",
    title: "Cuentas por cobrar y pagar",
    detail: "Saldos, vencimientos, edades de cartera y obligaciones.",
    icon: Banknote,
    status: "Reporte"
  },
  {
    href: "/dashboard/contabilidad/reportes",
    title: "Trazabilidad DIAN futura",
    detail: "Campos listos para CUFE, CUNE, XML, PDF, estado DIAN y proveedor.",
    icon: FileText,
    status: "Base"
  }
];

export default function ContabilidadPage() {
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-apex">M-07 · Finanzas</p>
          <h1 className="text-3xl font-semibold">Contabilidad</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">
            Panel central para configuracion contable, terceros, reportes, impuestos y cierres. Se mantiene el motor de doble partida y la preparacion Colombia sin mezclar funciones ajenas a contabilidad.
          </p>
        </div>
        <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/contabilidad/reportes">
          Ver reportes <ArrowRight size={16} />
        </Link>
      </header>
      <ContabilidadNav />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.title} href={item.href} className="group flex min-h-36 flex-col justify-between rounded-md border border-line bg-white p-4 transition hover:border-apex/40 hover:bg-paper">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#146C6312] text-apex">
                  <Icon size={22} />
                </span>
                <span className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-neutral-600">{item.status}</span>
              </div>
              <div>
                <h2 className="mt-4 text-base font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm leading-5 text-neutral-600">{item.detail}</p>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-4 rounded-md border border-line bg-white p-4 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Control</p>
          <p className="mt-1 text-sm text-neutral-700">No se eliminan comprobantes contabilizados; las correcciones deben pasar por anulacion o reversion.</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Colombia</p>
          <p className="mt-1 text-sm text-neutral-700">PUCC como referencia, terceros con DV, impuestos configurables y periodos contables auditables.</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Transversal</p>
          <p className="mt-1 text-sm text-neutral-700">Preparado para compras, ventas, inventario, servicios, nomina futura, costos y documentos electronicos.</p>
        </div>
      </section>
    </div>
  );
}
