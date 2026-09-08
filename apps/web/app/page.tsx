"use client";

import { ThemeToggle } from "@/components/system/ThemeToggle";
import { ArrowRight, Building2, Check, LockKeyhole, Settings, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const outcomes = ["Inventario conectado", "Compras bajo control", "Ventas con trazabilidad"];

export default function HomePage() {
  const [pendingFeature, setPendingFeature] = useState("");

  return (
    <main className="apex-login-split min-h-screen bg-[#05080f] text-white">
      <ThemeToggle />
      <section className="grid min-h-screen lg:grid-cols-[minmax(0,1.8fr)_minmax(26rem,1fr)]">
        <div className="apex-login-visual relative flex min-h-[58vh] flex-col justify-center overflow-hidden lg:min-h-screen">
          <div className="relative z-10 max-w-3xl px-7 py-20 sm:px-12 lg:px-16 lg:pb-44 xl:px-24">
            <div className="apex-login-brand mb-12 inline-flex items-center gap-3 text-[#31d7c5]">
              <span className="h-0 w-0 border-b-[2rem] border-l-[0.8rem] border-r-[0.8rem] border-b-[#31d7c5] border-l-transparent border-r-transparent" />
              <span className="text-xl font-black tracking-[0.18em]">APEX OS</span>
            </div>
            <p className="apex-login-eyebrow mb-5 text-xs font-bold uppercase tracking-[0.28em] text-[#31d7c5]">Plataforma empresarial inteligente</p>
            <h1 className="apex-login-hero-title max-w-2xl text-5xl font-black leading-[1.02] tracking-[-0.045em] text-[#dce8f5] sm:text-6xl xl:text-7xl">Convierte tu operación en decisiones.</h1>
            <p className="apex-login-hero-copy mt-7 max-w-2xl text-base leading-8 text-[#8fa5c1] sm:text-lg">Todo lo que tu empresa necesita para organizar, controlar y crecer, conectado en una experiencia segura y clara.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {outcomes.map((outcome) => <span className="apex-home-chip inline-flex items-center gap-2 rounded-full border border-[#31445c] bg-[#101927]/70 px-4 py-2 text-sm font-semibold text-[#aebfda] backdrop-blur" key={outcome}><Check className="text-[#31d7c5]" size={15} strokeWidth={3} />{outcome}</span>)}
            </div>
          </div>

          <svg aria-hidden="true" className="apex-flow-wave absolute inset-x-0 bottom-[4%] h-[42%] w-full" preserveAspectRatio="none" viewBox="0 0 1200 430">
            <defs><linearGradient id="apexHomeWave" x1="0" x2="1"><stop offset="0" stopColor="#263d57" stopOpacity="0.1" /><stop offset="0.48" stopColor="#78c9db" stopOpacity="0.78" /><stop offset="1" stopColor="#31d7c5" stopOpacity="0.3" /></linearGradient><filter id="apexHomeGlow"><feGaussianBlur stdDeviation="3" /></filter></defs>
            {[0,1,2,3,4,5,6,7,8,9,10,11].map((line) => <path d={`M -40 ${220 + line * 4} C 170 ${205 - line * 3}, 260 ${125 + line * 8}, 430 ${198 + line * 2} S 680 ${350 - line * 10}, 830 ${188 + line * 5} S 1040 ${78 + line * 9}, 1250 ${230 - line * 3}`} fill="none" key={line} opacity={0.34 + line * 0.035} stroke="url(#apexHomeWave)" strokeWidth="1.2" />)}
            <path d="M-40 245 C210 240 300 80 500 215 S760 365 910 160 S1090 110 1250 245" fill="none" filter="url(#apexHomeGlow)" opacity=".35" stroke="#7ee8e0" strokeWidth="5" />
          </svg>
          <div className="apex-login-security absolute bottom-8 left-7 z-10 flex items-center gap-2 text-sm text-[#7287a2] sm:left-12 lg:left-16 xl:left-24"><ShieldCheck className="text-[#31d7c5]" size={17} />Seguridad, control y trazabilidad empresarial</div>
        </div>

        <aside className="apex-login-panel flex min-h-[42vh] items-center bg-[#263347] px-6 py-14 sm:px-12 lg:min-h-screen lg:px-14 xl:px-20">
          <div className="mx-auto w-full max-w-md">
            <p className="apex-login-eyebrow text-xs font-black uppercase tracking-[0.3em] text-[#31d7c5]">APEX OS</p>
            <h2 className="apex-login-form-title mt-3 text-4xl font-light tracking-[-0.035em] text-[#aebfda]">Tu operación, <strong className="font-black text-[#dce8f5]">en un solo lugar</strong></h2>
            <p className="apex-login-hero-copy mt-5 text-base leading-7 text-[#91a2bb]">Ingresa a tu espacio de trabajo o inicia la configuración de una nueva empresa.</p>
            <Link className="mt-10 inline-flex h-14 w-full items-center justify-center gap-3 rounded bg-[#31d7c5] px-6 text-base font-black text-[#07111d] shadow-[0_14px_34px_rgba(49,215,197,.18)] transition hover:bg-[#65e5d8]" href="/login"><LockKeyhole size={20} />Entrar de forma segura<ArrowRight size={20} /></Link>
            <div className="apex-login-footer mt-10 space-y-3 border-t border-[#526078] pt-8">
              <Option icon={Building2} label="Crear empresa" copy="Prepara un nuevo espacio empresarial" onClick={() => setPendingFeature("Crear empresa")} />
              <Option icon={Settings} label="Configuración inicial" copy="Define los datos base de tu operación" onClick={() => setPendingFeature("Configuración inicial")} />
            </div>
            <p className="apex-login-footer-copy mt-8 flex items-center justify-center gap-2 text-center text-sm text-[#91a2bb]"><ShieldCheck className="text-[#31d7c5]" size={18} />Tu información está protegida y cifrada.</p>
          </div>
        </aside>
      </section>

      {pendingFeature ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05080f]/70 px-4 backdrop-blur-sm"><section className="w-full max-w-md rounded-xl border border-[#526078] bg-[#263347] p-6 text-[#dce8f5] shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">{pendingFeature}</h2><p className="mt-2 text-sm leading-6 text-[#aebfda]">Esta función estará disponible pronto. La estamos preparando para entregarla de forma segura y completa.</p></div><button aria-label="Cerrar aviso" className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#526078]" onClick={() => setPendingFeature("")} type="button"><X size={17} /></button></div><button className="mt-6 h-11 w-full rounded bg-[#31d7c5] text-sm font-black text-[#07111d]" onClick={() => setPendingFeature("")} type="button">Entendido</button></section></div> : null}
    </main>
  );
}

function Option({ icon: Icon, label, copy, onClick }: { icon: typeof Building2; label: string; copy: string; onClick: () => void }) {
  return <button className="apex-home-secondary flex min-h-16 w-full items-center gap-4 rounded border border-[#526078] bg-[#172131]/55 px-5 text-left transition hover:border-[#31d7c5] hover:bg-[#172131]" onClick={onClick} type="button"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#31d7c5]/10 text-[#31d7c5]"><Icon size={20} /></span><span><strong className="block text-sm text-[#dce8f5]">{label}</strong><small className="text-[#91a2bb]">{copy}</small></span></button>;
}
