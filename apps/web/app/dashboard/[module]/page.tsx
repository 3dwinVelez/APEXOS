import { MODULES_BY_SLUG } from "@/lib/modules";
import { ArrowRight, Brain, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: slug } = await params;
  const moduleConfig = MODULES_BY_SLUG[slug];
  if (!moduleConfig) notFound();

  const Icon = moduleConfig.icon;
  const inventoryActionLinks: Record<string, string> = {
    "Crear artículo": "/dashboard/inventario/productos/nuevo",
    "Registrar movimiento": "/dashboard/inventario/stock",
    "Revisar stock crítico": "/dashboard/inventario/reportes"
  };
  const moduleActionLinks: Record<string, Record<string, string>> = {
    inventario: inventoryActionLinks,
    compras: {
      "Crear orden de compra": "/dashboard/compras/ordenes/nueva",
      "Recibir mercancía": "/dashboard/compras/ordenes/recibir",
      "Consultar pendientes": "/dashboard/compras/ordenes/recibir"
    },
    ventas: {
      "Crear cotización": "/dashboard/ventas/ordenes/nueva",
      "Registrar pedido": "/dashboard/ventas/ordenes/nueva",
      "Revisar oportunidades": "/dashboard/ventas/ordenes"
    },
    facturacion: {
      "Emitir factura": "/dashboard/facturacion/emitir",
      "Ver consecutivos": "/dashboard/facturacion/documentos",
      "Revisar documentos": "/dashboard/facturacion/documentos"
    },
    contabilidad: {
      "Ver plan de cuentas": "/dashboard/contabilidad/plan-cuentas",
      "Consultar libro mayor": "/dashboard/contabilidad/reportes",
      "Generar P&G": "/dashboard/contabilidad/reportes"
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">{moduleConfig.id} · {moduleConfig.area}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Icon size={30} className="text-apex" />
          <h1 className="text-3xl font-semibold">{moduleConfig.name}</h1>
          <span className="rounded-md border border-line bg-white px-3 py-1 text-sm text-neutral-700">{moduleConfig.status}</span>
        </div>
      </header>
      <section className="rounded-md border border-line bg-white p-5">
        <h2 className="mb-2 text-lg font-semibold">Resumen operativo</h2>
        <p className="max-w-3xl text-sm leading-6 text-neutral-700">{moduleConfig.summary}</p>
      </section>
      <section className="rounded-md border border-apex/20 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-apex text-white">
              <Brain size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-apex">APEX AI Core conectado</p>
              <p className="mt-1 max-w-3xl text-sm text-neutral-700">
                Este modulo queda observado por la IA interna para explicar flujos, detectar riesgos, recomendar acciones y mantener trazabilidad segun permisos del usuario.
              </p>
            </div>
          </div>
          <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper" href={`/dashboard/apex-aimodule=${slug}`}>
            Ver inteligencia
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-5">
          <h2 className="mb-4 text-base font-semibold">Capacidades del módulo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {moduleConfig.capabilities.map((capability) => (
              <div className="flex items-start gap-2 rounded-md bg-paper p-3 text-sm" key={capability}>
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-apex" />
                <span>{capability}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-line bg-white p-5">
          <h2 className="mb-4 text-base font-semibold">Acciones disponibles</h2>
          <div className="space-y-2">
            {moduleConfig.nextActions.map((action) => (
              moduleActionLinks[slug]?.[action] ? (
                <Link className="flex w-full items-center justify-between rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-paper" href={moduleActionLinks[slug][action]} key={action}>
                  {action}
                  <ArrowRight size={16} className="text-apex" />
                </Link>
              ) : (
                <button className="flex w-full items-center justify-between rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-paper" key={action} type="button">
                  {action}
                  <ArrowRight size={16} className="text-apex" />
                </button>
              )
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-md border border-line bg-white p-5">
        <h2 className="mb-3 text-base font-semibold">Estado de implementación</h2>
        <p className="text-sm leading-6 text-neutral-700">
          Esta pantalla ya muestra el alcance funcional del módulo en español. Las acciones quedan preparadas para conectarse con los endpoints específicos a medida que se implemente cada bloque del plan APEX OS.
        </p>
        <Link className="mt-4 inline-flex h-10 items-center rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard">
          Volver al tablero
        </Link>
      </section>
    </div>
  );
}
