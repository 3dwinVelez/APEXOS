const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/transporte/planeacion/page.tsx"), "utf8");

test("el planeador aplica los componentes y tokens normativos de APEXOS", () => {
  for (const required of ["<Button", "<Input", "<Select", "<Alert", "<Badge", "<Skeleton", "<EmptyState", "bg-surface", "text-content-muted"]) {
    assert.match(page, new RegExp(required.replace(/[<]/g, "\\<")), `Falta ${required}`);
  }
  for (const forbidden of ["bg-gradient", "rounded-xl", "hover:-translate", "hover:shadow", "bg-white", "text-neutral-"]) {
    assert.equal(page.includes(forbidden), false, `Patron UX prohibido: ${forbidden}`);
  }
});

test("el planeador protege acciones y objetivos tactiles", () => {
  assert.match(page, /loading=\{evaluating\}/);
  assert.match(page, /loading=\{committing\}/);
  assert.match(page, /h-12 sm:h-10/);
  assert.match(page, /aria-pressed=/);
});
