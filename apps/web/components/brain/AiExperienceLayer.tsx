"use client";

import { api } from "@/lib/api";
import { AlertTriangle, Bell, Brain, CheckCircle2, ChevronRight, Lightbulb, Loader2, Sparkles, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type InsightSeverity = "critical" | "warning" | "info" | "success";

type BrainInsight = {
  id: string;
  module: string;
  module_label: string;
  severity: InsightSeverity;
  title: string;
  summary: string;
  recommended_action: string;
  href: string;
  confidence: number;
};

type BrainInsightsResponse = {
  data: BrainInsight[];
  health_score: number;
};

type CoachStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  action: string;
};

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const severityStyles: Record<InsightSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900"
};

const severityIcons: Record<InsightSeverity, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Zap,
  success: CheckCircle2
};

const moduleAliases: Record<string, string> = {
  inventario: "inventory",
  compras: "purchases",
  "apex-ai": "platform",
  facturacion: "invoicing",
  contabilidad: "finance",
  cartera: "finance",
  ventas: "sales",
  servicios: "services",
  "talento-humano": "hr",
  transporte: "transport"
};

function userKey() {
  if (typeof window === "undefined") return "anonymous";
  const token = localStorage.getItem("token");
  if (!token) return "anonymous";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.sub || payload.email || payload.id || "anonymous";
  } catch {
    return "anonymous";
  }
}

function moduleFromPath(pathname: string) {
  const [, , slug] = pathname.split("/");
  return moduleAliases[slug] || slug || "platform";
}

function stepsForPath(pathname: string): CoachStep[] {
  if (pathname.includes("/dashboard/compras")) {
    return [
      {
        id: "po-workspace",
        selector: 'a[href="/dashboard/compras/ordenes/nueva"]',
        title: "Crea la OC desde aqui",
        body: "La orden de compra es el origen del abastecimiento: proveedor, productos, costos, aprobacion y recepcion WMS nacen desde este flujo.",
        action: "Abrir workspace de OC"
      },
      {
        id: "supplier-master",
        selector: 'a[href="/dashboard/compras/proveedores"]',
        title: "Mantén proveedores listos",
        body: "APEX revisa datos fiscales, pais, correo y condiciones para reducir errores antes de crear una OC.",
        action: "Revisar proveedores"
      },
      {
        id: "receipts",
        selector: 'a[href="/dashboard/compras/ordenes/recibir"]',
        title: "Conecta compras con WMS",
        body: "Cuando una OC se aprueba, puede alimentar recepcion, putaway, diferencias y trazabilidad de inventario.",
        action: "Ver recepcion"
      }
    ];
  }

  if (pathname.includes("/dashboard/inventario")) {
    return [
      {
        id: "product-master",
        selector: 'a[href="/dashboard/inventario/productos/nuevo"]',
        title: "Producto maestro transversal",
        body: "Crea productos una sola vez para compras, ventas, inventario, WMS, costos e impuestos LATAM.",
        action: "Crear o completar producto"
      },
      {
        id: "wms-lego",
        selector: 'a[href="/dashboard/inventario/wms"]',
        title: "Layout WMS tipo LEGO",
        body: "Cada casilla representa una ubicacion fisica. La guia ayuda a configurar zonas, pasillos y ubicaciones sin consultores.",
        action: "Abrir layout 2D"
      },
      {
        id: "stock-control",
        selector: 'a[href="/dashboard/inventario/stock"]',
        title: "Controla movimientos y confiabilidad",
        body: "APEX puede sugerir conteos, alertar minimos y explicar diferencias cuando el stock se mueve.",
        action: "Revisar stock"
      }
    ];
  }

  if (pathname.includes("/dashboard/apex-ai")) {
    return [
      {
        id: "ai-recommendations",
        selector: "button",
        title: "Genera recomendaciones auditables",
        body: "APEX AI Core lee datos reales del tenant, respeta permisos y guarda recomendaciones como eventos trazables.",
        action: "Generar recomendaciones"
      },
      {
        id: "ai-modules",
        selector: "aside button",
        title: "Mentor por modulo",
        body: "Cambia entre inventario, compras, WMS o finanzas para recibir una guia contextual segun el flujo.",
        action: "Elegir modulo"
      }
    ];
  }

  if (pathname.includes("/dashboard/servicios")) {
    return [
      {
        id: "service-create",
        selector: 'a[href="/dashboard/servicios/nuevo"]',
        title: "Crea la orden en una pantalla limpia",
        body: "El monitor solo prioriza. La nueva orden vive aparte para capturar referencia, tecnico, cliente y programacion sin saturar la vista central.",
        action: "Crear orden"
      },
      {
        id: "service-flow",
        selector: 'a[href="/dashboard/servicios/referencias"]',
        title: "Referencias antes de operar",
        body: "Las referencias viven en Servicios porque describen el trabajo tecnico y sus piezas, no inventario vendible.",
        action: "Seguir estado"
      }
    ];
  }

  if (pathname.includes("/dashboard/talento-humano")) {
    return [
      {
        id: "time-schedule",
        selector: 'a[href="/dashboard/talento-humano/marcacion"]',
        title: "Marcacion movil separada",
        body: "El operario entra a una pantalla simple para ingreso, almuerzo, retorno y cierre con vehiculo y ruta.",
        action: "Abrir marcacion"
      },
      {
        id: "time-route-vehicle",
        selector: 'a[href="/dashboard/talento-humano/rutas"]',
        title: "Planeacion de rutas",
        body: "Las rutas asignan vehiculo, equipo, tolerancia y viaticos antes de que el operario marque.",
        action: "Planear ruta"
      }
    ];
  }

  if (pathname.includes("/dashboard/transporte")) {
    return [
      {
        id: "vehicle-master",
        selector: "button",
        title: "Maestro de vehiculos",
        body: "Crea placa, tipo, documentos y estado. Este maestro alimenta horarios, rutas, servicios y logistica.",
        action: "Crear vehiculo"
      },
      {
        id: "vehicle-expiry",
        selector: "section",
        title: "Documentos vigentes",
        body: "APEXOS conserva el control visual del legacy para SOAT, tecnico-mecanica y seguro antes de operar.",
        action: "Revisar alertas"
      }
    ];
  }

  return [
    {
      id: "ai-core",
      selector: 'a[href="/dashboard/apex-ai"]',
      title: "Tu mentor operativo esta activo",
      body: "APEX AI Core acompana cada modulo con guias, alertas y recomendaciones accionables segun permisos.",
      action: "Ver inteligencia"
    },
    {
      id: "inventory-start",
      selector: 'a[href="/dashboard/inventario"]',
      title: "Empieza por inventario",
      body: "El maestro de productos, stock y ubicaciones alimenta compras, ventas, costos y WMS.",
      action: "Abrir inventario"
    },
    {
      id: "purchases-start",
      selector: 'a[href="/dashboard/compras"]',
      title: "Compras dispara abastecimiento",
      body: "Las OC conectan proveedores, inventario, recepcion WMS y trazabilidad financiera.",
      action: "Abrir compras"
    }
  ];
}

function findTarget(selector: string) {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return nodes.find((node) => node.offsetParent !== null) || nodes[0] || null;
}

function readSet(key: string) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]") as string[]);
  } catch {
    return new Set<string>();
  }
}

function writeSet(key: string, value: Set<string>) {
  localStorage.setItem(key, JSON.stringify(Array.from(value)));
}

export function AiExperienceLayer() {
  const pathname = usePathname();
  const [insights, setInsights] = useState<BrainInsight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());

  const currentModule = moduleFromPath(pathname);
  const steps = useMemo(() => stepsForPath(pathname), [pathname]);
  const currentStep = steps[stepIndex];
  const storagePrefix = `apex_ai_${userKey()}`;
  const guideKey = `${storagePrefix}_guide_${pathname}`;
  const insightKey = `${storagePrefix}_dismissed_insights`;

  const refreshTarget = useCallback(() => {
    if (!currentStep) return;
    const node = findTarget(currentStep.selector);
    if (!node) {
      setTargetRect(null);
      return;
    }
    const rect = node.getBoundingClientRect();
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, [currentStep]);

  useEffect(() => {
    setStepIndex(0);
    const dismissed = readSet(insightKey);
    setDismissedInsights(dismissed);

    const guideSeen = localStorage.getItem(guideKey) === "1";
    setCoachOpen(!guideSeen && steps.length > 0);

    setLoadingInsights(true);
    api<BrainInsightsResponse>(`/api/v1/brain/insightslimit=12&module=${currentModule}`)
      .then((response) => setInsights(response.data))
      .catch(() => setInsights([]))
      .finally(() => setLoadingInsights(false));
  }, [currentModule, guideKey, insightKey, pathname, steps.length]);

  useEffect(() => {
    if (!coachOpen) return;
    const frame = window.requestAnimationFrame(refreshTarget);
    window.addEventListener("resize", refreshTarget);
    window.addEventListener("scroll", refreshTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refreshTarget);
      window.removeEventListener("scroll", refreshTarget, true);
    };
  }, [coachOpen, refreshTarget]);

  function closeCoach() {
    localStorage.setItem(guideKey, "1");
    setCoachOpen(false);
  }

  function nextStep() {
    if (stepIndex >= steps.length - 1) {
      closeCoach();
      return;
    }
    setStepIndex((value) => value + 1);
  }

  function dismissInsight(id: string) {
    setDismissedInsights((current) => {
      const next = new Set(current);
      next.add(id);
      writeSet(insightKey, next);
      return next;
    });
  }

  const visibleInsights = insights.filter((insight) => !dismissedInsights.has(insight.id));
  const criticalCount = visibleInsights.filter((insight) => insight.severity === "critical" || insight.severity === "warning").length;
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const coachTop = targetRect ? Math.min(viewportHeight - 210, Math.max(72, targetRect.top + targetRect.height + 12)) : 112;
  const coachLeft = targetRect ? Math.min(viewportWidth - 360, Math.max(16, targetRect.left)) : Math.max(16, viewportWidth - 390);

  return (
    <>
      {coachOpen && currentStep ? (
        <div className="pointer-events-none fixed inset-0 z-40">
          {targetRect ? (
            <div
              className="absolute rounded-md border-2 border-apex shadow-[0_0_0_9999px_rgba(20,22,26,0.18)] transition-all duration-300"
              style={{
                top: targetRect.top - 6,
                left: targetRect.left - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12
              }}
            />
          ) : null}
          <div
            className="pointer-events-auto absolute w-[340px] max-w-[calc(100vw-32px)] animate-[apexCoachIn_180ms_ease-out] rounded-md border border-line bg-white p-4 shadow-xl"
            style={{ top: coachTop, left: coachLeft }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-apex text-white">
                  <Lightbulb size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-apex">Guia APEX AI</p>
                  <h3 className="text-sm font-semibold">{currentStep.title}</h3>
                </div>
              </div>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-paper" onClick={closeCoach} type="button" aria-label="Cerrar guia">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm leading-5 text-neutral-700">{currentStep.body}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-neutral-500">{stepIndex + 1} de {steps.length}</span>
              <div className="flex items-center gap-2">
                <button className="h-9 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper" onClick={closeCoach} type="button">Cerrar</button>
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={nextStep} type="button">
                  {stepIndex >= steps.length - 1 ? "Finalizar" : "Siguiente"}
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
        {trayOpen ? (
          <section className="w-[380px] max-w-[calc(100vw-32px)] animate-[apexTrayIn_160ms_ease-out] rounded-md border border-line bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-apex">Bandeja APEX AI</p>
                <h3 className="text-base font-semibold">Recomendaciones para ti</h3>
              </div>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-paper" onClick={() => setTrayOpen(false)} type="button" aria-label="Cerrar bandeja">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
              {loadingInsights ? (
                <div className="flex items-center justify-center gap-2 rounded-md bg-paper p-4 text-sm text-neutral-600">
                  <Loader2 className="animate-spin" size={16} />
                  Leyendo recomendaciones
                </div>
              ) : visibleInsights.length ? (
                visibleInsights.map((insight) => {
                  const Icon = severityIcons[insight.severity];
                  return (
                    <article className={`rounded-md border p-3 ${severityStyles[insight.severity]}`} key={insight.id}>
                      <div className="flex items-start gap-2">
                        <Icon className="mt-0.5 shrink-0" size={16} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold uppercase">{insight.module_label}</p>
                              <h4 className="mt-1 text-sm font-semibold">{insight.title}</h4>
                            </div>
                            <button className="rounded-md p-1 hover:bg-white/60" onClick={() => dismissInsight(insight.id)} type="button" aria-label="Descartar recomendacion">
                              <X size={14} />
                            </button>
                          </div>
                          <p className="mt-1 text-xs leading-5">{insight.summary}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {insight.href ? (
                              <Link className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-2 text-xs font-semibold text-neutral-900 hover:bg-paper" href={insight.href}>
                                {insight.recommended_action}
                                <ChevronRight size={13} />
                              </Link>
                            ) : null}
                            <span className="text-xs font-medium">{Math.round(insight.confidence * 100)}% confianza</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-md bg-paper p-4 text-sm text-neutral-600">No tienes recomendaciones pendientes en este modulo.</div>
              )}
            </div>
          </section>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium shadow-lg hover:bg-paper"
            onClick={() => {
              setStepIndex(0);
              setCoachOpen(true);
              localStorage.removeItem(guideKey);
            }}
            type="button"
          >
            <Sparkles size={16} className="text-apex" />
            Guia IA
          </button>
          <button
            className="relative inline-flex h-12 w-12 items-center justify-center rounded-md bg-apex text-white shadow-lg hover:bg-apex/90"
            onClick={() => setTrayOpen((open) => !open)}
            type="button"
            aria-label="Abrir bandeja de recomendaciones APEX AI"
          >
            <Bell size={19} />
            {visibleInsights.length ? (
              <span className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${criticalCount ? "bg-red-600" : "bg-emerald-600"}`}>
                {visibleInsights.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </>
  );
}
