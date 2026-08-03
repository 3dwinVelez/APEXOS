export type RolePermission = {
  module?: string;
  key?: string;
  action?: string;
  actions?: unknown;
  [key: string]: unknown;
};

const permissionModuleAliases: Record<string, string> = {
  servicios_correcciones: "services.orders"
};

function normalizedModule(value: unknown) {
  const moduleName = String(value || "").trim().toLowerCase();
  return permissionModuleAliases[moduleName] || moduleName;
}

function actionValues(row: RolePermission) {
  if (Array.isArray(row.actions)) return row.actions;
  return [row.action, ...Object.entries(row).filter(([, enabled]) => enabled === true).map(([action]) => action)];
}

export function flattenRolePermissions(value: unknown): RolePermission[] {
  if (Array.isArray(value)) {
    return value.flatMap((permission) => {
      const row = permission && typeof permission === "object" ? permission as RolePermission : {};
      const moduleName = normalizedModule(row.module || row.key);
      return actionValues(row)
        .map((action) => ({ module: moduleName, action: String(action || "").trim().toLowerCase() }))
        .filter((item) => item.module && item.action);
    });
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([module, actions]) => {
      const row = actions && typeof actions === "object" ? actions as Record<string, unknown> : {};
      return Object.entries(row)
        .filter(([, enabled]) => enabled === true)
        .map(([action]) => ({ module: normalizedModule(module), action: action.trim().toLowerCase() }));
    });
  }
  return [];
}

export function hasRolePermission(value: unknown, module: string, action: string) {
  const expectedModule = normalizedModule(module);
  const expectedAction = String(action || "").trim().toLowerCase();
  return flattenRolePermissions(value).some((permission) => (
    (permission.module === "*" || permission.module === expectedModule)
    && (permission.action === "*" || permission.action === expectedAction)
  ));
}

export function hasStoredRolePermission(module: string, action: string) {
  if (typeof window === "undefined") return false;
  try {
    return hasRolePermission(JSON.parse(localStorage.getItem("role_permissions") || "[]"), module, action);
  } catch {
    return false;
  }
}
