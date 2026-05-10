import { MODULES_BY_SLUG } from "@/lib/modules";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: slug } = await params;
  const module = MODULES_BY_SLUG[slug];
  if (!module) notFound();

  const Icon = module.icon;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">{module.id} · {module.area}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Icon size={30} className="text-apex" />
          <h1 className="text-3xl font-semibold">{module.name}</h1>
          <span className="rounded-md border border-line bg-white px-3 py-1 text-sm text-neutral-700">{module.status}</span>
        </div>
      </header>
      <section className="rounded-md border border-line bg-white p-5">
        <h2 className="mb-2 text-lg font-semibold">Resumen operativo</h2>
        <p className="max-w-3xl text-sm leading-6 text-neutral-700">{module.summary}</p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-5">
          <h2 className="mb-4 text-base font-semibold">Capacidades del módulo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {module.capabilities.map((capability) => (
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
            {module.nextActions.map((action) => (
              <button className="flex w-full items-center justify-between rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-paper" key={action} type="button">
                {action}
                <ArrowRight size={16} className="text-apex" />
              </button>
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
