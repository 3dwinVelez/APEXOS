export const MARKING_ONLY_PROFILE = "marking_only";
export const MARKING_ONLY_ROLE = "empleado marcaciones";
export const MARKING_ONLY_PATH = "/dashboard/talento-humano/marcacion";

type StoredRoleMetadata = {
  access_profile?: unknown;
  profile_kind?: unknown;
};

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function storedRoleMetadata(): StoredRoleMetadata {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem("role_metadata") || "{}");
    return parsed && typeof parsed === "object" ? parsed as StoredRoleMetadata : {};
  } catch {
    return {};
  }
}

export function isMarkingOnlyAccess() {
  if (typeof window === "undefined") return false;
  const metadata = storedRoleMetadata();
  return normalized(metadata.access_profile) === MARKING_ONLY_PROFILE
    || normalized(metadata.profile_kind) === MARKING_ONLY_PROFILE
    || normalized(localStorage.getItem("profile_kind")) === MARKING_ONLY_PROFILE
    || normalized(localStorage.getItem("role_name")) === MARKING_ONLY_ROLE;
}

export function dashboardLandingPath() {
  if (isMarkingOnlyAccess()) return MARKING_ONLY_PATH;
  return normalized(localStorage.getItem("role_name")) === "tecnico"
    ? "/dashboard/servicios"
    : "/dashboard";
}
