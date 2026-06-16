const fs = require("node:fs");
const path = require("node:path");

const appDir = path.resolve(process.cwd(), "apps/web/app");

function discoverScreens(directory = appDir) {
  const screens = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(screens, discoverScreens(fullPath));
    if (!entry.isFile() || entry.name !== "page.tsx") continue;

    const relativeDirectory = path.relative(appDir, path.dirname(fullPath));
    const segments = relativeDirectory ? relativeDirectory.split(path.sep) : [];
    if (segments.includes("api")) continue;
    const route = segments.length ? `/${segments.join("/")}` : "/";
    screens[route] = path.relative(process.cwd(), fullPath).replaceAll("\\", "/");
  }
  return screens;
}

function literalRequests(file) {
  const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  const matches = [...content.matchAll(/["'`]((?:\/api\/v1|\/rest\/v1)[^"'`$]*)/g)].map((match) => match[1]);
  return [...new Set(matches)].sort();
}

const inventory = Object.fromEntries(Object.entries(discoverScreens()).sort(([left], [right]) => left.localeCompare(right)).map(([screen, file]) => {
  const requests = literalRequests(file);
  return [screen, { file, literal_request_count: requests.length, requests }];
}));

console.log(JSON.stringify({
  note: "Conteo estatico de todas las ventanas. No incluye llamadas expandidas por supabaseApiFallback ni requests globales del layout.",
  global_loaders: {
    module_access_callers: ["Sidebar", "RouteAccessGuard", "DashboardPage"],
    user_session_badge_instances: 2,
    ai_layer_global: true
  },
  screens: inventory
}, null, 2));
