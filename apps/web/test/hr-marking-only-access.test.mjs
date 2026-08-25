import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), "utf8");

test("el login redirige el perfil exclusivo directamente a marcaciones", () => {
  const login = read("../app/login/page.tsx");
  const profile = read("../lib/accessProfile.ts");
  assert.match(login, /window\.location\.assign\(dashboardLandingPath\(\)\)/);
  assert.match(profile, /MARKING_ONLY_PATH = "\/dashboard\/talento-humano\/marcacion"/);
  assert.match(profile, /MARKING_ONLY_ROLE = "empleado marcaciones"/);
});

test("el guard bloquea cualquier ruta distinta a la pantalla de marcacion", () => {
  const guard = read("../components/shell/RouteAccessGuard.tsx");
  assert.match(guard, /isMarkingOnlyAccess\(\)/);
  assert.match(guard, /pathname !== MARKING_ONLY_PATH/);
  assert.match(guard, /router\.replace\(MARKING_ONLY_PATH\)/);
});

test("el chrome exclusivo no renderiza sidebar, navegacion movil ni IA", () => {
  const chrome = read("../components/shell/DashboardChrome.tsx");
  const exclusiveBlock = chrome.match(/if \(mode === "marking_only"\)[\s\S]*?\n  return \(/)?.[0] || "";
  assert.match(exclusiveBlock, /Acceso exclusivo a mi jornada/);
  assert.match(exclusiveBlock, /UserSessionBadge compact/);
  assert.doesNotMatch(exclusiveBlock, /<Sidebar/);
  assert.doesNotMatch(exclusiveBlock, /<MobileNav/);
  assert.doesNotMatch(exclusiveBlock, /<AiExperienceLayer/);
});

test("la pantalla usa exclusivamente endpoints autocontenidos self", () => {
  const marking = read("../app/dashboard/talento-humano/marcacion/page.tsx");
  for (const endpoint of [
    "/api/v1/hr/self",
    "/api/v1/hr/self/routes",
    "/api/v1/hr/self/attendance",
    "/api/v1/hr/self/work-session",
    "/api/v1/hr/self/time-punches",
    "/api/v1/hr/self/work-activities",
    "/api/v1/hr/self/gps/ping"
  ]) assert.ok(marking.includes(endpoint), `Falta endpoint seguro ${endpoint}`);
  assert.doesNotMatch(marking, /api<[^>]+>\("\/api\/v1\/hr\/routes"/);
  assert.doesNotMatch(marking, /\/api\/v1\/hr\/operations-map/);
});

test("el perfil exclusivo se conserva al crear roles y usuarios Supabase", () => {
  const api = read("../lib/api.ts");
  const roleRoute = read("../app/api/admin/roles/route.ts");
  const userRoute = read("../app/api/admin/users/route.ts");
  assert.match(api, /name: "Empleado marcaciones"[\s\S]*access_profile: "marking_only"/);
  assert.match(api, /access_profile: role\.access_profile/);
  assert.match(roleRoute, /access_profile: clean\(role\.access_profile\)/);
  assert.match(userRoute, /access_profile: clean\(body\.access_profile\)/);
});
