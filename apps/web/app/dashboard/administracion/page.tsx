"use client";

import { Button } from "@/components/ui/button";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { api } from "@/lib/api";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { getUserDocumentUrl, uploadUserDocument } from "@/lib/supabaseStorage";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  Check,
  CreditCard,
  Database,
  Edit3,
  Filter,
  FileText,
  FolderKanban,
  Link as LinkIcon,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Save,
  Search,
  Shield,
  SlidersHorizontal,
  Truck,
  UserCog,
  UserPlus,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SUPABASE_PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || "";

type CatalogItem = { key: string; label: string; group?: string; module?: string; submodule?: string; actions: string[] };
type Role = {
  id: number;
  name: string;
  description: string;
  active: boolean;
  is_system: boolean;
  hierarchy_level?: number;
  role_type?: string;
  scope?: string;
  scopes?: RoleScopes;
  restrictions?: RoleScopes;
  can_delegate?: boolean;
  sensitive?: boolean;
  impact_summary?: { modules: number; actions: number; raw_permissions: number };
  permissions: Record<string, Record<string, boolean>>;
};
type RoleScopes = { locations: string[]; areas: string[]; cost_centers: string[]; processes: string[] };
type MasterOption = { code: string; name: string };
type ServiceType = { code: string; label: string; active?: boolean };
type SatisfactionQuestion = { id: string; label: string; active?: boolean };
type UserMasterData = {
  document_types: MasterOption[];
  user_statuses: MasterOption[];
  user_types: MasterOption[];
  contract_types: MasterOption[];
  engagement_types: MasterOption[];
  session_statuses: MasterOption[];
  user_document_types: MasterOption[];
  areas: MasterOption[];
  positions: MasterOption[];
  locations: MasterOption[];
  cost_centers: MasterOption[];
  work_shifts: MasterOption[];
  banks: MasterOption[];
  roles?: Role[];
};
type AdminUser = {
  id: number;
  employee_uuid?: string;
  user_uuid?: string;
  company_id?: string;
  name: string;
  email: string;
  role_id: number | null;
  role_name: string;
  active: boolean;
  code: string;
  document: string;
  company: string;
  position: string;
  department: string;
  salary_base: number;
  labor_status: string;
  [key: string]: unknown;
};
type UserDocument = {
  id: string;
  document_type: string;
  file_name: string;
  storage_path?: string;
  file_url?: string;
  mime_type?: string;
  file_size?: number;
  status?: string;
  observations?: string;
  uploaded_at?: string;
};
type ConfigItem = {
  key: string;
  title: string;
  description: string;
  status: "configurado" | "pendiente" | "activo" | "restringido";
  modal: "roles" | "users" | "masters" | "info";
  href?: string;
};
type ConfigCategory = {
  key: string;
  title: string;
  description: string;
  icon: typeof Building2;
  items: ConfigItem[];
};
type UserTab = "basicos" | "acceso" | "laboral" | "operacion" | "documentos" | "auditoria";
const userSteps: Array<{ key: UserTab; label: string; detail: string; icon: typeof UserCog }> = [
  { key: "basicos", label: "Identidad", detail: "Datos personales y contacto", icon: UserCog },
  { key: "acceso", label: "Acceso", detail: "Correo, rol y seguridad", icon: Shield },
  { key: "laboral", label: "Laboral", detail: "Vinculacion y organizacion", icon: FolderKanban },
  { key: "operacion", label: "Operacion", detail: "Capacidades y asignaciones", icon: Route },
  { key: "documentos", label: "Documentos", detail: "Expediente privado", icon: FileText },
  { key: "auditoria", label: "Revision", detail: "Resumen y trazabilidad", icon: Activity }
];
type UserForm = {
  name: string;
  first_names: string;
  last_names: string;
  email: string;
  password: string;
  role_id: string;
  code: string;
  document_type: string;
  document: string;
  document_issue_date: string;
  document_issue_place: string;
  birth_date: string;
  gender: string;
  phone: string;
  address: string;
  city: string;
  state_region: string;
  country: string;
  company: string;
  user_status: string;
  access_email: string;
  additional_roles: string;
  operational_profile: string;
  site: string;
  area: string;
  position: string;
  department: string;
  manager: string;
  special_permissions: string;
  require_password_change: boolean;
  mfa_status: string;
  session_status: string;
  engagement_type: string;
  hire_date: string;
  end_date: string;
  contract_type: string;
  cost_center: string;
  workday: string;
  base_shift: string;
  salary_base: string;
  transport_allowance: string;
  arl_risk: string;
  eps: string;
  pension_fund: string;
  compensation_fund: string;
  bank: string;
  bank_account_type: string;
  bank_account_number: string;
  labor_notes: string;
  operational_classification: string;
  can_punch_time: boolean;
  can_receive_services: boolean;
  can_be_assigned_routes: boolean;
  can_manage_inventory: boolean;
  can_approve_documents: boolean;
  can_authorize_exceptions: boolean;
  driver_license: string;
  license_category: string;
  license_expires_at: string;
  operational_restrictions: string;
  base_site: string;
  operation_zone: string;
};

const actionLabels: Record<string, string> = {
  access: "Entrar",
  view: "Ver",
  create: "Crear",
  edit: "Editar",
  delete: "Eliminar",
  approve: "Aprobar",
  reject: "Rechazar",
  void: "Anular",
  export: "Exportar",
  import: "Importar",
  attach: "Adjuntar",
  download: "Descargar",
  configure: "Configurar",
  administer: "Administrar",
  execute: "Ejecutar",
  reports: "Reportes",
  sensitive: "Sensible",
  manage_users: "Gestionar usuarios",
  manage_roles: "Gestionar roles"
};

const roleActions = ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import", "attach", "download", "configure", "administer", "execute", "reports", "sensitive", "manage_users", "manage_roles"];
const compactRoleActions = ["access", "view", "create", "edit", "approve", "export", "configure", "sensitive", "manage_users", "manage_roles"];
const defaultRoleScopes: RoleScopes = { locations: [], areas: [], cost_centers: [], processes: [] };

const emptyUser: UserForm = {
  name: "",
  first_names: "",
  last_names: "",
  email: "",
  password: "",
  role_id: "",
  code: "",
  document_type: "CC",
  document: "",
  document_issue_date: "",
  document_issue_place: "",
  birth_date: "",
  gender: "",
  phone: "",
  address: "",
  city: "",
  state_region: "",
  country: "Colombia",
  company: "APEX",
  user_status: "activo",
  access_email: "",
  additional_roles: "",
  operational_profile: "",
  site: "",
  area: "",
  position: "empleado",
  department: "Operacion",
  manager: "",
  special_permissions: "",
  require_password_change: false,
  mfa_status: "futuro",
  session_status: "sin_sesion",
  engagement_type: "empleado",
  hire_date: "",
  end_date: "",
  contract_type: "indefinite",
  cost_center: "",
  workday: "",
  base_shift: "",
  salary_base: "0",
  transport_allowance: "",
  arl_risk: "",
  eps: "",
  pension_fund: "",
  compensation_fund: "",
  bank: "",
  bank_account_type: "",
  bank_account_number: "",
  labor_notes: "",
  operational_classification: "administrativo",
  can_punch_time: false,
  can_receive_services: false,
  can_be_assigned_routes: false,
  can_manage_inventory: false,
  can_approve_documents: false,
  can_authorize_exceptions: false,
  driver_license: "",
  license_category: "",
  license_expires_at: "",
  operational_restrictions: "",
  base_site: "",
  operation_zone: ""
};

const fallbackUserMasterData: UserMasterData = {
  document_types: [{ code: "CC", name: "Cedula" }, { code: "CE", name: "Extranjeria" }, { code: "NIT", name: "NIT" }, { code: "PAS", name: "Pasaporte" }],
  user_statuses: [{ code: "activo", name: "Activo" }, { code: "inactivo", name: "Inactivo" }, { code: "suspendido", name: "Suspendido" }, { code: "bloqueado", name: "Bloqueado" }, { code: "pendiente_activacion", name: "Pendiente activacion" }],
  user_types: [{ code: "administrativo", name: "Administrativo" }, { code: "conductor", name: "Conductor" }, { code: "supervisor", name: "Supervisor" }, { code: "operario", name: "Operario" }, { code: "tecnico", name: "Tecnico" }, { code: "bodega", name: "Bodega" }],
  contract_types: [{ code: "indefinite", name: "Indefinido" }, { code: "fixed", name: "Termino fijo" }, { code: "service", name: "Prestacion de servicios" }, { code: "temporary", name: "Temporal" }],
  engagement_types: [{ code: "empleado", name: "Empleado" }, { code: "contratista", name: "Contratista" }, { code: "tercero", name: "Tercero" }, { code: "temporal", name: "Temporal" }, { code: "aprendiz", name: "Aprendiz" }],
  session_statuses: [{ code: "sin_sesion", name: "Sin sesion" }, { code: "activa", name: "Activa" }, { code: "bloqueada", name: "Bloqueada" }],
  user_document_types: [{ code: "identity", name: "Documento de identidad" }, { code: "contract", name: "Contrato" }, { code: "license", name: "Licencia de conduccion" }, { code: "social_security", name: "Seguridad social" }, { code: "bank_certificate", name: "Certificado bancario" }, { code: "occupational_exam", name: "Examen medico ocupacional" }, { code: "internal", name: "Documento interno" }],
  areas: [{ code: "OPER", name: "Operacion" }, { code: "TRANSP", name: "Transporte" }, { code: "ADMIN", name: "Administracion" }, { code: "BODEGA", name: "Bodega" }],
  positions: [{ code: "ADMIN", name: "Administrador" }, { code: "SUP_RUTA", name: "Supervisor de ruta" }, { code: "CONDUCTOR", name: "Conductor" }, { code: "AUX_OPER", name: "Auxiliar operativo" }],
  locations: [{ code: "SEDE-PRINCIPAL", name: "Sede principal" }, { code: "BOG-NORTE", name: "Bogota Norte" }, { code: "BOG-SUR", name: "Bogota Sur" }],
  cost_centers: [{ code: "CC-OPER", name: "Operacion" }, { code: "CC-TRAN", name: "Transporte" }, { code: "CC-ADMIN", name: "Administracion" }],
  work_shifts: [{ code: "DIURNO", name: "Diurno" }, { code: "NOCTURNO", name: "Nocturno" }, { code: "MIXTO", name: "Mixto" }],
  banks: [{ code: "BANCOLOMBIA", name: "Bancolombia" }, { code: "BOGOTA", name: "Banco de Bogota" }, { code: "DAVIVIENDA", name: "Davivienda" }]
};

const defaultServiceTypes: ServiceType[] = [
  { code: "instalacion", label: "Instalacion", active: true },
  { code: "mantenimiento", label: "Mantenimiento", active: true },
  { code: "garantia", label: "Garantia", active: true },
  { code: "retiro", label: "Retiro", active: true },
  { code: "diagnostico", label: "Diagnostico", active: true }
];

const defaultSatisfactionQuestions: SatisfactionQuestion[] = [
  { id: "service_quality", label: "Como calificas la calidad del servicio realizado?", active: true },
  { id: "technician_attention", label: "Como calificas la atencion y claridad del tecnico?", active: true },
  { id: "final_result", label: "Que tan satisfecho quedaste con el resultado final?", active: true }
];

function normalizeServiceTypeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeQuestionId(value: string) {
  return normalizeServiceTypeCode(value);
}

function normalizeServiceTypes(items: ServiceType[] = []) {
  const map = new Map<string, ServiceType>();
  items.forEach((item) => {
    const code = normalizeServiceTypeCode(item.code || item.label || "");
    const label = String(item.label || item.code || "").trim();
    if (!code || !label) return;
    map.set(code, { code, label, active: item.active !== false });
  });
  return Array.from(map.values());
}

function normalizeSatisfactionQuestions(items: SatisfactionQuestion[] = []) {
  const map = new Map<string, SatisfactionQuestion>();
  items.forEach((item) => {
    const id = normalizeQuestionId(item.id || item.label || "");
    const label = String(item.label || item.id || "").trim();
    if (!id || !label) return;
    map.set(id, { id, label, active: item.active !== false });
  });
  return Array.from(map.values());
}

const categories: ConfigCategory[] = [
  {
    key: "empresa",
    title: "Empresa y organizacion",
    description: "Datos maestros, sedes, areas y parametros generales.",
    icon: Building2,
    items: [
      { key: "empresas", title: "Empresas y modulos", description: "Crear empresas, editar datos y habilitar modulos por compania.", status: "activo", modal: "info", href: "/dashboard/administracion/suscripciones" },
      { key: "sedes", title: "Sedes", description: "Puntos de operacion asociados a usuarios, rutas y marcaciones.", status: "pendiente", modal: "masters" },
      { key: "areas", title: "Areas y centros de costo", description: "Clasificacion para usuarios, nomina futura y costos.", status: "pendiente", modal: "masters" },
      { key: "parametros", title: "Maestros de plataforma", description: "Catalogos transversales para usuarios, documentos, sedes, turnos y bancos.", status: "configurado", modal: "masters" }
    ]
  },
  {
    key: "seguridad",
    title: "Usuarios y seguridad",
    description: "Accesos, roles, permisos y auditoria.",
    icon: Shield,
    items: [
      { key: "usuarios", title: "Usuarios", description: "Ficha maestra de usuario, colaborador y perfil operativo.", status: "configurado", modal: "users" },
      { key: "roles", title: "Roles y permisos", description: "Matriz de permisos alineada con la logica actual.", status: "configurado", modal: "roles" },
      { key: "sesiones", title: "Accesos y sesiones", description: "Estado de acceso, ultimo ingreso y MFA futuro.", status: "pendiente", modal: "info" },
      { key: "auditoria", title: "Auditoria basica", description: "Registro de cambios criticos por usuario y modulo.", status: "activo", modal: "info" }
    ]
  },
  {
    key: "operacion",
    title: "Operacion logistica",
    description: "Vehiculos, rutas, marcaciones y servicios.",
    icon: Truck,
    items: [
      { key: "vehiculos", title: "Vehiculos", description: "Flota, documentos y conductor autorizado.", status: "activo", modal: "info", href: "/dashboard/transporte" },
      { key: "rutas", title: "Rutas", description: "Planeacion y asignacion operativa.", status: "activo", modal: "info", href: "/dashboard/talento-humano/rutas" },
      { key: "marcaciones", title: "Marcaciones", description: "Reglas operativas de jornada y trazabilidad.", status: "activo", modal: "info", href: "/dashboard/talento-humano/marcacion" },
      { key: "servicios", title: "Servicios", description: "Ordenes, referencias y parametros de campo.", status: "activo", modal: "info", href: "/dashboard/servicios" }
    ]
  },
  {
    key: "documentos",
    title: "Documentos y adjuntos",
    description: "Tipos documentales, vencimientos y validaciones.",
    icon: FileText,
    items: [
      { key: "tipos-documentales", title: "Tipos documentales", description: "Catalogo de documentos por usuario, vehiculo y servicio.", status: "pendiente", modal: "masters" },
      { key: "vencimientos", title: "Vencimientos", description: "Control de fechas criticas y estado documental.", status: "pendiente", modal: "info" },
      { key: "archivos", title: "Configuracion de archivos", description: "Buckets privados, tamanos y formatos permitidos.", status: "activo", modal: "info" },
      { key: "validaciones-documentales", title: "Validaciones documentales", description: "Estados de revision, rechazo y versionado.", status: "pendiente", modal: "info" }
    ]
  },
  {
    key: "alertas",
    title: "Notificaciones y alertas",
    description: "Avisos por vencimiento, operacion y sistema.",
    icon: Bell,
    items: [
      { key: "alertas-sistema", title: "Alertas del sistema", description: "Eventos criticos y avisos administrativos.", status: "pendiente", modal: "info" },
      { key: "alertas-vencimiento", title: "Vencimientos", description: "Licencias, documentos y contratos proximos a vencer.", status: "pendiente", modal: "info" },
      { key: "alertas-operativas", title: "Operativas", description: "Marcaciones, rutas, servicios y novedades.", status: "pendiente", modal: "info" },
      { key: "reglas-aviso", title: "Reglas de aviso", description: "Frecuencia y responsables de cada notificacion.", status: "pendiente", modal: "info" }
    ]
  },
  {
    key: "costos",
    title: "Contabilidad y costos",
    description: "Parametros financieros y centros de costo.",
    icon: CreditCard,
    items: [
      { key: "cuentas", title: "Cuentas contables", description: "Plan de cuentas y reglas contables.", status: "activo", modal: "info", href: "/dashboard/contabilidad/plan-cuentas" },
      { key: "impuestos", title: "Impuestos", description: "Parametros tributarios y tasas base.", status: "pendiente", modal: "info" },
      { key: "centros-costo", title: "Centros de costo", description: "Clasificacion para personal, operacion y productos.", status: "pendiente", modal: "masters" },
      { key: "producto-material", title: "Producto/material", description: "Costos futuros por producto, material o referencia.", status: "pendiente", modal: "info" }
    ]
  },
  {
    key: "integraciones",
    title: "Integraciones",
    description: "Supabase, APIs, correo, GPS y webhooks.",
    icon: LinkIcon,
    items: [
      { key: "supabase", title: "Supabase", description: "Conexion QA, Auth, Storage y RLS.", status: "activo", modal: "info" },
      { key: "apis", title: "APIs externas", description: "Credenciales y endpoints por proveedor.", status: "pendiente", modal: "info" },
      { key: "facturacion", title: "Facturacion electronica futura", description: "Base para integracion tributaria.", status: "pendiente", modal: "info" },
      { key: "correo-webhooks", title: "Correo y webhooks", description: "Canales de salida para avisos e integraciones.", status: "pendiente", modal: "info" }
    ]
  },
  {
    key: "sistema",
    title: "Sistema",
    description: "Preferencias globales, logs y mantenimiento.",
    icon: Database,
    items: [
      { key: "preferencias", title: "Preferencias generales", description: "Idioma, moneda, zona horaria y comportamiento base.", status: "pendiente", modal: "info" },
      { key: "apariencia", title: "Apariencia", description: "Parametros visuales futuros del tenant.", status: "pendiente", modal: "info" },
      { key: "logs", title: "Logs", description: "Eventos tecnicos y auditoria operativa.", status: "activo", modal: "info" },
      { key: "mantenimiento", title: "Mantenimiento", description: "Acciones avanzadas protegidas por permisos.", status: "restringido", modal: "info" }
    ]
  }
];

function emptyPermissions(catalog: CatalogItem[]) {
  return Object.fromEntries(catalog.map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, false]))
  ]));
}

function emptyRoleForm(catalog: CatalogItem[]) {
  return {
    name: "",
    description: "",
    active: true,
    hierarchy_level: "10",
    role_type: "custom",
    scope: "company",
    scopes: defaultRoleScopes,
    restrictions: defaultRoleScopes,
    can_delegate: false,
    sensitive: false,
    permissions: emptyPermissions(catalog)
  };
}

function roleScopesFrom(role?: Role | null, key: "scopes" | "restrictions" = "scopes"): RoleScopes {
  return {
    locations: Array.isArray(role?.[key]?.locations) ? role[key]!.locations : [],
    areas: Array.isArray(role?.[key]?.areas) ? role[key]!.areas : [],
    cost_centers: Array.isArray(role?.[key]?.cost_centers) ? role[key]!.cost_centers : [],
    processes: Array.isArray(role?.[key]?.processes) ? role[key]!.processes : []
  };
}

function csvToList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function listToCsv(value: string[]) {
  return value.join(", ");
}

function isSupabaseSession() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("auth_provider") === "supabase") return true;
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.iss || "").includes("supabase") || (!!SUPABASE_PROJECT_REF && String(payload.ref || "") === SUPABASE_PROJECT_REF);
  } catch {
    return false;
  }
}

function statusClass(status: ConfigItem["status"]) {
  if (status === "configurado" || status === "activo") return "bg-emerald-50 text-emerald-700";
  if (status === "restringido") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

function readUserValue(user: AdminUser, key: keyof UserForm, fallback = "") {
  const value = user[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : fallback;
}

function userToForm(user: AdminUser): UserForm {
  return {
    ...emptyUser,
    name: user.name || "",
    first_names: String(readUserValue(user, "first_names", "")),
    last_names: String(readUserValue(user, "last_names", "")),
    email: user.email || "",
    password: "",
    role_id: user.role_id ? String(user.role_id) : "",
    code: user.code || "",
    document_type: String(readUserValue(user, "document_type", "CC")),
    document: user.document || "",
    document_issue_date: String(readUserValue(user, "document_issue_date", "")),
    document_issue_place: String(readUserValue(user, "document_issue_place", "")),
    birth_date: String(readUserValue(user, "birth_date", "")),
    gender: String(readUserValue(user, "gender", "")),
    phone: String(readUserValue(user, "phone", "")),
    address: String(readUserValue(user, "address", "")),
    city: String(readUserValue(user, "city", "")),
    state_region: String(readUserValue(user, "state_region", "")),
    country: String(readUserValue(user, "country", "Colombia")),
    company: user.company || "APEX",
    user_status: String(readUserValue(user, "user_status", user.active ? "activo" : "inactivo")),
    access_email: String(readUserValue(user, "access_email", user.email || "")),
    additional_roles: String(readUserValue(user, "additional_roles", "")),
    operational_profile: String(readUserValue(user, "operational_profile", "")),
    site: String(readUserValue(user, "site", "")),
    area: String(readUserValue(user, "area", user.department || "")),
    position: user.position || "empleado",
    department: user.department || "Operacion",
    manager: String(readUserValue(user, "manager", "")),
    special_permissions: String(readUserValue(user, "special_permissions", "")),
    require_password_change: Boolean(user.require_password_change),
    mfa_status: String(readUserValue(user, "mfa_status", "futuro")),
    session_status: String(readUserValue(user, "session_status", "sin_sesion")),
    engagement_type: String(readUserValue(user, "engagement_type", "empleado")),
    hire_date: String(readUserValue(user, "hire_date", "")),
    end_date: String(readUserValue(user, "end_date", "")),
    contract_type: String(readUserValue(user, "contract_type", "indefinite")),
    cost_center: String(readUserValue(user, "cost_center", "")),
    workday: String(readUserValue(user, "workday", "")),
    base_shift: String(readUserValue(user, "base_shift", "")),
    salary_base: String(user.salary_base || 0),
    transport_allowance: String(readUserValue(user, "transport_allowance", "")),
    arl_risk: String(readUserValue(user, "arl_risk", "")),
    eps: String(readUserValue(user, "eps", "")),
    pension_fund: String(readUserValue(user, "pension_fund", "")),
    compensation_fund: String(readUserValue(user, "compensation_fund", "")),
    bank: String(readUserValue(user, "bank", "")),
    bank_account_type: String(readUserValue(user, "bank_account_type", "")),
    bank_account_number: String(readUserValue(user, "bank_account_number", "")),
    labor_notes: String(readUserValue(user, "labor_notes", "")),
    operational_classification: String(readUserValue(user, "operational_classification", "administrativo")),
    can_punch_time: Boolean(user.can_punch_time),
    can_receive_services: Boolean(user.can_receive_services),
    can_be_assigned_routes: Boolean(user.can_be_assigned_routes),
    can_manage_inventory: Boolean(user.can_manage_inventory),
    can_approve_documents: Boolean(user.can_approve_documents),
    can_authorize_exceptions: Boolean(user.can_authorize_exceptions),
    driver_license: String(readUserValue(user, "driver_license", "")),
    license_category: String(readUserValue(user, "license_category", "")),
    license_expires_at: String(readUserValue(user, "license_expires_at", "")),
    operational_restrictions: String(readUserValue(user, "operational_restrictions", "")),
    base_site: String(readUserValue(user, "base_site", "")),
    operation_zone: String(readUserValue(user, "operation_zone", ""))
  };
}

function scoreUser(form: UserForm) {
  let score = 0;
  if (form.name && form.email && form.document && form.phone && form.user_status) score += 25;
  if (form.role_id && form.access_email) score += 25;
  if (form.engagement_type && form.hire_date && form.contract_type && form.cost_center) score += 20;
  if (form.operational_classification && form.base_site && form.operation_zone) score += 15;
  if (form.driver_license || form.special_permissions || form.labor_notes) score += 15;
  return Math.min(score, 100);
}

function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  );
}

function optionPairs(items: MasterOption[] = [], placeholder?: string): Array<[string, string]> {
  const pairs = items.map((item) => [item.code, item.name] as [string, string]);
  return placeholder ? [["", placeholder], ...pairs] : pairs;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <input checked={checked} className="h-4 w-4 accent-apex" type="checkbox" onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function CompactMetric({ icon, label, value, detail, tone = "default" }: { icon: React.ReactNode; label: string; value: number | string; detail: string; tone?: "default" | "amber" | "red" }) {
  const toneClass = tone === "red" ? "border-rose-200 bg-rose-50 text-rose-900" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-white text-neutral-800";
  return <div className={`flex items-center gap-3 rounded-md border p-3 ${toneClass}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/70 text-apex">{icon}</span><div className="min-w-0"><div className="flex items-baseline gap-2"><p className="text-xl font-semibold">{value}</p><p className="truncate text-sm font-semibold">{label}</p></div><p className="truncate text-xs opacity-70">{detail}</p></div></div>;
}

export default function AdministracionPage() {
  const initializedRole = useRef(false);
  const [activeModal, setActiveModal] = useState<"roles" | "users" | "masters" | "info" | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<ConfigItem | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [configStatusFilter, setConfigStatusFilter] = useState("all");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [masterData, setMasterData] = useState<UserMasterData>(fallbackUserMasterData);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>(defaultServiceTypes);
  const [satisfactionQuestions, setSatisfactionQuestions] = useState<SatisfactionQuestion[]>(defaultSatisfactionQuestions);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm([]));
  const [roleFilter, setRoleFilter] = useState("");
  const [roleGroupFilter, setRoleGroupFilter] = useState("all");
  const [roleActionMode, setRoleActionMode] = useState<"compact" | "full">("compact");
  const [userForm, setUserForm] = useState<UserForm>(emptyUser);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userTab, setUserTab] = useState<UserTab>("basicos");
  const [userEditorOpen, setUserEditorOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [documentDraft, setDocumentDraft] = useState({ document_type: "identity", file_name: "", file_url: "", storage_path: "", mime_type: "", file_size: "", observations: "" });
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const [catalogDraft, setCatalogDraft] = useState({ catalog: "positions", code: "", name: "", description: "" });
  const [message, setMessage] = useState("");
  const [platformAdmin, setPlatformAdmin] = useState(false);

  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) || null, [roles, selectedRoleId]);
  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) || null, [users, selectedUserId]);
  const userScore = useMemo(() => scoreUser(userForm), [userForm]);
  const sensitiveAllowed = useMemo(() => roles.find((role) => role.id === Number(userForm.role_id))?.name !== "Empleado", [roles, userForm.role_id]);
  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      const matchesStatus = userStatusFilter === "all" || (userStatusFilter === "active" ? user.active : !user.active);
      const text = `${user.name} ${user.email} ${user.role_name || ""} ${user.position || ""} ${user.department || ""} ${user.company || ""}`.toLowerCase();
      return matchesStatus && (!term || text.includes(term));
    });
  }, [userSearch, userStatusFilter, users]);
  const currentUserStep = Math.max(0, userSteps.findIndex((step) => step.key === userTab));
  const configItems = useMemo(() => categories.flatMap((category) => category.items.map((item) => ({ ...item, categoryKey: category.key, categoryTitle: category.title, categoryIcon: category.icon }))), []);
  const filteredConfigItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return configItems.filter((item) => {
      if (item.key === "empresas" && !platformAdmin) return false;
      const matchesCategory = categoryFilter === "all" || item.categoryKey === categoryFilter;
      const matchesStatus = configStatusFilter === "all" || item.status === configStatusFilter;
      const text = `${item.categoryTitle} ${item.title} ${item.description}`.toLowerCase();
      return matchesCategory && matchesStatus && (!term || text.includes(term));
    });
  }, [categoryFilter, configItems, configStatusFilter, platformAdmin, query]);
  const metrics = useMemo(() => {
    const active = users.filter((user) => user.active).length;
    const inactive = users.length - active;
    const drivers = users.filter((user) => String(user.operational_classification || "").toLowerCase() === "conductor").length;
    const pending = users.filter((user) => String(user.user_status || "").includes("pendiente")).length;
    const withoutRole = users.filter((user) => !user.role_id).length;
    const withoutSite = users.filter((user) => !user.site && !user.base_site).length;
    return { active, inactive, drivers, pending, withoutRole, withoutSite };
  }, [users]);
  const roleGroups = useMemo(() => Array.from(new Set(catalog.map((item) => item.group || "general"))).sort(), [catalog]);
  const visibleRoleActions = roleActionMode === "full" ? roleActions : compactRoleActions;
  const filteredRoleCatalog = useMemo(() => {
    const term = roleFilter.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesGroup = roleGroupFilter === "all" || (item.group || "general") === roleGroupFilter;
      const text = `${item.label} ${item.key} ${item.group || ""} ${item.module || ""} ${item.submodule || ""}`.toLowerCase();
      return matchesGroup && (!term || text.includes(term));
    });
  }, [catalog, roleFilter, roleGroupFilter]);
  const roleImpact = useMemo(() => {
    const modules = Object.values(roleForm.permissions).filter((actions) => Object.values(actions || {}).some(Boolean)).length;
    const actions = Object.values(roleForm.permissions).reduce((sum, actionsMap) => sum + Object.values(actionsMap || {}).filter(Boolean).length, 0);
    const critical = Object.values(roleForm.permissions).reduce((sum, actionsMap) => sum + ["delete", "administer", "configure", "sensitive", "manage_users", "manage_roles"].filter((action) => actionsMap?.[action]).length, 0);
    return { modules, actions, critical };
  }, [roleForm.permissions]);
  const configuredItems = configItems.filter((item) => item.status === "configurado" || item.status === "activo").length;
  const pendingItems = configItems.filter((item) => item.status === "pendiente").length;
  const activeConfigFilters = [query.trim(), categoryFilter !== "all" ? categoryFilter : "", configStatusFilter !== "all" ? configStatusFilter : ""].filter(Boolean).length;

  function clearConfigFilters() {
    setQuery("");
    setCategoryFilter("all");
    setConfigStatusFilter("all");
  }

  function setUserField<K extends keyof UserForm>(key: K, value: UserForm[K]) {
    setUserForm((current) => ({ ...current, [key]: value }));
  }

  const load = useCallback(async () => {
    setMessage("");
    const [catalogResult, rolesResult, usersResult, masterResult, serviceTypesResult, satisfactionQuestionsResult] = await Promise.allSettled([
      api<CatalogItem[]>("/api/v1/admin/permissions/catalog"),
      api<Role[]>("/api/v1/admin/roles"),
      api<AdminUser[]>("/api/v1/admin/users"),
      api<UserMasterData>("/api/v1/admin/user-master-data"),
      api<ServiceType[]>("/api/v1/services/service-types"),
      api<SatisfactionQuestion[]>("/api/v1/services/satisfaction-questions")
    ]);
    const catalogData = catalogResult.status === "fulfilled" ? catalogResult.value : [];
    const rolesData = rolesResult.status === "fulfilled" ? rolesResult.value : [];
    const usersData = usersResult.status === "fulfilled" ? usersResult.value : [];
    const masterDataResult = masterResult.status === "fulfilled" ? masterResult.value : fallbackUserMasterData;
    const serviceTypesData = serviceTypesResult.status === "fulfilled" ? normalizeServiceTypes(serviceTypesResult.value) : defaultServiceTypes;
    const satisfactionQuestionsData = satisfactionQuestionsResult.status === "fulfilled" ? normalizeSatisfactionQuestions(satisfactionQuestionsResult.value) : defaultSatisfactionQuestions;
    setCatalog(catalogData);
    setRoles(rolesData);
    setUsers(usersData);
    setMasterData({ ...fallbackUserMasterData, ...masterDataResult });
    setServiceTypes(serviceTypesData.length ? serviceTypesData : defaultServiceTypes);
    setSatisfactionQuestions(satisfactionQuestionsData.length ? satisfactionQuestionsData : defaultSatisfactionQuestions);
    const errors = [
      catalogResult.status === "rejected" ? "catalogo de permisos" : "",
      rolesResult.status === "rejected" ? "roles" : "",
      usersResult.status === "rejected" ? "usuarios" : "",
      masterResult.status === "rejected" ? "maestros de usuario" : "",
      serviceTypesResult.status === "rejected" ? "tipos de servicio" : "",
      satisfactionQuestionsResult.status === "rejected" ? "preguntas de satisfaccion" : ""
    ].filter(Boolean);
    if (errors.length) {
      setMessage(`No fue posible consultar ${errors.join(", ")}. Revisa permisos RLS, empresa activa o conectividad Supabase.`);
    }
    const initialRole = rolesData.find((role) => role.name !== "APEX_ADMIN") || rolesData[0];
    if (initialRole && !initializedRole.current) {
      initializedRole.current = true;
      setSelectedRoleId(initialRole.id);
      setRoleForm({
        ...emptyRoleForm(catalogData),
        name: initialRole.name,
        description: initialRole.description || "",
        active: initialRole.active,
        hierarchy_level: String(initialRole.hierarchy_level || 10),
        role_type: initialRole.role_type || "custom",
        scope: initialRole.scope || "company",
        scopes: roleScopesFrom(initialRole, "scopes"),
        restrictions: roleScopesFrom(initialRole, "restrictions"),
        can_delegate: Boolean(initialRole.can_delegate),
        sensitive: Boolean(initialRole.sensitive),
        permissions: initialRole.permissions || emptyPermissions(catalogData)
      });
    }
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    loadModuleAccess(MODULES)
      .then((access) => setPlatformAdmin(access.isPlatformAdmin))
      .catch(() => setPlatformAdmin(false));
  }, []);

  function openConfig(item: ConfigItem) {
    setSelectedConfig(item);
    setActiveModal(item.modal);
  }

  function selectRole(role: Role) {
    setSelectedRoleId(role.id);
    setRoleForm({
      ...emptyRoleForm(catalog),
      name: role.name,
      description: role.description || "",
      active: role.active,
      hierarchy_level: String(role.hierarchy_level || 10),
      role_type: role.role_type || "custom",
      scope: role.scope || "company",
      scopes: roleScopesFrom(role, "scopes"),
      restrictions: roleScopesFrom(role, "restrictions"),
      can_delegate: Boolean(role.can_delegate),
      sensitive: Boolean(role.sensitive),
      permissions: role.permissions || emptyPermissions(catalog)
    });
  }

  function newRole() {
    setSelectedRoleId(null);
    setRoleForm(emptyRoleForm(catalog));
  }

  function copyRole(roleId: string) {
    const role = roles.find((item) => String(item.id) === roleId);
    if (!role) return;
    setSelectedRoleId(null);
    setRoleForm({
      ...emptyRoleForm(catalog),
      name: `${role.name} copia`,
      description: role.description || "",
      active: true,
      hierarchy_level: String(role.hierarchy_level || 10),
      role_type: role.role_type || "custom",
      scope: role.scope || "company",
      scopes: roleScopesFrom(role, "scopes"),
      restrictions: roleScopesFrom(role, "restrictions"),
      can_delegate: Boolean(role.can_delegate),
      sensitive: Boolean(role.sensitive),
      permissions: role.permissions || emptyPermissions(catalog)
    });
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
    if (!roleForm.name.trim()) {
      setMessage("El nombre del rol es obligatorio.");
      return;
    }
    const payload = { ...roleForm, hierarchy_level: Number(roleForm.hierarchy_level || 10), permissions: roleForm.permissions };
    if (selectedRoleId) await api(`/api/v1/admin/roles/${selectedRoleId}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/v1/admin/roles", { method: "POST", body: JSON.stringify(payload) });
    setMessage("Rol guardado.");
    await load();
  }

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
    setUserForm(userToForm(user));
    setUserTab("basicos");
    setUserEditorOpen(true);
  }

  function newUser() {
    setSelectedUserId(null);
    setUserForm(emptyUser);
    setUserTab("basicos");
    setSelectedDocumentFile(null);
    setUserEditorOpen(true);
  }

  function validateUser() {
    if (!userForm.first_names.trim()) return "Los nombres son obligatorios.";
    if (!userForm.last_names.trim()) return "Los apellidos son obligatorios.";
    if (!userForm.name.trim() && !`${userForm.first_names} ${userForm.last_names}`.trim()) return "El nombre es obligatorio.";
    if (!userForm.email.trim()) return "El correo es obligatorio.";
    if (!userForm.role_id) return "El rol principal es obligatorio.";
    if (!userForm.document.trim()) return "El documento es obligatorio.";
    if (!userForm.position.trim()) return "El cargo es obligatorio.";
    if (!userForm.department.trim() && !userForm.area.trim()) return "El area o departamento es obligatorio.";
    if (!selectedUserId && !userForm.password) return "La clave inicial es obligatoria.";
    if (!selectedUserId && userForm.password.length < 8) return "La clave inicial debe tener minimo 8 caracteres.";
    if (userForm.operational_classification === "conductor" && (!userForm.driver_license || !userForm.license_expires_at)) return "Un conductor requiere licencia y fecha de vencimiento.";
    if (userForm.can_punch_time && (!userForm.base_site || !userForm.base_shift)) return "Para marcar jornada se requiere sede base y turno.";
    if (userForm.salary_base !== "0" && (!userForm.cost_center || !userForm.contract_type)) return "Los datos de nomina requieren centro de costo y tipo de contrato.";
    if (userForm.end_date && userForm.hire_date && userForm.end_date < userForm.hire_date) return "La fecha de retiro no puede ser anterior al ingreso.";
    return "";
  }

  async function saveUser() {
    const validation = validateUser();
    if (validation) {
      setMessage(validation);
      return;
    }
    const payload = {
      ...userForm,
      name: userForm.name || `${userForm.first_names} ${userForm.last_names}`.trim(),
      role_id: userForm.role_id ? Number(userForm.role_id) : undefined,
      salary_base: Number(userForm.salary_base || 0),
      documents: selectedUser?.documents || []
    };
    if (selectedUserId) await api(`/api/v1/admin/users/${selectedUserApiId()}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/v1/admin/users", { method: "POST", body: JSON.stringify(payload) });
    setMessage("Usuario guardado.");
    await load();
    setSelectedUserId(null);
    setUserForm(emptyUser);
    setUserTab("basicos");
    setUserEditorOpen(false);
  }

  function userApiId(user: AdminUser) {
    return isSupabaseSession() && user.employee_uuid ? user.employee_uuid : user.id;
  }

  async function setUserStatusDirect(user: AdminUser, active: boolean) {
    if (!active && !window.confirm(`Confirmas inactivar a ${user.name} sin eliminar su historial?`)) return;
    await api(`/api/v1/admin/users/${userApiId(user)}/status`, { method: "PATCH", body: JSON.stringify({ active }) });
    setMessage(active ? `${user.name} fue activado.` : `${user.name} fue inactivado.`);
    await load();
  }

  async function suspendUserDirect(user: AdminUser) {
    if (!window.confirm(`Confirmas suspender el acceso de ${user.name}?`)) return;
    await api(`/api/v1/admin/users/${userApiId(user)}/access`, { method: "PATCH", body: JSON.stringify({ session_status: "bloqueada", active: false }) });
    setMessage(`Acceso suspendido para ${user.name}.`);
    await load();
  }

  function moveUserStep(direction: -1 | 1) {
    const next = Math.min(userSteps.length - 1, Math.max(0, currentUserStep + direction));
    setUserTab(userSteps[next].key);
  }

  async function setUserStatus(active: boolean) {
    const targetId = selectedUserApiId();
    if (!targetId) return;
    if (!active && !window.confirm("Confirmas desactivar este usuario sin eliminar su historial?")) return;
    await api(`/api/v1/admin/users/${targetId}/status`, { method: "PATCH", body: JSON.stringify({ active }) });
    setMessage(active ? "Usuario activado." : "Usuario desactivado.");
    await load();
  }

  function selectedUserApiId() {
    return isSupabaseSession() && selectedUser?.employee_uuid ? selectedUser.employee_uuid : selectedUserId;
  }

  async function blockUserAccess() {
    const targetId = selectedUserApiId();
    if (!targetId) return;
    await api(`/api/v1/admin/users/${targetId}/access`, { method: "PATCH", body: JSON.stringify({ session_status: "bloqueada", active: false }) });
    setMessage("Acceso de usuario bloqueado.");
    await load();
  }

  async function requestPasswordReset() {
    const targetId = selectedUserApiId();
    if (!targetId) return;
    await api(`/api/v1/admin/users/${targetId}/access`, { method: "PATCH", body: JSON.stringify({ require_password_change: true, session_status: "sin_sesion" }) });
    setMessage("Cambio de clave solicitado para el proximo ingreso.");
    await load();
  }

  async function addDocument() {
    const targetId = selectedUserApiId();
    if (!targetId) {
      setMessage("Guarda primero el usuario para adjuntar documentos.");
      return;
    }
    if (!documentDraft.document_type || (!documentDraft.file_name.trim() && !selectedDocumentFile)) {
      setMessage("Tipo documental y nombre de archivo son obligatorios.");
      return;
    }
    let nextDraft = { ...documentDraft };
    if (selectedDocumentFile) {
      if (!selectedUser?.company_id || !selectedUser?.user_uuid) {
        setMessage("El usuario debe estar sincronizado con empresa y Auth para subir documentos privados.");
        return;
      }
      const uploaded = await uploadUserDocument(selectedUser.company_id, selectedUser.user_uuid, documentDraft.document_type, selectedDocumentFile);
      nextDraft = {
        ...nextDraft,
        file_name: nextDraft.file_name || selectedDocumentFile.name,
        file_url: "",
        storage_path: uploaded.storagePath,
        mime_type: selectedDocumentFile.type,
        file_size: String(selectedDocumentFile.size)
      };
    }
    await api<AdminUser>(`/api/v1/admin/users/${targetId}/documents`, {
      method: "POST",
      body: JSON.stringify({ ...nextDraft, file_size: Number(nextDraft.file_size || 0), status: "pending" })
    });
    setDocumentDraft({ document_type: "identity", file_name: "", file_url: "", storage_path: "", mime_type: "", file_size: "", observations: "" });
    setSelectedDocumentFile(null);
    setMessage("Documento asociado al usuario.");
    await load();
  }

  async function removeDocument(documentId: string) {
    const targetId = selectedUserApiId();
    if (!targetId) return;
    await api<AdminUser>(`/api/v1/admin/users/${targetId}/documents/${documentId}`, { method: "DELETE" });
    setMessage("Documento retirado del expediente.");
    await load();
  }

  async function openDocument(doc: UserDocument) {
    const value = doc.storage_path || doc.file_url;
    if (!value) return;
    const url = value.startsWith("user-documents/") ? await getUserDocumentUrl(value) : value;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function saveCatalogItem() {
    if (!catalogDraft.catalog || !catalogDraft.code.trim() || !catalogDraft.name.trim()) {
      setMessage("Catalogo, codigo y nombre son obligatorios.");
      return;
    }
    if (catalogDraft.catalog === "service_types") {
      const code = normalizeServiceTypeCode(catalogDraft.code);
      if (!code) {
        setMessage("El codigo del tipo de servicio debe tener letras o numeros.");
        return;
      }
      const next = normalizeServiceTypes([
        ...serviceTypes.filter((item) => item.code !== code),
        { code, label: catalogDraft.name.trim(), active: true }
      ]).sort((a, b) => a.label.localeCompare(b.label));
      await saveServiceTypeCatalog(next, "Tipo de servicio actualizado.");
      setCatalogDraft({ catalog: catalogDraft.catalog, code: "", name: "", description: "" });
      return;
    }
    if (catalogDraft.catalog === "satisfaction_questions") {
      const id = normalizeQuestionId(catalogDraft.code);
      if (!id) {
        setMessage("El codigo de la pregunta debe tener letras o numeros.");
        return;
      }
      const next = normalizeSatisfactionQuestions([
        ...satisfactionQuestions.filter((item) => item.id !== id),
        { id, label: catalogDraft.name.trim(), active: true }
      ]);
      await saveSatisfactionQuestionCatalog(next, "Pregunta de satisfaccion actualizada.");
      setCatalogDraft({ catalog: catalogDraft.catalog, code: "", name: "", description: "" });
      return;
    }
    const next = await api<UserMasterData>(`/api/v1/admin/user-master-data/${catalogDraft.catalog}/items`, {
      method: "POST",
      body: JSON.stringify({
        code: catalogDraft.code.trim(),
        name: catalogDraft.name.trim(),
        description: catalogDraft.description.trim(),
        active: true
      })
    });
    setMasterData({ ...fallbackUserMasterData, ...next });
    setCatalogDraft({ catalog: catalogDraft.catalog, code: "", name: "", description: "" });
    setMessage("Maestro actualizado.");
  }

  async function saveServiceTypeCatalog(nextTypes: ServiceType[], successMessage = "Tipos de servicio actualizados.") {
    const normalized = normalizeServiceTypes(nextTypes);
    if (!normalized.length) {
      setMessage("Debe existir al menos un tipo de servicio.");
      return;
    }
    if (!normalized.some((item) => item.active !== false)) {
      setMessage("Debe quedar al menos un tipo de servicio activo.");
      return;
    }
    const saved = await api<ServiceType[]>("/api/v1/services/service-types", {
      method: "PUT",
      body: JSON.stringify({ types: normalized })
    });
    const cleanSaved = normalizeServiceTypes(saved);
    setServiceTypes(cleanSaved.length ? cleanSaved : normalized);
    setMessage(successMessage);
  }

  async function toggleServiceType(code: string) {
    const next = serviceTypes.map((item) => item.code === code ? { ...item, active: item.active === false } : item);
    await saveServiceTypeCatalog(next, "Estado del tipo de servicio actualizado.");
  }

  async function removeServiceType(code: string) {
    const target = serviceTypes.find((item) => item.code === code);
    if (!target) return;
    if (!window.confirm(`Confirmas retirar el tipo de servicio "${target.label}" del maestro?`)) return;
    await saveServiceTypeCatalog(serviceTypes.filter((item) => item.code !== code), "Tipo de servicio retirado del maestro.");
  }

  async function saveSatisfactionQuestionCatalog(nextQuestions: SatisfactionQuestion[], successMessage = "Preguntas de satisfaccion actualizadas.") {
    const normalized = normalizeSatisfactionQuestions(nextQuestions);
    if (!normalized.length) {
      setMessage("Debe existir al menos una pregunta de satisfaccion.");
      return;
    }
    if (!normalized.some((item) => item.active !== false)) {
      setMessage("Debe quedar al menos una pregunta de satisfaccion activa.");
      return;
    }
    const saved = await api<SatisfactionQuestion[]>("/api/v1/services/satisfaction-questions", {
      method: "PUT",
      body: JSON.stringify({ questions: normalized })
    });
    const cleanSaved = normalizeSatisfactionQuestions(saved);
    setSatisfactionQuestions(cleanSaved.length ? cleanSaved : normalized);
    setMessage(successMessage);
  }

  async function toggleSatisfactionQuestion(id: string) {
    const next = satisfactionQuestions.map((item) => item.id === id ? { ...item, active: item.active === false } : item);
    await saveSatisfactionQuestionCatalog(next, "Estado de la pregunta actualizado.");
  }

  async function removeSatisfactionQuestion(id: string) {
    const target = satisfactionQuestions.find((item) => item.id === id);
    if (!target) return;
    if (!window.confirm(`Confirmas retirar la pregunta "${target.label}" del maestro?`)) return;
    await saveSatisfactionQuestionCatalog(satisfactionQuestions.filter((item) => item.id !== id), "Pregunta retirada del maestro.");
  }

  function renderMasterCatalogManager() {
    const catalogOptions: Array<[string, string]> = [
      ["user_types", "Tipos de usuario"],
      ["user_statuses", "Estados de usuario"],
      ["document_types", "Tipos de documento"],
      ["positions", "Cargos"],
      ["areas", "Areas"],
      ["locations", "Sedes"],
      ["cost_centers", "Centros de costo"],
      ["contract_types", "Tipos de contrato"],
      ["work_shifts", "Turnos"],
      ["user_document_types", "Tipos documentales"],
      ["banks", "Bancos"],
      ["service_types", "Tipos de servicio"],
      ["satisfaction_questions", "Preguntas de satisfaccion"]
    ];
    const isServiceTypeCatalog = catalogDraft.catalog === "service_types";
    const isSatisfactionQuestionCatalog = catalogDraft.catalog === "satisfaction_questions";
    const isOperationalCatalog = isServiceTypeCatalog || isSatisfactionQuestionCatalog;
    const selectedItems = !isOperationalCatalog && Array.isArray((masterData as Record<string, unknown>)[catalogDraft.catalog])
      ? (((masterData as unknown) as Record<string, MasterOption[]>)[catalogDraft.catalog] || [])
      : [];
    const catalogRows: Array<MasterOption & { active?: boolean }> = isServiceTypeCatalog
      ? serviceTypes.map((item) => ({ code: item.code, name: item.label, active: item.active !== false }))
      : isSatisfactionQuestionCatalog
        ? satisfactionQuestions.map((item) => ({ code: item.id, name: item.label, active: item.active !== false }))
      : selectedItems;
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-md border border-line bg-paper p-3">
          <div className="grid gap-3">
            <SelectField label="Catalogo" value={catalogDraft.catalog} onChange={(value) => setCatalogDraft((current) => ({ ...current, catalog: value }))} options={catalogOptions} />
            <Field label="Codigo" value={catalogDraft.code} onChange={(value) => setCatalogDraft((current) => ({ ...current, code: isOperationalCatalog ? normalizeServiceTypeCode(value) : value.toUpperCase().replace(/\s+/g, "-") }))} />
            <Field label={isSatisfactionQuestionCatalog ? "Pregunta" : "Nombre"} value={catalogDraft.name} onChange={(value) => setCatalogDraft((current) => ({ ...current, name: value }))} />
            <Field label="Descripcion" value={catalogDraft.description} onChange={(value) => setCatalogDraft((current) => ({ ...current, description: value }))} />
            {isServiceTypeCatalog ? (
              <p className="rounded-md border border-apex/20 bg-apex/10 px-3 py-2 text-xs text-neutral-600">
                Estos tipos se usan en la creacion y edicion de ordenes de servicio. Deja activo solo lo que el operador debe seleccionar.
              </p>
            ) : null}
            {isSatisfactionQuestionCatalog ? (
              <p className="rounded-md border border-apex/20 bg-apex/10 px-3 py-2 text-xs text-neutral-600">
                Estas preguntas aparecen en el cierre del servicio y son obligatorias cuando estan activas.
              </p>
            ) : null}
            <Button onClick={saveCatalogItem} type="button"><Save size={16} /> {isServiceTypeCatalog ? "Guardar tipo de servicio" : isSatisfactionQuestionCatalog ? "Guardar pregunta" : "Guardar maestro"}</Button>
          </div>
        </div>
        <div className="max-h-[58vh] overflow-auto rounded-md border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-line text-left text-xs text-neutral-500">
                <th className="px-3 py-2">Codigo</th>
                <th className="px-3 py-2">{isSatisfactionQuestionCatalog ? "Pregunta" : "Nombre"}</th>
                {isOperationalCatalog ? <th className="px-3 py-2">Estado</th> : null}
                {isOperationalCatalog ? <th className="px-3 py-2 text-right">Accion</th> : null}
              </tr>
            </thead>
            <tbody>
              {catalogRows.map((item) => (
                <tr className="border-b border-line/70" key={item.code}>
                  <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                  <td className="px-3 py-2">{item.name}</td>
                  {isOperationalCatalog ? (
                    <td className="px-3 py-2">
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                        {item.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  ) : null}
                  {isOperationalCatalog ? (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button className="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-paper" onClick={() => isServiceTypeCatalog ? toggleServiceType(item.code) : toggleSatisfactionQuestion(item.code)} type="button">
                          {item.active ? "Inactivar" : "Activar"}
                        </button>
                        <button className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={() => isServiceTypeCatalog ? removeServiceType(item.code) : removeSatisfactionQuestion(item.code)} type="button">
                          Retirar
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {isOperationalCatalog && !catalogRows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-neutral-500" colSpan={4}>No hay registros configurados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderUserTab() {
    if (userTab === "basicos") {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Nombres" value={userForm.first_names} onChange={(value) => setUserField("first_names", value)} />
          <Field label="Apellidos" value={userForm.last_names} onChange={(value) => setUserField("last_names", value)} />
          <Field label="Nombre visible" value={userForm.name} onChange={(value) => setUserField("name", value)} />
          <SelectField label="Tipo de documento" value={userForm.document_type} onChange={(value) => setUserField("document_type", value)} options={optionPairs(masterData.document_types)} />
          <Field label="Numero de documento" value={userForm.document} onChange={(value) => setUserField("document", value)} />
          <Field label="Fecha de expedicion" type="date" value={userForm.document_issue_date} onChange={(value) => setUserField("document_issue_date", value)} />
          <Field label="Lugar de expedicion" value={userForm.document_issue_place} onChange={(value) => setUserField("document_issue_place", value)} />
          <Field label="Fecha de nacimiento" type="date" value={userForm.birth_date} onChange={(value) => setUserField("birth_date", value)} />
          <SelectField label="Genero" value={userForm.gender} onChange={(value) => setUserField("gender", value)} options={[["", "No especificado"], ["femenino", "Femenino"], ["masculino", "Masculino"], ["otro", "Otro"]]} />
          <Field label="Correo principal" value={userForm.email} onChange={(value) => setUserField("email", value)} />
          <Field label="Telefono" value={userForm.phone} onChange={(value) => setUserField("phone", value)} />
          <SelectField label="Estado" value={userForm.user_status} onChange={(value) => setUserField("user_status", value)} options={optionPairs(masterData.user_statuses)} />
          <Field label="Direccion" value={userForm.address} onChange={(value) => setUserField("address", value)} />
          <Field label="Ciudad" value={userForm.city} onChange={(value) => setUserField("city", value)} />
          <Field label="Departamento" value={userForm.state_region} onChange={(value) => setUserField("state_region", value)} />
          <Field label="Pais" value={userForm.country} onChange={(value) => setUserField("country", value)} />
        </div>
      );
    }
    if (userTab === "acceso") {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Correo de acceso" value={userForm.access_email} onChange={(value) => setUserField("access_email", value)} />
          <Field label={selectedUserId ? "Nueva clave opcional" : "Clave inicial"} type="password" value={userForm.password} onChange={(value) => setUserField("password", value)} />
          <SelectField label="Rol principal" value={userForm.role_id} onChange={(value) => setUserField("role_id", value)} options={[["", "Seleccionar rol"], ...roles.filter((role) => role.active).map((role) => [String(role.id), role.name] as [string, string])]} />
          <Field label="Roles adicionales" value={userForm.additional_roles} onChange={(value) => setUserField("additional_roles", value)} />
          <SelectField label="Perfil operativo" value={userForm.operational_profile || userForm.operational_classification} onChange={(value) => { setUserField("operational_profile", value); setUserField("operational_classification", value); }} options={optionPairs(masterData.user_types, "Seleccionar perfil")} />
          <Field label="Empresa" value={userForm.company} onChange={(value) => setUserField("company", value)} />
          <SelectField label="Sede asignada" value={userForm.site} onChange={(value) => setUserField("site", value)} options={optionPairs(masterData.locations, "Seleccionar sede")} />
          <SelectField label="Area" value={userForm.area} onChange={(value) => { setUserField("area", value); setUserField("department", value); }} options={optionPairs(masterData.areas, "Seleccionar area")} />
          <SelectField label="Cargo" value={userForm.position} onChange={(value) => setUserField("position", value)} options={optionPairs(masterData.positions, "Seleccionar cargo")} />
          <Field label="Jefe directo" value={userForm.manager} onChange={(value) => setUserField("manager", value)} />
          <Field label="Permisos especiales" value={userForm.special_permissions} onChange={(value) => setUserField("special_permissions", value)} />
          <SelectField label="Estado de sesion" value={userForm.session_status} onChange={(value) => setUserField("session_status", value)} options={optionPairs(masterData.session_statuses)} />
          <Toggle label="Requiere cambio de clave" checked={userForm.require_password_change} onChange={(value) => setUserField("require_password_change", value)} />
          <Field label="MFA / 2FA futuro" value={userForm.mfa_status} onChange={(value) => setUserField("mfa_status", value)} />
        </div>
      );
    }
    if (userTab === "laboral") {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SelectField label="Tipo de vinculacion" value={userForm.engagement_type} onChange={(value) => setUserField("engagement_type", value)} options={optionPairs(masterData.engagement_types)} />
          <Field label="Fecha de ingreso" type="date" value={userForm.hire_date} onChange={(value) => setUserField("hire_date", value)} />
          <Field label="Fecha de retiro" type="date" value={userForm.end_date} onChange={(value) => setUserField("end_date", value)} />
          <SelectField label="Tipo de contrato" value={userForm.contract_type} onChange={(value) => setUserField("contract_type", value)} options={optionPairs(masterData.contract_types)} />
          <SelectField label="Cargo" value={userForm.position} onChange={(value) => setUserField("position", value)} options={optionPairs(masterData.positions, "Seleccionar cargo")} />
          <SelectField label="Area" value={userForm.department} onChange={(value) => { setUserField("department", value); setUserField("area", value); }} options={optionPairs(masterData.areas, "Seleccionar area")} />
          <SelectField label="Centro de costo" value={userForm.cost_center} onChange={(value) => setUserField("cost_center", value)} options={optionPairs(masterData.cost_centers, "Seleccionar centro")} />
          <SelectField label="Jornada laboral" value={userForm.workday} onChange={(value) => setUserField("workday", value)} options={optionPairs(masterData.work_shifts, "Seleccionar jornada")} />
          <SelectField label="Turno base" value={userForm.base_shift} onChange={(value) => setUserField("base_shift", value)} options={optionPairs(masterData.work_shifts, "Seleccionar turno")} />
          {sensitiveAllowed ? <Field label="Salario base" type="number" value={userForm.salary_base} onChange={(value) => setUserField("salary_base", value)} /> : null}
          {sensitiveAllowed ? <Field label="Auxilio transporte" value={userForm.transport_allowance} onChange={(value) => setUserField("transport_allowance", value)} /> : null}
          <Field label="Riesgo ARL" value={userForm.arl_risk} onChange={(value) => setUserField("arl_risk", value)} />
          <Field label="EPS" value={userForm.eps} onChange={(value) => setUserField("eps", value)} />
          <Field label="Fondo de pension" value={userForm.pension_fund} onChange={(value) => setUserField("pension_fund", value)} />
          <Field label="Caja de compensacion" value={userForm.compensation_fund} onChange={(value) => setUserField("compensation_fund", value)} />
          {sensitiveAllowed ? <SelectField label="Banco" value={userForm.bank} onChange={(value) => setUserField("bank", value)} options={optionPairs(masterData.banks, "Seleccionar banco")} /> : null}
          {sensitiveAllowed ? <Field label="Tipo de cuenta" value={userForm.bank_account_type} onChange={(value) => setUserField("bank_account_type", value)} /> : null}
          {sensitiveAllowed ? <Field label="Numero de cuenta" value={userForm.bank_account_number} onChange={(value) => setUserField("bank_account_number", value)} /> : null}
          <Field label="Observaciones laborales" value={userForm.labor_notes} onChange={(value) => setUserField("labor_notes", value)} />
        </div>
      );
    }
    if (userTab === "operacion") {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SelectField label="Clasificacion operativa" value={userForm.operational_classification} onChange={(value) => setUserField("operational_classification", value)} options={optionPairs(masterData.user_types)} />
          <SelectField label="Sede base" value={userForm.base_site} onChange={(value) => setUserField("base_site", value)} options={optionPairs(masterData.locations, "Seleccionar sede")} />
          <Field label="Zona de operacion" value={userForm.operation_zone} onChange={(value) => setUserField("operation_zone", value)} />
          <Toggle label="Puede realizar marcaciones" checked={userForm.can_punch_time} onChange={(value) => setUserField("can_punch_time", value)} />
          <Toggle label="Puede recibir servicios" checked={userForm.can_receive_services} onChange={(value) => setUserField("can_receive_services", value)} />
          <Toggle label="Puede ser asignado a rutas" checked={userForm.can_be_assigned_routes} onChange={(value) => setUserField("can_be_assigned_routes", value)} />
          <Toggle label="Puede responder inventario" checked={userForm.can_manage_inventory} onChange={(value) => setUserField("can_manage_inventory", value)} />
          <Toggle label="Puede aprobar documentos" checked={userForm.can_approve_documents} onChange={(value) => setUserField("can_approve_documents", value)} />
          <Toggle label="Puede autorizar novedades" checked={userForm.can_authorize_exceptions} onChange={(value) => setUserField("can_authorize_exceptions", value)} />
          <Field label="Licencia de conduccion" value={userForm.driver_license} onChange={(value) => setUserField("driver_license", value)} />
          <Field label="Categoria licencia" value={userForm.license_category} onChange={(value) => setUserField("license_category", value)} />
          <Field label="Vencimiento licencia" type="date" value={userForm.license_expires_at} onChange={(value) => setUserField("license_expires_at", value)} />
          <Field label="Restricciones operativas" value={userForm.operational_restrictions} onChange={(value) => setUserField("operational_restrictions", value)} />
        </div>
      );
    }
    if (userTab === "documentos") {
      const documents = (Array.isArray(selectedUser?.documents) ? selectedUser.documents : []) as UserDocument[];
      return (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-md border border-line bg-paper p-3 md:grid-cols-2 xl:grid-cols-3">
            <SelectField label="Tipo documental" value={documentDraft.document_type} onChange={(value) => setDocumentDraft((current) => ({ ...current, document_type: value }))} options={optionPairs(masterData.user_document_types)} />
            <Field label="Nombre de archivo" value={documentDraft.file_name} onChange={(value) => setDocumentDraft((current) => ({ ...current, file_name: value }))} />
            <Field label="Ruta storage / URL" value={documentDraft.storage_path || documentDraft.file_url} onChange={(value) => setDocumentDraft((current) => ({ ...current, storage_path: value, file_url: value }))} />
            <Field label="MIME" value={documentDraft.mime_type} onChange={(value) => setDocumentDraft((current) => ({ ...current, mime_type: value }))} />
            <Field label="Tamano bytes" type="number" value={documentDraft.file_size} onChange={(value) => setDocumentDraft((current) => ({ ...current, file_size: value }))} />
            <Field label="Observaciones" value={documentDraft.observations} onChange={(value) => setDocumentDraft((current) => ({ ...current, observations: value }))} />
            <label className="text-sm font-semibold md:col-span-2 xl:col-span-3">
              Archivo privado
              <input className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-sm" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setSelectedDocumentFile(event.target.files?.[0] || null)} />
              {selectedDocumentFile ? <span className="mt-1 block text-xs font-normal text-neutral-500">{selectedDocumentFile.name} - {selectedDocumentFile.type || "sin MIME"}</span> : null}
            </label>
            <div className="md:col-span-2 xl:col-span-3">
              <Button onClick={addDocument} type="button"><Plus size={16} /> Subir / asociar documento</Button>
            </div>
          </div>
          {documents.map((doc) => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3" key={doc.id}>
              <div>
                <p className="text-sm font-semibold">{doc.file_name}</p>
                <p className="text-xs text-neutral-500">{doc.document_type} · {doc.mime_type || "sin MIME"} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : "sin fecha"}</p>
                {doc.storage_path || doc.file_url ? <p className="mt-1 break-all text-xs text-neutral-500">{doc.storage_path || doc.file_url}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">{doc.status || "pending"}</span>
                {(doc.storage_path || doc.file_url) ? <button className="h-9 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => openDocument(doc)} type="button">Ver</button> : null}
                <button className="h-9 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => removeDocument(doc.id)} type="button">Eliminar</button>
              </div>
            </div>
          ))}
          {!documents.length ? <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-neutral-500">Sin documentos asociados al usuario.</p> : null}
        </div>
      );
    }
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-line p-3">
          <p className="text-sm font-semibold">Score maestro</p>
          <p className="mt-1 text-3xl font-semibold">{userScore}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper"><div className="h-full bg-apex" style={{ width: `${userScore}%` }} /></div>
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="text-sm font-semibold">Auditoria</p>
          <p className="mt-1 text-sm text-neutral-600">Los cambios por POST, PUT y PATCH se registran en la auditoria existente del backend.</p>
        </div>
      </div>
    );
  }

  function renderUserDirectory() {
    return (
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["Total usuarios", users.length, "text-neutral-950"], ["Activos", metrics.active, "text-emerald-700"], ["Inactivos", metrics.inactive, "text-neutral-600"], ["Sin rol", metrics.withoutRole, "text-amber-700"]].map(([label, value, tone]) => (
            <div className="rounded-md border border-line bg-white p-3" key={String(label)}><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p></div>
          ))}
        </section>
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper p-3">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input className="h-11 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm" placeholder="Buscar nombre, correo, rol, cargo o area..." value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
            </label>
            <select className="h-11 rounded-md border border-line bg-white px-3 text-sm font-semibold" value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value)}>
              <option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos / suspendidos</option>
            </select>
          </div>
          <Button onClick={newUser} type="button"><UserPlus size={16} /> Crear usuario</Button>
        </section>
        <div className="max-h-[58vh] overflow-auto rounded-md border border-line bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 z-10 bg-paper"><tr className="border-b border-line text-left text-xs font-semibold uppercase text-neutral-500"><th className="px-3 py-3">Usuario</th><th className="px-3 py-3">Rol y cargo</th><th className="px-3 py-3">Organizacion</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr className="border-b border-line/70 hover:bg-paper/60" key={user.id}>
                  <td className="px-3 py-3"><p className="font-semibold">{user.name}</p><p className="mt-1 text-xs text-neutral-500">{user.email || "Sin correo"} - {user.code || "Sin codigo"}</p></td>
                  <td className="px-3 py-3"><p className="font-medium">{user.role_name || "Sin rol"}</p><p className="mt-1 text-xs text-neutral-500">{user.position || "Sin cargo"}</p></td>
                  <td className="px-3 py-3"><p>{user.company || "Sin empresa"}</p><p className="mt-1 text-xs text-neutral-500">{user.department || "Sin area"}</p></td>
                  <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{user.active ? "Activo" : "Inactivo"}</span></td>
                  <td className="px-3 py-3"><div className="flex justify-end gap-2">
                    <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-xs font-semibold hover:bg-white" onClick={() => selectUser(user)} type="button"><Edit3 size={14} /> Editar</button>
                    {user.active ? <><button className="h-9 rounded-md border border-amber-200 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50" onClick={() => suspendUserDirect(user)} type="button">Suspender</button><button className="h-9 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={() => setUserStatusDirect(user, false)} type="button">Inactivar</button></> : <button className="h-9 rounded-md bg-apex px-3 text-xs font-semibold text-white" onClick={() => setUserStatusDirect(user, true)} type="button">Activar</button>}
                  </div></td>
                </tr>
              ))}
              {!filteredUsers.length ? <tr><td className="px-4 py-10 text-center text-sm text-neutral-500" colSpan={5}>No hay usuarios que coincidan con los filtros.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderUserEditor() {
    return (
      <div className="grid gap-4 xl:grid-cols-[250px_1fr]">
        <aside className="space-y-3">
          <button className="inline-flex h-10 w-full items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => setUserEditorOpen(false)} type="button"><ChevronLeft size={16} /> Volver a usuarios</button>
          <div className="rounded-md border border-line bg-paper p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{selectedUserId ? "Editando usuario" : "Nuevo usuario"}</p><p className="mt-2 truncate font-semibold">{userForm.name || `${userForm.first_names} ${userForm.last_names}`.trim() || "Sin nombre todavia"}</p><p className="mt-1 truncate text-xs text-neutral-500">{userForm.email || userForm.access_email || "Correo pendiente"}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full bg-apex" style={{ width: `${userScore}%` }} /></div><p className="mt-2 text-xs font-semibold text-neutral-600">Ficha completa: {userScore}%</p></div>
          <nav className="space-y-1" aria-label="Pasos de creacion de usuario">{userSteps.map((step, index) => { const StepIcon = step.icon; const active = userTab === step.key; return <button className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left ${active ? "bg-apex text-white" : "hover:bg-paper"}`} key={step.key} onClick={() => setUserTab(step.key)} type="button"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${active ? "bg-white/15" : "bg-paper text-apex"}`}>{index + 1}</span><span className="min-w-0"><span className="flex items-center gap-1 text-sm font-semibold"><StepIcon size={14} /> {step.label}</span><span className={`mt-0.5 block text-xs ${active ? "text-white/70" : "text-neutral-500"}`}>{step.detail}</span></span></button>; })}</nav>
        </aside>
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div><p className="text-xs font-semibold uppercase text-apex">Paso {currentUserStep + 1} de {userSteps.length}</p><h3 className="mt-1 text-lg font-semibold">{userSteps[currentUserStep].label}</h3><p className="mt-1 text-sm text-neutral-500">{userSteps[currentUserStep].detail}. Completa lo necesario y continua.</p></div>
            <div className="flex flex-wrap gap-2">{selectedUserId ? <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" onClick={requestPasswordReset} type="button"><LockKeyhole size={16} /> Restablecer acceso</Button> : null}{selectedUserId ? <Button className="border border-amber-200 bg-white text-amber-800 hover:bg-amber-50" onClick={blockUserAccess} type="button">Suspender</Button> : null}{selectedUserId && selectedUser?.active ? <Button className="bg-rose-700 hover:bg-rose-800" onClick={() => setUserStatus(false)} type="button">Inactivar</Button> : null}{selectedUserId && selectedUser && !selectedUser.active ? <Button onClick={() => setUserStatus(true)} type="button"><Check size={16} /> Activar</Button> : null}</div>
          </div>
          <div className="min-h-[380px]">{renderUserTab()}</div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-40" disabled={currentUserStep === 0} onClick={() => moveUserStep(-1)} type="button"><ChevronLeft size={16} /> Anterior</button>
            <div className="flex gap-2"><button className="h-10 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => setUserEditorOpen(false)} type="button">Cancelar</button>{currentUserStep < userSteps.length - 1 ? <Button onClick={() => moveUserStep(1)} type="button">Siguiente <ChevronRight size={16} /></Button> : <Button onClick={saveUser} type="button"><Save size={16} /> {selectedUserId ? "Guardar cambios" : "Crear usuario"}</Button>}</div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-apex">Configuracion y gobierno</p>
          <h1 className="mt-1 text-3xl font-semibold">Administracion APEX</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Gestiona accesos, permisos, empresas y maestros desde un centro administrativo ordenado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" onClick={() => load().catch((error) => setMessage(error.message))} type="button"><RefreshCw size={16} /> Actualizar</Button>
          <Button onClick={() => { setActiveModal("users"); newUser(); }} type="button"><UserPlus size={16} /> Crear usuario</Button>
        </div>
      </header>

      {message ? <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-neutral-700">{message}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactMetric icon={<Users size={17} />} label="Usuarios activos" value={metrics.active} detail={`${metrics.inactive} inactivos`} />
        <CompactMetric icon={<AlertTriangle size={17} />} label="Requieren atencion" value={metrics.pending + metrics.withoutRole + metrics.withoutSite} detail={`${metrics.pending} pendientes · ${metrics.withoutRole} sin rol`} tone={metrics.pending + metrics.withoutRole + metrics.withoutSite ? "amber" : "default"} />
        <CompactMetric icon={<Shield size={17} />} label="Roles activos" value={roles.filter((role) => role.active).length} detail={`${roles.length} roles configurados`} />
        <CompactMetric icon={<SlidersHorizontal size={17} />} label="Configuraciones listas" value={`${configuredItems}/${configItems.length}`} detail={`${pendingItems} pendientes`} tone={pendingItems ? "amber" : "default"} />
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <button className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 text-left hover:border-apex hover:bg-paper" onClick={() => setActiveModal("users")} type="button"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><Users size={18} /></span><span><span className="block text-sm font-semibold">Usuarios</span><span className="text-xs text-neutral-500">Accesos y fichas maestras</span></span></button>
        <button className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 text-left hover:border-apex hover:bg-paper" onClick={() => setActiveModal("roles")} type="button"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><Shield size={18} /></span><span><span className="block text-sm font-semibold">Roles y permisos</span><span className="text-xs text-neutral-500">Gobierno de acceso</span></span></button>
        <Link className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 hover:border-apex hover:bg-paper" href="/dashboard/administracion/suscripciones"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><Building2 size={18} /></span><span><span className="block text-sm font-semibold">Empresas y modulos</span><span className="text-xs text-neutral-500">Suscripciones y habilitaciones</span></span></Link>
        <button className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 text-left hover:border-apex hover:bg-paper" onClick={() => setActiveModal("masters")} type="button"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><Database size={18} /></span><span><span className="block text-sm font-semibold">Maestros</span><span className="text-xs text-neutral-500">Catalogos transversales</span></span></button>
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Catalogo administrativo</h2><p className="mt-1 text-sm text-neutral-600">Encuentra configuraciones por nombre, categoria o estado.</p></div><p className="text-sm text-neutral-500">{filteredConfigItems.length} de {configItems.length}</p></div>
          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(240px,1fr)_230px_180px]">
            <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar configuracion, modulo o tarea" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas las categorias</option>{categories.map((category) => <option key={category.key} value={category.key}>{category.title}</option>)}</select>
            <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={configStatusFilter} onChange={(event) => setConfigStatusFilter(event.target.value)}><option value="all">Todos los estados</option><option value="configurado">Configurados</option><option value="activo">Activos</option><option value="pendiente">Pendientes</option><option value="restringido">Restringidos</option></select>
          </div>
          {activeConfigFilters ? <button className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-700 hover:bg-paper" onClick={clearConfigFilters} type="button"><RotateCcw size={15} /> Limpiar {activeConfigFilters} filtro(s)</button> : null}
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {filteredConfigItems.map((item) => {
            const Icon = item.categoryIcon;
            const content = <><div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex"><Icon size={17} /></span><span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span></div><p className="mt-3 font-semibold">{item.title}</p><p className="mt-1 text-xs text-neutral-500">{item.categoryTitle}</p><p className="mt-2 text-sm text-neutral-600">{item.description}</p></>;
            return item.href ? <Link className="rounded-md border border-line p-4 hover:border-apex hover:bg-paper" href={item.href} key={item.key}>{content}</Link> : <button className="rounded-md border border-line p-4 text-left hover:border-apex hover:bg-paper" key={item.key} onClick={() => openConfig(item)} type="button">{content}</button>;
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-3">Configuracion</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Proposito</th><th className="px-4 py-3 text-right">Accion</th></tr></thead>
            <tbody className="divide-y divide-line">
              {filteredConfigItems.map((item) => {
                const Icon = item.categoryIcon;
                return <tr className="hover:bg-paper/70" key={item.key}><td className="px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-paper text-apex"><Icon size={16} /></span><p className="font-semibold">{item.title}</p></div></td><td className="px-4 py-3 text-neutral-600">{item.categoryTitle}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span></td><td className="max-w-md px-4 py-3 text-neutral-600">{item.description}</td><td className="px-4 py-3 text-right">{item.href ? <Link className="inline-flex h-9 items-center rounded-md border border-line px-3 text-xs font-semibold hover:border-apex hover:bg-paper" href={item.href}>Abrir panel</Link> : <button className="h-9 rounded-md border border-line px-3 text-xs font-semibold hover:border-apex hover:bg-paper" onClick={() => openConfig(item)} type="button">Configurar</button>}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
        {!filteredConfigItems.length ? <div className="p-10 text-center"><Filter className="mx-auto text-neutral-300" size={28} /><p className="mt-3 text-sm font-semibold">No hay configuraciones con estos filtros</p><p className="mt-1 text-sm text-neutral-500">Limpia los filtros para volver al catalogo completo.</p></div> : null}
      </section>

      {activeModal === "info" && selectedConfig ? (
        <ModalFrame title={selectedConfig.title} onClose={() => setActiveModal(null)} maxWidth="md:max-w-3xl">
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">{selectedConfig.description}</p>
            <div className="rounded-md border border-line p-3">
              <p className="text-sm font-semibold">Estado</p>
              <p className="mt-1 text-sm text-neutral-600">{selectedConfig.status === "pendiente" ? "Preparado como acceso administrativo sin exponer formularios incompletos." : "Disponible con la logica actual de APEX-OS."}</p>
            </div>
            {selectedConfig.href ? (
              <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" href={selectedConfig.href}>
                <SlidersHorizontal size={16} />
                Abrir configuracion
              </Link>
            ) : (
              <p className="rounded-md bg-paper p-3 text-sm text-neutral-600">Esta configuracion queda agrupada para activarse cuando exista una base funcional compatible.</p>
            )}
          </div>
        </ModalFrame>
      ) : null}

      {activeModal === "roles" ? (
        <ModalFrame title="Roles y permisos" onClose={() => setActiveModal(null)} maxWidth="md:max-w-7xl">
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <aside className="space-y-2">
              <Button className="w-full" onClick={newRole} type="button"><Plus size={16} /> Nuevo rol</Button>
              {roles.map((role) => (
                <button className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedRoleId === role.id ? "border-apex bg-paper" : "border-line hover:bg-paper"}`} key={role.id} onClick={() => selectRole(role)} type="button">
                  <span className="block font-semibold">{role.name}</span>
                  <span className="mt-1 block text-xs text-neutral-500">{role.active ? "Activo" : "Inactivo"} · {role.description || "Sin descripcion"}</span>
                </button>
              ))}
            </aside>
            <section className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{selectedRole ? selectedRole.name : "Nuevo rol"}</h3>
                  <p className="text-sm text-neutral-500">{roleImpact.modules} modulo(s), {roleImpact.actions} permiso(s), {roleImpact.critical} critico(s).</p>
                </div>
                <Button onClick={saveRole} type="button"><Save size={16} /> Guardar</Button>
              </div>
              <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Nombre del rol" value={roleForm.name} onChange={(value) => setRoleForm((prev) => ({ ...prev, name: value }))} />
                <Field label="Descripcion" value={roleForm.description} onChange={(value) => setRoleForm((prev) => ({ ...prev, description: value }))} />
                <Field label="Nivel jerarquico" type="number" value={roleForm.hierarchy_level} onChange={(value) => setRoleForm((prev) => ({ ...prev, hierarchy_level: value }))} />
                <SelectField label="Tipo de rol" value={roleForm.role_type} onChange={(value) => setRoleForm((prev) => ({ ...prev, role_type: value }))} options={[["custom", "Personalizado"], ...(platformAdmin ? [["superadmin", "Superadmin"] as [string, string]] : []), ["admin_empresa", "Admin empresa"], ["gerencia", "Gerencia"], ["coordinador", "Coordinador"], ["supervisor", "Supervisor"], ["operativo", "Operativo"], ["analista", "Analista"], ["comercial", "Comercial"], ["auditor", "Auditor"], ["soporte", "Soporte"]]} />
                <SelectField label="Alcance" value={roleForm.scope} onChange={(value) => setRoleForm((prev) => ({ ...prev, scope: value }))} options={[["company", "Empresa"], ["location", "Sede"], ["area", "Area"], ["cost_center", "Centro de costo"], ["process", "Proceso"]]} />
                <SelectField label="Copiar desde rol" value="" onChange={copyRole} options={[["", "Seleccionar rol base"], ...roles.map((role) => [String(role.id), role.name] as [string, string])]} />
                <Toggle label="Puede delegar permisos" checked={roleForm.can_delegate} onChange={(value) => setRoleForm((prev) => ({ ...prev, can_delegate: value }))} />
                <Toggle label="Acceso sensible" checked={roleForm.sensitive} onChange={(value) => setRoleForm((prev) => ({ ...prev, sensitive: value }))} />
                <Field label="Sedes permitidas" value={listToCsv(roleForm.scopes.locations)} onChange={(value) => setRoleForm((prev) => ({ ...prev, scopes: { ...prev.scopes, locations: csvToList(value) } }))} />
                <Field label="Areas permitidas" value={listToCsv(roleForm.scopes.areas)} onChange={(value) => setRoleForm((prev) => ({ ...prev, scopes: { ...prev.scopes, areas: csvToList(value) } }))} />
                <Field label="Centros costo permitidos" value={listToCsv(roleForm.scopes.cost_centers)} onChange={(value) => setRoleForm((prev) => ({ ...prev, scopes: { ...prev.scopes, cost_centers: csvToList(value) } }))} />
                <Field label="Procesos permitidos" value={listToCsv(roleForm.scopes.processes)} onChange={(value) => setRoleForm((prev) => ({ ...prev, scopes: { ...prev.scopes, processes: csvToList(value) } }))} />
              </div>
              <div className="mb-4 grid gap-3 rounded-md border border-line bg-paper p-3 md:grid-cols-[1fr_180px_150px]">
                <Field label="Buscar permiso" value={roleFilter} onChange={setRoleFilter} />
                <SelectField label="Grupo" value={roleGroupFilter} onChange={setRoleGroupFilter} options={[["all", "Todos"], ...roleGroups.map((group) => [group, group] as [string, string])]} />
                <SelectField label="Vista" value={roleActionMode} onChange={(value) => setRoleActionMode(value as "compact" | "full")} options={[["compact", "Compacta"], ["full", "Completa"]]} />
              </div>
              <div className="max-h-[58vh] overflow-auto rounded-md border border-line">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-line text-left text-xs text-neutral-500">
                      <th className="py-2 pl-3">Modulo</th>
                      {visibleRoleActions.map((action) => <th className="py-2 text-center" key={action}>{actionLabels[action]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoleCatalog.map((item) => (
                      <tr className="border-b border-line/70" key={item.key}>
                        <td className="py-2 pl-3">
                          <span className="block font-medium">{item.label}</span>
                          <span className="text-xs text-neutral-500">{item.group || "general"} · {item.module || item.key}{item.submodule ? `/${item.submodule}` : ""}</span>
                        </td>
                        {visibleRoleActions.map((action) => (
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
            </section>
          </div>
        </ModalFrame>
      ) : null}

      {activeModal === "masters" ? (
        <ModalFrame title="Maestros de plataforma" onClose={() => setActiveModal(null)} maxWidth="md:max-w-6xl">
          {renderMasterCatalogManager()}
        </ModalFrame>
      ) : null}

      {activeModal === "users" ? (
        <ModalFrame title={userEditorOpen ? (selectedUserId ? "Editar usuario" : "Crear usuario") : "Usuarios de plataforma"} onClose={() => { setActiveModal(null); setUserEditorOpen(false); }} maxWidth="md:max-w-7xl">
          {userEditorOpen ? renderUserEditor() : renderUserDirectory()}
          {false && (
          <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
            <aside className="space-y-3">
              <Button className="w-full" onClick={newUser} type="button"><Plus size={16} /> Nuevo usuario</Button>
              <div className="max-h-[64vh] space-y-2 overflow-y-auto pr-1">
                {users.map((user) => (
                  <button className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedUserId === user.id ? "border-apex bg-paper" : "border-line hover:bg-paper"}`} key={user.id} onClick={() => selectUser(user)} type="button">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{user.name}</span>
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{user.active ? "Activo" : "Inactivo"}</span>
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500">{user.email} · {user.role_name || "Sin rol"}</span>
                  </button>
                ))}
              </div>
            </aside>
            <section className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{selectedUserId ? "Editar usuario" : "Crear usuario"}</h3>
                  <p className="text-sm text-neutral-500">Score maestro: {userScore}/100</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedUserId ? <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" onClick={requestPasswordReset} type="button"><LockKeyhole size={16} /> Reset acceso</Button> : null}
                  {selectedUserId ? <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" onClick={blockUserAccess} type="button"><X size={16} /> Bloquear acceso</Button> : null}
                  {selectedUserId && selectedUser?.active ? <Button className="bg-rose-700 hover:bg-rose-800" onClick={() => setUserStatus(false)} type="button"><X size={16} /> Desactivar</Button> : null}
                  {selectedUserId && selectedUser && !selectedUser.active ? <Button onClick={() => setUserStatus(true)} type="button"><Check size={16} /> Activar</Button> : null}
                  <Button onClick={saveUser} type="button"><Save size={16} /> Guardar</Button>
                </div>
              </div>
              <div className="mb-4 flex gap-2 overflow-x-auto rounded-md border border-line bg-white p-1">
                {[
                  ["basicos", "Datos basicos", UserCog],
                  ["acceso", "Acceso y permisos", Shield],
                  ["laboral", "Datos laborales", FolderKanban],
                  ["operacion", "Operacion", Route],
                  ["documentos", "Documentos", FileText],
                  ["auditoria", "Auditoria", Activity]
                ].map(([key, label, Icon]) => {
                  const TabIcon = Icon as typeof UserCog;
                  return (
                    <button className={`flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold ${userTab === key ? "bg-apex text-white" : "text-neutral-700 hover:bg-paper"}`} key={String(key)} onClick={() => setUserTab(key as UserTab)} type="button">
                      <TabIcon size={15} />
                      {String(label)}
                    </button>
                  );
                })}
              </div>
              {renderUserTab()}
            </section>
          </div>
          )}
        </ModalFrame>
      ) : null}
    </div>
  );
}
