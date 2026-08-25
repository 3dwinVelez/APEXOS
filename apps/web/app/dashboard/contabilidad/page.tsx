import { BarChart3, BookOpen, Building2, FilePlus2, Landmark, ReceiptText, Users, WalletCards } from "lucide-react";
import { ActionCard } from "@/components/ui/ActionCard";

const actions = [
  { href: "/dashboard/contabilidad/asientos", title: "Asientos contables", detail: "Registrar y consultar comprobantes de doble partida.", icon: FilePlus2, primary: true },
  { href: "/dashboard/contabilidad/plan-cuentas", title: "Plan de cuentas", detail: "Administrar cuentas PUCC y su naturaleza.", icon: BookOpen },
  { href: "/dashboard/contabilidad/cuentas-por-pagar", title: "Cuentas por pagar", detail: "Registrar obligaciones, notas y vencimientos de proveedores.", icon: WalletCards },
  { href: "/dashboard/cxc/documentos", title: "Cuentas por cobrar", detail: "Consultar documentos, saldos y cartera de clientes.", icon: Landmark },
  { href: "/dashboard/contabilidad/terceros", title: "Terceros", detail: "Gestionar identificación, roles y datos fiscales.", icon: Users },
  { href: "/dashboard/contabilidad/iva", title: "IVA", detail: "Configurar tarifas activas para compras y ventas.", icon: ReceiptText },
  { href: "/dashboard/contabilidad/retenciones", title: "Retenciones", detail: "Administrar conceptos, bases y cuentas asociadas.", icon: ReceiptText },
  { href: "/dashboard/contabilidad/estructura", title: "Estructura", detail: "Mantener sociedades, sucursales y centros de costo.", icon: Building2 },
  { href: "/dashboard/contabilidad/reportes", title: "Reportes", detail: "Consultar balance, resultados, mayor e impuestos.", icon: BarChart3 }
] as const;

export default function ContabilidadPage() {
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div>
          <p className="text-sm font-medium text-apex">M-07 · Finanzas</p>
          <h1 className="text-3xl font-semibold">Contabilidad</h1>
          <p className="mt-1 text-sm text-neutral-600">Registros, maestros, obligaciones e informes financieros organizados por tarea.</p>
        </div>
      </header>
      <section aria-label="Herramientas activas de contabilidad" className="apex-dense-actions">
        {actions.map((action) => <ActionCard key={action.href} {...action} />)}
      </section>
    </div>
  );
}
