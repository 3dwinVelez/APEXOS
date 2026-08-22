"use client";

import { ArrowLeft, ArrowRight, Check, CheckCircle2, Home, MapPin, PackageSearch, Plus, Send, ShieldCheck, Trash2, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type FormState = {
  customer_name: string;
  customer_document: string;
  customer_phone: string;
  customer_phone_secondary: string;
  customer_email: string;
  invoice_number: string;
  service_type: string;
  reference_id: string;
  customer_address: string;
  customer_neighborhood: string;
  service_store: string;
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
type PublicServiceStore = { code: string; label: string; active?: boolean };
type RequestItem = { reference_id: string; service_type: string; observation: string };

const initialForm: FormState = {
  customer_name: "",
  customer_document: "",
  customer_phone: "",
  customer_phone_secondary: "",
  customer_email: "",
  invoice_number: "",
  service_type: "montaje",
  reference_id: "",
  customer_address: "",
  customer_neighborhood: "",
  service_store: "",
  notes: ""
};

const steps = [
  { title: "Quien eres", shortTitle: "Tus datos", helper: "Dinos a quien podemos llamar.", icon: UserRound },
  { title: "Donde vamos", shortTitle: "Direccion", helper: "Escribe donde se hara el servicio.", icon: MapPin },
  { title: "Que instalamos", shortTitle: "Producto", helper: "Elige el servicio y la referencia.", icon: PackageSearch },
  { title: "Revisar y enviar", shortTitle: "Final", helper: "Mira todo antes de enviarlo.", icon: ShieldCheck }
];

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

function buildAddress(form: FormState) {
  return [form.customer_address, form.customer_neighborhood ? `Barrio ${form.customer_neighborhood}` : ""].filter(Boolean).join(" - ").trim();
}

function requiredForStep(step: number): Array<keyof FormState> {
  if (step === 0) return ["customer_name", "customer_document", "customer_phone", "customer_phone_secondary"];
  if (step === 1) return ["customer_address", "customer_neighborhood", "service_store"];
  if (step === 2) return [];
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
  const [serviceStores, setServiceStores] = useState<PublicServiceStore[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [requestItems, setRequestItems] = useState<RequestItem[]>([{ reference_id: "", service_type: "montaje", observation: "" }]);
  const addressPreview = useMemo(() => buildAddress(form), [form]);
  const progress = Math.round(((step + 1) / steps.length) * 100);

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
        const nextStores = Array.isArray(body.service_stores) ? body.service_stores.filter((item: PublicServiceStore) => item.active !== false) : [];
        setReferences(nextReferences);
        setServiceTypes(nextTypes);
        setServiceStores(nextStores);
        setForm((current) => ({
          ...current,
          service_type: nextTypes.length && !nextTypes.some((item: PublicServiceType) => item.code === current.service_type) ? nextTypes[0].code : current.service_type,
          service_store: nextStores.length && !nextStores.some((item: PublicServiceStore) => item.code === current.service_store) ? nextStores[0].code : current.service_store
        }));
        setRequestItems((current) => current.map((item) => ({
          ...item,
          service_type: nextTypes.length && !nextTypes.some((type: PublicServiceType) => type.code === item.service_type) ? nextTypes[0].code : item.service_type
        })));
      })
      .catch(() => {
        if (active) {
          setReferences([]);
          setServiceTypes([]);
          setServiceStores([]);
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
    if (currentStep === 0 && !/^\d{7,15}$/.test(form.customer_phone)) {
      setMessage("El telefono principal debe tener entre 7 y 15 numeros.");
      return false;
    }
    if (currentStep === 0 && !/^\d{7,15}$/.test(form.customer_phone_secondary)) {
      setMessage("El telefono alterno debe tener entre 7 y 15 numeros.");
      return false;
    }
    if (currentStep === 0 && form.customer_phone === form.customer_phone_secondary) {
      setMessage("Los dos telefonos de contacto deben ser diferentes.");
      return false;
    }
    if (currentStep === 2 && requestItems.some((item) => !item.reference_id || !item.service_type)) {
      setMessage("Completa la referencia y el tipo de servicio de cada producto.");
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
          customer_phone_secondary: form.customer_phone_secondary,
          customer_email: form.customer_email,
          company_name: companyName,
          invoice_number: form.invoice_number,
          service_type: form.service_type,
          reference_id: form.reference_id,
          product_reference: references.find((item) => item.id === requestItems[0]?.reference_id)?.code || "",
          product_description: references.find((item) => item.id === requestItems[0]?.reference_id)?.name || "",
          customer_address: addressPreview,
          customer_neighborhood: form.customer_neighborhood,
          service_store: form.service_store,
          notes: form.notes,
          items: requestItems.map((item) => ({ ...item, quantity: 1 }))
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
      <main className="apex-service-request min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(54,211,186,0.28),transparent_34%),linear-gradient(135deg,#f7f5ee,#ffffff)] px-4 py-6 text-neutral-900">
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
              <button className="mx-auto inline-flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-[#08796c] px-6 text-base font-bold text-white shadow-lg shadow-teal-900/20 hover:bg-[#075e54]" onClick={() => { setCreated(null); setForm(initialForm); setRequestItems([{ reference_id: "", service_type: "montaje", observation: "" }]); setStep(0); }} type="button">
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
    <main className="apex-service-request min-h-screen bg-[#f4f6f5] px-3 py-3 text-neutral-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-4xl">
        <header className="mb-3 overflow-hidden rounded-lg bg-[#083c35] text-white shadow-sm">
          <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-[1fr_220px] md:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase text-teal-100">
                <Home size={14} /> Solicitud de servicio
              </div>
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Solicita tu servicio</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-white/75">Completa un paso a la vez. Los campos con * son obligatorios.</p>
            </div>
            <div className="rounded-md border border-white/15 bg-white/10 p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-teal-50">
                <span>Paso {step + 1} de {steps.length}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </header>

        <nav aria-label="Progreso de la solicitud" className="mb-3 rounded-lg border border-line bg-white p-2 shadow-sm">
            <div className="grid grid-cols-4 gap-1 sm:gap-2">
              {steps.map((item, index) => {
                const Icon = item.icon;
                const active = index === step;
                const done = index < step;
                return (
                  <button aria-current={active ? "step" : undefined} className={`flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-center transition sm:flex-row sm:px-3 sm:text-left ${active ? "bg-[#dff1ed] text-[#075e54]" : done ? "bg-emerald-50 text-emerald-800" : "text-neutral-500"}`} disabled={index > step} key={item.title} onClick={() => setStep(index)} type="button">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${active ? "bg-[#08796c] text-white" : done ? "bg-emerald-600 text-white" : "bg-paper"}`}>
                      {done ? <Check size={17} /> : <Icon size={17} />}
                    </span>
                    <span className="min-w-0">
                      <span className="hidden text-xs font-medium sm:block">Paso {index + 1}</span>
                      <span className="block text-xs font-bold sm:text-sm">{item.shortTitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
        </nav>

          <section className="rounded-lg border border-line bg-white p-4 shadow-sm sm:p-6">
            {message ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

            {step === 0 ? (
              <div className="space-y-5">
                <div className="border-b border-line pb-4">
                  <p className="text-xs font-bold uppercase text-[#075e54]">Paso 1 · Tus datos</p>
                  <h2 className="mt-1 text-xl font-bold sm:text-2xl">¿Quién solicita el servicio?</h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">Necesitamos tu nombre y dos telefonos de contacto para llamarte y confirmar la visita.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tu nombre completo *" hint="Como aparece en tu cedula o factura."><input className="apex-public-input" placeholder="Ej. Maria Gomez" value={form.customer_name} onChange={(event) => setField("customer_name", event.target.value)} /></Field>
                  <Field label="Tu cedula *" hint="Solo numeros, sin puntos."><input className="apex-public-input" inputMode="numeric" placeholder="Ej. 1020304050" value={form.customer_document} onChange={(event) => setField("customer_document", onlyNumbers(event.target.value))} /></Field>
                  <Field label="Telefono principal o WhatsApp *" hint="A este numero te llamaremos primero."><input className="apex-public-input" inputMode="tel" placeholder="Ej. 3001234567" value={form.customer_phone} onChange={(event) => setField("customer_phone", onlyNumbers(event.target.value))} /></Field>
                  <Field label="Telefono alterno *" hint="Debe ser diferente al telefono principal."><input className="apex-public-input" inputMode="tel" placeholder="Ej. 3107654321" value={form.customer_phone_secondary} onChange={(event) => setField("customer_phone_secondary", onlyNumbers(event.target.value))} /></Field>
                  <Field label="Correo electronico" hint="Opcional, por si quieres recibir informacion."><input className="apex-public-input" placeholder="Ej. correo@ejemplo.com" type="email" value={form.customer_email} onChange={(event) => setField("customer_email", event.target.value)} /></Field>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-5">
                <div className="border-b border-line pb-4">
                  <p className="text-xs font-bold uppercase text-[#075e54]">Paso 2 · Dirección</p>
                  <h2 className="mt-1 text-xl font-bold sm:text-2xl">¿Dónde realizaremos el servicio?</h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">Escribe la direccion como si se la explicaras a un mensajero.</p>
                </div>
                <div className="grid gap-3">
                  <Field label="Direccion completa *" hint="Incluye calle/carrera, numero, apartamento, torre o punto de referencia.">
                    <textarea className="apex-public-input min-h-32 py-3" placeholder="Ej. Carrera 43 C Sur # 22 - 901, torre 5, cerca al D1" value={form.customer_address} onChange={(event) => setField("customer_address", event.target.value)} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Barrio *" hint="El barrio ayuda a programar la ruta."><input className="apex-public-input" placeholder="Ej. La Magnolia" value={form.customer_neighborhood} onChange={(event) => setField("customer_neighborhood", event.target.value)} /></Field>
                    <Field label="Almacen donde compraste *" hint="Si no recuerdas, elige el mas cercano."><select className="apex-public-input" disabled={loadingReferences} value={form.service_store} onChange={(event) => setField("service_store", event.target.value)}>
                      <option value="">{loadingReferences ? "Cargando almacenes..." : "Selecciona un almacen"}</option>
                      {(serviceStores.length ? serviceStores : [{ code: "hogar_y_moda_1", label: "Hogar y Moda 1" }, { code: "hogar_y_moda_2", label: "Hogar y Moda 2" }]).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                    </select></Field>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#4f9489] bg-[#dff1ed] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#075e54]">Asi quedara registrada</p>
                  <p className="mt-2 font-semibold">{addressPreview || "Completa los datos de direccion."}</p>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <div className="border-b border-line pb-4">
                  <p className="text-xs font-bold uppercase text-[#075e54]">Paso 3 · Servicios</p>
                  <h2 className="mt-1 text-xl font-bold sm:text-2xl">¿Qué productos debemos atender?</h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">Registra cada producto por separado. Puedes pedir montaje, desmontaje o ambos.</p>
                </div>
                <Field label="Numero de factura o pedido" hint="Opcional, pero ayuda mucho."><input className="apex-public-input" placeholder="Ej. FAC-12345" value={form.invoice_number} onChange={(event) => setField("invoice_number", event.target.value)} /></Field>
                <div className="space-y-3">
                  {requestItems.map((requestItem, index) => (
                    <div className="rounded-lg border border-line bg-paper p-4" key={index}>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div><p className="font-bold">Producto {index + 1}</p><p className="text-xs text-neutral-500">Cada producto corresponde a un servicio independiente.</p></div>
                        {requestItems.length > 1 ? <button aria-label={`Eliminar producto ${index + 1}`} className="flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-white text-red-700" title="Eliminar producto" onClick={() => setRequestItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><Trash2 size={17} /></button> : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Referencia del producto *" hint="Busca el codigo o nombre que aparece en tu factura."><select className="apex-public-input" disabled={loadingReferences} value={requestItem.reference_id} onChange={(event) => setRequestItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, reference_id: event.target.value } : item))}><option value="">Selecciona una referencia</option>{references.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
                        <Field label="Servicio *"><select className="apex-public-input" value={requestItem.service_type} onChange={(event) => setRequestItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, service_type: event.target.value } : item))}>{(serviceTypes.length ? serviceTypes : [{ code: "montaje", label: "Montaje" }, { code: "desmontaje", label: "Desmontaje" }, { code: "ambos", label: "Montaje y desmontaje" }]).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></Field>
                        <Field label="Detalle de este producto" hint="Opcional. Ejemplo: cama de 1,40 m."><input className="apex-public-input" placeholder="Escribe un detalle util" value={requestItem.observation} onChange={(event) => setRequestItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, observation: event.target.value } : item))} /></Field>
                      </div>
                    </div>
                  ))}
                  <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-[#4f9489] bg-[#edf7f4] px-4 text-sm font-bold text-[#075e54] disabled:opacity-40 sm:w-auto" disabled={requestItems.length >= 20 || !references.length} onClick={() => setRequestItems((current) => [...current, { reference_id: "", service_type: serviceTypes[0]?.code || "montaje", observation: "" }])} type="button"><Plus size={17} /> Añadir otro producto</button>
                </div>
                <Field label="Algo que debamos saber" hint="Opcional: horario, indicaciones o detalles del producto."><textarea className="apex-public-input min-h-28 py-3" placeholder="Ej. Solo hay porteria hasta las 5 pm." value={form.notes} onChange={(event) => setField("notes", event.target.value)} /></Field>
                {!loadingReferences && !references.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">No encontramos referencias activas para esta empresa. Activa el maestro de referencias antes de recibir solicitudes externas.</div> : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-5">
                <div className="border-b border-line pb-4">
                  <p className="text-xs font-bold uppercase text-emerald-700">Paso 4 · Confirmacion</p>
                  <h2 className="mt-1 text-xl font-bold sm:text-2xl">Revisa antes de enviar</h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">Si algo no esta bien, toca volver. Si todo esta correcto, envia la solicitud.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Summary label="Cliente" value={`${form.customer_name} - CC ${form.customer_document}`} />
                  <Summary label="Contactos" value={`${form.customer_phone} / ${form.customer_phone_secondary}${form.customer_email ? ` / ${form.customer_email}` : ""}`} />
                  <Summary label="Direccion" value={addressPreview} />
                  <Summary label="Almacen" value={(serviceStores.find((item) => item.code === form.service_store)?.label || form.service_store || "Sin seleccionar")} />
                  <Summary label="Solicitudes" value={requestItems.map((item, index) => { const reference = references.find((candidate) => candidate.id === item.reference_id); return `${index + 1}. ${reference?.code || "Sin referencia"} - ${item.service_type}`; }).join(" | ")} />
                  <Summary label="Factura / pedido" value={form.invoice_number || "Sin registrar por ahora"} />
                </div>
              </div>
            ) : null}

            <div className="sticky bottom-0 -mx-4 mt-8 flex flex-col-reverse gap-2 border-t border-line bg-white/95 px-4 pb-1 pt-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:px-0">
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-white px-5 text-sm font-bold text-neutral-700 disabled:opacity-40" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(current - 1, 0))} type="button">
                <ArrowLeft size={17} /> Volver
              </button>
              {step < steps.length - 1 ? (
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#08796c] px-6 text-sm font-bold text-white hover:bg-[#075e54]" onClick={nextStep} type="button">
                  Continuar a {steps[step + 1].shortTitle} <ArrowRight size={17} />
                </button>
              ) : (
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#08796c] px-6 text-sm font-bold text-white hover:bg-[#075e54] disabled:opacity-60" disabled={saving} onClick={submit} type="button">
                  <Send size={17} /> {saving ? "Enviando..." : "Enviar solicitud"}
                </button>
              )}
            </div>
          </section>
      </div>
    </main>
  );
}

function PublicServiceRequestFallback() {
  return (
    <main className="apex-service-request min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(54,211,186,0.20),transparent_32%),linear-gradient(135deg,#f7f5ee,#ffffff)] px-4 py-5 text-neutral-900 sm:py-8">
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-neutral-700">
      <span>{label}</span>
      {hint ? <span className="text-xs font-medium leading-5 text-neutral-500">{hint}</span> : null}
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
