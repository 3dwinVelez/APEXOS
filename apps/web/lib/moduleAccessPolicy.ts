const ADMIN_ROLE_NAMES = new Set([
  "admin",
  "owner",
  "superadmin",
  "apex_admin",
  "administrador",
  "administrador de empresa"
]);

export function isAdministrativeRole(roles: Array<string | null | undefined>) {
  return roles
    .map((role) => String(role || "").trim().toLowerCase())
    .some((role) => ADMIN_ROLE_NAMES.has(role));
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
