"use client";

import { api } from "@/lib/api";
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, DatabaseZap, Loader2, Lock, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InsightSeverity = "critical" | "warning" | "info" | "success";

type BrainInsight = {
  id: string;
  module: string;
  module_label: string;
  severity: InsightSeverity;
  title: string;
  summary: string;
  why: string;
  impact: string;
  recommended_action: string;
  href: string;
  confidence: number;
};

type BrainInsightsResponse = {
  data: BrainInsight[];
  health_score: number;
  snapshot_summary: {
    tenant: string;
    country: string;
    currency: string;
    totals: Record<string, number | null>;
    permissions: Record<string, boolean>;
  };
  generated_at: string;
};

type MentorResponse = {
  module: string;
  title: string;
  message: string;
  steps: string[];
  priority_insights: BrainInsight[];
};

const modules = [
  { id: "platform", label: "Ecosistema" },
  { id: "inventory", label: "Inventario" },
  { id: "purchases", label: "Compras" },
  { id: "wms", label: "WMS" },
  { id: "finance", label: "Finanzas" }
];

const severityClasses: Record<InsightSeverity, string> = {
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

export default function ApexAiPage() {
  const [selectedModule, setSelectedModule] = useState("platform");
  const [insights, setInsights] = useState<BrainInsightsResponse | null>(null);
  const [mentor, setMentor] = useState<MentorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("module");
    const normalized = requested === "inventario" ? "inventory" : requested === "compras" ? "purchases" : requested || "platform";
    if (modules.some((module) => module.id === normalized)) setSelectedModule(normalized);
  }, []);

  async function load(moduleId = selectedModule) {
    setLoading(true);
    setError(null);
    try {
      const [insightResponse, mentorResponse] = await Promise.all([
        api<BrainInsightsResponse>("/api/v1/brain/insights?limit=20"),
        api<MentorResponse>(`/api/v1/brain/mentor?module=${moduleId}`)
      ]);
      setInsights(insightResponse);
      setMentor(mentorResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible leer APEX AI Core.");
    } finally {
      setLoading(false);
    }
  }

  async function runRecommendations() {
    setRunning(true);
    setError(null);
    try {
      await api<{ count: number }>("/api/v1/brain/recommendations/run", { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible guardar recomendaciones.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    load(selectedModule);
  }, [selectedModule]);

  const filteredInsights = useMemo(() => {
    if (!insights) return [];
    if (selectedModule === "platform") return insights.data;
    return insights.data.filter((insight) => insight.module === selectedModule);
  }, [insights, selectedModule]);

  const snapshot = insights?.snapshot_summary;
  const totals = snapshot?.totals || { items: 0, open_purchase_orders: 0 };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">APEX AI CORE</p>
          <h1 className="text-3xl font-semibold">Inteligencia transversal</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            La IA interna observa el tenant, respeta permisos y convierte senales de inventario, compras, WMS, ventas y finanzas en acciones simples.
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60"
          disabled={running}
          onClick={runRecommendations}
          type="button"
        >
          {running ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          Generar recomendaciones
        </button>
      </header>

      {error ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-neutral-500">Salud operativa</p>
            <Brain size={18} className="text-apex" />
          </div>
          <p className="text-3xl font-semibold">{insights?.health_score ?? "--"}%</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-neutral-500">Productos</p>
            <DatabaseZap size={18} className="text-apex" />
          </div>
          <p className="text-3xl font-semibold">{totals.items ?? "--"}</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-neutral-500">OC abiertas</p>
            <Zap size={18} className="text-apex" />
          </div>
          <p className="text-3xl font-semibold">{totals.open_purchase_orders ?? "--"}</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-neutral-500">Permisos</p>
            <Lock size={18} className="text-apex" />
          </div>
          <p className="text-sm font-semibold">{snapshot?.permissions?.finance ? "Finanzas visibles" : "Finanzas protegidas"}</p>
          <p className="mt-1 text-xs text-neutral-500">{snapshot?.country || "LATAM"} · {snapshot?.currency || "USD"}</p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-md border border-line bg-white p-3">
          <p className="mb-3 px-1 text-sm font-semibold">Mentor por modulo</p>
          <div className="space-y-1">
            {modules.map((module) => (
              <button
                className={`flex h-10 w-full items-center justify-between rounded-md px-3 text-left text-sm ${selectedModule === module.id ? "bg-apex text-white" : "hover:bg-paper"}`}
                key={module.id}
                onClick={() => setSelectedModule(module.id)}
                type="button"
              >
                {module.label}
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-md border border-line bg-white p-4">
            {loading ? (
              <div className="flex h-28 items-center justify-center text-neutral-500">
                <Loader2 className="mr-2 animate-spin" size={18} />
                Leyendo contexto operativo
              </div>
            ) : mentor ? (
              <div>
                <p className="text-sm font-medium text-apex">{mentor.title}</p>
                <h2 className="mt-1 text-xl font-semibold">Guia contextual</h2>
                <p className="mt-2 text-sm text-neutral-600">{mentor.message}</p>
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  {mentor.steps.map((step) => (
                    <div className="rounded-md border border-line bg-paper p-3 text-sm" key={step}>{step}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Senales y recomendaciones</h2>
                <p className="text-sm text-neutral-600">Priorizadas por severidad, impacto y permisos del usuario.</p>
              </div>
              <span className="rounded-md bg-paper px-3 py-1 text-sm">{filteredInsights.length} activas</span>
            </div>
            <div className="space-y-3">
              {filteredInsights.map((insight) => {
                const Icon = severityIcons[insight.severity];
                return (
                  <div className={`rounded-md border p-4 ${severityClasses[insight.severity]}`} key={insight.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <Icon className="mt-1 shrink-0" size={18} />
                        <div>
                          <p className="text-xs font-semibold uppercase">{insight.module_label}</p>
                          <h3 className="mt-1 text-base font-semibold">{insight.title}</h3>
                          <p className="mt-1 text-sm">{insight.summary}</p>
                        </div>
                      </div>
                      <span className="rounded-md bg-white/60 px-2 py-1 text-xs font-semibold">{Math.round(insight.confidence * 100)}%</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      <p><span className="font-semibold">Por que importa:</span> {insight.why}</p>
                      <p><span className="font-semibold">Impacto:</span> {insight.impact}</p>
                    </div>
                    <div className="mt-3">
                      {insight.href ? (
                        <Link className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-paper" href={insight.href}>
                          {insight.recommended_action}
                          <ArrowRight size={15} />
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold">{insight.recommended_action}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {!loading && filteredInsights.length === 0 ? (
                <div className="rounded-md border border-line bg-paper p-4 text-sm text-neutral-600">No hay senales para este modulo en este momento.</div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
