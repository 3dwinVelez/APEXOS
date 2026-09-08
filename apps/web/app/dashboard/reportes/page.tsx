import { HeartPulse } from "lucide-react";
import Link from "next/link";

export default function ReportsPage() {
  return <div className="apex-workspace-shell"><header className="apex-section-card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-apex">Control gerencial</p><h1 className="mt-1 text-2xl font-semibold text-content-strong">Reportes</h1><p className="mt-1 text-sm text-content-muted">Decisiones conectadas con la operación real de la empresa.</p></header><Link className="apex-section-card mt-4 flex max-w-2xl items-center gap-4 border-l-4 border-l-apex p-5 transition hover:-translate-y-0.5 hover:border-apex hover:shadow-md" href="/dashboard/reportes/apex-heart"><span className="rounded-xl bg-apex p-3 text-white"><HeartPulse size={28} /></span><span><strong className="block text-lg text-content-strong">Apex Heart</strong><span className="text-sm text-content-muted">Ventas, margen, inventario, cartera, caja y alertas en un único pulso.</span></span></Link></div>;
}
