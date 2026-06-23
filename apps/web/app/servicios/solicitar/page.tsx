"use client";

import { ArrowRight, CheckCircle2, Home, MapPin, PackageSearch, Send, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type FormState = {
  customer_name: string;
  customer_document: string;
  customer_phone: string;
  customer_email: string;
  invoice_number: string;
  service_type: string;
  preferred_date: string;
  product_reference: string;
  product_description: string;
  road_type: string;
  road_main: string;
  road_letter: string;
  road_suffix: string;
  cross_number: string;
  door_number: string;
  address_extra: string;
  property_type: string;
  property_detail: string;
  neighborhood: string;
  city: string;
  department: string;
  notes: string;
};

const initialForm: FormState = {
  customer_name: "",
  customer_document: "",
  customer_phone: "",
  customer_email: "",
  invoice_number: "",
  service_type: "montaje",
  preferred_date: "",
  product_reference: "",
  product_description: "",
  road_type: "Calle",
  road_main: "",
  road_letter: "",
  road_suffix: "",
  cross_number: "",
  door_number: "",
  address_extra: "",
  property_type: "Apartamento",
  property_detail: "",
  neighborhood: "",
  city: "Medellin",
  department: "Antioquia",
  notes: ""
};

const steps = [
  { title: "Tus datos", icon: UserRound },
  { title: "Direccion", icon: MapPin },
  { title: "Servicio", icon: PackageSearch },
  { title: "Confirmar", icon: ShieldCheck }
];

const medellinNeighborhoods = [
  "Laureles",
  "Belen",
  "El Poblado",
  "Envigado",
  "Sabaneta",
  "Itagui",
  "Robledo",
  "Manrique",
  "Buenos Aires",
  "La America",
  "Castilla",
  "Aranjuez"
];

const valleyCities = ["Medellin", "Envigado", "Sabaneta", "Itagui", "Bello", "La Estrella", "Copacabana", "Girardota", "Barbosa", "Caldas"];

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

function buildAddress(form: FormState) {
  const first = [form.road_type, form.road_main, form.road_letter, form.road_suffix].filter(Boolean).join(" ");
  const placeNumber = form.cross_number && form.door_number ? `# ${form.cross_number} - ${form.door_number}` : "";
  const detail = [form.property_type, form.property_detail, form.address_extra].filter(Boolean).join(" ");
  const location = [form.neighborhood ? `Barrio ${form.neighborhood}` : "", form.city, form.department].filter(Boolean).join(", ");
  return [first, placeNumber, detail, location].filter(Boolean).join(", ");
}

function requiredForStep(step: number): Array<keyof FormState> {
  if (step === 0) return ["customer_name", "customer_document", "customer_phone"];
  if (step === 1) return ["road_type", "road_main", "cross_number", "door_number", "property_type", "property_detail", "neighborhood", "city"];
  if (step === 2) return ["service_type", "preferred_date", "product_description"];
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
  const addressPreview = useMemo(() => buildAddress(form), [form]);

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
          preferred_date: form.preferred_date,
          product_reference: form.product_reference,
          product_description: form.product_description,
          customer_address: addressPreview,
          notes: form.notes,
          address: {
            road_type: form.road_type,
            road_main: form.road_main,
            road_letter: form.road_letter,
            road_suffix: form.road_suffix,
            cross_number: form.cross_number,
            door_number: form.door_number,
            property_type: form.property_type,
            property_detail: form.property_detail,
            address_extra: form.address_extra,
            neighborhood: form.neighborhood,
            city: form.city,
            department: form.department,
            normalized: addressPreview
          }
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
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Te guiaremos paso a paso. La direccion se arma por partes para evitar errores y facilitar la visita tecnica.</p>
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
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-apex">Direccion guiada</p>
                  <h2 className="mt-2 text-2xl font-bold">Construyamos la direccion sin ambiguedad</h2>
                  <p className="mt-2 text-sm text-neutral-600">Usa la forma que normalmente damos en Medellin: via principal, cruce, numero de la casa o apartamento, barrio y una sena facil de ubicar.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Tipo de via *"><select className="apex-public-input" value={form.road_type} onChange={(event) => setField("road_type", event.target.value)}>{["Calle", "Carrera", "Avenida", "Diagonal", "Transversal", "Circular", "Autopista", "Kilometro", "Vereda"].map((item) => <option key={item}>{item}</option>)}</select></Field>
                  <Field label="Numero de la via *"><input className="apex-public-input" placeholder="ej. 43" value={form.road_main} onChange={(event) => setField("road_main", event.target.value)} /></Field>
                  <Field label="Letra"><input className="apex-public-input" placeholder="A, B, C" value={form.road_letter} onChange={(event) => setField("road_letter", event.target.value.toUpperCase())} /></Field>
                  <Field label="Complemento"><select className="apex-public-input" value={form.road_suffix} onChange={(event) => setField("road_suffix", event.target.value)}><option value="">Sin complemento</option><option>Sur</option><option>Norte</option><option>Este</option><option>Oeste</option><option>Bis</option></select></Field>
                  <Field label="Via o calle que cruza *"><input className="apex-public-input" placeholder="ej. 22" value={form.cross_number} onChange={(event) => setField("cross_number", event.target.value)} /></Field>
                  <Field label="Numero de casa o apto *"><input className="apex-public-input" placeholder="ej. 90, 906, 301" value={form.door_number} onChange={(event) => setField("door_number", event.target.value)} /></Field>
                  <Field label="Tipo de lugar *"><select className="apex-public-input" value={form.property_type} onChange={(event) => setField("property_type", event.target.value)}>{["Casa", "Apartamento", "Unidad residencial", "Torre", "Local", "Oficina", "Bodega"].map((item) => <option key={item}>{item}</option>)}</select></Field>
                  <Field label="Interior o indicacion *"><input className="apex-public-input" placeholder="apto 301, torre 2, porteria" value={form.property_detail} onChange={(event) => setField("property_detail", event.target.value)} /></Field>
                  <Field label="Barrio o sector *"><input className="apex-public-input" list="medellin-neighborhoods" placeholder="ej. Laureles, Belen, El Poblado" value={form.neighborhood} onChange={(event) => setField("neighborhood", event.target.value)} /></Field>
                  <Field label="Municipio *"><select className="apex-public-input" value={form.city} onChange={(event) => setField("city", event.target.value)}>{valleyCities.map((item) => <option key={item}>{item}</option>)}</select></Field>
                  <Field label="Departamento"><input className="apex-public-input" value={form.department} onChange={(event) => setField("department", event.target.value)} /></Field>
                  <Field label="Sena para llegar"><input className="apex-public-input" placeholder="cerca al parque, porteria, color de fachada" value={form.address_extra} onChange={(event) => setField("address_extra", event.target.value)} /></Field>
                </div>
                <datalist id="medellin-neighborhoods">
                  {medellinNeighborhoods.map((item) => <option key={item} value={item} />)}
                </datalist>
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
                  <Field label="Tipo de servicio *"><select className="apex-public-input" value={form.service_type} onChange={(event) => setField("service_type", event.target.value)}><option value="montaje">Montaje</option><option value="desmontaje">Desmontaje</option><option value="ambos">Montaje y desmontaje</option><option value="garantia">Garantia</option></select></Field>
                  <Field label="Fecha tentativa *"><input className="apex-public-input" type="date" value={form.preferred_date} onChange={(event) => setField("preferred_date", event.target.value)} /></Field>
                  <Field label="Codigo o referencia"><input className="apex-public-input" value={form.product_reference} onChange={(event) => setField("product_reference", event.target.value)} /></Field>
                  <Field label="Producto o descripcion *"><input className="apex-public-input" placeholder="ej. Cocina integral, closet, mueble..." value={form.product_description} onChange={(event) => setField("product_description", event.target.value)} /></Field>
                  <Field label="Observaciones"><textarea className="apex-public-input min-h-28 py-3" value={form.notes} onChange={(event) => setField("notes", event.target.value)} /></Field>
                </div>
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
                  <Summary label="Servicio" value={`${form.service_type} - ${form.product_description}`} />
                  <Summary label="Factura / pedido" value={form.invoice_number || "Sin registrar por ahora"} />
                  <Summary label="Fecha tentativa" value={form.preferred_date} />
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
