"use client";

import { createPlatformCompanyWithAdmin, deletePlatformCompany, listPlatformCompanies, listPlatformCompanyModuleAccess, listPlatformCompanySessions, PlatformCompany, PlatformCompanyModuleAccess, PlatformCompanySessions, setPlatformCompanyModuleAccess, updatePlatformCompany } from "@/lib/supabaseQa";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { ArrowLeft, Building2, Check, CircleUserRound, LockKeyhole, Pencil, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, UsersRound, X } from "lucide-react";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [platformAdmin, setPlatformAdmin] = useState<boolean | null>(null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [modules, setModules] = useState<PlatformCompanyModuleAccess[]>([]);
  const [sessions, setSessions] = useState<PlatformCompanySessions | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<PlatformCompany | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<PlatformCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [companyModalMessage, setCompanyModalMessage] = useState("");
  const selectedCompanyIdRef = useRef("");

  const selectedCompany = useMemo(() => companies.find((company) => company.company_id === selectedCompanyId) || null, [companies, selectedCompanyId]);
  const enabledCount = modules.filter((item) => item.enabled).length;

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const rows = await listPlatformCompanies();
      setCompanies(rows);
      const nextCompanyId = selectedCompanyIdRef.current || rows[0]?.company_id || "";
      selectedCompanyIdRef.current = nextCompanyId;
      setSelectedCompanyId(nextCompanyId);
      if (nextCompanyId) {
        const [moduleRows, sessionRows] = await Promise.all([
          listPlatformCompanyModuleAccess(nextCompanyId),
          listPlatformCompanySessions(nextCompanyId).catch(() => null)
        ]);
        setModules(moduleRows);
        setSessions(sessionRows);
      } else {
        setModules([]);
        setSessions(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible consultar empresas.");
      setCompanies([]);
      setModules([]);
      setSessions(null);
    } finally {
      setLoading(false);
    }
  }, []);

  async function selectCompany(companyId: string) {
    selectedCompanyIdRef.current = companyId;
    setSelectedCompanyId(companyId);
    setMessage("");
    const [moduleRows, sessionRows] = await Promise.all([
      listPlatformCompanyModuleAccess(companyId),
      listPlatformCompanySessions(companyId).catch((error) => {
        setMessage(error instanceof Error ? error.message : "No fue posible consultar usuarios conectados.");
        return null;
      })
    ]);
    setModules(moduleRows);
    setSessions(sessionRows);
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
    if (!name || saving === "company") return;
    setSaving("company");
    setMessage("");
    setCompanyModalMessage("");
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
      setCompanyModalMessage(error instanceof Error ? error.message : "No fue posible crear la empresa.");
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
        selectedCompanyIdRef.current = "";
        setSelectedCompanyId("");
        setModules([]);
        setSessions(null);
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
    loadModuleAccess(MODULES)
      .then((access) => setPlatformAdmin(access.isPlatformAdmin))
      .catch(() => setPlatformAdmin(false));
  }, []);

  useEffect(() => {
    if (platformAdmin) loadCompanies();
  }, [loadCompanies, platformAdmin]);

  async function refreshCompanySessions() {
    if (!selectedCompanyId) return;
    setSaving("sessions");
    setMessage("");
    try {
      setSessions(await listPlatformCompanySessions(selectedCompanyId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible consultar usuarios conectados.");
    } finally {
      setSaving("");
    }
  }

  if (platformAdmin === null) {
    return <div className="rounded-md border border-line bg-white p-8 text-sm text-neutral-600">Validando permisos de administracion de plataforma...</div>;
  }

  if (!platformAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-md border border-line bg-white p-6">
        <Link className="mb-4 inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href="/dashboard/administracion">
          <ArrowLeft size={16} /> Volver a Administracion
        </Link>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-paper text-apex"><LockKeyhole size={20} /></span>
          <div>
            <p className="text-sm font-semibold text-apex">Acceso restringido</p>
            <h1 className="mt-1 text-2xl font-semibold">Empresas y suscripciones es solo para superadmin</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Los administradores de empresa gestionan usuarios, roles y maestros propios desde Administracion APEX. La creacion y configuracion global de empresas queda reservada para administradores de plataforma.</p>
          </div>
        </div>
      </div>
    );
  }

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

      <div className="space-y-4">
        <section className="rounded-md border border-line bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="text-apex" size={18} />
              <h2 className="font-semibold">Empresas registradas</h2>
            </div>
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-apex text-white" onClick={() => {
              setCompanyModalMessage("");
              setShowCompanyModal(true);
            }} title="Crear empresa" type="button">
              <Plus size={16} />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1">
            {companies.map((company) => (
              <div className={`w-[300px] shrink-0 rounded-md border p-3 transition ${company.company_id === selectedCompanyId ? "border-apex bg-apex/5 shadow-sm" : "border-line hover:bg-paper"}`} key={company.company_id}>
                <button className="w-full text-left" onClick={() => selectCompany(company.company_id)} type="button">
                  <span className="block truncate font-semibold">{company.company_name}</span>
                  <span className="mt-1 block truncate text-xs text-neutral-500">{company.legal_name || "Sin razon social"}</span>
                  <span className="mt-1 block truncate text-xs text-neutral-500">{company.tax_id || "Sin NIT"} - {company.company_type || "Empresa"} - {company.enabled_modules} activos</span>
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
        </section>

        <main className="space-y-4">
          <section className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-apex">{selectedCompany?.plan_name || "Suscripcion manual"}</p>
              <h2 className="text-xl font-semibold">{selectedCompany?.company_name || "Selecciona una empresa"}</h2>
              <p className="mt-1 text-sm text-neutral-500">{selectedCompany?.legal_name || "Empresa sin razon social"} - {selectedCompany?.tax_id || "Sin NIT"} - {selectedCompany?.parent_company_name || selectedCompany?.company_type || "Sin grupo"} - {selectedCompany?.status || "Sin estado"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold">
                <UsersRound className="mr-1 inline text-apex" size={15} />
                {sessions?.totals.connected || 0}/{sessions?.totals.users || 0} conectados
              </div>
              <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold">
                <ShieldCheck className="mr-1 inline text-apex" size={15} />
                {enabledCount} modulos habilitados
              </div>
            </div>
          </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Usuarios conectados</h3>
                <p className="text-xs text-neutral-500">Ventana de actividad: ultimos {sessions?.window_minutes || 30} minutos.</p>
              </div>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-paper disabled:opacity-60" disabled={!selectedCompanyId || saving === "sessions"} onClick={refreshCompanySessions} type="button">
                <RefreshCw className={saving === "sessions" ? "animate-spin" : ""} size={14} />
                Actualizar usuarios
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-md border border-line bg-paper px-3 py-2">
                <p className="text-xs text-neutral-500">Conectados</p>
                <p className="text-xl font-semibold text-emerald-700">{sessions?.totals.connected || 0}</p>
              </div>
              <div className="rounded-md border border-line bg-paper px-3 py-2">
                <p className="text-xs text-neutral-500">Usuarios activos</p>
                <p className="text-xl font-semibold">{sessions?.totals.active || 0}</p>
              </div>
              <div className="rounded-md border border-line bg-paper px-3 py-2">
                <p className="text-xs text-neutral-500">Sin cuenta Auth</p>
                <p className={`text-xl font-semibold ${(sessions?.totals.without_auth || 0) ? "text-rose-700" : "text-neutral-900"}`}>{sessions?.totals.without_auth || 0}</p>
              </div>
            </div>
            <div className="mt-3 max-h-52 overflow-auto rounded-md border border-line bg-white">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-line text-left text-xs text-neutral-500">
                    <th className="px-3 py-2">Usuario</th>
                    <th className="px-3 py-2">Rol / cargo</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Ultimo ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {(sessions?.users || []).map((user) => (
                    <tr className="border-b border-line/70" key={user.employee_id}>
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${user.connected ? "bg-emerald-100 text-emerald-700" : "bg-paper text-neutral-500"}`}>
                            <CircleUserRound size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{user.name}</p>
                            <p className="truncate text-xs text-neutral-500">{user.email || "Sin correo"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{user.role || user.user_type || "Sin rol"}</p>
                        <p className="text-xs text-neutral-500">{[user.position, user.department].filter(Boolean).join(" - ") || "Sin cargo"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${user.connected ? "bg-emerald-50 text-emerald-700" : user.auth_status === "without_auth" ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-600"}`}>
                          {user.connected ? "Conectado" : user.auth_status === "without_auth" ? "Sin Auth" : user.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">
                        {user.last_seen_minutes === null ? "Sin ingreso" : `Hace ${user.last_seen_minutes} min`}
                      </td>
                    </tr>
                  ))}
                  {!sessions?.users?.length ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-sm text-neutral-500" colSpan={4}>Sin usuarios asociados a esta empresa.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Modulos de la empresa</h3>
                <p className="mt-1 text-xs text-neutral-500">Activa o bloquea los modulos contratados para la empresa seleccionada.</p>
              </div>
              <div className="inline-flex rounded-md border border-line bg-paper p-1 text-xs font-semibold">
                <span className="rounded-md bg-white px-3 py-1 text-emerald-700">{enabledCount} activos</span>
                <span className="px-3 py-1 text-neutral-600">{Math.max(0, modules.length - enabledCount)} bloqueados</span>
              </div>
            </div>

            {modules.length ? (
              <div className="overflow-auto rounded-md border border-line">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-paper">
                    <tr className="border-b border-line text-left text-xs font-semibold uppercase text-neutral-500">
                      <th className="px-3 py-2">Modulo</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Origen</th>
                      <th className="px-3 py-2">Ruta</th>
                      <th className="px-3 py-2 text-right">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {modules.map((item) => (
                      <tr className="bg-white transition hover:bg-paper" key={item.module_id}>
                        <td className="px-3 py-2">
                          <div className="max-w-xl">
                            <p className="font-semibold text-neutral-900">{item.module_name}</p>
                            <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{item.description || item.module_code}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold ${item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                            {item.enabled ? <Check size={13} /> : <LockKeyhole size={13} />}
                            {item.enabled ? "Habilitado" : "Bloqueado"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-md bg-paper px-2 py-1 text-xs font-medium text-neutral-600">{item.source}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs text-neutral-500">{item.route || "Sin ruta"}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            <button
                              className={`inline-flex h-9 min-w-28 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold transition disabled:opacity-50 ${item.enabled ? "border-line bg-white text-neutral-700 hover:bg-paper" : "border-apex bg-apex text-white hover:bg-apex/90"}`}
                              disabled={saving === item.module_code}
                              onClick={() => toggleModule(item)}
                              type="button"
                            >
                              {item.enabled ? <LockKeyhole size={14} /> : <Check size={14} />}
                              {saving === item.module_code ? "Guardando" : item.enabled ? "Bloquear" : "Habilitar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line p-8 text-center">
                <SlidersHorizontal className="mx-auto text-apex" size={28} />
                <p className="mt-3 font-semibold">Sin permisos de administracion plataforma</p>
                <p className="mt-1 text-sm text-neutral-500">Este submodulo solo devuelve datos para administradores globales activos.</p>
              </div>
            )}
          </section>
        </main>
      </div>

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
              {companyModalMessage ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{companyModalMessage}</p>
              ) : null}

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
                  {saving === "company" ? "Creando..." : "Crear empresa"}
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
