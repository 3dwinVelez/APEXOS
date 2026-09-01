"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CalendarCheck2,
  ChartNoAxesCombined,
  ContactRound,
  FileText,
  Settings2,
  ShoppingCart,
  UsersRound
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VisitOperationsPanel } from "./VisitOperationsPanel";
import { OpenQuotationSummary } from "./OpenQuotationSummary";
import { CommitmentAlerts } from "./CommitmentAlerts";

type AccessCardProps = {
  title: string;
  href: string;
  icon: ReactNode;
  eyebrow: string;
};

export default function CommercialManagementPage() {
  const [access, setAccess] = useState<{ can_manage_masters: boolean } | null>(null);
  useEffect(() => { void api<{ can_manage_masters: boolean }>("/api/v1/commercial-management/access-context", { cache: "no-store" }).then(setAccess).catch(() => setAccess(null)); }, []);
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-apex">M-27 · Gestión por empresa</p>
            <h1 className="mt-1 text-2xl font-semibold">Gestión Comercial</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Accede a cada área desde un solo panel, sin cargar formularios ni indicadores antes de necesitarlos.
            </p>
          </div>
          <Link
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white hover:opacity-90"
            href="/dashboard/gestion-comercial/agenda"
          >
            <CalendarDays size={17} /> Ver agenda
          </Link>
        </div>
      </header>

      <section aria-label="Accesos de Gestión Comercial" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <AccessCard eyebrow="Operación" href="/dashboard/gestion-comercial/mi-dia" icon={<CalendarCheck2 size={24} />} title="Mi día" />
        <AccessCard eyebrow="Gerencia" href="/dashboard/gestion-comercial/reportes" icon={<ChartNoAxesCombined size={24} />} title="Reportes" />
        {access?.can_manage_masters ? <AccessCard
          eyebrow="Configuración"
          href="/dashboard/gestion-comercial/maestros"
          icon={<Settings2 size={24} />}
          title="Maestros"
        /> : null}
        <AccessCard
          eyebrow="Planeación"
          href="/dashboard/gestion-comercial/presupuestos"
          icon={<ChartNoAxesCombined size={24} />}
          title="Presupuestos"
        />
        <AccessCard
          eyebrow="Relaciones comerciales"
          href="/dashboard/gestion-comercial/maestros?seccion=customers"
          icon={<UsersRound size={24} />}
          title="Clientes"
        />
        <AccessCard
          eyebrow="Ventas"
          href="/dashboard/gestion-comercial/pedidos"
          icon={<ShoppingCart size={24} />}
          title="Pedidos"
        />
        <AccessCard
          eyebrow="Oportunidades"
          href="/dashboard/gestion-comercial/cotizaciones"
          icon={<FileText size={21} />}
          title="Cotizaciones"
        />
      </section>

      <CommitmentAlerts />
      <VisitOperationsPanel />
      <OpenQuotationSummary />

      <section className="apex-section-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-apex/10 p-2 text-apex"><ContactRound size={20} /></span>
          <div>
            <h2 className="text-sm font-semibold">Agenda y seguimiento de visitas</h2>
            <p className="mt-0.5 text-sm text-neutral-600">Programa, busca, ejecuta y reprograma visitas desde el calendario comercial.</p>
          </div>
        </div>
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-apex" href="/dashboard/gestion-comercial/agenda">
          Abrir calendario <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}

function AccessCard({ title, href, icon, eyebrow }: AccessCardProps) {
  return (
    <Link
      className="group apex-section-card flex min-h-28 flex-col p-4 transition hover:-translate-y-0.5 hover:border-apex hover:shadow-sm"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg bg-apex/10 p-2 text-apex">{icon}</span>
        <ArrowRight className="text-neutral-400 transition group-hover:translate-x-1 group-hover:text-apex" size={19} />
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{eyebrow}</p>
      <h2 className="mt-0.5 text-lg font-semibold">{title}</h2>
    </Link>
  );
}
