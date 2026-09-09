"use client";

import { api } from "@/lib/api";
import { useApexAiAccess } from "@/components/brain/useApexAiAccess";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Insight = { id: string; module?: string; title: string; summary: string; severity: "critical" | "warning" | "opportunity" | "info"; href?: string; recommended_action?: string };
type Response = { data?: Insight[] };

export function ApexIntelligencePulse() {
  const pathname = usePathname();
  const aiAccess = useApexAiAccess();
  const [insight, setInsight] = useState<Insight | null>(null);
  useEffect(() => {
    const moduleName = pathname.split("/")[2] || "dashboard";
    if (moduleName === "apex-ai" || aiAccess !== "enabled") {
      setInsight(null);
      return;
    }
    api<Response>("/api/v1/brain/insights?limit=12")
      .then((response) => setInsight((response.data || []).sort((a, b) => {
        const modulePriority = Number(b.module === moduleName) - Number(a.module === moduleName);
        if (modulePriority) return modulePriority;
        return ["critical", "warning", "opportunity", "info"].indexOf(a.severity) - ["critical", "warning", "opportunity", "info"].indexOf(b.severity);
      })[0] || null))
      .catch(() => setInsight(null));
  }, [pathname, aiAccess]);
  if (!insight) return null;
  const Icon = insight.severity === "critical" || insight.severity === "warning" ? AlertTriangle : Sparkles;
  return <aside aria-label="Señal inteligente prioritaria" className="mb-3 flex flex-col gap-3 rounded-card border border-apex/20 bg-apex/5 px-4 py-3 sm:flex-row sm:items-center">
    <Icon className="shrink-0 text-apex" size={18} />
    <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold uppercase tracking-wide text-apex">APEX AI · {insight.severity}</p><p className="truncate text-sm font-semibold text-content-strong">{insight.title}</p><p className="line-clamp-1 text-xs text-content-muted">{insight.summary}</p></div>
    <Link className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-control bg-apex px-3 text-xs font-semibold text-white" href={insight.href || "/dashboard/apex-ai"}>{insight.recommended_action || "Revisar"}<ArrowRight size={14} /></Link>
  </aside>;
}
