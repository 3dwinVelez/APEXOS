import { HeartPulse } from "lucide-react";
import Link from "next/link";

export default function ReportsPage() {
  return <div className="apex-workspace-shell"><header className="apex-section-card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-apex">Control gerencial</p><h1 className="mt-1 text-2xl font-semibold">Reportes</h1><p className="mt-1 text-sm text-neutral-600">Decisiones conectadas con la operación real de la empresa.</p></header><Link className="mt-4 flex max-w-xl items-center gap-4 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md" href="/dashboard/reportes/apex-heart"><span className="rounded-xl bg-rose-700 p-3 text-white"><HeartPulse size={28} /></span><span><strong className="block text-lg">Apex Heart</strong><span className="text-sm text-neutral-600">Ventas, margen, inventario, cartera, caja y alertas en un único pulso.</span></span></Link></div>;
}
