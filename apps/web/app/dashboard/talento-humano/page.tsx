import { ArrowRight, CalendarDays, Clock3, FileText, MapPinned, Smartphone, WalletCards } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const JOURNEY_ACTIONS = [
  { title: "Crear y asignar horarios", detail: "Diseña mallas, organiza jornadas y asigna personas.", href: "/dashboard/talento-humano/rutas", icon: <CalendarDays size={19} /> },
  { title: "Marcaciones y jornadas", detail: "Registra entradas, salidas, GPS y evidencias.", href: "/dashboard/talento-humano/marcacion", icon: <Smartphone size={19} /> },
  { title: "Monitor de jornada", detail: "Supervisa ubicación, actividad y cumplimiento en vivo.", href: "/dashboard/talento-humano/mapa", icon: <MapPinned size={19} /> },
  { title: "Reportes de tiempo", detail: "Consulta horas laboradas, extras y trazabilidad.", href: "/dashboard/talento-humano/reportes", icon: <FileText size={19} /> }
] as const;

export default function TalentPage() {
  return (
    <div className="apex-workspace-shell space-y-5">
      <section className="apex-context-hero">
        <div className="relative z-10 flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="apex-eyebrow">M-17 · Talento Humano</p>
            <h1 className="mt-2 max-w-3xl text-2xl font-semibold sm:text-3xl">Gestión de talento y tiempo laboral</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Planea mallas horarias, registra jornadas y consulta la trazabilidad del equipo desde un solo lugar.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="apex-guide-chip">1. Planea la malla</span>
              <span className="apex-guide-chip">2. Registra la jornada</span>
              <span className="apex-guide-chip">3. Controla y reporta</span>
            </div>
          </div>
          <Link className="apex-hero-action inline-flex shrink-0 items-center gap-2 px-5 text-sm font-semibold" href="/dashboard/talento-humano/rutas">
            <CalendarDays size={17} /> Abrir mallas horarias
          </Link>
        </div>
      </section>

      <section className="apex-section-card p-4 sm:p-5">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-apex">Áreas de trabajo</p>
          <h2 className="mt-1 text-xl font-semibold">Selecciona el proceso que necesitas gestionar</h2>
          <p className="mt-1 text-sm text-neutral-600">Las funciones están agrupadas por dominio para mantener una navegación clara y predecible.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
          <article className="overflow-hidden rounded-xl border border-apex/40 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-apex/15 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-apex text-white shadow-sm"><Clock3 size={23} /></span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold">Mallas horarias</h3>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Disponible</span>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">Todo lo relacionado con planeación de horarios, marcaciones, jornadas, seguimiento y reportes de tiempo.</p>
                </div>
              </div>
              <Link className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-apex px-4 text-sm font-semibold text-white transition hover:bg-apex/90" href="/dashboard/talento-humano/rutas">
                Gestionar mallas <ArrowRight size={16} />
              </Link>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {JOURNEY_ACTIONS.map((action) => <JourneyAction key={action.href} {...action} />)}
            </div>
          </article>

          <article className="flex min-h-full flex-col rounded-xl border border-line bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-paper text-apex"><WalletCards size={23} /></span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">En planeación</span>
            </div>
            <h3 className="mt-4 text-xl font-semibold">Nómina</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Este espacio reunirá la configuración, liquidación y seguimiento del proceso de nómina.</p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-600">
              <li className="flex gap-2"><span className="text-apex">•</span> Conceptos y novedades</li>
              <li className="flex gap-2"><span className="text-apex">•</span> Liquidación y comprobantes</li>
              <li className="flex gap-2"><span className="text-apex">•</span> Aportes y trazabilidad contable</li>
            </ul>
            <button className="mt-auto h-10 w-full cursor-not-allowed rounded-lg border border-line bg-paper px-4 text-sm font-semibold text-neutral-500" disabled type="button">Disponible próximamente</button>
          </article>
        </div>
      </section>
    </div>
  );
}

function JourneyAction({ icon, title, detail, href }: { icon: ReactNode; title: string; detail: string; href: string }) {
  return (
    <Link className="group flex min-h-24 items-start gap-3 rounded-lg border border-line bg-white p-4 transition hover:border-apex hover:shadow-md" href={href}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper text-apex transition group-hover:bg-apex group-hover:text-white">{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-semibold">{title}<ArrowRight className="opacity-0 transition group-hover:opacity-100" size={14} /></span>
        <span className="mt-1 block text-sm leading-5 text-neutral-600">{detail}</span>
      </span>
    </Link>
  );
}
