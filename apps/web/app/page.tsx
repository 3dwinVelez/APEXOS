"use client";

import { ArrowRight, Building2, Check, Folder, LockKeyhole, Settings, ShieldCheck, TrendingUp, UserRound, X, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function HomePage() {
  const [pendingFeature, setPendingFeature] = useState("");
  const capabilities = [
    { icon: Folder, label: "Organiza" },
    { icon: ShieldCheck, label: "Controla" },
    { icon: Zap, label: "Automatiza" },
    { icon: TrendingUp, label: "Impulsa" }
  ];

  const accessNotes = [
    {
      icon: UserRound,
      title: "Accede con tus credenciales",
      copy: "asignadas por el administrador."
    },
    {
      icon: ShieldCheck,
      title: "Revisiones y producciones",
      copy: "se entregan fuera del repositorio."
    }
  ];

  return (
    <main className="apex-public-shell relative min-h-screen overflow-hidden px-5 py-8 text-ink sm:px-8 lg:px-12">
      <div className="apex-public-glow pointer-events-none absolute inset-0" />
      <div className="apex-public-wave pointer-events-none absolute bottom-0 left-0 h-48 w-[42rem] max-w-full rounded-tr-full border-t opacity-80" />

      <section className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(25rem,31rem)]">
        <div className="max-w-3xl">
          <div className="mb-8 inline-flex items-center gap-3 text-apex sm:mb-12">
            <span className="flex h-9 w-9 items-end justify-center">
              <span className="h-0 w-0 border-b-[1.9rem] border-l-[0.75rem] border-r-[0.75rem] border-b-apex border-l-transparent border-r-transparent" />
            </span>
            <span className="text-xl font-bold tracking-wide">APEX OS</span>
          </div>

          <h1 className="apex-public-title max-w-3xl text-4xl font-black leading-[0.98] tracking-normal sm:text-6xl lg:text-7xl">
            Enfocate en <span className="block text-apex">hacer crecer</span> tu empresa.
          </h1>

          <div className="apex-public-title mt-8 flex items-center gap-3 text-xl font-extrabold sm:text-2xl">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-apex text-white shadow-lg shadow-apex/20">
              <Check size={22} strokeWidth={3} />
            </span>
            <p><span className="text-apex">Apex OS</span> se encarga del resto.</p>
          </div>

          <div className="apex-public-strong mt-9 flex flex-wrap items-center gap-x-8 gap-y-4 text-sm font-bold sm:text-base">
            {capabilities.map(({ icon: Icon, label }, index) => (
              <div className="flex items-center gap-3" key={label}>
                {index > 0 ? <span className="hidden h-8 w-px bg-line sm:block" /> : null}
                <Icon className="text-apex" size={24} strokeWidth={2.1} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link className="apex-primary-action inline-flex h-14 items-center justify-center gap-3 rounded-md px-7 text-base font-extrabold text-white" href="/login">
              <ArrowRight size={24} />
              Entrar
            </Link>
            <button className="apex-public-secondary-action inline-flex h-14 items-center justify-center gap-3 rounded-md border px-7 text-base font-extrabold shadow-sm transition" onClick={() => setPendingFeature("Crear empresa")} type="button">
              <Building2 className="text-apex" size={23} />
              Crear empresa
            </button>
            <button className="apex-public-secondary-action inline-flex h-14 items-center justify-center gap-3 rounded-md border px-7 text-base font-extrabold shadow-sm transition" onClick={() => setPendingFeature("Configuracion inicial")} type="button">
              <Settings className="text-apex" size={23} />
              Configuracion inicial
            </button>
          </div>

          <p className="apex-public-muted mt-12 inline-flex items-center gap-2 text-sm font-medium sm:text-base">
            <ShieldCheck className="text-apex" size={20} />
            Seguro, <span className="text-apex">confiable</span> y siempre disponible.
          </p>
        </div>

        <div className="apex-public-card w-full rounded-[1.35rem] border p-6 backdrop-blur-xl sm:p-8">
          <div className="flex items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-apex/10 text-apex dark:bg-apex/15">
              <LockKeyhole size={31} strokeWidth={2.4} />
            </div>
            <div>
              <h2 className="apex-public-title text-2xl font-black">Acceso seguro</h2>
              <p className="mt-2 text-base font-bold text-apex">Tu informacion, siempre protegida.</p>
            </div>
          </div>

          <div className="my-8 h-px bg-line" />

          <div className="space-y-7">
            {accessNotes.map(({ icon: Icon, title, copy }) => (
              <div className="flex gap-5" key={title}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-apex/10 text-apex dark:bg-apex/15">
                  <Icon size={27} strokeWidth={2.2} />
                </div>
                <p className="apex-public-copy pt-1 text-base leading-7">
                  <span className="apex-public-title block font-extrabold">{title}</span>
                  {copy}
                </p>
              </div>
            ))}
          </div>

          <div className="my-8 h-px bg-line" />

          <Link className="apex-primary-action inline-flex h-16 w-full items-center justify-center gap-3 rounded-md text-lg font-extrabold text-white" href="/login">
            <LockKeyhole size={23} />
            Ir al ingreso
          </Link>

          <p className="apex-public-muted mt-8 flex items-center justify-center gap-2 text-center text-sm font-medium">
            <ShieldCheck className="text-apex" size={18} />
            Seguridad empresarial de <span className="text-apex">nivel profesional.</span>
          </p>
        </div>
      </section>

      {pendingFeature ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[1px]">
          <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-apex/10 text-apex">
                  <Settings size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-950">{pendingFeature}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Esta funcion estara disponible pronto. Estamos trabajando en ella para entregarla de forma segura y completa.
                  </p>
                </div>
              </div>
              <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800" onClick={() => setPendingFeature("")} type="button" aria-label="Cerrar aviso">
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
              <button className="h-10 rounded-md bg-apex px-4 text-sm font-extrabold text-white" onClick={() => setPendingFeature("")} type="button">Entendido</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
