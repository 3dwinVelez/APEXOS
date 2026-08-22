"use client";

import { api } from "@/lib/api";
import { CalendarDays, FileText, MapPinned, Route, Smartphone, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type Employee = { id: number };

export default function TalentPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<{ id: number }[]>([]);

  useEffect(() => {
    Promise.all([
      api<Employee[]>("/api/v1/hr/employees").catch(() => []),
      api<{ id: number }[]>("/api/v1/transport/vehicles").catch(() => [])
    ]).then(([employeeData, vehicleData]) => {
      setEmployees(employeeData);
      setVehicles(vehicleData);
    }).catch(() => undefined);
  }, []);

  return (
    <div className="apex-workspace-shell space-y-5">
      <section className="apex-context-hero">
        <div className="relative z-10 flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="apex-eyebrow">M-17 - Talento Humano</p>
            <h1 className="mt-2 max-w-3xl text-2xl font-semibold sm:text-3xl">Operación de personal y jornadas</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Gestiona horarios, marcaciones, seguimiento GPS y trazabilidad del equipo operativo.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="apex-guide-chip">1. Marca o planea</span>
              <span className="apex-guide-chip">2. Supervisa campo</span>
              <span className="apex-guide-chip">3. Consulta trazabilidad</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link className="apex-hero-action inline-flex items-center gap-2 px-5 text-sm font-semibold" href="/dashboard/talento-humano/marcacion"><Smartphone size={16} /> Marcación móvil</Link>
            <Link className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" href="/dashboard/talento-humano/rutas"><Route size={16} /> Nuevo horario</Link>
          </div>
        </div>
      </section>

      {!employees.length || !vehicles.length ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Para operar necesitas personas y vehiculos base. Los usuarios se crean desde Administracion APEX y la flota desde Transporte.
        </section>
      ) : null}

      <section className="apex-section-card p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-apex">Funciones del módulo</p>
            <h2 className="mt-1 text-xl font-semibold">¿Qué necesitas gestionar?</h2>
            <p className="mt-1 text-sm text-neutral-600">Accesos organizados según el trabajo diario del equipo.</p>
          </div>
        </div>
        <div className="apex-dense-actions">
          <ActionTile icon={<Smartphone size={20} />} title="Registrar jornada" detail="Marcación móvil, GPS y evidencia para personal operativo." href="/dashboard/talento-humano/marcacion" primary />
          <ActionTile icon={<Route size={20} />} title="Planear y asignar horarios" detail="Organiza personas, jornadas y recursos de campo." href="/dashboard/talento-humano/rutas" primary />
          <ActionTile icon={<MapPinned size={20} />} title="Supervisar operación en vivo" detail="Consulta ubicación, actividad y trazabilidad por persona." href="/dashboard/talento-humano/mapa" primary />
          <ActionTile icon={<CalendarDays size={20} />} title="Consultar reportes" detail="Horas laboradas, extras y trazabilidad por empleado." href="/dashboard/talento-humano/reportes" />
          <ActionTile icon={<FileText size={20} />} title="Configurar nómina" detail="Administra recargos y conceptos contables." href="/dashboard/talento-humano/nomina" />
          <ActionTile icon={<Truck size={20} />} title="Gestionar vehículos" detail="Consulta disponibilidad y estado documental de la flota." href="/dashboard/transporte" />
        </div>
      </section>
    </div>
  );
}

function ActionTile({ icon, title, detail, href, primary = false }: { icon: ReactNode; title: string; detail: string; href: string; primary?: boolean }) {
  return (
    <Link className={`flex min-h-28 items-start gap-3 rounded-lg border p-4 transition hover:border-apex hover:shadow-md ${primary ? "border-apex/50 bg-apex/10 shadow-sm" : "border-line bg-white"}`} href={href}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${primary ? "bg-apex text-white" : "bg-paper text-apex"}`}>{icon}</span>
      <span className="min-w-0"><span className="font-semibold">{title}</span><span className="mt-1 block text-sm leading-5 text-neutral-600">{detail}</span></span>
    </Link>
  );
}
