import Link from "next/link";
import { ContabilidadNav } from "@/components/contabilidad-nav";

export default function ContabilidadPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">M-07 · Finanzas</p>
        <h1 className="text-3xl font-semibold">Contabilidad</h1>
      </header>
      <ContabilidadNav />
      <section className="grid gap-4 md:grid-cols-2">
        <Link href="/dashboard/contabilidad/plan-cuentas" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Plan de cuentas</Link>
        <Link href="/dashboard/contabilidad/reportes" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Reportes financieros</Link>
      </section>
    </div>
  );
}

