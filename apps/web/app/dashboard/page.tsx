import { BrainPanel } from "@/components/brain/BrainPanel";
import { MODULES } from "@/lib/modules";
import { Boxes, CircleDollarSign, ReceiptText, Users } from "lucide-react";
import Link from "next/link";

const kpis = [
  { label: "Ventas mes", value: "$0", icon: CircleDollarSign },
  { label: "Facturas", value: "0", icon: ReceiptText },
  { label: "Artículos", value: "0", icon: Boxes },
  { label: "Clientes", value: "0", icon: Users }
];

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">APEX CORE</p>
        <h1 className="text-3xl font-semibold">Tablero operativo</h1>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div className="rounded-md border border-line bg-white p-4" key={kpi.label}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-neutral-500">{kpi.label}</p>
                <Icon size={18} className="text-apex" />
              </div>
              <p className="text-2xl font-semibold">{kpi.value}</p>
            </div>
          );
        })}
      </section>
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Actividad reciente</h2>
          <p className="text-sm text-neutral-600">El registro de auditoría aparecerá aquí cuando empiecen las operaciones.</p>
        </div>
        <BrainPanel />
      </section>
      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Módulos activos</h2>
            <p className="text-sm text-neutral-600">Cuenta administradora con acceso completo para revisión.</p>
          </div>
          <span className="rounded-md bg-paper px-3 py-1 text-sm">{MODULES.length} módulos</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <Link className="rounded-md border border-line p-3 hover:bg-paper" href={`/dashboard/${module.slug}`} key={module.id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon size={18} className="text-apex" />
                    <p className="text-sm font-semibold">{module.name}</p>
                  </div>
                  <span className="text-xs text-neutral-500">{module.id}</span>
                </div>
                <p className="line-clamp-2 text-sm text-neutral-600">{module.summary}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
