"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MODULES_BY_ID } from "@/lib/modules";
import type { OnboardingSuggestion } from "@/lib/types";

type Step = {
  id: string;
  question: string;
  type: "text" | "select" | "multiselect";
  key: string;
  options?: string[];
};

const FLOW: Step[] = [
  {
    id: "business",
    question: "Hola, soy APEX. Cuéntame: ¿qué hace tu empresa?",
    type: "text",
    key: "business_description"
  },
  {
    id: "size",
    question: "¿Cuántas personas trabajan contigo?",
    type: "select",
    key: "team_size",
    options: ["Solo yo", "2-5 personas", "6-20 personas", "21-100 personas", "Más de 100"]
  },
  {
    id: "places",
    question: "¿Tienes una sede o varias?",
    type: "select",
    key: "places_count",
    options: ["Solo una", "2-3 sedes", "4 o más sedes", "Trabajo remoto / sin sede fija"]
  },
  {
    id: "sales",
    question: "¿Cómo vendes principalmente?",
    type: "multiselect",
    key: "sales_channels",
    options: ["Local físico", "Internet / redes", "Empresas", "Teléfono / WhatsApp", "Domicilios"]
  },
  {
    id: "pains",
    question: "¿Qué situaciones te quitan el sueño hoy?",
    type: "multiselect",
    key: "pain_points",
    options: ["No sé cuánto gano", "Se acaban productos", "Precios inciertos", "Me cuesta cobrar", "Nómina compleja", "Costos poco claros", "Excel o cuadernos"]
  },
  {
    id: "goals",
    question: "¿Qué quieres lograr en los próximos 12 meses?",
    type: "multiselect",
    key: "goals",
    options: ["Abrir sede", "Contratar personal", "Nuevos productos", "Vender por internet", "Mejorar márgenes", "Financiamiento", "Más tiempo libre"]
  }
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<OnboardingSuggestion | null>(null);
  const current = FLOW[step];

  async function next(value: string | string[]) {
    const nextAnswers = { ...answers, [current.key]: value };
    setAnswers(nextAnswers);
    setText("");
    setSelected([]);
    if (step + 1 < FLOW.length) {
      setStep(step + 1);
      return;
    }
    const data = await api<OnboardingSuggestion>("/api/v1/onboarding/suggest", {
      method: "POST",
      body: JSON.stringify(nextAnswers)
    });
    setSuggestion(data);
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-6">
      <section className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_320px]">
        <div className="rounded-md border border-line bg-white p-5">
          <p className="mb-2 text-sm font-medium text-apex">Consola APEX</p>
          <h1 className="mb-6 text-3xl font-semibold">Configuración inicial</h1>
          {suggestion ? (
            <div className="space-y-4">
              <p className="text-lg">{suggestion.message}</p>
              <div className="rounded-md bg-paper p-4">
                <p className="text-sm text-neutral-500">Industria detectada</p>
                <p className="font-semibold">{suggestion.industry_label || suggestion.industry}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {suggestion.modules.map((module) => (
                  <div className="rounded-md border border-line bg-white p-3 text-sm" key={module}>
                    <p className="font-semibold">{MODULES_BY_ID[module]?.name || module}</p>
                    <p className="mt-1 text-xs text-neutral-500">{module}</p>
                    <p className="mt-2 text-neutral-600">{MODULES_BY_ID[module]?.summary || "Módulo sugerido para tu operación."}</p>
                  </div>
                ))}
              </div>
              <Button onClick={() => router.push("/dashboard")}>
                <Check size={16} />
                Entrar al tablero
              </Button>
            </div>
          ) : (
            <div>
              <p className="mb-5 text-xl">{current.question}</p>
              {current.type === "text" ? (
                <textarea className="mb-4 min-h-32 w-full rounded-md border border-line p-3" value={text} onChange={(event) => setText(event.target.value)} />
              ) : (
                <div className="mb-4 grid gap-2">
                  {current.options?.map((option) => {
                    const active = selected.includes(option);
                    return (
                      <button
                        className={`rounded-md border px-3 py-2 text-left text-sm ${active ? "border-apex bg-[#146C6312]" : "border-line bg-white"}`}
                        key={option}
                        type="button"
                        onClick={() => {
                          if (current.type === "select") {
                            setSelected([option]);
                          } else {
                            setSelected(active ? selected.filter((item) => item !== option) : [...selected, option]);
                          }
                        }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
              <Button disabled={current.type === "text" ? !text : !selected.length} onClick={() => next(current.type === "text" ? text : selected)}>
                <ArrowRight size={16} />
                Continuar
              </Button>
            </div>
          )}
        </div>
        <aside className="rounded-md border border-line bg-white p-4">
          <p className="text-sm font-medium text-neutral-500">Progreso</p>
          <div className="mt-4 space-y-2">
            {FLOW.map((item, index) => (
              <div className="flex items-center gap-2 text-sm" key={item.id}>
                <span className={`h-2.5 w-2.5 rounded-full ${index <= step || suggestion ? "bg-apex" : "bg-line"}`} />
                {index + 1}. {item.id === "business" ? "Negocio" : item.id === "size" ? "Equipo" : item.id === "places" ? "Sedes" : item.id === "sales" ? "Ventas" : item.id === "pains" ? "Dolores" : "Metas"}
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
