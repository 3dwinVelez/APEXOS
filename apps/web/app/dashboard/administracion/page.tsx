"use client";

import { Button } from "@/components/ui/button";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { api, fallbackAdminPermissionCatalog } from "@/lib/api";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { getUserDocumentUrl, uploadUserDocument } from "@/lib/supabaseStorage";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  Check,
  CreditCard,
  Database,
  Download,
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
  Trash2,
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
type MasterOption = { code: string; name: string; description?: string; active?: boolean; sort_order?: number };
type ServiceType = { code: string; label: string; active?: boolean };
type ServiceStore = { code: string; label: string; active?: boolean };
type SatisfactionQuestion = { id: string; label: string; active?: boolean };
type PlatformLog = {
  id: string;
  at: string;
  source: "api" | "backend" | "frontend" | string;
  level: "info" | "warning" | "error" | string;
  module: string;
  route: string;
  method?: string;
  status_code?: number | null;
  code?: string;
  message: string;
  request_id?: string;
  detail?: string;
};
type ToastState = { title: string; detail?: string; tone: "success" | "warning" | "error" | "info" };
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
  modal: "roles" | "users" | "masters" | "logs" | "info";
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
  delete_physical_records: "Borrado fisico",
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

const roleActions = ["access", "view", "create", "edit", "delete", "delete_physical_records", "approve", "reject", "void", "export", "import", "attach", "download", "configure", "administer", "execute", "reports", "sensitive", "manage_users", "manage_roles"];
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

const defaultServiceStores: ServiceStore[] = [
  { code: "hogar_y_moda_1", label: "Hogar y Moda 1", active: true },
  { code: "hogar_y_moda_2", label: "Hogar y Moda 2", active: true }
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

function normalizeServiceStores(items: ServiceStore[] = []) {
  const map = new Map<string, ServiceStore>();
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
      { key: "almacenes-servicio", title: "Almacenes de servicio", description: "Catalogo usado en solicitudes externas y ordenes de servicio.", status: "configurado", modal: "masters" },
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
      { key: "supabase", title: "Supabase", description: "Conexion Auth, Storage y RLS.", status: "activo", modal: "info" },
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
      { key: "logs", title: "Logs tecnicos", description: "Errores de API, backend y frontend con trazabilidad de soporte.", status: "activo", modal: "logs" },
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

function normalizeRolePermissions(catalog: CatalogItem[], permissions?: Record<string, Record<string, boolean>>) {
  const base = emptyPermissions(catalog);
  for (const item of catalog) {
    for (const action of item.actions) {
      base[item.key][action] = Boolean(permissions?.[item.key]?.[action]);
    }
  }
  return base;
}

function storedRolePermissions() {
  if (typeof window === "undefined") return [] as Array<{ module?: string; action?: string }>;
  try {
    const parsed = JSON.parse(localStorage.getItem("role_permissions") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function canDeletePhysicalDocuments() {
  return storedRolePermissions().some((permission) => {
    const permissionModule = String(permission.module || "").toLowerCase();
    const action = String(permission.action || "").toLowerCase();
    return (permissionModule === "*" || permissionModule === "admin") && (action === "*" || action === "delete_physical_records");
  });
}

function normalizeRoleNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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

function splitFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_names: parts[0] || "", last_names: "" };
  return { first_names: parts.slice(0, -1).join(" "), last_names: parts.slice(-1).join(" ") };
}

function quickUserPayload(form: UserForm, roles: Role[], includePassword: boolean) {
  const names = splitFullName(form.name || `${form.first_names} ${form.last_names}`.trim());
  const role = roles.find((item) => item.id === Number(form.role_id));
  const payload: Record<string, unknown> = {
    name: form.name || `${form.first_names} ${form.last_names}`.trim(),
    first_names: form.first_names || names.first_names,
    last_names: form.last_names || names.last_names,
    email: form.email,
    access_email: form.email,
    document: form.document,
    document_type: form.document_type || "CC",
    company: form.company,
    site: form.site,
    base_site: form.site || form.base_site,
    role_id: form.role_id ? String(form.role_id) : undefined,
    role_name: role?.name,
    user_status: form.user_status,
    require_password_change: form.require_password_change
  };
  if (includePassword) payload.password = form.password;
  return payload;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <input checked={checked} className="h-4 w-4 accent-apex" type="checkbox" onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export default function AdministracionPage() {
  const initializedRole = useRef(false);
  const toastTimer = useRef<number | null>(null);
  const [activeModal, setActiveModal] = useState<"roles" | "users" | "masters" | "logs" | "info" | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<ConfigItem | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [configStatusFilter, setConfigStatusFilter] = useState("all");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [masterData, setMasterData] = useState<UserMasterData>(fallbackUserMasterData);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>(defaultServiceTypes);
  const [serviceStores, setServiceStores] = useState<ServiceStore[]>(defaultServiceStores);
  const [satisfactionQuestions, setSatisfactionQuestions] = useState<SatisfactionQuestion[]>(defaultSatisfactionQuestions);
  const [platformLogs, setPlatformLogs] = useState<PlatformLog[]>([]);
  const [logSourceFilter, setLogSourceFilter] = useState("all");
  const [logLevelFilter, setLogLevelFilter] = useState("all");
  const [logModuleFilter, setLogModuleFilter] = useState("all");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm([]));
  const [roleFilter, setRoleFilter] = useState("");
  const [roleGroupFilter, setRoleGroupFilter] = useState("all");
  const [roleActionMode, setRoleActionMode] = useState<"compact" | "full">("compact");
  const [roleCatalogWarning, setRoleCatalogWarning] = useState("");
  const [userForm, setUserForm] = useState<UserForm>(emptyUser);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userTab, setUserTab] = useState<UserTab>("basicos");
  const [userEditorOpen, setUserEditorOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [documentDraft, setDocumentDraft] = useState({ document_type: "identity", file_name: "", file_url: "", storage_path: "", mime_type: "", file_size: "", observations: "" });
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const [catalogDraft, setCatalogDraft] = useState({ catalog: "positions", code: "", name: "", description: "" });
  const [editingCatalogCode, setEditingCatalogCode] = useState<string | null>(null);
  const [catalogSaving, setCatalogSaving] = useState("");
  const [catalogNotice, setCatalogNotice] = useState<ToastState | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [userAccessSaving, setUserAccessSaving] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((title: string, detail?: string, tone: ToastState["tone"] = "success") => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ title, detail, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const confirmCatalogAction = useCallback((title: string, detail?: string, tone: ToastState["tone"] = "success") => {
    setCatalogNotice({ title, detail, tone });
    setMessage(detail ? `${title}. ${detail}` : title);
    notify(title, detail, tone);
  }, [notify]);

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
  const configItems = useMemo(() => categories.flatMap((category) => category.items.map((item) => ({ ...item, categoryKey: category.key, categoryTitle: category.title, categoryIcon: category.icon }))), []);
  const visibleConfigItems = useMemo(() => configItems.filter((item) => item.key !== "empresas" || platformAdmin), [configItems, platformAdmin]);
  const filteredConfigItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return visibleConfigItems.filter((item) => {
      const matchesCategory = categoryFilter === "all" || item.categoryKey === categoryFilter;
      const matchesStatus = configStatusFilter === "all" || item.status === configStatusFilter;
      const text = `${item.categoryTitle} ${item.title} ${item.description}`.toLowerCase();
      return matchesCategory && matchesStatus && (!term || text.includes(term));
    });
  }, [categoryFilter, configStatusFilter, query, visibleConfigItems]);
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
  const logModules = useMemo(() => Array.from(new Set(platformLogs.map((item) => item.module || "platform").filter(Boolean))).sort(), [platformLogs]);
  const filteredPlatformLogs = useMemo(() => platformLogs.filter((item) => {
    const matchesSource = logSourceFilter === "all" || item.source === logSourceFilter;
    const matchesLevel = logLevelFilter === "all" || item.level === logLevelFilter;
    const matchesModule = logModuleFilter === "all" || item.module === logModuleFilter;
    return matchesSource && matchesLevel && matchesModule;
  }), [logLevelFilter, logModuleFilter, logSourceFilter, platformLogs]);
  const visibleRoleActions = roleActionMode === "full" ? roleActions : compactRoleActions;
  const filteredRoleCatalog = useMemo(() => {
    const term = roleFilter.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesGroup = roleGroupFilter === "all" || (item.group || "general") === roleGroupFilter;
      const text = `${item.label} ${item.key} ${item.group || ""} ${item.module || ""} ${item.submodule || ""}`.toLowerCase();
      return matchesGroup && (!term || text.includes(term));
    });
  }, [catalog, roleFilter, roleGroupFilter]);
  const assignedRoleUsers = useMemo(() => users.filter((user) => selectedRoleId && Number(user.role_id) === selectedRoleId), [selectedRoleId, users]);
  const roleFormSummary = useMemo(() => {
    const entries = Object.values(roleForm.permissions);
    const modules = entries.filter((actions) => Object.values(actions).some(Boolean)).length;
    const actions = entries.reduce((count, permissions) => count + Object.values(permissions).filter(Boolean).length, 0);
    return { modules, actions };
  }, [roleForm.permissions]);
  const activeRoleCount = useMemo(() => roles.filter((role) => role.active).length, [roles]);
  const selectedRoleLocked = Boolean(selectedRole?.name === "APEX_ADMIN" || selectedRole?.is_system);
  const activeConfigFilters = [query.trim(), categoryFilter !== "all" ? categoryFilter : "", configStatusFilter !== "all" ? configStatusFilter : ""].filter(Boolean).length;
  const activeLogFilters = [logSourceFilter !== "all" ? "fuente" : "", logLevelFilter !== "all" ? "severidad" : "", logModuleFilter !== "all" ? "modulo" : ""].filter(Boolean).length;

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
    const [catalogResult, rolesResult, usersResult, masterResult, serviceTypesResult, serviceStoresResult, satisfactionQuestionsResult, platformLogsResult] = await Promise.allSettled([
      api<CatalogItem[]>("/api/v1/admin/permissions/catalog"),
      api<Role[]>("/api/v1/admin/roles"),
      api<AdminUser[]>("/api/v1/admin/users"),
      api<UserMasterData>("/api/v1/admin/user-master-data"),
      api<ServiceType[]>("/api/v1/services/service-types"),
      api<ServiceStore[]>("/api/v1/services/service-stores"),
      api<SatisfactionQuestion[]>("/api/v1/services/satisfaction-questions"),
      api<PlatformLog[]>("/api/v1/admin/platform-logs?limit=120")
    ]);
    const localCatalog = fallbackAdminPermissionCatalog() as CatalogItem[];
    const catalogData = catalogResult.status === "fulfilled" && catalogResult.value.length ? catalogResult.value : localCatalog;
    const rolesData = rolesResult.status === "fulfilled" ? rolesResult.value : [];
    const usersData = usersResult.status === "fulfilled" ? usersResult.value : [];
    const masterDataResult = masterResult.status === "fulfilled" ? masterResult.value : fallbackUserMasterData;
    const serviceTypesData = serviceTypesResult.status === "fulfilled" ? normalizeServiceTypes(serviceTypesResult.value) : defaultServiceTypes;
    const serviceStoresData = serviceStoresResult.status === "fulfilled" ? normalizeServiceStores(serviceStoresResult.value) : defaultServiceStores;
    const satisfactionQuestionsData = satisfactionQuestionsResult.status === "fulfilled" ? normalizeSatisfactionQuestions(satisfactionQuestionsResult.value) : defaultSatisfactionQuestions;
    const platformLogsData = platformLogsResult.status === "fulfilled" ? platformLogsResult.value : [];
    setCatalog(catalogData);
    setRoles(rolesData);
    setUsers(usersData);
    setMasterData({ ...fallbackUserMasterData, ...masterDataResult });
    setServiceTypes(serviceTypesData.length ? serviceTypesData : defaultServiceTypes);
    setServiceStores(serviceStoresData.length ? serviceStoresData : defaultServiceStores);
    setSatisfactionQuestions(satisfactionQuestionsData.length ? satisfactionQuestionsData : defaultSatisfactionQuestions);
    setPlatformLogs(platformLogsData);
    setRoleCatalogWarning(catalogResult.status === "fulfilled" && catalogResult.value.length
      ? ""
      : "Catalogo remoto de permisos no disponible o vacio. Se activo el catalogo funcional local para evitar una matriz sin permisos.");
    const errors = [
      catalogResult.status === "rejected" ? "catalogo remoto de permisos" : "",
      rolesResult.status === "rejected" ? "roles" : "",
      usersResult.status === "rejected" ? "usuarios" : "",
      masterResult.status === "rejected" ? "maestros de usuario" : "",
      serviceTypesResult.status === "rejected" ? "tipos de servicio" : "",
      serviceStoresResult.status === "rejected" ? "almacenes de servicio" : "",
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
        permissions: normalizeRolePermissions(catalogData, initialRole.permissions)
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

  async function refreshPlatformLogs() {
    try {
      const rows = await api<PlatformLog[]>("/api/v1/admin/platform-logs?limit=120");
      setPlatformLogs(rows);
      setMessage("Logs tecnicos actualizados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible actualizar logs tecnicos.");
    }
  }

  function clearLogFilters() {
    setLogSourceFilter("all");
    setLogLevelFilter("all");
    setLogModuleFilter("all");
  }

  function exportLogsToTxt() {
    if (!filteredPlatformLogs.length) {
      setMessage("No hay logs para exportar con los filtros actuales.");
      return;
    }
    const header = ["Fecha", "Fuente", "Severidad", "Modulo", "Ruta", "Metodo", "Codigo", "Mensaje", "Detalle", "Request ID"].join("\t");
    const rows = filteredPlatformLogs.map((item) => [
      item.at ? new Date(item.at).toISOString() : "Sin fecha",
      item.source,
      item.level,
      item.module || "platform",
      item.route || "-",
      item.method || "",
      item.status_code || "",
      item.message || "Evento tecnico",
      (item.detail || "").replace(/\n/g, " | ").replace(/\t/g, " "),
      item.request_id || "-"
    ].join("\t"));
    const txt = [header, ...rows].join("\n");
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `platform-logs-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function openConfig(item: ConfigItem) {
    setSelectedConfig(item);
    if (item.key === "almacenes-servicio") {
      setCatalogDraft((current) => ({ ...current, catalog: "service_stores", code: "", name: "", description: "" }));
    }
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
      permissions: normalizeRolePermissions(catalog, role.permissions)
    });
  }

  function newRole() {
    setSelectedRoleId(null);
    setRoleForm(emptyRoleForm(catalog));
    setMessage("");
    notify("Nuevo rol listo", "Completa el formulario y guarda la matriz de permisos.", "info");
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
      permissions: normalizeRolePermissions(catalog, role.permissions)
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

  function setVisiblePermissions(enabled: boolean) {
    if (selectedRoleLocked) return;
    setRoleForm((current) => {
      const permissions = { ...current.permissions };
      filteredRoleCatalog.forEach((item) => {
        const currentActions = { ...(permissions[item.key] || {}) };
        visibleRoleActions.forEach((action) => {
          if (item.actions.includes(action)) currentActions[action] = enabled;
        });
        permissions[item.key] = currentActions;
      });
      return { ...current, permissions };
    });
    notify(enabled ? "Permisos visibles marcados" : "Permisos visibles limpiados", `${filteredRoleCatalog.length} modulo(s) afectados por los filtros actuales.`, "info");
  }

  async function saveRole() {
    if (roleSaving) return;
    if (!roleForm.name.trim()) {
      setMessage("El nombre del rol es obligatorio.");
      notify("Nombre requerido", "Asigna un nombre antes de guardar el rol.", "warning");
      return;
    }
    const roleNameKey = normalizeRoleNameKey(roleForm.name);
    const duplicate = roles.find((role) => role.id !== selectedRoleId && normalizeRoleNameKey(role.name) === roleNameKey);
    if (duplicate) {
      setMessage(`Ya existe un rol visualmente igual: "${duplicate.name}". Edita ese rol o usa otro nombre.`);
      notify("Rol duplicado bloqueado", `Ya existe "${duplicate.name}" con el mismo nombre visual.`, "warning");
      return;
    }
    const normalizedPermissions = normalizeRolePermissions(catalog, roleForm.permissions);
    const hasSensitivePermission = Object.values(normalizedPermissions).some((actions) => actions.sensitive);
    const payload = {
      ...roleForm,
      name: roleForm.name.trim().replace(/\s+/g, " "),
      hierarchy_level: Number(roleForm.hierarchy_level || 10),
      can_delegate: false,
      sensitive: hasSensitivePermission,
      permissions: normalizedPermissions
    };
    setRoleSaving(true);
    try {
      const savedRole = selectedRoleId
        ? await api<Role>(`/api/v1/admin/roles/${selectedRoleId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Role>("/api/v1/admin/roles", { method: "POST", body: JSON.stringify(payload) });
      setSelectedRoleId(savedRole.id);
      setRoleForm({
        ...emptyRoleForm(catalog),
        name: savedRole.name,
        description: savedRole.description || "",
        active: savedRole.active,
        hierarchy_level: String(savedRole.hierarchy_level || 10),
        role_type: savedRole.role_type || "custom",
        scope: savedRole.scope || "company",
        scopes: roleScopesFrom(savedRole, "scopes"),
        restrictions: roleScopesFrom(savedRole, "restrictions"),
        can_delegate: Boolean(savedRole.can_delegate),
        sensitive: Boolean(savedRole.sensitive),
        permissions: normalizeRolePermissions(catalog, savedRole.permissions)
      });
      const actionTitle = selectedRoleId ? "Rol actualizado" : "Rol creado";
      await load();
      setMessage(`Rol "${savedRole.name}" guardado correctamente.`);
      notify(actionTitle, `"${savedRole.name}" quedo guardado con ${roleFormSummary.modules} modulo(s) y ${roleFormSummary.actions} permiso(s).`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error al guardar el rol.";
      setMessage(errorMessage);
      notify("No se pudo guardar el rol", errorMessage, "error");
    } finally {
      setRoleSaving(false);
    }
  }

  async function deleteRole() {
    if (!selectedRole) {
      setMessage("Selecciona un rol para eliminar.");
      notify("Selecciona un rol", "Debes elegir un rol antes de eliminar.", "warning");
      return;
    }
    if (selectedRole.name === "APEX_ADMIN" || selectedRole.is_system) {
      setMessage("Los roles de sistema no se pueden eliminar.");
      notify("Rol protegido", "Los roles de sistema no se pueden eliminar.", "warning");
      return;
    }
    if (assignedRoleUsers.length) {
      setMessage(`No se puede eliminar "${selectedRole.name}" porque tiene ${assignedRoleUsers.length} usuario(s) asignado(s).`);
      notify("Rol con usuarios asignados", `Reasigna ${assignedRoleUsers.length} usuario(s) antes de eliminarlo.`, "warning");
      return;
    }
    if (!window.confirm(`Confirmas eliminar el rol "${selectedRole.name}"? Esta accion retirara sus permisos y no se puede deshacer.`)) return;
    setRoleSaving(true);
    try {
      await api(`/api/v1/admin/roles/${selectedRole.id}`, { method: "DELETE" });
      setSelectedRoleId(null);
      setRoleForm(emptyRoleForm(catalog));
      await load();
      setMessage(`Rol "${selectedRole.name}" eliminado correctamente.`);
      notify("Rol eliminado", `"${selectedRole.name}" fue retirado correctamente.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error al eliminar el rol.";
      setMessage(errorMessage);
      notify("No se pudo eliminar el rol", errorMessage, "error");
    } finally {
      setRoleSaving(false);
    }
  }

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
    setUserForm(userToForm(user));
    setUserTab("basicos");
    setUserEditorOpen(true);
  }

  function newUser() {
    const companyName = typeof window !== "undefined" ? (localStorage.getItem("apexos_company_name") || localStorage.getItem("company_name") || "Nyvora") : "Nyvora";
    setSelectedUserId(null);
    setUserForm({ ...emptyUser, company: companyName });
    setUserTab("basicos");
    setSelectedDocumentFile(null);
    setUserEditorOpen(true);
  }

  function validateUser() {
    if (!userForm.name.trim() && !`${userForm.first_names} ${userForm.last_names}`.trim()) return "El nombre es obligatorio.";
    if (!userForm.email.trim()) return "El correo es obligatorio.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email.trim())) return "El correo debe tener un formato valido.";
    if (!selectedUserId && users.some((user) => user.email.trim().toLowerCase() === userForm.email.trim().toLowerCase())) return "Ya existe un usuario con este correo.";
    if (!userForm.company.trim()) return "La empresa es obligatoria.";
    if (!userForm.role_id) return "El rol principal es obligatorio.";
    if (!userForm.document.trim()) return "El documento es obligatorio.";
    if (!selectedUserId && !userForm.password) return "La clave inicial es obligatoria.";
    if (userForm.password && userForm.password.length < 8) return "La clave debe tener minimo 8 caracteres.";
    if (userForm.password && (!/[A-Za-z]/.test(userForm.password) || !/[0-9]/.test(userForm.password))) return "La clave debe combinar letras y numeros.";
    return "";
  }

  async function saveUser() {
    const validation = validateUser();
    if (validation) {
      setMessage(validation);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const payload = quickUserPayload(userForm, roles, !selectedUserId);
      if (selectedUserId && userForm.password) {
        payload.password = userForm.password;
        payload.require_password_change = true;
      }
      if (selectedUserId) await api(`/api/v1/admin/users/${selectedUserApiId()}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/api/v1/admin/users", { method: "POST", body: JSON.stringify(payload) });
      setMessage("Usuario guardado.");
      setSelectedUserId(null);
      setUserForm(emptyUser);
      setUserTab("basicos");
      setUserEditorOpen(false);
      setTimeout(() => load(), 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al guardar el usuario. Revisa los datos e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  function userApiId(user: AdminUser) {
    return isSupabaseSession() && user.employee_uuid ? user.employee_uuid : user.id;
  }

  async function setUserStatusDirect(user: AdminUser, active: boolean) {
    if (!active && !window.confirm(`Confirmas inactivar a ${user.name} sin eliminar su historial?`)) return;
    try {
      await api(`/api/v1/admin/users/${userApiId(user)}/status`, { method: "PATCH", body: JSON.stringify({ active }) });
      setMessage(active ? `${user.name} fue activado.` : `${user.name} fue inactivado.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al cambiar estado del usuario.");
    }
  }

  async function suspendUserDirect(user: AdminUser) {
    if (!window.confirm(`Confirmas suspender el acceso de ${user.name}?`)) return;
    try {
      await api(`/api/v1/admin/users/${userApiId(user)}/access`, { method: "PATCH", body: JSON.stringify({ session_status: "bloqueada", active: false }) });
      setMessage(`Acceso suspendido para ${user.name}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al suspender acceso del usuario.");
    }
  }

  async function setUserStatus(active: boolean) {
    const targetId = selectedUserApiId();
    if (!targetId) return;
    if (!active && !window.confirm("Confirmas desactivar este usuario sin eliminar su historial?")) return;
    try {
      await api(`/api/v1/admin/users/${targetId}/status`, { method: "PATCH", body: JSON.stringify({ active }) });
      setMessage(active ? "Usuario activado." : "Usuario desactivado.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al cambiar estado del usuario.");
    }
  }

  function selectedUserApiId() {
    return isSupabaseSession() && selectedUser?.employee_uuid ? selectedUser.employee_uuid : selectedUserId;
  }

  async function blockUserAccess() {
    const targetId = selectedUserApiId();
    if (!targetId) return;
    try {
      await api(`/api/v1/admin/users/${targetId}/access`, { method: "PATCH", body: JSON.stringify({ session_status: "bloqueada", active: false }) });
      setMessage("Acceso de usuario bloqueado.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al bloquear acceso del usuario.");
    }
  }

  async function requestPasswordReset() {
    const targetId = selectedUserApiId();
    if (!targetId) return;
    const nextPassword = userForm.password.trim();
    if (!nextPassword) {
      setMessage("Escribe una nueva clave temporal antes de cambiar el acceso.");
      notify("Clave temporal requerida", "Debes escribir la clave temporal que se entregara al usuario.", "warning");
      return;
    }
    if (nextPassword.length < 8 || !/[A-Za-z]/.test(nextPassword) || !/[0-9]/.test(nextPassword)) {
      setMessage("La clave temporal debe tener minimo 8 caracteres y combinar letras y numeros.");
      notify("Clave temporal invalida", "Usa minimo 8 caracteres con letras y numeros.", "warning");
      return;
    }
    if (!window.confirm(`Confirmas cambiar la clave de acceso de ${selectedUser?.name || "este usuario"}? El usuario debera cambiarla al ingresar.`)) return;
    if (userAccessSaving) return;
    setUserAccessSaving(true);
    try {
      await api(`/api/v1/admin/users/${targetId}/access`, { method: "PATCH", body: JSON.stringify({ password: nextPassword, require_password_change: true, session_status: "sin_sesion" }) });
      setMessage("Clave temporal actualizada. El usuario debera cambiarla en el proximo ingreso.");
      notify("Clave actualizada", `La clave temporal de ${selectedUser?.name || "usuario"} quedo guardada correctamente.`);
      setUserField("password", "");
      await load();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error al cambiar la clave del usuario.";
      setMessage(errorMessage);
      notify("No se pudo cambiar la clave", errorMessage, "error");
    } finally {
      setUserAccessSaving(false);
    }
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
    try {
      await api<AdminUser>(`/api/v1/admin/users/${targetId}/documents`, {
        method: "POST",
        body: JSON.stringify({ ...nextDraft, file_size: Number(nextDraft.file_size || 0), status: "pending" })
      });
      setDocumentDraft({ document_type: "identity", file_name: "", file_url: "", storage_path: "", mime_type: "", file_size: "", observations: "" });
      setSelectedDocumentFile(null);
      setMessage("Documento asociado al usuario.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al asociar documento.");
    }
  }

  async function removeDocument(documentId: string) {
    const targetId = selectedUserApiId();
    if (!targetId) return;
    if (!canDeletePhysicalDocuments()) {
      setMessage("No tienes permiso especial para eliminar documentos de la base.");
      return;
    }
    try {
      await api<AdminUser>(`/api/v1/admin/users/${targetId}/documents/${documentId}`, { method: "DELETE" });
      setMessage("Documento retirado del expediente.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al retirar documento.");
    }
  }

  async function openDocument(doc: UserDocument) {
    const value = doc.storage_path || doc.file_url;
    if (!value) return;
    const url = value.startsWith("user-documents/") ? await getUserDocumentUrl(value) : value;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function saveCatalogItem() {
    if (catalogSaving) return;
    const operationalCatalogs = new Set(["service_types", "service_stores", "satisfaction_questions"]);
    const isOperationalDraft = operationalCatalogs.has(catalogDraft.catalog);
    const draftCode = catalogDraft.code.trim() || (isOperationalDraft ? catalogDraft.name.trim() : "");
    if (!catalogDraft.catalog || !catalogDraft.name.trim() || (!isOperationalDraft && !catalogDraft.code.trim())) {
      confirmCatalogAction("Datos incompletos", isOperationalDraft ? "Catalogo y nombre son obligatorios." : "Catalogo, codigo y nombre son obligatorios.", "warning");
      return;
    }
    setCatalogSaving(editingCatalogCode ? "save" : "create");
    setCatalogNotice({ title: editingCatalogCode ? "Guardando cambios..." : "Creando maestro...", detail: "Estamos actualizando el catalogo. No cierres esta ventana.", tone: "info" });
    try {
      if (catalogDraft.catalog === "service_types") {
        const code = normalizeServiceTypeCode(draftCode);
        if (!code) {
          confirmCatalogAction("Codigo invalido", "El codigo del tipo de servicio debe tener letras o numeros.", "warning");
          return;
        }
        const next = normalizeServiceTypes([
          ...serviceTypes.filter((item) => item.code !== code && item.code !== editingCatalogCode),
          { code, label: catalogDraft.name.trim(), active: true }
        ]).sort((a, b) => a.label.localeCompare(b.label));
        await saveServiceTypeCatalog(next, editingCatalogCode ? `Tipo de servicio actualizado: ${catalogDraft.name.trim()}.` : `Tipo de servicio creado: ${catalogDraft.name.trim()}.`);
        resetCatalogDraft(catalogDraft.catalog);
        return;
      }
      if (catalogDraft.catalog === "service_stores") {
        const code = normalizeServiceTypeCode(draftCode);
        if (!code) {
          confirmCatalogAction("Codigo invalido", "El codigo del almacen debe tener letras o numeros.", "warning");
          return;
        }
        const next = normalizeServiceStores([
          ...serviceStores.filter((item) => item.code !== code && item.code !== editingCatalogCode),
          { code, label: catalogDraft.name.trim(), active: true }
        ]).sort((a, b) => a.label.localeCompare(b.label));
        await saveServiceStoreCatalog(next, editingCatalogCode ? `Almacen de servicio actualizado: ${catalogDraft.name.trim()}.` : `Almacen de servicio creado: ${catalogDraft.name.trim()}.`);
        resetCatalogDraft(catalogDraft.catalog);
        return;
      }
      if (catalogDraft.catalog === "satisfaction_questions") {
        const id = normalizeQuestionId(draftCode);
        if (!id) {
          confirmCatalogAction("Codigo invalido", "El codigo de la pregunta debe tener letras o numeros.", "warning");
          return;
        }
        const next = normalizeSatisfactionQuestions([
          ...satisfactionQuestions.filter((item) => item.id !== id && item.id !== editingCatalogCode),
          { id, label: catalogDraft.name.trim(), active: true }
        ]);
        await saveSatisfactionQuestionCatalog(next, editingCatalogCode ? `Pregunta de satisfaccion actualizada: ${catalogDraft.name.trim()}.` : `Pregunta de satisfaccion creada: ${catalogDraft.name.trim()}.`);
        resetCatalogDraft(catalogDraft.catalog);
        return;
      }
      const endpoint = editingCatalogCode
        ? `/api/v1/admin/user-master-data/${catalogDraft.catalog}/items/${encodeURIComponent(editingCatalogCode)}`
        : `/api/v1/admin/user-master-data/${catalogDraft.catalog}/items`;
      const next = await api<UserMasterData>(endpoint, {
        method: editingCatalogCode ? "PUT" : "POST",
        body: JSON.stringify({
          code: catalogDraft.code.trim(),
          name: catalogDraft.name.trim(),
          description: catalogDraft.description.trim(),
          active: true
        })
      });
      setMasterData({ ...fallbackUserMasterData, ...next });
      confirmCatalogAction(editingCatalogCode ? "Maestro actualizado" : "Maestro creado", `${catalogDraft.name.trim()} quedo guardado correctamente.`);
      resetCatalogDraft(catalogDraft.catalog);
    } catch (error) {
      confirmCatalogAction("No se pudo guardar el maestro", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  function resetCatalogDraft(catalog = catalogDraft.catalog) {
    setCatalogDraft({ catalog, code: "", name: "", description: "" });
    setEditingCatalogCode(null);
  }

  function editCatalogRow(item: MasterOption) {
    setCatalogDraft({
      catalog: catalogDraft.catalog,
      code: item.code,
      name: item.name,
      description: item.description || ""
    });
    setEditingCatalogCode(item.code);
  }

  async function toggleBaseCatalogItem(item: MasterOption) {
    if (catalogSaving) return;
    setCatalogSaving(`toggle:${item.code}`);
    try {
      const next = await api<UserMasterData>(`/api/v1/admin/user-master-data/${catalogDraft.catalog}/items/${encodeURIComponent(item.code)}`, {
        method: "PUT",
        body: JSON.stringify({ ...item, active: item.active === false })
      });
      setMasterData({ ...fallbackUserMasterData, ...next });
      confirmCatalogAction(item.active === false ? "Maestro activado" : "Maestro inactivado", `${item.name} quedo ${item.active === false ? "activo" : "inactivo"}.`);
    } catch (error) {
      confirmCatalogAction("No se pudo actualizar el maestro", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  async function removeBaseCatalogItem(item: MasterOption) {
    if (catalogSaving) return;
    if (!window.confirm(`Confirmas eliminar "${item.name}" del maestro?`)) return;
    setCatalogSaving(`delete:${item.code}`);
    setCatalogNotice({ title: "Eliminando maestro...", detail: `Retirando ${item.name} del catalogo.`, tone: "info" });
    try {
      const next = await api<UserMasterData>(`/api/v1/admin/user-master-data/${catalogDraft.catalog}/items/${encodeURIComponent(item.code)}`, { method: "DELETE" });
      setMasterData({ ...fallbackUserMasterData, ...next });
      if (editingCatalogCode === item.code) resetCatalogDraft(catalogDraft.catalog);
      confirmCatalogAction("Maestro eliminado", `${item.name} fue retirado correctamente.`);
    } catch (error) {
      confirmCatalogAction("No se pudo eliminar el maestro", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  async function saveServiceTypeCatalog(nextTypes: ServiceType[], successMessage = "Tipos de servicio actualizados.") {
    const normalized = normalizeServiceTypes(nextTypes);
    if (!normalized.length) {
      confirmCatalogAction("Catalogo requerido", "Debe existir al menos un tipo de servicio.", "warning");
      return;
    }
    if (!normalized.some((item) => item.active !== false)) {
      confirmCatalogAction("Activo requerido", "Debe quedar al menos un tipo de servicio activo.", "warning");
      return;
    }
    const saved = await api<ServiceType[]>("/api/v1/services/service-types", {
      method: "PUT",
      body: JSON.stringify({ types: normalized })
    });
    const cleanSaved = normalizeServiceTypes(saved);
    setServiceTypes(cleanSaved.length ? cleanSaved : normalized);
    confirmCatalogAction("Catalogo actualizado", successMessage);
  }

  async function toggleServiceType(code: string) {
    if (catalogSaving) return;
    const next = serviceTypes.map((item) => item.code === code ? { ...item, active: item.active === false } : item);
    const target = serviceTypes.find((item) => item.code === code);
    setCatalogSaving(`toggle:${code}`);
    try {
      await saveServiceTypeCatalog(next, `${target?.label || "Tipo de servicio"} quedo ${target?.active === false ? "activo" : "inactivo"}.`);
    } catch (error) {
      confirmCatalogAction("No se pudo actualizar el tipo de servicio", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  async function removeServiceType(code: string) {
    if (catalogSaving) return;
    const target = serviceTypes.find((item) => item.code === code);
    if (!target) return;
    if (!window.confirm(`Confirmas retirar el tipo de servicio "${target.label}" del maestro?`)) return;
    setCatalogSaving(`delete:${code}`);
    setCatalogNotice({ title: "Eliminando tipo de servicio...", detail: `Retirando ${target.label} del catalogo.`, tone: "info" });
    try {
      await saveServiceTypeCatalog(serviceTypes.filter((item) => item.code !== code), `Tipo de servicio eliminado: ${target.label}.`);
    } catch (error) {
      confirmCatalogAction("No se pudo eliminar el tipo de servicio", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  async function saveServiceStoreCatalog(nextStores: ServiceStore[], successMessage = "Almacenes de servicio actualizados.") {
    const normalized = normalizeServiceStores(nextStores);
    if (!normalized.length) {
      confirmCatalogAction("Catalogo requerido", "Debe existir al menos un almacen de servicio.", "warning");
      return;
    }
    if (!normalized.some((item) => item.active !== false)) {
      confirmCatalogAction("Activo requerido", "Debe quedar al menos un almacen de servicio activo.", "warning");
      return;
    }
    const saved = await api<ServiceStore[]>("/api/v1/services/service-stores", {
      method: "PUT",
      body: JSON.stringify({ stores: normalized })
    });
    const cleanSaved = normalizeServiceStores(saved);
    const nextSaved = cleanSaved.length ? cleanSaved : normalized;
    setServiceStores(nextSaved);
    let syncWarning = "";
    try {
      const token = localStorage.getItem("token") || "";
      const companyName = localStorage.getItem("apexos_company_name") || localStorage.getItem("company_name") || "SCJ";
      const response = await fetch(`/api/public/service-requests?empresa=${encodeURIComponent(companyName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ company_name: companyName, service_stores: nextSaved })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        syncWarning = `Sincronizacion publica pendiente: ${detail.message || response.statusText || response.status}.`;
      }
    } catch (error) {
      syncWarning = `Sincronizacion publica pendiente: ${error instanceof Error ? error.message : "error desconocido"}.`;
    }
    confirmCatalogAction("Catalogo actualizado", syncWarning ? `${successMessage} ${syncWarning}` : successMessage, syncWarning ? "warning" : "success");
  }

  async function toggleServiceStore(code: string) {
    if (catalogSaving) return;
    const next = serviceStores.map((item) => item.code === code ? { ...item, active: item.active === false } : item);
    const target = serviceStores.find((item) => item.code === code);
    setCatalogSaving(`toggle:${code}`);
    try {
      await saveServiceStoreCatalog(next, `${target?.label || "Almacen"} quedo ${target?.active === false ? "activo" : "inactivo"}.`);
    } catch (error) {
      confirmCatalogAction("No se pudo actualizar el almacen", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  async function removeServiceStore(code: string) {
    if (catalogSaving) return;
    const target = serviceStores.find((item) => item.code === code);
    if (!target) return;
    if (!window.confirm(`Confirmas retirar el almacen "${target.label}" del maestro?`)) return;
    setCatalogSaving(`delete:${code}`);
    setCatalogNotice({ title: "Eliminando almacen...", detail: `Retirando ${target.label} del catalogo.`, tone: "info" });
    try {
      await saveServiceStoreCatalog(serviceStores.filter((item) => item.code !== code), `Almacen eliminado: ${target.label}.`);
    } catch (error) {
      confirmCatalogAction("No se pudo eliminar el almacen", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  async function saveSatisfactionQuestionCatalog(nextQuestions: SatisfactionQuestion[], successMessage = "Preguntas de satisfaccion actualizadas.") {
    const normalized = normalizeSatisfactionQuestions(nextQuestions);
    if (!normalized.length) {
      confirmCatalogAction("Catalogo requerido", "Debe existir al menos una pregunta de satisfaccion.", "warning");
      return;
    }
    if (!normalized.some((item) => item.active !== false)) {
      confirmCatalogAction("Activo requerido", "Debe quedar al menos una pregunta de satisfaccion activa.", "warning");
      return;
    }
    const saved = await api<SatisfactionQuestion[]>("/api/v1/services/satisfaction-questions", {
      method: "PUT",
      body: JSON.stringify({ questions: normalized })
    });
    const cleanSaved = normalizeSatisfactionQuestions(saved);
    setSatisfactionQuestions(cleanSaved.length ? cleanSaved : normalized);
    confirmCatalogAction("Catalogo actualizado", successMessage);
  }

  async function toggleSatisfactionQuestion(id: string) {
    if (catalogSaving) return;
    const next = satisfactionQuestions.map((item) => item.id === id ? { ...item, active: item.active === false } : item);
    const target = satisfactionQuestions.find((item) => item.id === id);
    setCatalogSaving(`toggle:${id}`);
    try {
      await saveSatisfactionQuestionCatalog(next, `${target?.label || "Pregunta"} quedo ${target?.active === false ? "activa" : "inactiva"}.`);
    } catch (error) {
      confirmCatalogAction("No se pudo actualizar la pregunta", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  async function removeSatisfactionQuestion(id: string) {
    if (catalogSaving) return;
    const target = satisfactionQuestions.find((item) => item.id === id);
    if (!target) return;
    if (!window.confirm(`Confirmas retirar la pregunta "${target.label}" del maestro?`)) return;
    setCatalogSaving(`delete:${id}`);
    setCatalogNotice({ title: "Eliminando pregunta...", detail: `Retirando ${target.label} del catalogo.`, tone: "info" });
    try {
      await saveSatisfactionQuestionCatalog(satisfactionQuestions.filter((item) => item.id !== id), `Pregunta eliminada: ${target.label}.`);
    } catch (error) {
      confirmCatalogAction("No se pudo eliminar la pregunta", error instanceof Error ? error.message : "Operacion interrumpida.", "error");
    } finally {
      setCatalogSaving("");
    }
  }

  function renderPlatformLogs() {
    const counts = {
      total: platformLogs.length,
      error: platformLogs.filter((item) => item.level === "error").length,
      warning: platformLogs.filter((item) => item.level === "warning").length,
      frontend: platformLogs.filter((item) => item.source === "frontend").length
    };
    return (
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["Eventos", counts.total, "text-ink"], ["Errores", counts.error, "text-rose-700"], ["Alertas", counts.warning, "text-amber-700"], ["Frontend", counts.frontend, "text-sky-700"]].map(([label, value, tone]) => (
            <div className="rounded-md border border-line bg-paper p-3" key={String(label)}>
              <p className="text-xs font-semibold uppercase text-neutral-500">{label}</p>
              <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
            </div>
          ))}
        </section>
        <section className="grid gap-3 rounded-md border border-line bg-paper p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <SelectField label="Fuente" value={logSourceFilter} onChange={setLogSourceFilter} options={[["all", "Todas"], ["api", "API"], ["backend", "Backend"], ["frontend", "Frontend"]]} />
          <SelectField label="Severidad" value={logLevelFilter} onChange={setLogLevelFilter} options={[["all", "Todas"], ["error", "Errores"], ["warning", "Alertas"], ["info", "Info"]]} />
          <SelectField label="Modulo" value={logModuleFilter} onChange={setLogModuleFilter} options={[["all", "Todos"], ...logModules.map((item) => [item, item] as [string, string])]} />
          <Button className="self-end" onClick={refreshPlatformLogs} type="button"><RefreshCw size={16} /> Actualizar</Button>
          {filteredPlatformLogs.length ? <Button className="self-end border border-line bg-white text-neutral-800 hover:bg-paper" onClick={exportLogsToTxt} type="button"><Download size={16} /> Exportar TXT</Button> : null}
        </section>
        {activeLogFilters > 0 ? (
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-700 hover:bg-paper" onClick={clearLogFilters} type="button">
            <RotateCcw size={15} /> Limpiar {activeLogFilters} filtro(s)
          </button>
        ) : null}
        <div className="max-h-[58vh] overflow-auto rounded-md border border-line bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-paper">
              <tr className="border-b border-line text-left text-xs font-semibold uppercase text-neutral-500">
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Fuente</th>
                <th className="px-3 py-3">Modulo</th>
                <th className="px-3 py-3">Ruta</th>
                <th className="px-3 py-3">Mensaje</th>
                <th className="px-3 py-3">Request</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlatformLogs.map((item) => (
                <tr className="border-b border-line/70 align-top hover:bg-paper/60" key={item.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-neutral-600">{item.at ? new Date(item.at).toLocaleString() : "Sin fecha"}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${item.level === "error" ? "bg-rose-50 text-rose-700" : item.level === "warning" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600"}`}>{item.source}</span>
                  </td>
                  <td className="px-3 py-3 font-semibold">{item.module || "platform"}</td>
                  <td className="px-3 py-3"><p className="font-mono text-xs">{item.method ? `${item.method} ` : ""}{item.route || "-"}</p>{item.status_code ? <p className="mt-1 text-xs text-neutral-500">Estado {item.status_code}</p> : null}</td>
                  <td className="px-3 py-3"><p className="font-semibold">{item.message || item.code || "Evento tecnico"}</p>{item.detail ? <p className="mt-1 max-w-md break-words text-xs text-neutral-500">{item.detail}</p> : null}</td>
                  <td className="px-3 py-3 font-mono text-xs text-neutral-500">{item.request_id || "-"}</td>
                </tr>
              ))}
              {!filteredPlatformLogs.length ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-neutral-500" colSpan={6}>
                    {activeLogFilters > 0
                      ? "No hay logs con estos filtros. Limpia los filtros para ver todos los eventos."
                      : "No hay logs registrados en la plataforma."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
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
      ["service_stores", "Almacenes de servicio"],
      ["satisfaction_questions", "Preguntas de satisfaccion"]
    ];
    const isServiceTypeCatalog = catalogDraft.catalog === "service_types";
    const isServiceStoreCatalog = catalogDraft.catalog === "service_stores";
    const isSatisfactionQuestionCatalog = catalogDraft.catalog === "satisfaction_questions";
    const isOperationalCatalog = isServiceTypeCatalog || isServiceStoreCatalog || isSatisfactionQuestionCatalog;
    const selectedItems = !isOperationalCatalog && Array.isArray((masterData as Record<string, unknown>)[catalogDraft.catalog])
      ? (((masterData as unknown) as Record<string, MasterOption[]>)[catalogDraft.catalog] || [])
      : [];
    const selectedCatalogLabel = catalogOptions.find(([value]) => value === catalogDraft.catalog)?.[1] || "Catalogo";
    const catalogRows: Array<MasterOption & { active?: boolean }> = isServiceTypeCatalog
      ? serviceTypes.map((item) => ({ code: item.code, name: item.label, active: item.active !== false }))
      : isServiceStoreCatalog
        ? serviceStores.map((item) => ({ code: item.code, name: item.label, active: item.active !== false }))
      : isSatisfactionQuestionCatalog
        ? satisfactionQuestions.map((item) => ({ code: item.id, name: item.label, active: item.active !== false }))
      : selectedItems.map((item) => ({ ...item, active: item.active !== false }));
    const activeCatalogRows = catalogRows.filter((item) => item.active !== false).length;
    return (
      <div className="space-y-3">
        <div className="grid gap-3 rounded-md border border-line bg-paper p-3 md:grid-cols-[minmax(240px,320px)_1fr] md:items-end">
          <SelectField label="Catalogo maestro" value={catalogDraft.catalog} onChange={(value) => resetCatalogDraft(value)} options={catalogOptions} />
          <div>
            <p className="text-xs font-semibold uppercase text-neutral-500">{selectedCatalogLabel}</p>
            <p className="mt-1 text-sm text-neutral-600">{catalogRows.length} registro(s), {activeCatalogRows} activo(s). Todos se administran desde esta seccion.</p>
          </div>
        </div>
        {catalogNotice ? (
          <div className={`rounded-md border px-3 py-2 text-sm ${catalogNotice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : catalogNotice.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : catalogNotice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-sky-200 bg-sky-50 text-sky-900"}`} role="status">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {catalogNotice.tone === "success" ? <Check size={16} /> : catalogNotice.tone === "error" || catalogNotice.tone === "warning" ? <AlertTriangle size={16} /> : <RefreshCw className={catalogSaving ? "animate-spin" : ""} size={16} />}
              </span>
              <span>
                <span className="block font-semibold">{catalogNotice.title}</span>
                {catalogNotice.detail ? <span className="mt-0.5 block">{catalogNotice.detail}</span> : null}
              </span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-md border border-line bg-white p-3">
            <div className="grid gap-3">
              <p className="text-sm font-semibold">{editingCatalogCode ? "Editar maestro" : "Nuevo maestro"}</p>
              <Field label={isOperationalCatalog ? "Codigo" : "Codigo"} value={catalogDraft.code} onChange={(value) => setCatalogDraft((current) => ({ ...current, code: isOperationalCatalog ? normalizeServiceTypeCode(value) : value.toUpperCase().replace(/\s+/g, "-") }))} />
              <Field label={isSatisfactionQuestionCatalog ? "Pregunta" : "Nombre"} value={catalogDraft.name} onChange={(value) => setCatalogDraft((current) => ({ ...current, name: value }))} />
              {!isOperationalCatalog ? <Field label="Descripcion" value={catalogDraft.description} onChange={(value) => setCatalogDraft((current) => ({ ...current, description: value }))} /> : null}
              <div className="grid gap-2">
                <Button disabled={Boolean(catalogSaving)} onClick={saveCatalogItem} type="button">
                  {catalogSaving === "create" || catalogSaving === "save" ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                  {catalogSaving === "create" ? "Creando..." : catalogSaving === "save" ? "Guardando..." : editingCatalogCode ? "Guardar cambios" : "Crear maestro"}
                </Button>
                {editingCatalogCode ? <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" disabled={Boolean(catalogSaving)} onClick={() => resetCatalogDraft()} type="button"><X size={16} /> Cancelar edicion</Button> : null}
              </div>
            </div>
          </div>

          <div className="max-h-[62vh] overflow-auto rounded-md border border-line">
            <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-line text-left text-xs text-neutral-500">
                <th className="px-3 py-2">Codigo</th>
                <th className="px-3 py-2">{isSatisfactionQuestionCatalog ? "Pregunta" : "Nombre"}</th>
                {!isOperationalCatalog ? <th className="px-3 py-2">Descripcion</th> : null}
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {catalogRows.map((item) => (
                <tr className={`border-b border-line/70 ${editingCatalogCode === item.code ? "bg-apex/5" : ""}`} key={item.code}>
                  <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                  <td className="px-3 py-2">{item.name}</td>
                  {!isOperationalCatalog ? <td className="px-3 py-2 text-neutral-600">{item.description || "-"}</td> : null}
                  <td className="px-3 py-2">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                      {item.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button className="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(catalogSaving)} onClick={() => editCatalogRow(item)} type="button"><Edit3 size={13} /></button>
                      <button className="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-paper disabled:cursor-wait disabled:opacity-50" disabled={Boolean(catalogSaving)} onClick={() => isServiceTypeCatalog ? toggleServiceType(item.code) : isServiceStoreCatalog ? toggleServiceStore(item.code) : isSatisfactionQuestionCatalog ? toggleSatisfactionQuestion(item.code) : toggleBaseCatalogItem(item)} type="button">
                        {catalogSaving === `toggle:${item.code}` ? "Guardando..." : item.active ? "Inactivar" : "Activar"}
                      </button>
                      <button className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50" disabled={Boolean(catalogSaving)} onClick={() => isServiceTypeCatalog ? removeServiceType(item.code) : isServiceStoreCatalog ? removeServiceStore(item.code) : isSatisfactionQuestionCatalog ? removeSatisfactionQuestion(item.code) : removeBaseCatalogItem(item)} type="button">
                        {catalogSaving === `delete:${item.code}` ? <RefreshCw className="animate-spin" size={13} /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!catalogRows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-neutral-500" colSpan={isOperationalCatalog ? 4 : 5}>No hay registros configurados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  }

  function renderQuickUserCreation() {
    return (
      <div className="space-y-4">
        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <button className="rounded-md border border-apex bg-apex/5 p-4 text-left shadow-sm" type="button">
            <span className="inline-flex items-center gap-2 rounded-md bg-apex px-2 py-1 text-xs font-semibold text-white"><UserPlus size={14} /> Principal</span>
            <h3 className="mt-3 text-lg font-semibold">Crear usuario rapido</h3>
            <p className="mt-1 text-sm text-neutral-600">Alta operativa con rol, empresa y acceso inicial.</p>
          </button>
          <button className="cursor-not-allowed rounded-md border border-line bg-paper p-4 text-left opacity-75" disabled type="button">
            <span className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs font-semibold text-neutral-600"><LockKeyhole size={14} /> Disponible proximamente</span>
            <h3 className="mt-3 text-lg font-semibold">Creacion completa</h3>
            <p className="mt-1 text-sm text-neutral-600">Datos laborales, nomina, documentos y configuraciones avanzadas.</p>
          </button>
        </section>

        <section className="rounded-md border border-line bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nombre completo" value={userForm.name} onChange={(value) => setUserField("name", value)} />
            <Field label="Correo" value={userForm.email} onChange={(value) => { setUserField("email", value); setUserField("access_email", value); }} />
            <Field label="Documento" value={userForm.document} onChange={(value) => setUserField("document", value)} />
            <Field label="Empresa" value={userForm.company} onChange={(value) => setUserField("company", value)} />
            <SelectField label="Sede" value={userForm.site} onChange={(value) => { setUserField("site", value); setUserField("base_site", value); }} options={optionPairs(masterData.locations, "Sin sede asignada")} />
            <SelectField label="Rol" value={userForm.role_id} onChange={(value) => setUserField("role_id", value)} options={[["", "Seleccionar rol"], ...roles.filter((role) => role.active).map((role) => [String(role.id), role.name] as [string, string])]} />
            <SelectField label="Estado" value={userForm.user_status} onChange={(value) => setUserField("user_status", value)} options={optionPairs(masterData.user_statuses)} />
            <Field label="Clave temporal" type="password" value={userForm.password} onChange={(value) => setUserField("password", value)} />
            <Toggle label="Exigir cambio de clave" checked={userForm.require_password_change} onChange={(value) => setUserField("require_password_change", value)} />
          </div>
          <p className="mt-3 rounded-md bg-paper px-3 py-2 text-xs font-medium text-neutral-600">Los permisos y alcances se administran desde el maestro de Roles y permisos. En esta vista solo se asigna el rol principal del usuario.</p>
        </section>

        <section className="rounded-md border border-dashed border-line bg-paper p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Creacion completa - proximamente</h3>
              <p className="mt-1 text-sm text-neutral-600">Campos preservados: centro de costos, cargo, area, contrato, supervisor, nomina, adjuntos, licencias y talento humano avanzado.</p>
            </div>
            <span className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-neutral-600">Bloqueada</span>
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <button className="h-10 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => setUserEditorOpen(false)} type="button">Cancelar</button>
          <Button onClick={saveUser} disabled={saving} type="button"><Save size={16} /> {saving ? "Guardando..." : "Crear usuario rapido"}</Button>
        </div>
      </div>
    );
  }

  function renderQuickUserEdit() {
    return (
      <div className="space-y-4">
        {message ? <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-neutral-700">{message}</p> : null}
        <section className="rounded-md border border-apex bg-apex/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 rounded-md bg-apex px-2 py-1 text-xs font-semibold text-white"><UserCog size={14} /> Edicion rapida</span>
              <h3 className="mt-3 text-lg font-semibold">Editar usuario</h3>
              <p className="mt-1 text-sm text-neutral-600">Solo se actualizan los campos disponibles en la creacion rapida.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" disabled={userAccessSaving} onClick={requestPasswordReset} type="button"><LockKeyhole size={16} /> {userAccessSaving ? "Cambiando..." : "Cambiar clave"}</Button>
              <Button className="border border-amber-200 bg-white text-amber-800 hover:bg-amber-50" disabled={userAccessSaving} onClick={blockUserAccess} type="button">Suspender</Button>
              {selectedUser?.active ? <Button className="bg-rose-700 hover:bg-rose-800" disabled={userAccessSaving} onClick={() => setUserStatus(false)} type="button">Inactivar</Button> : <Button disabled={userAccessSaving} onClick={() => setUserStatus(true)} type="button"><Check size={16} /> Activar</Button>}
            </div>
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nombre completo" value={userForm.name} onChange={(value) => setUserField("name", value)} />
            <Field label="Correo" value={userForm.email} onChange={(value) => { setUserField("email", value); setUserField("access_email", value); }} />
            <Field label="Documento" value={userForm.document} onChange={(value) => setUserField("document", value)} />
            <Field label="Empresa" value={userForm.company} onChange={(value) => setUserField("company", value)} />
            <SelectField label="Sede" value={userForm.site} onChange={(value) => { setUserField("site", value); setUserField("base_site", value); }} options={optionPairs(masterData.locations, "Sin sede asignada")} />
            <SelectField label="Rol" value={userForm.role_id} onChange={(value) => setUserField("role_id", value)} options={[["", "Seleccionar rol"], ...roles.filter((role) => role.active).map((role) => [String(role.id), role.name] as [string, string])]} />
            <SelectField label="Estado" value={userForm.user_status} onChange={(value) => setUserField("user_status", value)} options={optionPairs(masterData.user_statuses)} />
            <Field label="Nueva clave temporal" type="password" value={userForm.password} onChange={(value) => setUserField("password", value)} />
            <Toggle label="Exigir cambio de clave" checked={userForm.require_password_change} onChange={(value) => setUserField("require_password_change", value)} />
          </div>
          <p className="mt-3 rounded-md bg-paper px-3 py-2 text-xs font-medium text-neutral-600">Para cambiar clave sin correo, escribe una clave temporal y usa Cambiar clave. El usuario debera cambiarla en el proximo ingreso.</p>
        </section>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <button className="h-10 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => setUserEditorOpen(false)} type="button">Cancelar</button>
          <Button onClick={saveUser} disabled={saving || userAccessSaving} type="button"><Save size={16} /> {saving ? "Guardando..." : "Guardar cambios"}</Button>
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
          <SelectField label="Perfil operativo" value={userForm.operational_profile || userForm.operational_classification} onChange={(value) => { setUserField("operational_profile", value); setUserField("operational_classification", value); }} options={optionPairs(masterData.user_types, "Seleccionar perfil")} />
          <Field label="Empresa" value={userForm.company} onChange={(value) => setUserField("company", value)} />
          <SelectField label="Sede asignada" value={userForm.site} onChange={(value) => setUserField("site", value)} options={optionPairs(masterData.locations, "Seleccionar sede")} />
          <SelectField label="Area" value={userForm.area} onChange={(value) => { setUserField("area", value); setUserField("department", value); }} options={optionPairs(masterData.areas, "Seleccionar area")} />
          <SelectField label="Cargo" value={userForm.position} onChange={(value) => setUserField("position", value)} options={optionPairs(masterData.positions, "Seleccionar cargo")} />
          <Field label="Jefe directo" value={userForm.manager} onChange={(value) => setUserField("manager", value)} />
          <SelectField label="Estado de sesion" value={userForm.session_status} onChange={(value) => setUserField("session_status", value)} options={optionPairs(masterData.session_statuses)} />
          <Toggle label="Requiere cambio de clave" checked={userForm.require_password_change} onChange={(value) => setUserField("require_password_change", value)} />
          <Field label="MFA / 2FA futuro" value={userForm.mfa_status} onChange={(value) => setUserField("mfa_status", value)} />
          <p className="rounded-md bg-paper px-3 py-2 text-xs font-medium text-neutral-600 md:col-span-2 xl:col-span-3">Los permisos, alcances y roles adicionales se controlan en el maestro de Roles y permisos; aqui solo se asigna el rol principal.</p>
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
          <Field label="Licencia de conduccion" value={userForm.driver_license} onChange={(value) => setUserField("driver_license", value)} />
          <Field label="Categoria licencia" value={userForm.license_category} onChange={(value) => setUserField("license_category", value)} />
          <Field label="Vencimiento licencia" type="date" value={userForm.license_expires_at} onChange={(value) => setUserField("license_expires_at", value)} />
          <Field label="Restricciones operativas" value={userForm.operational_restrictions} onChange={(value) => setUserField("operational_restrictions", value)} />
          <p className="rounded-md bg-paper px-3 py-2 text-xs font-medium text-neutral-600 md:col-span-2 xl:col-span-3">Las capacidades operativas se heredan del rol asignado y se modifican en Roles y permisos.</p>
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
                {canDeletePhysicalDocuments() ? <button className="h-9 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => removeDocument(doc.id)} type="button">Eliminar</button> : null}
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
      <div className="space-y-3">
        {message ? <p className="mb-2 rounded-md border border-line bg-white px-4 py-3 text-sm text-neutral-700">{message}</p> : null}
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper p-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input className="h-11 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm" placeholder="Buscar nombre, correo, rol, cargo o area..." value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-11 min-w-[180px] rounded-md border border-line bg-white px-3 text-sm font-semibold" value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value)}>
                <option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos / suspendidos</option>
              </select>
              <span className="whitespace-nowrap rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold text-neutral-600">{filteredUsers.length}/{users.length} usuarios</span>
              <span className="whitespace-nowrap rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{metrics.active} activos</span>
              {metrics.withoutRole ? <span className="whitespace-nowrap rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">{metrics.withoutRole} sin rol</span> : null}
            </div>
          </div>
          <Button onClick={newUser} type="button"><UserPlus size={16} /> Crear usuario</Button>
        </section>
        <div className="max-h-[68vh] overflow-auto rounded-md border border-line bg-white">
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
    const feedback = message ? <p className="mb-4 rounded-md border border-line bg-white px-4 py-3 text-sm text-neutral-700">{message}</p> : null;
    if (message && !selectedUserId) {
      // Auto-clear feedback after 8s so it doesn't linger forever
      setTimeout(() => { try { setMessage(""); } catch { /* ignore */ } }, 8000);
    }
    if (!selectedUserId) return <>{feedback}{renderQuickUserCreation()}</>;
    return renderQuickUserEdit();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-apex">Configuracion y gobierno</p>
          <h1 className="mt-1 text-3xl font-semibold">Administracion APEX</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">{platformAdmin ? "Gestiona accesos, permisos, empresas y maestros desde un centro administrativo ordenado." : "Gestiona usuarios, roles y maestros propios de esta empresa desde un centro administrativo ordenado."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" onClick={() => load().catch((error) => setMessage(error.message))} type="button"><RefreshCw size={16} /> Actualizar</Button>
          <Button onClick={() => { setActiveModal("users"); newUser(); }} type="button"><UserPlus size={16} /> Crear usuario</Button>
        </div>
      </header>

      {message ? <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-neutral-700">{message}</p> : null}

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <button className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 text-left hover:border-apex hover:bg-paper" onClick={() => setActiveModal("users")} type="button"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><Users size={18} /></span><span><span className="block text-sm font-semibold">Usuarios</span><span className="text-xs text-neutral-500">Accesos y fichas maestras</span></span></button>
        <button className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 text-left hover:border-apex hover:bg-paper" onClick={() => setActiveModal("roles")} type="button"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><Shield size={18} /></span><span><span className="block text-sm font-semibold">Roles y permisos</span><span className="text-xs text-neutral-500">Gobierno de acceso</span></span></button>
        {platformAdmin ? <Link className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 hover:border-apex hover:bg-paper" href="/dashboard/administracion/suscripciones"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><Building2 size={18} /></span><span><span className="block text-sm font-semibold">Empresas y modulos</span><span className="text-xs text-neutral-500">Suscripciones y habilitaciones</span></span></Link> : null}
        <button className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 text-left hover:border-apex hover:bg-paper" onClick={() => setActiveModal("masters")} type="button"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><Database size={18} /></span><span><span className="block text-sm font-semibold">Maestros</span><span className="text-xs text-neutral-500">Catalogos transversales</span></span></button>
        <button className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 text-left hover:border-apex hover:bg-paper" onClick={() => setActiveModal("logs")} type="button"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white"><AlertTriangle size={18} /></span><span><span className="block text-sm font-semibold">Logs tecnicos</span><span className="text-xs text-neutral-500">API, backend y frontend</span></span></button>
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Catalogo administrativo</h2><p className="mt-1 text-sm text-neutral-600">Encuentra configuraciones por nombre, categoria o estado.</p></div><p className="text-sm text-neutral-500">{filteredConfigItems.length} de {visibleConfigItems.length}</p></div>
          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(240px,1fr)_230px_180px]">
            <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar configuracion, modulo o tarea" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas las categorias</option>{categories.filter((category) => category.items.some((item) => item.key !== "empresas" || platformAdmin)).map((category) => <option key={category.key} value={category.key}>{category.title}</option>)}</select>
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
        <ModalFrame title="Roles y permisos" onClose={() => setActiveModal(null)} maxWidth="md:max-w-[min(96vw,1480px)]">
          {message ? <p className="mb-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-neutral-700">{message}</p> : null}
          <div className="grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="space-y-2">
              <div className="rounded-md border border-line bg-white p-2">
                <Button className="h-9 w-full text-sm" disabled={roleSaving} onClick={newRole} type="button"><Plus size={15} /> Nuevo rol</Button>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-paper px-2 py-1.5">
                    <span className="block text-neutral-500">Activos</span>
                    <span className="block text-base font-semibold text-neutral-900">{activeRoleCount}</span>
                  </div>
                  <div className="rounded-md bg-paper px-2 py-1.5">
                    <span className="block text-neutral-500">Total</span>
                    <span className="block text-base font-semibold text-neutral-900">{roles.length}</span>
                  </div>
                </div>
              </div>
              <div className="max-h-[30dvh] space-y-1.5 overflow-y-auto pr-1 xl:max-h-[58dvh]">
                {roles.map((role) => {
                  const assignedCount = users.filter((user) => Number(user.role_id) === role.id).length;
                  return (
                    <button className={`w-full rounded-md border px-2.5 py-2 text-left text-xs transition ${selectedRoleId === role.id ? "border-apex bg-paper shadow-sm" : "border-line bg-white hover:border-apex/40 hover:bg-paper"}`} key={role.id} onClick={() => selectRole(role)} type="button">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{role.name}</span>
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${role.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{role.active ? "Activo" : "Inactivo"}</span>
                      </span>
                      <span className="mt-1 line-clamp-1 text-[11px] text-neutral-500">{role.description || "Sin descripcion"}</span>
                      <span className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
                        <span>{role.impact_summary?.modules ?? Object.values(role.permissions || {}).filter((actions) => Object.values(actions).some(Boolean)).length} modulo(s)</span>
                        <span>{assignedCount} usuario(s)</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-md border border-line bg-paper p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase text-neutral-500">Usuarios con rol</p>
                  <p className="text-base font-semibold">{assignedRoleUsers.length}</p>
                </div>
                <div className="mt-1 max-h-20 space-y-1 overflow-y-auto">
                  {assignedRoleUsers.slice(0, 4).map((user) => <p className="truncate text-[11px] text-neutral-600" key={user.id}>{user.name} - {user.email}</p>)}
                  {!assignedRoleUsers.length ? <p className="text-[11px] text-neutral-500">Sin usuarios asignados.</p> : null}
                  {assignedRoleUsers.length > 4 ? <p className="text-[11px] font-medium text-neutral-500">+{assignedRoleUsers.length - 4} usuario(s) mas</p> : null}
                </div>
              </div>
            </aside>
            <section className="min-w-0">
              <div className="mb-2 flex flex-col gap-2 rounded-md border border-line bg-white p-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-semibold">{selectedRole ? selectedRole.name : "Nuevo rol"}</p>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${selectedRole?.active ?? true ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{selectedRole?.active === false ? "Inactivo" : "Activo"}</span>
                    <span className="text-xs text-neutral-500">{selectedRole ? `nivel ${selectedRole.hierarchy_level || 10} - ${selectedRole.scope || "company"}` : "pendiente de guardar"}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{selectedRole ? selectedRole.description || "Sin descripcion" : "Rol personalizado pendiente de guardar."}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-md bg-paper px-2.5 py-1.5 text-xs">
                    <span className="font-semibold text-neutral-900">{roleFormSummary.actions}</span>
                    <span className="ml-1 text-neutral-500">permisos</span>
                    <span className="mx-1 text-neutral-300">/</span>
                    <span className="font-semibold text-neutral-900">{roleFormSummary.modules}</span>
                    <span className="ml-1 text-neutral-500">modulos</span>
                  </div>
                  <div className="rounded-md bg-paper px-2.5 py-1.5 text-xs">
                    <span className="font-semibold text-neutral-900">{assignedRoleUsers.length}</span>
                    <span className="ml-1 text-neutral-500">usuarios</span>
                    <span className="ml-2 text-neutral-500">{selectedRoleLocked ? "protegido" : "editable"}</span>
                  </div>
                  {selectedRole ? (
                    <Button className="h-9 border border-rose-200 bg-white px-3 text-sm text-rose-700 hover:bg-rose-50" disabled={roleSaving || selectedRoleLocked || assignedRoleUsers.length > 0} onClick={deleteRole} type="button">
                      <Trash2 size={15} /> Eliminar
                    </Button>
                  ) : null}
                  <Button className="h-9 px-3 text-sm" disabled={roleSaving} onClick={saveRole} type="button"><Save size={15} /> {roleSaving ? "Guardando..." : "Guardar"}</Button>
                </div>
              </div>
              <div className="mb-2 grid gap-2 rounded-md border border-line bg-white p-2 md:grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.2fr)_200px]">
                <Field label="Nombre del rol" value={roleForm.name} onChange={(value) => setRoleForm((prev) => ({ ...prev, name: value }))} />
                <Field label="Descripcion" value={roleForm.description} onChange={(value) => setRoleForm((prev) => ({ ...prev, description: value }))} />
                <SelectField label="Copiar desde rol" value="" onChange={copyRole} options={[["", "Seleccionar rol base"], ...roles.map((role) => [String(role.id), role.name] as [string, string])]} />
              </div>
              <div className="mb-2 grid gap-2 rounded-md border border-line bg-paper p-2 md:grid-cols-[1fr_150px_130px_auto]">
                <Field label="Buscar permiso" value={roleFilter} onChange={setRoleFilter} />
                <SelectField label="Grupo" value={roleGroupFilter} onChange={setRoleGroupFilter} options={[["all", "Todos"], ...roleGroups.map((group) => [group, group] as [string, string])]} />
                <SelectField label="Vista" value={roleActionMode} onChange={(value) => setRoleActionMode(value as "compact" | "full")} options={[["compact", "Compacta"], ["full", "Completa"]]} />
                <div className="flex items-end gap-2">
                  <Button className="h-9 border border-line bg-white px-3 text-sm text-neutral-700 hover:bg-white" disabled={selectedRoleLocked || roleSaving || !filteredRoleCatalog.length} onClick={() => setVisiblePermissions(true)} type="button"><Check size={15} /> Marcar</Button>
                  <Button className="h-9 border border-line bg-white px-3 text-sm text-neutral-700 hover:bg-white" disabled={selectedRoleLocked || roleSaving || !filteredRoleCatalog.length} onClick={() => setVisiblePermissions(false)} type="button"><X size={15} /> Limpiar</Button>
                </div>
              </div>
              {roleCatalogWarning ? <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{roleCatalogWarning}</p> : null}
              <div className="max-h-[48dvh] overflow-auto rounded-md border border-line xl:max-h-[62dvh]">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-line text-left text-xs text-neutral-500">
                      <th className="py-2 pl-3">Modulo</th>
                      {visibleRoleActions.map((action) => <th className="px-1 py-2 text-center" key={action}>{actionLabels[action]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoleCatalog.map((item) => (
                      <tr className="border-b border-line/70 hover:bg-paper/70" key={item.key}>
                        <td className="py-1.5 pl-3">
                          <span className="block font-medium">{item.label}</span>
                          <span className="text-[11px] text-neutral-500">{item.group || "general"} - {item.module || item.key}{item.submodule ? `/${item.submodule}` : ""}</span>
                        </td>
                        {visibleRoleActions.map((action) => (
                          <td className="px-1 py-1.5 text-center" key={action}>
                            {item.actions.includes(action) ? (
                              <button className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${roleForm.permissions[item.key]?.[action] ? "border-apex bg-apex text-white shadow-sm" : "border-line bg-white hover:border-apex/40 hover:bg-paper"}`} disabled={selectedRoleLocked} onClick={() => togglePermission(item.key, action)} title={`${item.label}: ${actionLabels[action]}`} type="button">
                                {roleForm.permissions[item.key]?.[action] ? <Check size={13} /> : null}
                              </button>
                            ) : <span className="text-neutral-300">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!filteredRoleCatalog.length ? (
                      <tr>
                        <td className="px-3 py-10 text-center text-sm text-neutral-500" colSpan={visibleRoleActions.length + 1}>
                          No hay permisos para mostrar con estos filtros. Limpia la busqueda o selecciona otro grupo.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </ModalFrame>
      ) : null}

      {activeModal === "masters" ? (
        <ModalFrame title="Maestros de plataforma" onClose={() => setActiveModal(null)} maxWidth="md:max-w-5xl">
          {renderMasterCatalogManager()}
        </ModalFrame>
      ) : null}

      {activeModal === "logs" ? (
        <ModalFrame title="Logs tecnicos de plataforma" onClose={() => setActiveModal(null)} maxWidth="md:max-w-6xl">
          {renderPlatformLogs()}
        </ModalFrame>
      ) : null}

      {activeModal === "users" ? (
        <ModalFrame title={userEditorOpen ? (selectedUserId ? "Editar usuario" : "Crear usuario") : "Usuarios de plataforma"} onClose={() => { setActiveModal(null); setUserEditorOpen(false); }} maxWidth="md:max-w-6xl">
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
                  {selectedUserId ? <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" disabled={userAccessSaving} onClick={requestPasswordReset} type="button"><LockKeyhole size={16} /> {userAccessSaving ? "Cambiando..." : "Cambiar clave"}</Button> : null}
                  {selectedUserId ? <Button className="border border-line bg-white text-neutral-800 hover:bg-paper" onClick={blockUserAccess} type="button"><X size={16} /> Bloquear acceso</Button> : null}
                  {selectedUserId && selectedUser?.active ? <Button className="bg-rose-700 hover:bg-rose-800" onClick={() => setUserStatus(false)} type="button"><X size={16} /> Desactivar</Button> : null}
                  {selectedUserId && selectedUser && !selectedUser.active ? <Button onClick={() => setUserStatus(true)} type="button"><Check size={16} /> Activar</Button> : null}
                  <Button onClick={saveUser} disabled={saving} type="button"><Save size={16} /> {saving ? "Guardando..." : "Guardar"}</Button>
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
      {toast ? (
        <div className={`fixed bottom-4 right-4 z-[80] w-[min(360px,calc(100vw-2rem))] rounded-md border bg-white p-4 shadow-xl ${toast.tone === "success" ? "border-emerald-200" : toast.tone === "warning" ? "border-amber-200" : toast.tone === "error" ? "border-rose-200" : "border-line"}`} role="status">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${toast.tone === "success" ? "bg-emerald-50 text-emerald-700" : toast.tone === "warning" ? "bg-amber-50 text-amber-700" : toast.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-paper text-neutral-700"}`}>
              {toast.tone === "success" ? <Check size={16} /> : toast.tone === "error" || toast.tone === "warning" ? <AlertTriangle size={16} /> : <Bell size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900">{toast.title}</p>
              {toast.detail ? <p className="mt-1 text-sm text-neutral-600">{toast.detail}</p> : null}
            </div>
            <button className="rounded-md p-1 text-neutral-400 hover:bg-paper hover:text-neutral-700" onClick={() => setToast(null)} type="button" title="Cerrar notificacion">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
