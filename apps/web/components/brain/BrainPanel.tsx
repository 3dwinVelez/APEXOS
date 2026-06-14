"use client";

import { api } from "@/lib/api";
import { useApexAiAccess } from "@/components/brain/useApexAiAccess";
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, Loader2, Sparkles, Zap } from "lucide-react";
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
  };
  generated_at: string;
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

export function BrainPanel() {
  const access = useApexAiAccess();
  const [data, setData] = useState<BrainInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api<BrainInsightsResponse>("/api/v1/brain/insights?limit=5");
      setData(response);
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
      setError(err instanceof Error ? err.message : "No fue posible generar recomendaciones.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (access === "enabled") load();
    else if (access === "disabled") setLoading(false);
  }, [access]);

  const healthLabel = useMemo(() => {
    if (!data) return "Leyendo";
    if (data.health_score >= 85) return "Salud estable";
    if (data.health_score >= 70) return "Requiere atencion";
    return "Riesgo operativo";
  }, [data]);

  if (access === "disabled") {
    return (
      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-paper text-neutral-500">
            <Brain size={19} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">APEX AI Core</p>
            <h2 className="text-base font-semibold">Modulo no habilitado</h2>
            <p className="mt-1 text-sm text-neutral-600">La empresa actual no tiene APEX AI Core activo.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-line bg-white p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-apex text-white">
            <Brain size={19} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-apex">APEX AI Core</p>
            <h2 className="text-base font-semibold">Capa cognitiva empresarial</h2>
          </div>
        </div>
        {loading ? <Loader2 className="animate-spin text-neutral-400" size={18} /> : null}
      </div>

      {error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>
      ) : null}

      {data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-line bg-paper p-3">
              <p className="text-xs text-neutral-500">Salud</p>
              <p className="mt-1 text-xl font-semibold">{data.health_score}%</p>
              <p className="mt-1 text-xs text-neutral-600">{healthLabel}</p>
            </div>
            <div className="rounded-md border border-line bg-paper p-3">
              <p className="text-xs text-neutral-500">Tenant</p>
              <p className="mt-1 truncate text-sm font-semibold">{data.snapshot_summary.tenant}</p>
              <p className="mt-1 text-xs text-neutral-600">{data.snapshot_summary.country || "LATAM"} · {data.snapshot_summary.currency || "USD"}</p>
            </div>
            <div className="rounded-md border border-line bg-paper p-3">
              <p className="text-xs text-neutral-500">Senales</p>
              <p className="mt-1 text-xl font-semibold">{data.data.length}</p>
              <p className="mt-1 text-xs text-neutral-600">priorizadas</p>
            </div>
          </div>

          <div className="space-y-2">
            {data.data.map((insight) => {
              const Icon = severityIcons[insight.severity];
              const content = (
                <div className={`rounded-md border p-3 ${severityStyles[insight.severity]}`}>
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 shrink-0" size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{insight.title}</p>
                        <span className="shrink-0 text-[11px] font-medium">{Math.round(insight.confidence * 100)}%</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs">{insight.summary}</p>
                      <p className="mt-2 text-xs font-medium">{insight.recommended_action}</p>
                    </div>
                  </div>
                </div>
              );

              return insight.href ? (
                <Link href={insight.href} key={insight.id}>
                  {content}
                </Link>
              ) : (
                <div key={insight.id}>{content}</div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white disabled:opacity-60"
              disabled={running}
              onClick={runRecommendations}
              type="button"
            >
              {running ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Generar recomendaciones
            </button>
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper" href="/dashboard/apex-ai">
              Ver AI Core
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      ) : !loading ? (
        <div className="rounded-md border border-line bg-paper p-3 text-sm text-neutral-600">APEX AI Core se activara cuando existan datos operativos del tenant.</div>
      ) : null}
    </section>
  );
}
