import { BarChart3, Building2, CalendarDays, Clock3, HandCoins, Landmark, LayoutDashboard, MapPinned, Percent, ReceiptText, ScrollText, Smartphone, UserRoundCheck, WalletCards } from "lucide-react";
import { ActionCard } from "@/components/ui/ActionCard";

const actions = [
  { href: "/dashboard/talento-humano/rutas", title: "Asignar horarios", detail: "Crear mallas, comparar jornadas y asignar personal operativo o administrativo.", icon: CalendarDays, primary: true },
  { href: "/dashboard/talento-humano/mallas", title: "Monitor de mallas", detail: "Seguir en vivo las marcaciones, actividades y evidencias de una malla.", icon: LayoutDashboard },
  { href: "/dashboard/talento-humano/marcacion", title: "Marcaciones", detail: "Registrar entradas, salidas y ubicación GPS del equipo.", icon: Smartphone },
  { href: "/dashboard/talento-humano/novedades", title: "Novedades de jornada", detail: "Revisar alertas, incapacidades, permisos, faltas y justificaciones.", icon: Clock3 },
  { href: "/dashboard/talento-humano/mapa", title: "Mapa operativo", detail: "Supervisar rutas, última ubicación y cumplimiento de la jornada.", icon: MapPinned },
  { href: "/dashboard/talento-humano/empleados", title: "Maestro de empleados", detail: "Mantener datos laborales y su asociación con usuarios APEX.", icon: UserRoundCheck },
  { href: "/dashboard/talento-humano/entidades", title: "Entidades y afiliaciones", detail: "Administrar EPS, pensión, ARL, caja, ICBF y sus vigencias.", icon: Building2 },
  { href: "/dashboard/talento-humano/configuracion-laboral", title: "Configuración laboral", detail: "Parametrizar recargos, horas extra, límites y jornada nocturna.", icon: Percent },
  { href: "/dashboard/talento-humano/nomina", title: "Nómina", detail: "Liquidar periodos quincenales o mensuales y sus comprobantes.", icon: WalletCards },
  { href: "/dashboard/talento-humano/provisiones", title: "Provisiones", detail: "Provisionar prima, cesantías, intereses y vacaciones desde nómina.", icon: ReceiptText },
  { href: "/dashboard/talento-humano/aportes-sociales", title: "Aportes sociales", detail: "Liquidar salud, pensión, ARL, caja, ICBF y SENA.", icon: Landmark },
  { href: "/dashboard/talento-humano/prestaciones-pagos", title: "Pago de prestaciones", detail: "Pagar prima, cesantías, intereses y vacaciones provisionados.", icon: HandCoins },
  { href: "/dashboard/talento-humano/libranzas", title: "Libranzas", detail: "Gestionar conceptos, cuotas, saldos y deducciones recurrentes.", icon: HandCoins },
  { href: "/dashboard/talento-humano/liquidacion-trabajador", title: "Liquidación de trabajador", detail: "Calcular retiro, prestaciones adeudadas e indemnización.", icon: ScrollText },
  { href: "/dashboard/talento-humano/reportes", title: "Reportes de tiempo", detail: "Consultar horas laboradas, extras y trazabilidad del equipo.", icon: BarChart3 }
] as const;

export default function TalentPage() {
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div>
          <p className="text-sm font-medium text-apex">M-17 · Talento Humano</p>
          <h1 className="text-3xl font-semibold">Talento Humano</h1>
          <p className="mt-1 text-sm text-neutral-600">Planeación, marcaciones, afiliaciones y liquidaciones organizadas por tarea.</p>
        </div>
      </header>
      <section aria-label="Herramientas activas de talento humano" className="apex-dense-actions">
        {actions.map((action) => <ActionCard key={action.href} {...action} />)}
      </section>
    </div>
  );
}
