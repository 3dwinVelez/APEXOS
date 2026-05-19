"use client";

import { api } from "@/lib/api";
import { listPlatformCompanies } from "@/lib/supabaseQa";
import { Building2, Check, Plus, RefreshCw, Save, Shield, SlidersHorizontal, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CatalogItem = { key: string; label: string; actions: string[] };
type Role = { id: number; name: string; description: string; active: boolean; is_system: boolean; permissions: Record<string, Record<string, boolean>> };
type AdminUser = { id: number; name: string; email: string; role_id: number | null; role_name: string; active: boolean; code: string; document: string; company: string; position: string; department: string; salary_base: number; labor_status: string };

const actionLabels: Record<string, string> = {
  access: "Entrar",
  view: "Ver",
  create: "Crear",
  edit: "Editar",
  export: "Exportar",
  approve: "Aprobar"
};

const emptyUser = {
  name: "",
  email: "",
  password: "",
  role_id: "",
  code: "",
  document: "",
  company: "APEX",
  position: "empleado",
  department: "Operacion",
  salary_base: "0",
  labor_status: "activo"
};

function emptyPermissions(catalog: CatalogItem[]) {
  return Object.fromEntries(catalog.map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, false]))
  ]));
}

export default function AdministracionPage() {
  const [section, setSection] = useState<"roles" | "usuarios">("roles");
  const [platformAdminEnabled, setPlatformAdminEnabled] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "", description: "", active: true, permissions: {} as Record<string, Record<string, boolean>> });
  const [userForm, setUserForm] = useState(emptyUser);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) || null, [roles, selectedRoleId]);

  function isSupabaseSession() {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem("auth_provider") === "supabase") return true;
    const token = localStorage.getItem("token");
    if (!token?.includes(".")) return false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return String(payload.iss || "").includes("supabase") || String(payload.ref || "") === "jbirkghkekuifgfsgquq";
    } catch {
      return false;
    }
  }

  async function load() {
    if (isSupabaseSession()) {
      setMessage("Sesion Supabase QA activa. Roles y usuarios legacy quedan disponibles solo para usuarios del backend local.");
      setCatalog([]);
      setRoles([]);
      setUsers([]);
      return;
    }
    const [catalogData, rolesData, usersData] = await Promise.all([
      api<CatalogItem[]>("/api/v1/admin/permissions/catalog"),
      api<Role[]>("/api/v1/admin/roles"),
      api<AdminUser[]>("/api/v1/admin/users")
    ]);
    setCatalog(catalogData);
    setRoles(rolesData);
    setUsers(usersData);
    const initialRole = rolesData.find((role) => role.name !== "APEX_ADMIN") || rolesData[0];
    if (!selectedRoleId && initialRole) {
      setSelectedRoleId(initialRole.id);
      setRoleForm({
        name: initialRole.name,
        description: initialRole.description || "",
        active: initialRole.active,
        permissions: initialRole.permissions || emptyPermissions(catalogData)
      });
    }
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
    listPlatformCompanies(1)
      .then((rows) => setPlatformAdminEnabled(rows.length > 0))
      .catch(() => setPlatformAdminEnabled(false));
  }, []);

  function selectRole(role: Role) {
    setSelectedRoleId(role.id);
    setRoleForm({ name: role.name, description: role.description || "", active: role.active, permissions: role.permissions || emptyPermissions(catalog) });
  }

  function newRole() {
    setSelectedRoleId(null);
    setRoleForm({ name: "", description: "", active: true, permissions: emptyPermissions(catalog) });
  }

  function togglePermission(moduleKey: string, action: string) {
    setRoleForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [moduleKey]: {
          ...(current.permissions[moduleKey] || {}),
          [action]: !current.permissions[moduleKey]?.[action]
        }
      }
    }));
  }

  async function saveRole() {
    const payload = { ...roleForm, permissions: roleForm.permissions };
    if (selectedRoleId) await api(`/api/v1/admin/roles/${selectedRoleId}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/v1/admin/roles", { method: "POST", body: JSON.stringify(payload) });
    setMessage("Rol guardado.");
    await load();
  }

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
    setUserForm({
      name: user.name,
      email: user.email,
      password: "",
      role_id: user.role_id ? String(user.role_id) : "",
      code: user.code || "",
      document: user.document || "",
      company: user.company || "APEX",
      position: user.position || "empleado",
      department: user.department || "Operacion",
      salary_base: String(user.salary_base || 0),
      labor_status: user.labor_status || "activo"
    });
  }

  function newUser() {
    setSelectedUserId(null);
    setUserForm(emptyUser);
  }

  async function saveUser() {
    const payload = { ...userForm, role_id: userForm.role_id ? Number(userForm.role_id) : undefined, salary_base: Number(userForm.salary_base || 0) };
    if (selectedUserId) await api(`/api/v1/admin/users/${selectedUserId}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/v1/admin/users", { method: "POST", body: JSON.stringify(payload) });
    setMessage("Usuario guardado.");
    await load();
    newUser();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">Configuracion</p>
          <h1 className="text-3xl font-semibold">Usuarios y roles</h1>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-paper" onClick={() => load().catch((error) => setMessage(error.message))} type="button">
          <RefreshCw size={16} />
          Actualizar
        </button>
      </header>

      {message ? <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-neutral-700">{message}</p> : null}

      {platformAdminEnabled ? (
        <section className="rounded-md border border-apex/30 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-apex text-white">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="font-semibold">Administracion de empresas</h2>
                <p className="mt-1 text-sm text-neutral-600">Gestiona empresas, suscripciones y modulos habilitados desde Admin APEXOS.</p>
              </div>
            </div>
            <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white hover:bg-[#0f5a52]" href="/dashboard/administracion/suscripciones">
              <SlidersHorizontal size={16} />
              Abrir empresas
            </Link>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-2 rounded-md border border-line bg-white p-1">
        <button className={`h-12 rounded-md text-sm font-semibold ${section === "roles" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setSection("roles")} type="button">
          <Shield className="mr-1 inline" size={16} /> Roles y permisos
        </button>
        <button className={`h-12 rounded-md text-sm font-semibold ${section === "usuarios" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setSection("usuarios")} type="button">
          <Users className="mr-1 inline" size={16} /> Usuarios
        </button>
      </section>

      {section === "roles" ? <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="rounded-md border border-line bg-white p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-apex" />
              <h2 className="text-base font-semibold">Roles</h2>
            </div>
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={newRole} title="Nuevo rol" type="button">
              <Plus size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {roles.map((role) => (
              <button className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedRoleId === role.id ? "border-apex bg-paper" : "border-line hover:bg-paper"}`} key={role.id} onClick={() => selectRole(role)} type="button">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{role.name}</span>
                  <span className="text-xs text-neutral-500">{role.active ? "Activo" : "Inactivo"}</span>
                </span>
                <span className="mt-1 block text-xs text-neutral-500">{role.description || "Sin descripcion"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{selectedRole ? selectedRole.name : "Nuevo rol"}</h2>
              <p className="text-sm text-neutral-500">Matriz alineada con permisos legacy APEX.</p>
            </div>
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={saveRole} type="button">
              <Save size={16} />
              Guardar
            </button>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <input className="h-10 rounded-md border border-line px-3 text-sm" disabled={Boolean(selectedRole?.is_system)} placeholder="Nombre del rol" value={roleForm.name} onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))} />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Descripcion" value={roleForm.description} onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className="max-h-[58vh] overflow-auto rounded-md border border-line">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-line text-left text-xs text-neutral-500">
                  <th className="py-2">Modulo</th>
                  {["access", "view", "create", "edit", "export", "approve"].map((action) => <th className="py-2 text-center" key={action}>{actionLabels[action]}</th>)}
                </tr>
              </thead>
              <tbody>
                {catalog.map((item) => (
                  <tr className="border-b border-line/70" key={item.key}>
                    <td className="py-2 font-medium">{item.label}</td>
                    {["access", "view", "create", "edit", "export", "approve"].map((action) => (
                      <td className="py-2 text-center" key={action}>
                        {item.actions.includes(action) ? (
                          <button className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${roleForm.permissions[item.key]?.[action] ? "border-apex bg-apex text-white" : "border-line hover:bg-paper"}`} disabled={selectedRole?.name === "APEX_ADMIN"} onClick={() => togglePermission(item.key, action)} title={`${item.label}: ${actionLabels[action]}`} type="button">
                            {roleForm.permissions[item.key]?.[action] ? <Check size={14} /> : null}
                          </button>
                        ) : <span className="text-neutral-300">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section> : null}

      {section === "usuarios" ? <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="rounded-md border border-line bg-white p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-apex" />
              <h2 className="text-base font-semibold">Usuarios</h2>
            </div>
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={newUser} title="Nuevo usuario" type="button">
              <Plus size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {users.map((user) => (
              <button className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedUserId === user.id ? "border-apex bg-paper" : "border-line hover:bg-paper"}`} key={user.id} onClick={() => selectUser(user)} type="button">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{user.name}</span>
                  <span className="text-xs text-neutral-500">{user.active ? "Activo" : "Inactivo"}</span>
                </span>
                <span className="mt-1 block text-xs text-neutral-500">{user.email} · {user.role_name || "Sin rol"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserCog size={18} className="text-apex" />
              <h2 className="text-base font-semibold">{selectedUserId ? "Editar usuario" : "Crear usuario"}</h2>
            </div>
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={saveUser} type="button">
              <Save size={16} />
              Guardar
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Nombre" value={userForm.name} onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))} />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Email / usuario" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder={selectedUserId ? "Nueva clave opcional" : "Clave"} type="password" value={userForm.password} onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))} />
            <select className="h-10 rounded-md border border-line px-3 text-sm" value={userForm.role_id} onChange={(e) => setUserForm((p) => ({ ...p, role_id: e.target.value }))}>
              <option value="">Sin rol</option>
              {roles.filter((role) => role.active).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Codigo interno" value={userForm.code} onChange={(e) => setUserForm((p) => ({ ...p, code: e.target.value }))} />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Documento" value={userForm.document} onChange={(e) => setUserForm((p) => ({ ...p, document: e.target.value }))} />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Empresa" value={userForm.company} onChange={(e) => setUserForm((p) => ({ ...p, company: e.target.value }))} />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Cargo" value={userForm.position} onChange={(e) => setUserForm((p) => ({ ...p, position: e.target.value }))} />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Area" value={userForm.department} onChange={(e) => setUserForm((p) => ({ ...p, department: e.target.value }))} />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Salario base" type="number" value={userForm.salary_base} onChange={(e) => setUserForm((p) => ({ ...p, salary_base: e.target.value }))} />
            <select className="h-10 rounded-md border border-line px-3 text-sm" value={userForm.labor_status} onChange={(e) => setUserForm((p) => ({ ...p, labor_status: e.target.value }))}>
              <option value="activo">Activo laboral</option>
              <option value="inactivo">Inactivo laboral</option>
              <option value="suspendido">Suspendido</option>
            </select>
          </div>
        </div>
      </section> : null}
    </div>
  );
}
