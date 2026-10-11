"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, HandCoins, ListChecks, Receipt, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { GastosMenoresNav } from "@/components/gastos-menores-nav";
import { ActionCard } from "@/components/ui/ActionCard";

// DTO del maestro de conceptos (GET /api/v1/petty-cash/concepts).
type Concept = {
  id: number;
  code: string;
  name: string;
  account_code: string;
  advance_account_code: string | null;
  default_vat_code: string | null;
  requires_supplier: boolean;
  requires_invoice_reference: boolean;
  active: boolean;
  notes?: string | null;
};

// DTO del maestro de cajas (GET /api/v1/petty-cash/boxes). ready_for_advances y warnings
// los calcula el servidor: la UI solo los presenta, nunca los deduce.
type Box = {
  id: number;
  code: string;
  name: string;
  account_code: string;
  advance_account_code: string;
  custodian_party_id: number | null;
  custodian_name: string | null;
  branch_code: string | null;
  cost_center_code: string | null;
  monthly_limit: number | null;
  require_advance: boolean;
  block_unliquidated_advance: boolean;
  active: boolean;
  ready_for_advances: boolean;
  warnings: string[];
  notes?: string | null;
};

function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

export default function GastosMenoresPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canWrite: false });
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setAccess({
      ready: true,
      canRead: hasStoredRolePermission("accounting", "read"),
      canWrite: hasStoredRolePermission("accounting", "write")
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sin include_inactive: el resumen cuenta solo lo activo, que es lo que opera.
      const [conceptRows, boxRows] = await Promise.all([
        api<Concept[]>("/api/v1/petty-cash/concepts"),
        api<Box[]>("/api/v1/petty-cash/boxes")
      ]);
      setConcepts(conceptRows);
      setBoxes(boxRows);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar el estado de gastos menores."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  if (!access.ready) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Gastos Menores...</div>;
  }

  if (!access.canRead) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">Gastos Menores no disponible para este perfil</h1>
        <p className="mt-2 text-sm text-amber-900">
          Las cajas menores comparten los permisos del módulo Contable. Solicita acceso de lectura a contabilidad para consultar conceptos y cajas.
        </p>
      </section>
    );
  }

  const activeConcepts = concepts.filter((row) => row.active !== false);
  const activeBoxes = boxes.filter((row) => row.active !== false);
  const readyBoxes = activeBoxes.filter((row) => row.ready_for_advances === true);
  const boxesWithWarnings = activeBoxes.filter((row) => (row.warnings || []).length > 0);

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <p className="text-sm font-medium text-apex">M-29 · Finanzas</p>
        <h1 className="text-3xl font-semibold">Gastos Menores</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cajas menores con conceptos de egreso, anticipos al custodio y comprobantes de gasto contabilizados al momento.
        </p>
      </header>
      <GastosMenoresNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <div className="apex-section-card p-6 text-sm text-neutral-600">Cargando conceptos y cajas menores...</div>
      ) : (
        <>
          <section aria-label="Estado de los maestros de caja menor" className="grid gap-3 sm:grid-cols-3">
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Conceptos activos</p>
              <p className="mt-1 text-2xl font-semibold">{activeConcepts.length}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {activeConcepts.length ? "Conceptos de egreso listos para comprobantes GM." : "Sin conceptos activos: crea el primero en el maestro."}
              </p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cajas activas</p>
              <p className="mt-1 text-2xl font-semibold">{activeBoxes.length}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {activeBoxes.length ? "Cajas menores disponibles para la operación." : "Sin cajas activas: configura la primera con su custodio."}
              </p>
            </div>
            <div className="apex-section-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Listas para anticipos</p>
              <p className="mt-1 text-2xl font-semibold">{readyBoxes.length} de {activeBoxes.length}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {readyBoxes.length === activeBoxes.length
                  ? "Toda caja activa puede girar anticipos al custodio."
                  : "Hay cajas sin cuenta de anticipo o sin custodio asignado."}
              </p>
            </div>
          </section>

          {boxesWithWarnings.length ? (
            <section aria-label="Alertas de cajas menores" className="apex-section-card p-4">
              <h2 className="text-sm font-semibold text-amber-800">Cajas con configuración incompleta</h2>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {boxesWithWarnings.map((box) => (
                  <li key={box.id}>
                    <span className="font-semibold">{box.code} · {box.name}:</span> {box.warnings.join(" ")}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-neutral-500">Estas alertas las calcula el servidor a partir del PUC y del custodio de cada caja.</p>
            </section>
          ) : null}

          <section aria-label="Herramientas activas de gastos menores" className="apex-dense-actions">
            <ActionCard
              detail="Conceptos de egreso con cuenta contable, IVA sugerido y requisitos de soporte."
              href="/dashboard/gastos-menores/conceptos"
              icon={ListChecks}
              title="Conceptos de gasto"
            />
            <ActionCard
              detail="Cajas menores con custodio, cuenta de efectivo, cuenta de anticipo y límite mensual."
              href="/dashboard/gastos-menores/cajas"
              icon={Wallet}
              title="Cajas menores"
            />
            <ActionCard
              detail="Anticipos girados al custodio: liquidacion con reintegro y faltante."
              href="/dashboard/gastos-menores/anticipos"
              icon={HandCoins}
              title="Anticipos de caja"
            />
            <ActionCard
              detail="Comprobantes de gasto con IVA por linea y contabilizacion inmediata."
              href="/dashboard/gastos-menores/gastos"
              icon={Receipt}
              title="Gastos"
            />
            <ActionCard
              detail="Gasto por caja, concepto y dimension con filtros y exportacion a Excel."
              href="/dashboard/gastos-menores/reportes"
              icon={BarChart3}
              title="Reportes de gasto"
            />
          </section>
        </>
      )}
    </div>
  );
}
