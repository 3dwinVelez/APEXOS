"use client";

import { loadModuleAccess } from "@/lib/moduleAccess";
import { MODULES, MODULES_BY_SLUG } from "@/lib/modules";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type AccessState = "checking" | "allowed" | "denied";

function dashboardSlug(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard") return null;
  return parts[1] || null;
}

export function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const slug = useMemo(() => dashboardSlug(pathname), [pathname]);
  const [state, setState] = useState<AccessState>("checking");

  useEffect(() => {
    let alive = true;

    async function checkAccess() {
      if (localStorage.getItem("role_name")?.toLowerCase() === "tecnico" && !pathname.startsWith("/dashboard/servicios")) {
        router.replace("/dashboard/servicios");
        return;
      }
      if (!slug || !MODULES_BY_SLUG[slug]) {
        if (alive) setState("allowed");
        return;
      }

      try {
        const access = await loadModuleAccess(MODULES);
        if (!alive) return;
        if (pathname.startsWith("/dashboard/administracion/suscripciones")) {
          setState(access.isPlatformAdmin ? "allowed" : "denied");
          return;
        }
        setState(access.bySlug[slug] === true ? "allowed" : "denied");
      } catch {
        if (alive) setState("denied");
      }
    }

    setState("checking");
    checkAccess();
    return () => {
      alive = false;
    };
  }, [pathname, router, slug]);

  if (state === "checking") {
    return (
      <section className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">
        Validando permisos...
      </section>
    );
  }

  if (state === "denied") {
    const moduleName = slug ? MODULES_BY_SLUG[slug]?.name : "este modulo";
    return (
      <section className="rounded-md border border-red-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700">
            <ShieldAlert size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-neutral-900">Acceso no autorizado</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Tu rol no tiene permisos para abrir {moduleName || "este modulo"}. Si necesitas acceso, solicita ajuste de rol a un administrador.
            </p>
            <Link className="mt-4 inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href="/dashboard">
              Volver al tablero
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
