const ADMIN_ROLE_NAMES = new Set([
  "admin",
  "owner",
  "superadmin",
  "apex admin",
  "administrador",
  "administrador de empresa",
  "administrador empresa",
  "admin empresa",
  "company admin",
  "platform admin"
]);

export function isAdministrativeRole(roles: Array<string | null | undefined>) {
  return roles
    .map((role) => String(role || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " "))
    .some((role) => ADMIN_ROLE_NAMES.has(role));
}

type AdminResource = "users" | "roles";
type AdminAction = "read" | "create" | "edit" | "delete";

const ADMIN_CAPABILITY_RULES: Record<AdminResource, Record<AdminAction, Array<[string, string[]]>>> = {
  users: {
    read: [["usuarios", ["access", "view", "manage_users"]]],
    create: [["usuarios", ["create", "manage_users"]]],
    edit: [["usuarios", ["edit", "manage_users"]]],
    delete: [["usuarios", ["delete", "manage_users"]]]
  },
  roles: {
    read: [["roles", ["access", "view", "manage_roles"]], ["usuarios", ["create", "manage_users"]]],
    create: [["roles", ["create", "manage_roles", "administer"]]],
    edit: [["roles", ["edit", "configure", "manage_roles", "administer"]]],
    delete: [["roles", ["delete", "manage_roles", "administer"]]]
  }
};

export function hasAdministrativeCapability(input: {
  roleName?: unknown;
  roleType?: unknown;
  permissions?: unknown;
}, resource: AdminResource, action: AdminAction) {
  if (isAdministrativeRole([String(input.roleName || ""), String(input.roleType || "")])) return true;
  if (!input.permissions || typeof input.permissions !== "object" || Array.isArray(input.permissions)) return false;
  const permissions = input.permissions as Record<string, unknown>;
  return ADMIN_CAPABILITY_RULES[resource][action].some(([key, actions]) => {
    const row = permissions[key];
    return Boolean(row && typeof row === "object" && actions.some((candidate) => (row as Record<string, unknown>)[candidate] === true));
  });
}

export function mergePlatformAdminModuleAccess(
  slugs: string[],
  companyAccess: Record<string, boolean>,
  platformModuleSlugs: ReadonlySet<string>
) {
  return Object.fromEntries(slugs.map((slug) => [
    slug,
    companyAccess[slug] === true || platformModuleSlugs.has(slug)
  ]));
}
