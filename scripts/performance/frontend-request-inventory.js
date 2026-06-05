const fs = require("node:fs");
const path = require("node:path");

const screens = {
  dashboard: "apps/web/app/dashboard/page.tsx",
  users_roles: "apps/web/app/dashboard/administracion/page.tsx",
  services: "apps/web/app/dashboard/servicios/page.tsx",
  punches: "apps/web/app/dashboard/talento-humano/marcacion/page.tsx",
  vehicles: "apps/web/app/dashboard/transporte/page.tsx",
  projects: "apps/web/app/dashboard/proyectos/page.tsx",
  inventory: "apps/web/app/dashboard/inventario/stock/page.tsx",
  purchases: "apps/web/app/dashboard/compras/proveedores/page.tsx",
  accounting: "apps/web/app/dashboard/contabilidad/reportes/page.tsx",
  payroll: "apps/web/app/dashboard/talento-humano/nomina/page.tsx"
};

function literalRequests(file) {
  const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  const matches = [...content.matchAll(/["'`]((?:\/api\/v1|\/rest\/v1)[^"'`$]*)/g)].map((match) => match[1]);
  return [...new Set(matches)].sort();
}

const inventory = Object.fromEntries(Object.entries(screens).map(([screen, file]) => {
  const requests = literalRequests(file);
  return [screen, { file, literal_request_count: requests.length, requests }];
}));

console.log(JSON.stringify({
  note: "Conteo estatico. No incluye llamadas expandidas por supabaseApiFallback ni requests globales del layout.",
  global_loaders: {
    module_access_callers: ["Sidebar", "RouteAccessGuard", "DashboardPage"],
    user_session_badge_instances: 2,
    ai_layer_global: true
  },
  screens: inventory
}, null, 2));
