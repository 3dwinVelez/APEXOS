import Link from "next/link";
import { FacturacionNav } from "@/components/facturacion-nav";
import { ArrowRight, FileText, ReceiptText } from "lucide-react";
import type { ReactNode } from "react";

export default function FacturacionPage() {
  return (
    <div className="apex-page-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-apex">M-04 · Finanzas</p>
            <h1 className="text-3xl font-semibold">Facturacion</h1>
            <p className="mt-1 text-sm text-neutral-600">Emite y consulta documentos con una ruta clara de trabajo.</p>
          </div>
          <Link href="/dashboard/facturacion/emitir" className="apex-primary-action inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold">
            <ReceiptText size={16} /> Emitir factura
          </Link>
        </div>
      </header>
      <FacturacionNav />
      <section className="grid gap-3 md:grid-cols-2">
        <LobbyLink href="/dashboard/facturacion/emitir" icon={<ReceiptText size={18} />} title="Emitir factura" detail="Generar documento desde una orden confirmada." primary />
        <LobbyLink href="/dashboard/facturacion/documentos" icon={<FileText size={18} />} title="Documentos emitidos" detail="Consultar consecutivos, estados y trazabilidad." />
      </section>
    </div>
  );
}

function LobbyLink({ href, icon, title, detail, primary = false }: { href: string; icon: ReactNode; title: string; detail: string; primary?: boolean }) {
  return (
    <Link href={href} className={`group flex items-center gap-3 rounded-lg border p-4 transition hover:border-apex hover:bg-paper ${primary ? "border-apex bg-apex/10 shadow-sm" : "border-line bg-white"}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${primary ? "bg-apex text-white" : "bg-paper text-apex"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-neutral-500">{detail}</span>
      </span>
      <ArrowRight className="text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-apex" size={16} />
    </Link>
  );
}
