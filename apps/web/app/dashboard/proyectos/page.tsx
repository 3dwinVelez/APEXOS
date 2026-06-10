"use client";

import { api } from "@/lib/api";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Clock3,
  FileCheck2,
  Filter,
  ListChecks,
  MessageSquarePlus,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ApexStatus = "pendiente" | "activo" | "bloqueado" | "validacion" | "finalizado";
type WorkType = "tarea" | "compromiso" | "entregable" | "bloqueo" | "riesgo";
type Commitment = { id: number; title: string; description?: string; responsible_name?: string; priority: string; target_date?: string; status: ApexStatus; updated_at?: string; metadata?: Record<string, unknown> };
type Deliverable = { id: number; name: string; description?: string; responsible_name?: string; target_date?: string; status: ApexStatus; validation?: string; evidence_status?: string; updated_at?: string; metadata?: Record<string, unknown> };
type RiskItem = { id: number; kind: "riesgo" | "bloqueo"; description: string; impact: string; priority: string; responsible_name?: string; action_recommended?: string; status: ApexStatus; updated_at?: string; metadata?: Record<string, unknown> };
type AssignmentSummary = { commitments: number; deliverables: number; risks: number; open_items: number };
type ResourceItem = {
  id: number;
  person_id?: number | null;
  person_name: string;
  role: string;
  load_level: number;
  availability: string;
  responsibilities?: string;
  metadata?: Record<string, unknown>;
  assignment_summary?: AssignmentSummary;
  assignments?: {
    commitments?: Array<{ id: number; title: string; status: ApexStatus; target_date?: string }>;
    deliverables?: Array<{ id: number; name: string; status: ApexStatus; target_date?: string }>;
    risks?: Array<{ id: number; kind: string; description: string; status: ApexStatus }>;
  };
};
type AlertItem = { title: string; description?: string; action_suggested?: string; severity: string; type: string };
type LogItem = { id: string; action: string; summary: string; created_at: string; entity_type?: string; entity_id?: number; new_value?: Record<string, unknown> };
type ProjectItem = {
  id: number;
  name: string;
  objective: string;
  status: ApexStatus;
  priority: string;
  owner_name?: string;
  target_date?: string;
  apex_score: number;
  score_status: string;
  progress: number;
  validated_progress: number;
  commitments: Commitment[];
  deliverables: Deliverable[];
  risks: RiskItem[];
  resources: ResourceItem[];
  generated_alerts: AlertItem[];
  logs: LogItem[];
  indicators: {
    open_commitments: number;
    pending_deliverables: number;
    active_blocks: number;
    critical_risks: number;
    saturated_resources: number;
    next_commitments: number;
  };
};
type CenterResponse = { active_project: ProjectItem; projects: ProjectItem[]; portfolio: { total: number; active: number; blocked: number; validation: number; average_score: number }; next_actions: Array<{ title: string; description?: string; action?: string; severity: string }> };
type WorkItem = {
  uid: string;
  id: number;
  entityType: "commitment" | "deliverable" | "risk";
  type: WorkType;
  name: string;
  description?: string;
  responsible?: string;
  targetDate?: string;
  priority: string;
  status: ApexStatus;
  lastUpdate?: string;
  action: string;
};
type QuickForm = "proyecto" | "compromiso" | "tarea" | "entregable" | "riesgo" | "recurso" | "seguimiento" | null;

const shortStatusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  activo: "En curso",
  bloqueado: "Bloqueado",
  validacion: "Validacion",
  finalizado: "Finalizado"
};

const scoreLabel: Record<string, string> = {
  excelente: "Excelente",
  estable: "Estable",
  en_riesgo: "En riesgo",
  critico: "Critico"
};

const statusTone: Record<string, string> = {
  pendiente: "border-neutral-200 bg-neutral-50 text-neutral-700",
  activo: "border-cyan-200 bg-cyan-50 text-cyan-800",
  bloqueado: "border-red-200 bg-red-50 text-red-700",
  validacion: "border-violet-200 bg-violet-50 text-violet-800",
  finalizado: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

const typeTone: Record<WorkType, string> = {
  tarea: "bg-slate-100 text-slate-700",
  compromiso: "bg-cyan-50 text-cyan-800",
  entregable: "bg-emerald-50 text-emerald-800",
  bloqueo: "bg-red-50 text-red-700",
  riesgo: "bg-amber-50 text-amber-800"
};

const barColors = ["#059669", "#0284c7", "#f59e0b", "#dc2626"];
const emptyDraft = { title: "", description: "", responsible_name: "", target_date: "", priority: "media", kind: "riesgo", role: "", participant_type: "externo", load_level: "50", availability: "disponible", contact_email: "", phone: "", organization: "", status: "activo", progress: "0", next_action: "", next_date: "" };

function shortDate(value?: string) {
  return value ? new Date(value).toLocaleDateString("es-CO", { month: "short", day: "numeric" }) : "Sin fecha";
}

function fullDate(value?: string) {
  return value ? new Date(value).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "Sin fecha";
}

function daysUntil(value?: string) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function byDate<T extends { targetDate?: string; target_date?: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(a.targetDate || a.target_date || "2999-01-01").getTime() - new Date(b.targetDate || b.target_date || "2999-01-01").getTime());
}

function scoreTone(score: number) {
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-cyan-300";
  if (score >= 50) return "text-amber-300";
  return "text-red-300";
}

function scoreMessage(project: ProjectItem) {
  const parts = [];
  if (project.indicators.next_commitments > 0) parts.push(`${project.indicators.next_commitments} compromisos proximos a vencer`);
  if (project.indicators.active_blocks > 0) parts.push(`${project.indicators.active_blocks} bloqueos pendientes`);
  if (project.indicators.saturated_resources > 0) parts.push(`${project.indicators.saturated_resources} responsables con carga alta`);
  if (!parts.length) return "El proyecto avanza sin alertas urgentes. Mantener seguimiento y validar entregables.";
  return `Hay ${parts.join(", ")}. Atiende primero lo que pueda detener el avance.`;
}

function nextAction(project: ProjectItem) {
  if (project.indicators.active_blocks > 0) return "Resolver el bloqueo abierto con responsable y proxima accion.";
  if (project.indicators.next_commitments > 0) return "Revisar compromisos de esta semana y registrar seguimiento.";
  if (project.indicators.pending_deliverables > 0) return "Validar entregables pendientes y cerrar evidencia.";
  return "Registrar una actualizacion corta para mantener trazabilidad.";
}

function humanStatus(project: ProjectItem) {
  const label = scoreLabel[project.score_status] || "En seguimiento";
  return `Proyecto ${label.toLowerCase()}. ${scoreMessage(project)}`;
}

function workAction(item: WorkItem) {
  const days = daysUntil(item.targetDate);
  if (item.status === "bloqueado") return "Definir desbloqueo";
  if (days !== null && days < 0) return "Actualizar vencido";
  if (item.status === "validacion") return "Validar cierre";
  if (!item.responsible) return "Asignar responsable";
  return "Registrar seguimiento";
}

function buildWorkItems(project: ProjectItem): WorkItem[] {
  return [
    ...project.commitments.map((item) => {
      const type = item.metadata?.item_type === "tarea" ? "tarea" : "compromiso";
      return {
        uid: `commitment-${item.id}`,
        id: item.id,
        entityType: "commitment" as const,
        type: type as WorkType,
        name: item.title,
        description: item.description,
        responsible: item.responsible_name,
        targetDate: item.target_date,
        priority: item.priority || "media",
        status: item.status,
        lastUpdate: item.updated_at,
        action: ""
      };
    }),
    ...project.deliverables.map((item) => ({
      uid: `deliverable-${item.id}`,
      id: item.id,
      entityType: "deliverable" as const,
      type: "entregable" as WorkType,
      name: item.name,
      description: item.description,
      responsible: item.responsible_name,
      targetDate: item.target_date,
      priority: "media",
      status: item.status,
      lastUpdate: item.updated_at,
      action: ""
    })),
    ...project.risks.map((item) => ({
      uid: `risk-${item.id}`,
      id: item.id,
      entityType: "risk" as const,
      type: item.kind,
      name: item.description,
      description: item.action_recommended,
      responsible: item.responsible_name,
      targetDate: undefined,
      priority: item.priority || "media",
      status: item.status,
      lastUpdate: item.updated_at,
      action: ""
    }))
  ].map((item) => ({ ...item, action: workAction(item) }));
}

export default function ProjectsPage() {
  const [data, setData] = useState<CenterResponse | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState<QuickForm>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [filters, setFilters] = useState({ search: "", status: "todos", responsible: "todos", priority: "todos", type: "todos", date: "todos" });

  async function load(projectId = activeId) {
    const qs = projectId ? `?project_id=${projectId}` : "";
    const response = await api<CenterResponse>(`/api/v1/projects/operational-center${qs}`);
    setData(response);
    setActiveId(response.active_project?.id || null);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "No fue posible cargar proyectos."));
  }, []);

  const project = data?.active_project;
  const workItems = useMemo(() => project ? buildWorkItems(project) : [], [project]);
  const responsibles = useMemo(() => Array.from(new Set(workItems.map((item) => item.responsible).filter(Boolean) as string[])).sort(), [workItems]);

  const filteredItems = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return workItems.filter((item) => {
      const days = daysUntil(item.targetDate);
      const matchSearch = !search || `${item.name} ${item.description || ""} ${item.responsible || ""}`.toLowerCase().includes(search);
      const matchStatus = filters.status === "todos" || item.status === filters.status;
      const matchResponsible = filters.responsible === "todos" || item.responsible === filters.responsible;
      const matchPriority = filters.priority === "todos" || item.priority === filters.priority;
      const matchType = filters.type === "todos" || item.type === filters.type;
      const matchDate = filters.date === "todos" ||
        (filters.date === "vencidos" && days !== null && days < 0) ||
        (filters.date === "proximos" && days !== null && days >= 0 && days <= 7) ||
        (filters.date === "sin_responsable" && !item.responsible);
      return matchSearch && matchStatus && matchResponsible && matchPriority && matchType && matchDate;
    });
  }, [filters, workItems]);

  const attentionItems = useMemo(() => byDate(workItems.filter((item) => item.status === "bloqueado" || !item.responsible || (daysUntil(item.targetDate) ?? 99) <= 3)).slice(0, 6), [workItems]);
  const nextDue = useMemo(() => byDate(workItems.filter((item) => {
    const days = daysUntil(item.targetDate);
    return days !== null && days >= 0 && days <= 14 && item.status !== "finalizado";
  })).slice(0, 6), [workItems]);

  async function saveQuick() {
    if (!project && form !== "proyecto") return;
    setSaving(true);
    setMessage("");
    try {
      if (form === "proyecto") {
        await api("/api/v1/projects", { method: "POST", body: JSON.stringify({ name: draft.title, objective: draft.description, owner_name: draft.responsible_name, target_date: draft.target_date, priority: draft.priority }) });
      } else if (form === "compromiso" || form === "tarea") {
        await api(`/api/v1/projects/${project?.id}/commitments`, { method: "POST", body: JSON.stringify({ title: draft.title, description: draft.description, responsible_name: draft.responsible_name, target_date: draft.target_date, priority: draft.priority, status: draft.status || "activo", metadata: { item_type: form } }) });
      } else if (form === "entregable") {
        await api(`/api/v1/projects/${project?.id}/deliverables`, { method: "POST", body: JSON.stringify({ name: draft.title, description: draft.description, responsible_name: draft.responsible_name, target_date: draft.target_date, status: draft.status || "activo" }) });
      } else if (form === "riesgo") {
        await api(`/api/v1/projects/${project?.id}/risks`, { method: "POST", body: JSON.stringify({ kind: draft.kind, description: draft.description || draft.title, responsible_name: draft.responsible_name, priority: draft.priority, impact: draft.priority === "critica" ? "alto" : "medio", action_recommended: draft.next_action || draft.title, status: "activo" }) });
      } else if (form === "recurso") {
        await api(`/api/v1/projects/${project?.id}/resources`, { method: "POST", body: JSON.stringify({ person_name: draft.responsible_name || draft.title, role: draft.role || "Participante", load_level: Number(draft.load_level || 50), availability: draft.availability, responsibilities: draft.description, contact_email: draft.contact_email, phone: draft.phone, organization: draft.organization, metadata: { participant_type: draft.participant_type } }) });
      } else if (form === "seguimiento") {
        await api(`/api/v1/projects/${project?.id}/follow-ups`, { method: "POST", body: JSON.stringify({ entity_type: selectedItem?.entityType || "project", entity_id: selectedItem?.id, comment: draft.description || draft.title, status: draft.status, progress: Number(draft.progress || 0), next_action: draft.next_action, next_date: draft.next_date }) });
      }
      setDraft(emptyDraft);
      setForm(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: WorkItem, status: ApexStatus) {
    const kind = item.entityType === "commitment" ? "commitments" : item.entityType === "deliverable" ? "deliverables" : "risks";
    await api(`/api/v1/projects/${kind}/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  function openFollowUp(item?: WorkItem) {
    setSelectedItem(item || null);
    setDraft((prev) => ({ ...prev, title: item ? `Seguimiento: ${item.name}` : "Seguimiento del proyecto", description: "", status: item?.status || "activo" }));
    setForm("seguimiento");
  }

  if (!data || !project) {
    return <div className="rounded-md border border-line bg-white p-4 text-sm text-neutral-600">Cargando Monitor Operacional APEX...</div>;
  }

  const executionData = [
    { name: "Avance", value: project.progress },
    { name: "Validado", value: project.validated_progress },
    { name: "Salud", value: project.apex_score },
    { name: "Control", value: Math.max(0, 100 - project.indicators.active_blocks * 24 - project.indicators.critical_risks * 14) }
  ];
  const flowData = [
    { name: "Tareas", abiertos: workItems.filter((item) => item.type === "tarea" && item.status !== "finalizado").length, cerrados: workItems.filter((item) => item.type === "tarea" && item.status === "finalizado").length },
    { name: "Compromisos", abiertos: workItems.filter((item) => item.type === "compromiso" && item.status !== "finalizado").length, cerrados: workItems.filter((item) => item.type === "compromiso" && item.status === "finalizado").length },
    { name: "Entregables", abiertos: project.indicators.pending_deliverables, cerrados: project.deliverables.filter((item) => item.status === "finalizado").length },
    { name: "Bloqueos", abiertos: project.indicators.active_blocks, cerrados: project.risks.filter((item) => item.status === "finalizado").length }
  ];
  const overdue = workItems.filter((item) => {
    const days = daysUntil(item.targetDate);
    return days !== null && days < 0 && item.status !== "finalizado";
  }).length;
  const noResponsible = workItems.filter((item) => !item.responsible && item.status !== "finalizado").length;
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-24 md:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-neutral-600 hover:text-apex md:hidden" href="/dashboard"><ArrowLeft size={17} /> Inicio</Link>
        <div className="grid gap-3 lg:flex lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-apex">M-19 - MODELO APEX</p>
            <h1 className="text-2xl font-semibold md:text-3xl">Monitor operacional del proyecto</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">Una vista para saber que pasa, que esta pendiente, quien responde y que accion sigue.</p>
          </div>
          <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <select className="h-11 min-w-0 rounded-md border border-line bg-white px-3 text-sm sm:max-w-[320px]" value={activeId || ""} onChange={(event) => { const id = Number(event.target.value); setActiveId(id); load(id); }}>
              {data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => setForm("proyecto")} type="button"><Plus size={16} /> Proyecto</button>
          </div>
        </div>
      </header>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="overflow-hidden rounded-md bg-neutral-950 text-white">
        <div className="grid gap-5 p-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_310px] lg:p-5">
          <div className="flex flex-col justify-between gap-5 border-white/10 lg:border-r lg:pr-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Resumen ejecutivo</p>
              <h2 className="mt-3 text-2xl font-semibold leading-tight">{project.name}</h2>
              <p className="mt-3 text-sm leading-6 text-white/72">{humanStatus(project)}</p>
            </div>
            <div>
              <div className="flex items-end gap-2">
                <span className={`text-6xl font-semibold leading-none ${scoreTone(project.apex_score)}`}>{project.apex_score}</span>
                <span className="pb-2 text-sm text-white/50">/100</span>
              </div>
              <p className="mt-2 text-sm font-semibold">Salud del proyecto: {scoreLabel[project.score_status] || project.score_status}</p>
              <p className="mt-1 text-xs leading-5 text-white/55">{scoreMessage(project)}</p>
            </div>
          </div>

          <div className="min-w-0 grid gap-4">
            <div className="min-h-56 min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={executionData}>
                  <defs>
                    <linearGradient id="projectHealth" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.62)", fontSize: 12 }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", color: "#111827" }} />
                  <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={3} fill="url(#projectHealth)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid min-w-0 gap-2 md:grid-cols-2">
              <Signal label="Avance real" value={`${project.progress}%`} detail="Trabajo ejecutado frente a lo planeado." />
              <Signal label="Avance validado" value={`${project.validated_progress}%`} detail="Entregables revisados o cerrados." />
              <Signal label="Responsable general" value={project.owner_name || "Sin asignar"} detail="Quien responde por el resultado." />
              <Signal label="Fecha objetivo" value={shortDate(project.target_date)} detail="Meta principal del proyecto." />
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-white/5 p-4 xl:col-span-2 2xl:col-span-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Que hacer ahora</p>
                <p className="mt-2 text-sm font-semibold leading-6">{nextAction(project)}</p>
              </div>
              <Sparkles className="shrink-0 text-emerald-300" size={22} />
            </div>
            <div className="mt-4 space-y-3">
              <PressureLine label="Bloqueos" value={project.indicators.active_blocks} tone="bg-red-400" />
              <PressureLine label="Vencidos" value={overdue} tone="bg-orange-300" />
              <PressureLine label="Sin responsable" value={noResponsible} tone="bg-violet-300" />
            </div>
            <button className="mt-5 h-11 w-full rounded-md bg-white text-sm font-semibold text-neutral-950" onClick={() => openFollowUp()} type="button">Registrar seguimiento</button>
          </div>
        </div>

        <div className="grid border-t border-white/10 md:grid-cols-4">
          <HeroMetric icon={ListChecks} label="Compromisos abiertos" value={project.indicators.open_commitments} state={`${project.indicators.next_commitments} proximos`} action="Revisar compromisos criticos" />
          <HeroMetric icon={ClipboardList} label="Tareas activas" value={workItems.filter((item) => item.type === "tarea" && item.status !== "finalizado").length} state={noResponsible ? `${noResponsible} sin responsable` : "Con responsables"} action="Asignar o registrar avance" />
          <HeroMetric icon={FileCheck2} label="Entregables pendientes" value={project.indicators.pending_deliverables} state="Necesitan cierre o validacion" action="Validar evidencia" />
          <HeroMetric icon={ShieldAlert} label="Bloqueos activos" value={project.indicators.active_blocks} state={project.indicators.active_blocks ? "Detienen avance" : "Sin bloqueo"} action="Definir desbloqueo" />
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <QuickAction icon={ListChecks} label="Crear compromiso" onClick={() => setForm("compromiso")} />
        <QuickAction icon={ClipboardList} label="Crear tarea" onClick={() => setForm("tarea")} />
        <QuickAction icon={FileCheck2} label="Crear entregable" onClick={() => setForm("entregable")} />
        <QuickAction icon={ShieldAlert} label="Registrar bloqueo" onClick={() => setForm("riesgo")} />
        <QuickAction icon={MessageSquarePlus} label="Agregar seguimiento" onClick={() => openFollowUp()} />
        <QuickAction icon={UserPlus} label="Agregar responsable" onClick={() => setForm("recurso")} />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <section className="grid gap-3 lg:grid-cols-2">
            <Panel title="Hoy requiere atencion" subtitle="Lo que puede detener o atrasar el proyecto.">
              <div className="space-y-2">
                {attentionItems.length ? attentionItems.map((item) => <AttentionRow key={item.uid} item={item} onFollow={() => openFollowUp(item)} onDetail={() => setSelectedItem(item)} />) : <EmptyState text="No hay elementos urgentes en este momento." />}
              </div>
            </Panel>
            <Panel title="Proximos vencimientos" subtitle="Fechas que conviene revisar antes de que se vuelvan urgentes.">
              <div className="space-y-2">
                {nextDue.length ? nextDue.map((item) => <AttentionRow key={item.uid} item={item} onFollow={() => openFollowUp(item)} onDetail={() => setSelectedItem(item)} />) : <EmptyState text="No hay vencimientos proximos." />}
              </div>
            </Panel>
          </section>

          <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold">Trabajo del proyecto</h2>
                <p className="text-sm text-neutral-600">Tareas, compromisos, entregables y bloqueos en una sola lista accionable.</p>
              </div>
              <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{filteredItems.length} elementos visibles</span>
            </div>
            <Filters filters={filters} setFilters={setFilters} responsibles={responsibles} />
            <div className="mt-4 hidden max-w-full overflow-x-auto md:block">
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500">
                    <th className="border-b border-line pb-2 font-semibold">Tipo</th>
                    <th className="border-b border-line pb-2 font-semibold">Nombre</th>
                    <th className="border-b border-line pb-2 font-semibold">Responsable</th>
                    <th className="border-b border-line pb-2 font-semibold">Fecha</th>
                    <th className="border-b border-line pb-2 font-semibold">Prioridad</th>
                    <th className="border-b border-line pb-2 font-semibold">Estado</th>
                    <th className="border-b border-line pb-2 font-semibold">Accion rapida</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => <WorkTableRow key={item.uid} item={item} onFollow={() => openFollowUp(item)} onDetail={() => setSelectedItem(item)} onDone={() => updateStatus(item, "finalizado")} />)}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 md:hidden">
              {filteredItems.map((item) => <WorkMobileCard key={item.uid} item={item} onFollow={() => openFollowUp(item)} onDetail={() => setSelectedItem(item)} onDone={() => updateStatus(item, "finalizado")} />)}
            </div>
            {!filteredItems.length ? <EmptyState text="No hay elementos con esos filtros." /> : null}
          </section>
        </div>

        <aside className="space-y-3">
          <Panel title="Responsables" subtitle="Personas internas, terceros, clientes o aliados.">
            <div className="space-y-2">
              {project.resources.slice(0, 6).map((item) => <ResourceCard key={item.id} item={item} />)}
            </div>
          </Panel>
          <Panel title="Seguimiento reciente" subtitle="Ultimas actualizaciones registradas.">
            <div className="space-y-2">
              {project.logs.slice(0, 6).map((item) => <LogRow key={item.id} item={item} />)}
            </div>
          </Panel>
        </aside>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Flujo de ejecucion" subtitle="Volumen abierto frente a elementos finalizados.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowData}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb" }} />
                <Bar dataKey="abiertos" radius={[6, 6, 0, 0]}>
                  {flowData.map((_, index) => <Cell fill={barColors[index % barColors.length]} key={index} />)}
                </Bar>
                <Bar dataKey="cerrados" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Mensajes inteligentes" subtitle="Lectura operacional del sistema.">
          <div className="space-y-2">
            <SmartMessage icon={Clock3} text={`Tienes ${project.indicators.next_commitments} compromisos proximos a vencer.`} />
            <SmartMessage icon={AlertTriangle} text={overdue ? `Hay ${overdue} elementos vencidos sin cierre.` : "No hay elementos vencidos abiertos."} />
            <SmartMessage icon={Users} text={project.indicators.saturated_resources ? `Hay ${project.indicators.saturated_resources} responsables con carga alta.` : "La carga del equipo se ve controlada."} />
            <SmartMessage icon={MessageSquarePlus} text={project.logs.length ? "El proyecto tiene seguimiento reciente." : "Este proyecto necesita una actualizacion de seguimiento."} />
          </div>
        </Panel>
      </section>

      {selectedItem && !form ? <DetailDrawer item={selectedItem} logs={project.logs.filter((log) => log.entity_type === selectedItem.entityType && Number(log.entity_id) === selectedItem.id)} onClose={() => setSelectedItem(null)} onFollow={() => openFollowUp(selectedItem)} onDone={() => updateStatus(selectedItem, "finalizado")} /> : null}
      {form ? <QuickModal form={form} selectedItem={selectedItem} draft={draft} saving={saving} setDraft={setDraft} onClose={() => setForm(null)} onSave={saveQuick} /> : null}
    </div>
  );
}

function Signal({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-md bg-white/10 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-white/55">{label}</span><span className="min-w-0 truncate font-semibold">{value}</span></div><p className="mt-1 text-xs text-white/42">{detail}</p></div>;
}

function PressureLine({ label, value, tone }: { label: string; value: number; tone: string }) {
  const width = Math.min(100, value * 22);
  return <div><div className="mb-1 flex items-center justify-between text-xs text-white/60"><span>{label}</span><span>{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} /></div></div>;
}

function HeroMetric({ icon: Icon, label, value, state, action }: { icon: LucideIcon; label: string; value: number; state: string; action: string }) {
  return <div className="border-t border-white/10 px-5 py-4 md:border-l md:border-t-0 md:first:border-l-0"><div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-emerald-200"><Icon size={17} /></span><div><p className="text-2xl font-semibold leading-tight">{value}</p><p className="text-xs text-white/55">{label}</p></div></div><p className="mt-2 text-xs text-white/72">{state}</p><p className="mt-1 text-xs font-semibold text-emerald-200">{action}</p></div>;
}

function QuickAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold shadow-sm hover:border-apex hover:bg-paper" onClick={onClick} type="button"><Icon size={16} />{label}</button>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="rounded-md border border-line bg-white p-4 shadow-sm"><div className="mb-3"><h2 className="text-base font-semibold">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-neutral-600">{subtitle}</p> : null}</div>{children}</section>;
}

function Filters({ filters, setFilters, responsibles }: { filters: Record<string, string>; setFilters: React.Dispatch<React.SetStateAction<{ search: string; status: string; responsible: string; priority: string; type: string; date: string }>>; responsibles: string[] }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700"><Filter size={16} /> Filtros simples</div>
      <div className="grid min-w-0 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <label className="relative min-w-0 md:col-span-3 xl:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={16} />
          <input className="h-11 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm" placeholder="Buscar" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} />
        </label>
        <FilterSelect value={filters.status} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} options={[["todos", "Estado"], ["pendiente", "Pendiente"], ["activo", "En curso"], ["bloqueado", "Bloqueado"], ["validacion", "Validacion"], ["finalizado", "Finalizado"]]} />
        <FilterSelect value={filters.type} onChange={(value) => setFilters((prev) => ({ ...prev, type: value }))} options={[["todos", "Tipo"], ["tarea", "Tarea"], ["compromiso", "Compromiso"], ["entregable", "Entregable"], ["bloqueo", "Bloqueo"], ["riesgo", "Riesgo"]]} />
        <FilterSelect value={filters.priority} onChange={(value) => setFilters((prev) => ({ ...prev, priority: value }))} options={[["todos", "Prioridad"], ["baja", "Baja"], ["media", "Media"], ["alta", "Alta"], ["critica", "Critica"]]} />
        <FilterSelect value={filters.responsible} onChange={(value) => setFilters((prev) => ({ ...prev, responsible: value }))} options={[["todos", "Responsable"], ...responsibles.map((name) => [name, name] as [string, string])]} />
        <FilterSelect value={filters.date} onChange={(value) => setFilters((prev) => ({ ...prev, date: value }))} options={[["todos", "Fecha"], ["vencidos", "Vencidos"], ["proximos", "Proximos"], ["sin_responsable", "Sin responsable"]]} />
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <select className="h-11 min-w-0 rounded-md border border-line bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>;
}

function TypeBadge({ type }: { type: WorkType }) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold capitalize ${typeTone[type]}`}>{type}</span>;
}

function StatusBadge({ status }: { status: ApexStatus }) {
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusTone[status] || statusTone.pendiente}`}>{shortStatusLabel[status] || status}</span>;
}

function AttentionRow({ item, onFollow, onDetail }: { item: WorkItem; onFollow: () => void; onDetail: () => void }) {
  return <div className="rounded-md border border-line bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><TypeBadge type={item.type} /><StatusBadge status={item.status} /></div><p className="mt-2 text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-neutral-500">{item.responsible || "Sin responsable"} - {fullDate(item.targetDate)}</p></div><button className="h-9 shrink-0 rounded-md border border-line px-2 text-xs font-semibold hover:bg-paper" onClick={onDetail} type="button">Ver</button></div><button className="mt-3 h-10 w-full rounded-md bg-apex text-sm font-semibold text-white" onClick={onFollow} type="button">{item.action}</button></div>;
}

function WorkTableRow({ item, onFollow, onDetail, onDone }: { item: WorkItem; onFollow: () => void; onDetail: () => void; onDone: () => void }) {
  return (
    <tr className="align-top">
      <td className="border-b border-line py-3"><TypeBadge type={item.type} /></td>
      <td className="border-b border-line py-3 pr-4"><button className="text-left font-semibold hover:text-apex" onClick={onDetail} type="button">{item.name}</button><p className="mt-1 line-clamp-1 text-xs text-neutral-500">{item.description || "Sin descripcion adicional."}</p></td>
      <td className="border-b border-line py-3 pr-4 text-neutral-700">{item.responsible || "Sin responsable"}</td>
      <td className="border-b border-line py-3 pr-4">{shortDate(item.targetDate)}</td>
      <td className="border-b border-line py-3 pr-4 capitalize">{item.priority}</td>
      <td className="border-b border-line py-3 pr-4"><StatusBadge status={item.status} /></td>
      <td className="border-b border-line py-3"><div className="flex flex-wrap gap-2"><button className="h-9 rounded-md border border-line px-2 text-xs font-semibold hover:bg-paper" onClick={onFollow} type="button">Seguimiento</button><button className="h-9 rounded-md border border-line px-2 text-xs font-semibold hover:bg-paper" onClick={onDetail} type="button">Detalle</button>{item.status !== "finalizado" ? <button className="h-9 rounded-md bg-emerald-600 px-2 text-xs font-semibold text-white" onClick={onDone} type="button">Finalizar</button> : null}</div></td>
    </tr>
  );
}

function WorkMobileCard({ item, onFollow, onDetail, onDone }: { item: WorkItem; onFollow: () => void; onDetail: () => void; onDone: () => void }) {
  return <div className="rounded-md border border-line bg-white p-3"><div className="flex flex-wrap gap-2"><TypeBadge type={item.type} /><StatusBadge status={item.status} /></div><p className="mt-2 text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-neutral-500">{item.responsible || "Sin responsable"} - {fullDate(item.targetDate)} - prioridad {item.priority}</p>{item.description ? <p className="mt-2 text-sm text-neutral-600">{item.description}</p> : null}<div className="mt-3 grid grid-cols-2 gap-2"><button className="h-10 rounded-md border border-line text-sm font-semibold" onClick={onDetail} type="button">Ver detalle</button><button className="h-10 rounded-md bg-apex text-sm font-semibold text-white" onClick={onFollow} type="button">Seguimiento</button>{item.status !== "finalizado" ? <button className="col-span-2 h-10 rounded-md bg-emerald-600 text-sm font-semibold text-white" onClick={onDone} type="button">Marcar como finalizado</button> : null}</div></div>;
}

function ResourceCard({ item }: { item: ResourceItem }) {
  const external = item.metadata?.source === "participante_externo" || item.person_id == null;
  const summary = item.assignment_summary || { commitments: 0, deliverables: 0, risks: 0, open_items: 0 };
  return <div className="rounded-md border border-line p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{item.person_name}</p>{external ? <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">Externo/temporal</span> : <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Interno</span>}</div><p className="mt-1 text-xs text-neutral-500">{item.role} - {item.availability}</p></div><span className={`rounded-md px-2 py-1 text-sm font-semibold ${item.load_level >= 85 ? "bg-red-100 text-red-700" : "bg-paper text-neutral-700"}`}>{item.load_level}%</span></div>{item.responsibilities ? <p className="mt-2 text-sm text-neutral-600">{item.responsibilities}</p> : null}<div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><MiniCount label="Abiertos" value={summary.open_items} /><MiniCount label="Comp." value={summary.commitments} /><MiniCount label="Entr." value={summary.deliverables} /><MiniCount label="Riesgos" value={summary.risks} /></div></div>;
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-paper p-2"><p className="font-semibold">{value}</p><p className="text-neutral-500">{label}</p></div>;
}

function LogRow({ item }: { item: LogItem }) {
  return <div className="rounded-md border border-line bg-white p-3"><p className="text-sm font-semibold">{item.summary}</p><p className="mt-1 text-xs text-neutral-500">{new Date(item.created_at).toLocaleString("es-CO")} - {item.action}</p></div>;
}

function SmartMessage({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return <div className="flex gap-3 rounded-md bg-paper p-3 text-sm"><Icon className="mt-0.5 shrink-0 text-apex" size={16} /><p className="leading-5 text-neutral-700">{text}</p></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md bg-paper p-4 text-center text-sm text-neutral-600">{text}</div>;
}

function DetailDrawer({ item, logs, onClose, onFollow, onDone }: { item: WorkItem; logs: LogItem[]; onClose: () => void; onFollow: () => void; onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-neutral-950/35">
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div><div className="flex flex-wrap gap-2"><TypeBadge type={item.type} /><StatusBadge status={item.status} /></div><h2 className="mt-3 text-xl font-semibold">{item.name}</h2><p className="mt-1 text-sm text-neutral-600">{item.description || "Sin descripcion adicional."}</p></div>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line" onClick={onClose} type="button" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoBox label="Responsable" value={item.responsible || "Sin responsable"} />
            <InfoBox label="Fecha objetivo" value={fullDate(item.targetDate)} />
            <InfoBox label="Prioridad" value={item.priority} />
            <InfoBox label="Ultima actualizacion" value={item.lastUpdate ? fullDate(item.lastUpdate) : "Sin registro"} />
          </div>
          <div className="mt-4 rounded-md border border-line p-3">
            <h3 className="text-sm font-semibold">Proximo paso sugerido</h3>
            <p className="mt-1 text-sm text-neutral-600">{item.action}</p>
          </div>
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Historial de seguimiento</h3>
            <div className="space-y-2">{logs.length ? logs.map((log) => <LogRow key={log.id} item={log} />) : <EmptyState text="Este elemento aun no tiene seguimiento registrado." />}</div>
          </div>
        </div>
        <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-2">
          <button className="h-11 rounded-md border border-line font-semibold" onClick={onFollow} type="button">Nuevo seguimiento</button>
          {item.status !== "finalizado" ? <button className="h-11 rounded-md bg-emerald-600 font-semibold text-white" onClick={onDone} type="button">Marcar finalizado</button> : null}
        </div>
      </aside>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-paper p-3"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-sm font-semibold capitalize">{value}</p></div>;
}

function QuickModal({ form, selectedItem, draft, saving, setDraft, onClose, onSave }: { form: Exclude<QuickForm, null>; selectedItem: WorkItem | null; draft: typeof emptyDraft; saving: boolean; setDraft: React.Dispatch<React.SetStateAction<typeof emptyDraft>>; onClose: () => void; onSave: () => void }) {
  const title = form === "proyecto" ? "Nuevo proyecto" : form === "compromiso" ? "Nuevo compromiso" : form === "tarea" ? "Nueva tarea" : form === "entregable" ? "Nuevo entregable" : form === "recurso" ? "Nuevo responsable o tercero" : form === "seguimiento" ? "Nuevo seguimiento" : "Nuevo bloqueo o riesgo";
  const requiresTitle = form === "recurso" ? (draft.responsible_name || draft.title).trim() && draft.role.trim() : form === "seguimiento" ? (draft.description || draft.title).trim() : draft.title.trim();
  const disabled = saving || !requiresTitle || (form === "proyecto" && !draft.description.trim());
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/45 p-0 sm:p-4">
      <section className="min-h-dvh bg-white p-4 sm:mx-auto sm:min-h-0 sm:max-w-2xl sm:rounded-md">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-line pb-3">
          <div>
            <p className="text-sm font-semibold text-apex">Accion rapida</p>
            <h2 className="text-xl font-semibold">{title}</h2>
            {selectedItem && form === "seguimiento" ? <p className="mt-1 text-sm text-neutral-600">{selectedItem.name}</p> : null}
          </div>
          <button className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line" onClick={onClose} type="button" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {form === "recurso" ? (
            <>
              <input className="h-12 w-full rounded-md border border-line px-3 text-base" placeholder="Nombre de la persona, tercero o aliado" value={draft.responsible_name || draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, responsible_name: event.target.value, title: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="h-12 rounded-md border border-line bg-white px-3 text-base" value={draft.participant_type} onChange={(event) => setDraft((prev) => ({ ...prev, participant_type: event.target.value }))}>
                  <option value="interno">Interno</option>
                  <option value="externo">Externo</option>
                  <option value="cliente">Cliente</option>
                  <option value="proveedor">Proveedor</option>
                  <option value="aliado">Aliado</option>
                </select>
                <input className="h-12 rounded-md border border-line px-3 text-base" placeholder="Rol en el proyecto" value={draft.role} onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="h-12 rounded-md border border-line px-3 text-base" placeholder="Empresa / tercero" value={draft.organization} onChange={(event) => setDraft((prev) => ({ ...prev, organization: event.target.value }))} />
                <input className="h-12 rounded-md border border-line px-3 text-base" placeholder="Carga %" type="number" min="0" max="100" value={draft.load_level} onChange={(event) => setDraft((prev) => ({ ...prev, load_level: event.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="h-12 rounded-md border border-line px-3 text-base" placeholder="Correo o contacto opcional" value={draft.contact_email} onChange={(event) => setDraft((prev) => ({ ...prev, contact_email: event.target.value }))} />
                <input className="h-12 rounded-md border border-line px-3 text-base" placeholder="Telefono opcional" value={draft.phone} onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))} />
              </div>
            </>
          ) : form === "seguimiento" ? (
            <>
              <textarea className="min-h-32 w-full rounded-md border border-line px-3 py-3 text-base" placeholder="Escribe una actualizacion corta: que paso, que falta o que decision se tomo." value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-3">
                <select className="h-12 rounded-md border border-line bg-white px-3 text-base" value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="pendiente">Pendiente</option>
                  <option value="activo">En curso</option>
                  <option value="bloqueado">Bloqueado</option>
                  <option value="validacion">Validacion</option>
                  <option value="finalizado">Finalizado</option>
                </select>
                <input className="h-12 rounded-md border border-line px-3 text-base" placeholder="Avance %" type="number" min="0" max="100" value={draft.progress} onChange={(event) => setDraft((prev) => ({ ...prev, progress: event.target.value }))} />
                <input className="h-12 rounded-md border border-line px-3 text-base" type="date" value={draft.next_date} onChange={(event) => setDraft((prev) => ({ ...prev, next_date: event.target.value }))} />
              </div>
              <input className="h-12 w-full rounded-md border border-line px-3 text-base" placeholder="Proxima accion" value={draft.next_action} onChange={(event) => setDraft((prev) => ({ ...prev, next_action: event.target.value }))} />
            </>
          ) : (
            <>
              <input className="h-12 w-full rounded-md border border-line px-3 text-base" placeholder={form === "riesgo" ? "Accion recomendada" : "Titulo / nombre"} value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />
              <input className="h-12 w-full rounded-md border border-line px-3 text-base" placeholder="Responsable o participante" value={draft.responsible_name} onChange={(event) => setDraft((prev) => ({ ...prev, responsible_name: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-3">
                <input className="h-12 rounded-md border border-line px-3 text-base" type="date" value={draft.target_date} onChange={(event) => setDraft((prev) => ({ ...prev, target_date: event.target.value }))} />
                <select className="h-12 rounded-md border border-line bg-white px-3 text-base" value={draft.priority} onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}>
                  <option value="baja">Prioridad baja</option>
                  <option value="media">Prioridad media</option>
                  <option value="alta">Prioridad alta</option>
                  <option value="critica">Prioridad critica</option>
                </select>
                <select className="h-12 rounded-md border border-line bg-white px-3 text-base" value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="pendiente">Pendiente</option>
                  <option value="activo">En curso</option>
                  <option value="bloqueado">Bloqueado</option>
                  <option value="validacion">Validacion</option>
                  <option value="finalizado">Finalizado</option>
                </select>
              </div>
              {form === "riesgo" ? (
                <select className="h-12 w-full rounded-md border border-line bg-white px-3 text-base" value={draft.kind} onChange={(event) => setDraft((prev) => ({ ...prev, kind: event.target.value }))}>
                  <option value="riesgo">Riesgo</option>
                  <option value="bloqueo">Bloqueo</option>
                </select>
              ) : null}
            </>
          )}
          {form !== "seguimiento" ? <textarea className="min-h-28 w-full rounded-md border border-line px-3 py-3 text-base" placeholder={form === "proyecto" ? "Objetivo operacional" : form === "recurso" ? "Responsabilidad dentro del proyecto" : "Descripcion corta"} value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} /> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="h-12 rounded-md border border-line bg-white text-base font-semibold" onClick={onClose} type="button">Cancelar</button>
            <button className="h-12 rounded-md bg-apex text-base font-semibold text-white disabled:opacity-60" disabled={Boolean(disabled)} onClick={onSave} type="button">{saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
