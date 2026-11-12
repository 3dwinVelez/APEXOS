import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const catalogSlugs = () => [...read("lib/modules.ts").matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);
const retiredSlugs = () => {
  const block = read("lib/modules.ts").slice(read("lib/modules.ts").indexOf("const RETIRED_MODULE_SLUGS"));
  return [...block.slice(0, block.indexOf("]);")).matchAll(/"([\w-]+)"/g)].map((match) => match[1]);
};
const moduleBlock = (slug) => {
  const source = read("lib/modules.ts");
  const start = source.indexOf(`slug: "${slug}"`);
  assert.ok(start >= 0, `falta la ficha de ${slug}`);
  const end = source.indexOf("icon:", start);
  return source.slice(start, end === -1 ? undefined : end);
};

const RETIRED = [
  "punto-de-venta",
  "costos",
  "presupuestos",
  "produccion",
  "recetas",
  "calidad",
  "devoluciones",
  "comercio-exterior",
  "activos",
  "crm",
  "planeacion-demanda",
  "facturacion",
  "facturacion-electronica",
  "configuracion-inicial",
  "suscripciones"
];

// Retirados que ya tenían pantalla operativa publicada: salen de la oferta, no del código.
const RETIRED_WITH_LEGACY_ROUTE = ["facturacion"];

const VISIBLE = [
  "reportes",
  "inventario",
  "compras",
  "ventas",
  "cxc",
  "contabilidad",
  "tesoreria",
  "transporte",
  "talento-humano",
  "proyectos",
  "administracion",
  "servicios",
  "apex-ai",
  "gestion-comercial",
  "gastos-menores",
  "comercio",
  "apex-control"
];

test("el catálogo conserva 32 fichas y el portafolio publica 17", () => {
  const slugs = catalogSlugs();
  assert.equal(slugs.length, 32);
  assert.deepEqual(new Set(retiredSlugs()), new Set(RETIRED));
  assert.equal(retiredSlugs().length, 15);
  const visible = slugs.filter((slug) => !retiredSlugs().includes(slug));
  assert.deepEqual(new Set(visible), new Set(VISIBLE));
  assert.equal(visible.length, 17);
});

test("todo módulo visible tiene pantalla propia y el retirado sin ruta deja de publicarse", () => {
  for (const slug of VISIBLE) {
    const dir = path.join(root, "app/dashboard", slug);
    const pages = fs.existsSync(dir)
      ? fs.readdirSync(dir, { recursive: true }).filter((file) => String(file).endsWith("page.tsx"))
      : [];
    assert.ok(pages.length >= 1, `módulo visible sin pantalla: ${slug}`);
  }
  for (const slug of RETIRED.filter((item) => !RETIRED_WITH_LEGACY_ROUTE.includes(item))) {
    const dir = path.join(root, "app/dashboard", slug);
    const pages = fs.existsSync(dir)
      ? fs.readdirSync(dir, { recursive: true }).filter((file) => String(file).endsWith("page.tsx"))
      : [];
    assert.equal(pages.length, 0, `módulo retirado con pantalla operativa: ${slug}`);
  }
  for (const slug of RETIRED_WITH_LEGACY_ROUTE) {
    assert.ok(VISIBLE.includes(slug) === false, `${slug} no puede estar en el portafolio`);
    const dir = path.join(root, "app/dashboard", slug);
    assert.ok(fs.existsSync(path.join(dir, "page.tsx")), `${slug} conserva su pantalla operativa`);
  }
});

test("lobby, barra lateral y buscador solo ofrecen el portafolio", () => {
  const lobby = read("app/dashboard/page.tsx");
  assert.match(lobby, /PORTFOLIO_MODULES\.filter\(\(module\) => access\.bySlug\[module\.slug\] === true\)/);
  assert.match(lobby, /href=\{moduleHome\(module\.slug\)\}/);

  const sidebar = read("components/shell/Sidebar.tsx");
  assert.match(sidebar, /PORTFOLIO_MODULES\.map/);
  assert.match(sidebar, /href: moduleHome\(module\.slug\)/);
  assert.doesNotMatch(sidebar, /href: `\/dashboard\/\$\{module\.slug\}`/);

  const palette = read("components/system/CommandPalette.tsx");
  assert.match(palette, /isPortfolioModule\(MODULES_BY_SLUG\[slug\]\)/);
  assert.match(palette, /isPortfolioModule\(module\)/);
});

test("la ficha genérica de un módulo retirado no se publica", () => {
  const page = read("app/dashboard/[module]/page.tsx");
  assert.match(page, /isRetiredModuleSlug\(slug\)\) notFound\(\)/);
});

test("las fichas visibles dejan de declararse en construcción", () => {
  for (const slug of ["ventas", "facturacion", "tesoreria"]) {
    assert.match(moduleBlock(slug), /status: "Base funcional"/, `${slug} sigue en construcción`);
  }
  for (const slug of ["transporte", "talento-humano"]) {
    assert.match(moduleBlock(slug), /status: "Listo para operar"/, `${slug} no refleja su operación certificada`);
  }
});

test("ninguna acción frecuente ni función apunta a un módulo retirado", () => {
  for (const file of ["lib/moduleFunctions.ts", "lib/operationalWorkspace.ts"]) {
    const referenced = [...read(file).matchAll(/module: "([^"]+)"/g)].map((match) => match[1]);
    for (const slug of referenced) {
      assert.ok(!RETIRED.includes(slug), `${file} ofrece el módulo retirado ${slug}`);
    }
  }
});
