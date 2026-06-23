"use client";

import { ArrowRight, CheckCircle2, Home, MapPin, PackageSearch, Send, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type FormState = {
  customer_name: string;
  customer_document: string;
  customer_phone: string;
  customer_email: string;
  invoice_number: string;
  service_type: string;
  reference_id: string;
  customer_address: string;
  notes: string;
};

type PublicServiceReference = {
  id: string;
  code: string;
  name: string;
  category?: string;
  brand?: string;
  model?: string;
};
type PublicServiceType = { code: string; label: string; active?: boolean };

const initialForm: FormState = {
  customer_name: "",
  customer_document: "",
  customer_phone: "",
  customer_email: "",
  invoice_number: "",
  service_type: "montaje",
  reference_id: "",
  customer_address: "",
  notes: ""
};

const steps = [
  { title: "Tus datos", icon: UserRound },
  { title: "Direccion", icon: MapPin },
  { title: "Servicio", icon: PackageSearch },
  { title: "Confirmar", icon: ShieldCheck }
];

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

function buildAddress(form: FormState) {
  return form.customer_address.trim();
}

function requiredForStep(step: number): Array<keyof FormState> {
  if (step === 0) return ["customer_name", "customer_document", "customer_phone"];
  if (step === 1) return ["customer_address"];
  if (step === 2) return ["service_type", "reference_id"];
  return [];
}

export default function PublicServiceRequestPage() {
  return (
    <Suspense fallback={<PublicServiceRequestFallback />}>
      <PublicServiceRequestContent />
    </Suspense>
  );
}

function PublicServiceRequestContent() {
  const searchParams = useSearchParams();
  const companyName = searchParams.get("empresa") || "";
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ number: string } | null>(null);
  const [references, setReferences] = useState<PublicServiceReference[]>([]);
  const [serviceTypes, setServiceTypes] = useState<PublicServiceType[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const addressPreview = useMemo(() => buildAddress(form), [form]);
  const selectedReference = useMemo(() => references.find((item) => item.id === form.reference_id), [form.reference_id, references]);

  useEffect(() => {
    let active = true;
    const requestPath = companyName ? `/api/public/service-requests?empresa=${encodeURIComponent(companyName)}` : "/api/public/service-requests";
    setLoadingReferences(true);
    fetch(requestPath)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("No fue posible cargar las referencias.")))
      .then((body) => {
        if (!active) return;
        const nextReferences = Array.isArray(body.references) ? body.references : [];
        const nextTypes = Array.isArray(body.service_types) ? body.service_types.filter((item: PublicServiceType) => item.active !== false) : [];
        setReferences(nextReferences);
        setServiceTypes(nextTypes);
        if (nextTypes.length) {
          setForm((current) => nextTypes.some((item: PublicServiceType) => item.code === current.service_type) ? current : { ...current, service_type: nextTypes[0].code });
        }
      })
      .catch(() => {
        if (active) {
          setReferences([]);
          setServiceTypes([]);
        }
      })
      .finally(() => {
        if (active) setLoadingReferences(false);
      });
    return () => {
      active = false;
    };
  }, [companyName]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate(currentStep = step) {
    const missing = requiredForStep(currentStep).filter((key) => !String(form[key] || "").trim());
    if (missing.length) {
      setMessage("Completa los campos marcados como obligatorios antes de continuar.");
      return false;
    }
    if (currentStep === 0 && !/^\d{5,12}$/.test(form.customer_document)) {
      setMessage("La cedula debe tener entre 5 y 12 numeros.");
      return false;
    }
    setMessage("");
    return true;
  }

  function nextStep() {
    if (!validate()) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit() {
    if (saving || ![0, 1, 2].every((index) => validate(index))) return;
    setSaving(true);
    setMessage("");
    try {
      const requestPath = companyName ? `/api/public/service-requests?empresa=${encodeURIComponent(companyName)}` : "/api/public/service-requests";
      const response = await fetch(requestPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: form.customer_name,
          customer_document: form.customer_document,
          customer_phone: form.customer_phone,
          customer_email: form.customer_email,
          company_name: companyName,
          invoice_number: form.invoice_number,
          service_type: form.service_type,
          reference_id: form.reference_id,
          product_reference: selectedReference?.code || "",
          product_description: selectedReference ? `${selectedReference.code} - ${selectedReference.name}` : "",
          customer_address: addressPreview,
          notes: form.notes
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "No fue posible enviar la solicitud.");
      setCreated({ number: body.order?.number || "Solicitud recibida" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible enviar la solicitud.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(54,211,186,0.28),transparent_34%),linear-gradient(135deg,#f7f5ee,#ffffff)] px-4 py-6 text-neutral-900">
        <section className="mx-auto flex min-h-[calc(100vh-48px)] max-w-5xl items-center justify-center">
          <div className="w-full overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-2xl shadow-teal-950/15">
            <div className="bg-[linear-gradient(135deg,#05231f,#0d4a40)] px-5 py-10 text-center text-white sm:px-10 sm:py-14">
              <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-200/30 sm:h-36 sm:w-36">
                <CheckCircle2 size={72} />
              </div>
              <p className="text-sm font-bold uppercase tracking-[0.26em] text-emerald-100">Solicitud creada con exito</p>
              <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">Tu servicio ya fue creado</h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
                Numero de seguimiento: <strong className="text-white">{created.number}</strong>. Un asesor revisara la informacion, validara disponibilidad y confirmara la visita.
              </p>
            </div>
            <div className="grid gap-4 px-5 py-6 text-center sm:px-10 sm:py-8">
              <button className="mx-auto inline-flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-apex px-6 text-base font-bold text-white shadow-lg shadow-teal-900/20" onClick={() => { setCreated(null); setForm(initialForm); setStep(0); }} type="button">
                Realizar otra solicitud
              </button>
              <p className="text-sm text-neutral-500">Puedes cerrar esta ventana si no necesitas registrar otro servicio.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(54,211,186,0.20),transparent_32%),linear-gradient(135deg,#f7f5ee,#ffffff)] px-4 py-5 text-neutral-900 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 rounded-3xl bg-[linear-gradient(135deg,#061d19,#123d35)] p-5 text-white shadow-xl shadow-teal-950/15 sm:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-teal-100">
                <Home size={14} /> Solicitud de servicio
              </div>
              <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">Agenda tu instalacion de forma clara y rapida</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Te guiaremos paso a paso con datos simples para crear la solicitud sin usuario ni clave.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-teal-50">
              <p className="font-semibold">Tiempo estimado</p>
              <p className="mt-1 text-2xl font-bold">3 min</p>
              <p className="mt-1 text-white/65">Sin usuario ni clave.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-line bg-white p-4 shadow-sm lg:sticky lg:top-5 lg:self-start">
            <div className="space-y-2">
              {steps.map((item, index) => {
                const Icon = item.icon;
                const active = index === step;
                const done = index < step;
                return (
                  <button className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-apex bg-apex/10 text-apex" : done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-white text-neutral-500"}`} key={item.title} onClick={() => index <= step && setStep(index)} type="button">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-apex text-white" : done ? "bg-emerald-600 text-white" : "bg-paper"}`}>
                      <Icon size={18} />
                    </span>
                    <span>
                      <span className="block text-xs font-bold uppercase tracking-[0.14em]">Paso {index + 1}</span>
                      <span className="block font-semibold">{item.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-2xl bg-paper p-3 text-sm text-neutral-600">
              <p className="font-semibold text-neutral-900">Direccion previa</p>
              <p className="mt-1 leading-5">{addressPreview || "Aun no has ingresado la direccion."}</p>
            </div>
          </aside>

          <section className="rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-6">
            {message ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

            {step === 0 ? (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-apex">Datos de contacto</p>
                  <h2 className="mt-2 text-2xl font-bold">Primero identifiquemos quien solicita</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre completo *"><input className="apex-public-input" value={form.customer_name} onChange={(event) => setField("customer_name", event.target.value)} /></Field>
                  <Field label="Cedula *"><input className="apex-public-input" inputMode="numeric" value={form.customer_document} onChange={(event) => setField("customer_document", onlyNumbers(event.target.value))} /></Field>
                  <Field label="Telefono / WhatsApp *"><input className="apex-public-input" inputMode="tel" value={form.customer_phone} onChange={(event) => setField("customer_phone", event.target.value)} /></Field>
                  <Field label="Correo electronico"><input className="apex-public-input" type="email" value={form.customer_email} onChange={(event) => setField("customer_email", event.target.value)} /></Field>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-apex">Direccion</p>
                  <h2 className="mt-2 text-2xl font-bold">Indicanos donde se realizara el servicio</h2>
                  <p className="mt-2 text-sm text-neutral-600">Escribela como la das normalmente en Medellin: via, numero, interior o torre, barrio, municipio y una referencia para llegar.</p>
                </div>
                <div className="grid gap-3">
                  <Field label="Direccion completa *">
                    <textarea className="apex-public-input min-h-32 py-3" placeholder="Ej. Carrera 43 C Sur # 22 - 901, apartamento torre 5, cerca al D1, barrio La Magnolia, Envigado" value={form.customer_address} onChange={(event) => setField("customer_address", event.target.value)} />
                  </Field>
                </div>
                <div className="rounded-2xl border border-apex/20 bg-apex/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-apex">Asi quedara registrada</p>
                  <p className="mt-2 font-semibold">{addressPreview || "Completa los datos de direccion."}</p>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-apex">Datos del servicio</p>
                  <h2 className="mt-2 text-2xl font-bold">Cuentanos que producto necesitas instalar</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Factura o pedido (opcional)"><input className="apex-public-input" placeholder="Si lo tienes a la mano" value={form.invoice_number} onChange={(event) => setField("invoice_number", event.target.value)} /></Field>
                  <Field label="Tipo de servicio *"><select className="apex-public-input" disabled={loadingReferences} value={form.service_type} onChange={(event) => setField("service_type", event.target.value)}>
                    {(serviceTypes.length ? serviceTypes : [{ code: "montaje", label: "Montaje" }, { code: "desmontaje", label: "Desmontaje" }, { code: "ambos", label: "Montaje y desmontaje" }]).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                  </select></Field>
                  <Field label="Referencia del producto *">
                    <select className="apex-public-input" disabled={loadingReferences} value={form.reference_id} onChange={(event) => setField("reference_id", event.target.value)}>
                      <option value="">{loadingReferences ? "Cargando referencias..." : "Selecciona una referencia"}</option>
                      {references.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Observaciones"><textarea className="apex-public-input min-h-28 py-3" value={form.notes} onChange={(event) => setField("notes", event.target.value)} /></Field>
                </div>
                {!loadingReferences && !references.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">No encontramos referencias activas para esta empresa. Activa el maestro de referencias antes de recibir solicitudes externas.</div> : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-apex">Confirmacion</p>
                  <h2 className="mt-2 text-2xl font-bold">Revisa antes de enviar</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Summary label="Cliente" value={`${form.customer_name} - CC ${form.customer_document}`} />
                  <Summary label="Contacto" value={`${form.customer_phone}${form.customer_email ? ` / ${form.customer_email}` : ""}`} />
                  <Summary label="Direccion" value={addressPreview} />
                  <Summary label="Servicio" value={`${form.service_type} - ${selectedReference ? `${selectedReference.code} ${selectedReference.name}` : "Sin referencia"}`} />
                  <Summary label="Factura / pedido" value={form.invoice_number || "Sin registrar por ahora"} />
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <button className="h-12 rounded-xl border border-line bg-white px-5 text-sm font-bold text-neutral-700 disabled:opacity-40" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(current - 1, 0))} type="button">
                Volver
              </button>
              {step < steps.length - 1 ? (
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-apex px-6 text-sm font-bold text-white shadow-lg shadow-teal-900/20" onClick={nextStep} type="button">
                  Continuar <ArrowRight size={17} />
                </button>
              ) : (
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-apex px-6 text-sm font-bold text-white shadow-lg shadow-teal-900/20 disabled:opacity-60" disabled={saving} onClick={submit} type="button">
                  <Send size={17} /> {saving ? "Enviando..." : "Enviar solicitud"}
                </button>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function PublicServiceRequestFallback() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(54,211,186,0.20),transparent_32%),linear-gradient(135deg,#f7f5ee,#ffffff)] px-4 py-5 text-neutral-900 sm:py-8">
      <section className="mx-auto flex min-h-[calc(100vh-40px)] max-w-5xl items-center justify-center">
        <div className="w-full rounded-3xl bg-[linear-gradient(135deg,#061d19,#123d35)] p-8 text-center text-white shadow-xl shadow-teal-950/15">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-teal-100">
            <Home size={28} />
          </div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-100">Solicitud de servicio</p>
          <h1 className="mt-3 text-3xl font-bold">Preparando el formulario</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/70">Estamos cargando la informacion necesaria para crear tu servicio.</p>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-neutral-700">
      {label}
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">{label}</p>
      <p className="mt-2 font-semibold text-neutral-900">{value || "Pendiente"}</p>
    </div>
  );
}
