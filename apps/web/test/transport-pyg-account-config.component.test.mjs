import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Render de servidor del componente real. El componente arranca en estado
// "cargando" y useEffect no corre en SSR, por lo que aqui solo se puede afirmar
// el primer render. Opciones, etiquetas y solo-lectura se certifican en navegador.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const componentPath = path.join(webRoot, "components/transport-pyg/TransportPygAccountConfig.tsx");
const libPath = path.join(webRoot, "lib/transport-pyg-account-config.ts");

function locate(name) {
  const require = createRequire(pathToFileURL(path.join(repoRoot, "package.json")).href);
  try { return { require, resolved: realpathSync(require.resolve(name)) }; } catch { return null; }
}

const modules = {
  react: locate("react"),
  domServer: locate("react-dom/server"),
  typescript: locate("typescript"),
  lucide: locate("lucide-react")
};
const missing = Object.entries(modules).filter(([, value]) => !value).map(([name]) => name);

function compile(ts, file) {
  const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
  // Runtime automatico (igual que Next): el componente no importa React en
  // alcance y el JSX emite jsx/jsxs desde react/jsx-runtime.
  if (file.endsWith(".tsx")) options.jsx = ts.JsxEmit.ReactJSX;
  return ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: options, fileName: file }).outputText;
}

function execute(origin, compiled, require) {
  const module = { exports: {} };
  const fn = new Function("exports", "require", "module", "__filename", "__dirname", compiled);
  fn(module.exports, require, module, origin, path.dirname(origin));
  return module.exports;
}

// require local inyectado en execute: sin parche global de Module._load, asi
// rootRequire nunca vuelve a entrar al shim (sin recursion).
function makeCustomRequire(api, lib, rootRequire) {
  return function customRequire(request) {
    if (request === "@/lib/api") return api;
    if (request === "@/lib/transport-pyg-account-config") return lib;
    return rootRequire(request);
  };
}

function renderServerMarkup(canWrite) {
  assert.deepEqual(missing, [], `Faltan dependencias reales para renderizar: ${missing.join(", ")}`);
  const apiCalls = [];
  const api = {
    getTransportPygAccountConfiguration: async () => { apiCalls.push("get"); return {}; },
    saveTransportPygAccountConfiguration: async () => { apiCalls.push("save"); return { ok: true }; }
  };
  const ts = modules.typescript.require(modules.typescript.resolved);
  // react, react-dom/server, lucide-react y jsx-runtime salen del root; el
  // componente y el renderer comparten la misma instancia de React.
  const rootRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")).href);
  const react = rootRequire("react");
  const { renderToStaticMarkup } = rootRequire("react-dom/server");
  const lib = execute(libPath, compile(ts, libPath), makeCustomRequire(api, null, rootRequire));
  // react, react/jsx-runtime, react/jsx-dev-runtime y lucide-react caen al
  // rootRequire; solo los alias del proyecto se resuelven aqui.
  const Component = execute(componentPath, compile(ts, componentPath), makeCustomRequire(api, lib, rootRequire)).default;
  const markup = renderToStaticMarkup(react.createElement(Component, { canWrite, onSaved() {} }));
  return { markup, apiCalls };
}

test("SSR con escritura: primer render de carga, sin tarjetas ni editor inventado", () => {
  const { markup, apiCalls } = renderServerMarkup(true);
  assert.match(markup, /Leyendo la configuración de rangos PUC/);
  assert.doesNotMatch(markup, /<article/);
  assert.doesNotMatch(markup, /<input|<select/);
  assert.doesNotMatch(markup, /data-concept-key/);
  assert.doesNotMatch(markup, /Crear concepto|Guardar cambios|Usar estructura del Excel/);
  assert.deepEqual(apiCalls, [], "SSR no debe disparar llamadas a la API");
});

test("SSR con lectura: mismo primer render de carga y ninguna llamada a la API", () => {
  const { markup, apiCalls } = renderServerMarkup(false);
  assert.match(markup, /Leyendo la configuración de rangos PUC/);
  assert.doesNotMatch(markup, /<input|<select/);
  assert.doesNotMatch(markup, /Consulta de solo lectura/);
  assert.deepEqual(apiCalls, [], "SSR no debe disparar llamadas a la API");
});

test("react y react-dom/server salen de la misma instalacion de node_modules", () => {
  assert.deepEqual(missing, [], `Faltan dependencias reales para renderizar: ${missing.join(", ")}`);
  const react = modules.react.require(modules.react.resolved);
  const { renderToStaticMarkup } = modules.domServer.require(modules.domServer.resolved);
  assert.equal(typeof renderToStaticMarkup(react.createElement(() => null)), "string");
  assert.equal(modules.react.require(modules.react.resolved), react, "una sola instancia de React");
  for (const pkg of ["react", "react-dom", "lucide-react"]) {
    const resolved = locate(pkg).resolved;
    assert.ok(resolved.startsWith(realpathSync(repoRoot) + path.sep), `${pkg} debe resolver desde el node_modules del repositorio: ${resolved}`);
  }
});
