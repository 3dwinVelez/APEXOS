"use client";

import { createPlatformCompanyWithAdmin, deletePlatformCompany, listPlatformCompanies, listPlatformCompanyModuleAccess, PlatformCompany, PlatformCompanyModuleAccess, setPlatformCompanyModuleAccess, updatePlatformCompany } from "@/lib/supabaseQa";
import { ArrowLeft, Building2, Check, LockKeyhole, Pencil, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, X } from "lucide-react";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";

type CompanyForm = {
  name: string;
  legal_name: string;
  tax_id: string;
  email: string;
  phone: string;
  company_type: string;
  parent_company_id: string;
  business_line: string;
  country: string;
  city: string;
  address: string;
  status: string;
  admin_full_name: string;
  admin_email: string;
  admin_password: string;
};

const emptyCompanyForm: CompanyForm = {
  name: "",
  legal_name: "",
  tax_id: "",
  email: "",
  phone: "",
  company_type: "company",
  parent_company_id: "",
  business_line: "",
  country: "Colombia",
  city: "",
  address: "",
  status: "active",
  admin_full_name: "",
  admin_email: "",
  admin_password: ""
};

export default function SuscripcionesPage() {
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [modules, setModules] = useState<PlatformCompanyModuleAccess[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<PlatformCompany | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<PlatformCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  const selectedCompany = useMemo(() => companies.find((company) => company.company_id === selectedCompanyId) || null, [companies, selectedCompanyId]);
  const enabledCount = modules.filter((item) => item.enabled).length;

  async function loadCompanies() {
    setLoading(true);
    setMessage("");
    try {
      const rows = await listPlatformCompanies();
      setCompanies(rows);
      const nextCompanyId = selectedCompanyId || rows[0]?.company_id || "";
      setSelectedCompanyId(nextCompanyId);
      if (nextCompanyId) {
        setModules(await listPlatformCompanyModuleAccess(nextCompanyId));
      } else {
        setModules([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible consultar empresas.");
      setCompanies([]);
      setModules([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    setMessage("");
    setModules(await listPlatformCompanyModuleAccess(companyId));
  }

  async function toggleModule(item: PlatformCompanyModuleAccess) {
    setSaving(item.module_code);
    setMessage("");
    try {
      await setPlatformCompanyModuleAccess({ company_id: item.company_id, module_id: item.module_id, enabled: !item.enabled });
      setModules(await listPlatformCompanyModuleAccess(item.company_id));
      setCompanies(await listPlatformCompanies());
      setMessage(`${item.module_name} ${item.enabled ? "bloqueado" : "habilitado"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cambiar el modulo.");
    } finally {
      setSaving("");
    }
  }

  async function createCompany() {
    const name = companyForm.name.trim();
    if (!name) return;
    setSaving("company");
    setMessage("");
    try {
      const created = await createPlatformCompanyWithAdmin({
        name,
        legal_name: companyForm.legal_name.trim() || null,
        tax_id: companyForm.tax_id.trim() || null,
        email: companyForm.email.trim() || null,
        phone: companyForm.phone.trim() || null,
        company_type: companyForm.company_type,
        parent_company_id: companyForm.parent_company_id || null,
        business_line: companyForm.business_line.trim() || null,
        country: companyForm.country.trim() || null,
        city: companyForm.city.trim() || null,
        address: companyForm.address.trim() || null,
        status: companyForm.status,
        admin_full_name: companyForm.admin_full_name.trim(),
        admin_email: companyForm.admin_email.trim(),
        admin_password: companyForm.admin_password
      });
      const rows = await listPlatformCompanies();
      setCompanies(rows);
      const nextId = created.company?.company_id || rows.find((company) => company.company_name === name)?.company_id || "";
      setCompanyForm(emptyCompanyForm);
      setShowCompanyModal(false);
      if (nextId) await selectCompany(nextId);
      setMessage("Empresa creada con ambiente propio. Activa solo los modulos contratados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible crear la empresa.");
    } finally {
      setSaving("");
    }
  }

  function openEditCompany(company: PlatformCompany) {
    setCompanyForm({
      name: company.company_name || "",
      legal_name: company.legal_name || "",
      tax_id: company.tax_id || "",
      email: company.email || "",
      phone: company.phone || "",
      company_type: company.company_type || "company",
      parent_company_id: company.parent_company_id || "",
      business_line: company.business_line || "",
      country: company.country || "Colombia",
      city: company.city || "",
      address: company.address || "",
      status: company.status || "active",
      admin_full_name: "",
      admin_email: "",
      admin_password: ""
    });
    setEditingCompany(company);
  }

  async function saveEditedCompany() {
    if (!editingCompany || !companyForm.name.trim()) return;
    setSaving("edit-company");
    setMessage("");
    try {
      await updatePlatformCompany(editingCompany.company_id, {
        name: companyForm.name.trim(),
        legal_name: companyForm.legal_name.trim() || null,
        tax_id: companyForm.tax_id.trim() || null,
        email: companyForm.email.trim() || null,
        phone: companyForm.phone.trim() || null,
        company_type: companyForm.company_type,
        parent_company_id: companyForm.parent_company_id || null,
        business_line: companyForm.business_line.trim() || null,
        country: companyForm.country.trim() || null,
        city: companyForm.city.trim() || null,
        address: companyForm.address.trim() || null,
        status: companyForm.status
      });
      setEditingCompany(null);
      setCompanyForm(emptyCompanyForm);
      await loadCompanies();
      setMessage("Empresa actualizada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible editar la empresa.");
    } finally {
      setSaving("");
    }
  }

  async function confirmDeleteCompany() {
    if (!deletingCompany) return;
    setSaving("delete-company");
    setMessage("");
    try {
      await deletePlatformCompany(deletingCompany.company_id);
      setDeletingCompany(null);
      if (selectedCompanyId === deletingCompany.company_id) {
        setSelectedCompanyId("");
        setModules([]);
      }
      await loadCompanies();
      setMessage("Empresa eliminada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible eliminar la empresa.");
    } finally {
      setSaving("");
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white hover:bg-paper" href="/dashboard/administracion" aria-label="Volver">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-sm font-medium text-apex">Admin Plataforma APEX</p>
            <h1 className="text-3xl font-semibold">Empresas y suscripciones</h1>
          </div>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={loadCompanies} type="button">
          <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
          Actualizar
        </button>
      </header>

      {message ? <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-neutral-700">{message}</p> : null}

      <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="text-apex" size={18} />
              <h2 className="font-semibold">Empresas registradas</h2>
            </div>
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-apex text-white" onClick={() => setShowCompanyModal(true)} title="Crear empresa" type="button">
              <Plus size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {companies.map((company) => (
              <div className={`rounded-md border p-3 transition ${company.company_id === selectedCompanyId ? "border-apex bg-paper" : "border-line hover:bg-paper"}`} key={company.company_id}>
                <button className="w-full text-left" onClick={() => selectCompany(company.company_id)} type="button">
                  <span className="block font-semibold">{company.company_name}</span>
                  <span className="mt-1 block text-xs text-neutral-500">{company.legal_name || "Sin razon social"}</span>
                  <span className="mt-1 block text-xs text-neutral-500">{company.tax_id || "Sin NIT"} · {company.parent_company_name || company.company_type || "Empresa"} · {company.enabled_modules} activos</span>
                </button>
                <div className="mt-3 flex justify-end gap-2">
                  <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white hover:bg-paper" onClick={() => openEditCompany(company)} title="Editar empresa" type="button">
                    <Pencil size={14} />
                  </button>
                  <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 hover:bg-rose-50" onClick={() => setDeletingCompany(company)} title="Eliminar empresa" type="button">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {!companies.length && !loading ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-500">Sin empresas visibles para este usuario.</p> : null}
          </div>
        </aside>

        <main className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-apex">{selectedCompany?.plan_name || "Suscripcion manual"}</p>
              <h2 className="text-xl font-semibold">{selectedCompany?.company_name || "Selecciona una empresa"}</h2>
              <p className="mt-1 text-sm text-neutral-500">{selectedCompany?.legal_name || "Empresa sin razon social"} · {selectedCompany?.tax_id || "Sin NIT"} · {selectedCompany?.parent_company_name || selectedCompany?.company_type || "Sin grupo"} · {selectedCompany?.status || "Sin estado"}</p>
            </div>
            <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold">
              <ShieldCheck className="mr-1 inline text-apex" size={15} />
              {enabledCount} modulos habilitados
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {modules.map((item) => (
              <div className={`rounded-md border p-4 transition ${item.enabled ? "border-emerald-300 bg-emerald-50/70" : "border-amber-300 bg-amber-50/70"}`} key={item.module_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span>{item.module_name}</span>
                      <span className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold ${item.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {item.enabled ? <Check size={13} /> : <LockKeyhole size={13} />}
                        {item.enabled ? "Habilitado" : "Bloqueado"}
                      </span>
                    </p>
                    <p className={`mt-1 text-sm ${item.enabled ? "text-emerald-900/75" : "text-amber-900/75"}`}>{item.description || item.module_code}</p>
                  </div>
                  <button
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${item.enabled ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800" : "border-amber-500 bg-white text-amber-700 hover:bg-amber-100"}`}
                    disabled={saving === item.module_code}
                    onClick={() => toggleModule(item)}
                    title={item.enabled ? "Bloquear modulo" : "Habilitar modulo"}
                    type="button"
                  >
                    {item.enabled ? <Check size={17} /> : <LockKeyhole size={16} />}
                  </button>
                </div>
                <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${item.enabled ? "text-emerald-800" : "text-amber-800"}`}>
                  <span className={`rounded-md px-2 py-1 ${item.enabled ? "bg-emerald-100" : "bg-amber-100"}`}>{item.module_code}</span>
                  <span className={`rounded-md px-2 py-1 ${item.enabled ? "bg-emerald-100" : "bg-amber-100"}`}>{item.source}</span>
                  {item.route ? <span className={`rounded-md px-2 py-1 ${item.enabled ? "bg-emerald-100" : "bg-amber-100"}`}>{item.route}</span> : null}
                </div>
              </div>
            ))}
          </div>

          {!modules.length ? (
            <div className="rounded-md border border-dashed border-line p-8 text-center">
              <SlidersHorizontal className="mx-auto text-apex" size={28} />
              <p className="mt-3 font-semibold">Sin permisos de administracion plataforma</p>
              <p className="mt-1 text-sm text-neutral-500">Este submodulo solo devuelve datos para administradores globales activos.</p>
            </div>
          ) : null}
        </main>
      </section>

      {showCompanyModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-2xl rounded-md border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-medium text-apex">Nueva sociedad</p>
                <h2 className="text-xl font-semibold">Crear empresa</h2>
              </div>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => setShowCompanyModal(false)} title="Cerrar" type="button">
                <X size={17} />
              </button>
            </div>

            <form
              className="grid gap-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                createCompany();
              }}
            >
              <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  Nombre comercial
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.name} onChange={(event) => setCompanyForm((current) => ({ ...current, name: event.target.value }))} required />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Razon social
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.legal_name} onChange={(event) => setCompanyForm((current) => ({ ...current, legal_name: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Tipo de entidad
                  <select className="h-11 rounded-md border border-line bg-white px-3 text-sm font-normal" value={companyForm.company_type} onChange={(event) => setCompanyForm((current) => ({ ...current, company_type: event.target.value, parent_company_id: event.target.value === "business_group" ? "" : current.parent_company_id }))}>
                    <option value="business_group">Grupo empresarial</option>
                    <option value="company">Sociedad / empresa</option>
                    <option value="business_unit">Unidad de negocio</option>
                    <option value="branch">Sucursal</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Empresa padre
                  <select className="h-11 rounded-md border border-line bg-white px-3 text-sm font-normal disabled:bg-paper" disabled={companyForm.company_type === "business_group"} value={companyForm.parent_company_id} onChange={(event) => setCompanyForm((current) => ({ ...current, parent_company_id: event.target.value }))}>
                    <option value="">Sin empresa padre</option>
                    {companies.map((company) => (
                      <option key={company.company_id} value={company.company_id}>{company.company_name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  NIT / Tax ID
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.tax_id} onChange={(event) => setCompanyForm((current) => ({ ...current, tax_id: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Estado
                  <select className="h-11 rounded-md border border-line bg-white px-3 text-sm font-normal" value={companyForm.status} onChange={(event) => setCompanyForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="active">Activa</option>
                    <option value="inactive">Inactiva</option>
                    <option value="suspended">Suspendida</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Correo corporativo
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" type="email" value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Telefono
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Linea de negocio
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.business_line} onChange={(event) => setCompanyForm((current) => ({ ...current, business_line: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Pais
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.country} onChange={(event) => setCompanyForm((current) => ({ ...current, country: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Ciudad
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Direccion
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Admin inicial
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.admin_full_name} onChange={(event) => setCompanyForm((current) => ({ ...current, admin_full_name: event.target.value }))} required />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Correo de acceso
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" type="email" value={companyForm.admin_email} onChange={(event) => setCompanyForm((current) => ({ ...current, admin_email: event.target.value }))} required />
                </label>
                <label className="grid gap-1 text-sm font-medium md:col-span-2">
                  Clave temporal
                  <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" minLength={8} type="password" value={companyForm.admin_password} onChange={(event) => setCompanyForm((current) => ({ ...current, admin_password: event.target.value }))} required />
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                <button className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={() => setShowCompanyModal(false)} type="button">
                  Cancelar
                </button>
                <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving === "company" || !companyForm.name.trim() || !companyForm.admin_email.trim() || !companyForm.admin_full_name.trim() || companyForm.admin_password.length < 8} type="submit">
                  <Plus size={16} />
                  Crear empresa
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-2xl rounded-md border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-medium text-apex">Editar sociedad</p>
                <h2 className="text-xl font-semibold">{editingCompany.company_name}</h2>
              </div>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => setEditingCompany(null)} title="Cerrar" type="button">
                <X size={17} />
              </button>
            </div>

            <form
              className="grid gap-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                saveEditedCompany();
              }}
            >
              <CompanyFields companies={companies.filter((company) => company.company_id !== editingCompany.company_id)} companyForm={companyForm} setCompanyForm={setCompanyForm} includeAdmin={false} />
              <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                <button className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={() => setEditingCompany(null)} type="button">
                  Cancelar
                </button>
                <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving === "edit-company" || !companyForm.name.trim()} type="submit">
                  <Check size={16} />
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deletingCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-md rounded-md border border-line bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-700">
                <Trash2 size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Eliminar empresa</h2>
                <p className="mt-1 text-sm text-neutral-600">Esta accion elimina la empresa y sus relaciones dependientes configuradas con cascade. Para conservar historial operativo, usa estado inactiva o suspendida.</p>
                <p className="mt-3 rounded-md bg-paper p-3 text-sm font-semibold">{deletingCompany.company_name}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-paper" onClick={() => setDeletingCompany(null)} type="button">
                Cancelar
              </button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving === "delete-company"} onClick={confirmDeleteCompany} type="button">
                <Trash2 size={16} />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CompanyFields({ companies, companyForm, setCompanyForm, includeAdmin }: { companies: PlatformCompany[]; companyForm: CompanyForm; setCompanyForm: Dispatch<SetStateAction<CompanyForm>>; includeAdmin: boolean }) {
  return (
    <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">
        Nombre comercial
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.name} onChange={(event) => setCompanyForm((current) => ({ ...current, name: event.target.value }))} required />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Razon social
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.legal_name} onChange={(event) => setCompanyForm((current) => ({ ...current, legal_name: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Tipo de entidad
        <select className="h-11 rounded-md border border-line bg-white px-3 text-sm font-normal" value={companyForm.company_type} onChange={(event) => setCompanyForm((current) => ({ ...current, company_type: event.target.value, parent_company_id: event.target.value === "business_group" ? "" : current.parent_company_id }))}>
          <option value="business_group">Grupo empresarial</option>
          <option value="company">Sociedad / empresa</option>
          <option value="business_unit">Unidad de negocio</option>
          <option value="branch">Sucursal</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Empresa padre
        <select className="h-11 rounded-md border border-line bg-white px-3 text-sm font-normal disabled:bg-paper" disabled={companyForm.company_type === "business_group"} value={companyForm.parent_company_id} onChange={(event) => setCompanyForm((current) => ({ ...current, parent_company_id: event.target.value }))}>
          <option value="">Sin empresa padre</option>
          {companies.map((company) => (
            <option key={company.company_id} value={company.company_id}>{company.company_name}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        NIT / Tax ID
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.tax_id} onChange={(event) => setCompanyForm((current) => ({ ...current, tax_id: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Estado
        <select className="h-11 rounded-md border border-line bg-white px-3 text-sm font-normal" value={companyForm.status} onChange={(event) => setCompanyForm((current) => ({ ...current, status: event.target.value }))}>
          <option value="active">Activa</option>
          <option value="inactive">Inactiva</option>
          <option value="suspended">Suspendida</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Correo corporativo
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" type="email" value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Telefono
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Linea de negocio
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.business_line} onChange={(event) => setCompanyForm((current) => ({ ...current, business_line: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Pais
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.country} onChange={(event) => setCompanyForm((current) => ({ ...current, country: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Ciudad
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.city} onChange={(event) => setCompanyForm((current) => ({ ...current, city: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Direccion
        <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} />
      </label>
      {includeAdmin ? (
        <>
          <label className="grid gap-1 text-sm font-medium">
            Admin inicial
            <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" value={companyForm.admin_full_name} onChange={(event) => setCompanyForm((current) => ({ ...current, admin_full_name: event.target.value }))} required />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Correo de acceso
            <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" type="email" value={companyForm.admin_email} onChange={(event) => setCompanyForm((current) => ({ ...current, admin_email: event.target.value }))} required />
          </label>
          <label className="grid gap-1 text-sm font-medium md:col-span-2">
            Clave temporal
            <input className="h-11 rounded-md border border-line px-3 text-sm font-normal" minLength={8} type="password" value={companyForm.admin_password} onChange={(event) => setCompanyForm((current) => ({ ...current, admin_password: event.target.value }))} required />
          </label>
        </>
      ) : null}
    </div>
  );
}
