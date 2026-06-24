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
    "Crear artÃ­culo": "/dashboard/inventario/productos/nuevo",
    "Registrar movimiento": "/dashboard/inventario/stock",
    "Revisar stock crÃ­tico": "/dashboard/inventario/reportes"
  };
  const moduleActionLinks: Record<string, Record<string, string>> = {
    inventario: inventoryActionLinks,
    compras: {
      "Crear orden de compra": "/dashboard/compras/ordenes/nueva",
      "Recibir mercancÃ­a": "/dashboard/compras/ordenes/recibir",
      "Consultar pendientes": "/dashboard/compras/ordenes/recibir"
    },
    ventas: {
      "Crear cotizaciÃ³n": "/dashboard/ventas/ordenes/nueva",
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
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <p className="text-sm font-medium text-apex">{moduleConfig.id} · {moduleConfig.area}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Icon size={30} className="text-apex" />
          <h1 className="text-3xl font-semibold">{moduleConfig.name}</h1>
          <span className="rounded-md border border-line bg-white px-3 py-1 text-sm text-neutral-700">{moduleConfig.status}</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-700">{moduleConfig.summary}</p>
      </header>

      <section className="apex-dashboard-grid">
        <div className="apex-section-card p-4">
          <h2 className="mb-4 text-base font-semibold">Capacidades del modulo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {moduleConfig.capabilities.map((capability) => (
              <div className="flex items-start gap-2 rounded-lg bg-paper p-3 text-sm" key={capability}>
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-apex" />
                <span>{capability}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <section className="apex-section-card p-4">
            <h2 className="mb-4 text-base font-semibold">Acciones disponibles</h2>
            <div className="space-y-2">
              {moduleConfig.nextActions.map((action) => (
                moduleActionLinks[slug]?.[action] ? (
                  <Link className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-sm transition hover:border-apex hover:bg-paper" href={moduleActionLinks[slug][action]} key={action}>
                    {action}
                    <ArrowRight size={16} className="text-apex" />
                  </Link>
                ) : (
                  <button className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-sm transition hover:border-apex hover:bg-paper" key={action} type="button">
                    {action}
                    <ArrowRight size={16} className="text-apex" />
                  </button>
                )
              ))}
            </div>
          </section>

          <section className="apex-section-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-apex text-white">
                <Brain size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-apex">Asistencia disponible</p>
                <p className="mt-1 text-sm text-neutral-600">Consulta recomendaciones cuando necesites apoyo operativo.</p>
                <Link className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-apex" href={`/dashboard/apex-aimodule=${slug}`}>
                  Ver inteligencia <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </section>

          <Link className="apex-primary-action inline-flex w-full items-center justify-center px-4 text-sm font-semibold" href="/dashboard">
            Volver al tablero
          </Link>
        </div>
      </section>
    </div>
  );
}
