import { ArrowRight, Building2, LogIn, MessageCircle } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl content-center gap-8 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="mb-3 text-sm font-semibold text-apex">APEX OS</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">Sistema Operativo Empresarial</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-700">
            Una plataforma de gestión empresarial en español para operar inventario, ventas, finanzas, personas, logística e inteligencia desde un solo lugar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/login">
              <LogIn size={16} />
              Entrar
            </Link>
            <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink" href="/register">
              <Building2 size={16} />
              Crear empresa
            </Link>
            <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink" href="/onboarding">
              <MessageCircle size={16} />
              Configuración inicial
            </Link>
          </div>
        </div>
        <div className="rounded-md border border-line bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Cuenta de revisión</h2>
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-paper p-3">Correo: demo@apex.local</p>
            <p className="rounded-md bg-paper p-3">Contraseña: test1234</p>
          </div>
          <Link className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/login">
            Revisar plataforma
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
