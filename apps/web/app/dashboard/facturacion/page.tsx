import Link from "next/link";
import { FacturacionNav } from "@/components/facturacion-nav";

export default function FacturacionPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">M-04 · Finanzas</p>
        <h1 className="text-3xl font-semibold">Facturación</h1>
      </header>
      <FacturacionNav />
      <section className="grid gap-4 md:grid-cols-2">
        <Link href="/dashboard/facturacion/emitir" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Emitir factura</Link>
        <Link href="/dashboard/facturacion/documentos" className="rounded-md border border-line bg-white p-4 hover:bg-paper">Ver documentos emitidos</Link>
      </section>
    </div>
  );
}

