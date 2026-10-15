import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountTree,
  fetchAccountPages,
  filterAccountTree,
  normalizeChartPreview,
} from "../lib/accounting-account-tree.ts";

const account = (id, code, name, parent_id = null) => ({ id, code, name, parent_id });

test("carga paginas completas, deduplica registros y conserva los offsets", async () => {
  const requests = [];
  const pages = [
    Array.from({ length: 500 }, (_, index) => account(index + 1, String(index + 1), `Cuenta ${index + 1}`)),
    Array.from({ length: 500 }, (_, index) => account(index + 501, String(index + 501), `Cuenta ${index + 501}`)),
    [account(1001, "1001", "Cuenta 1001"), account(1001, "1001", "Cuenta 1001")],
  ];
  const result = await fetchAccountPages(async (offset, limit) => {
    requests.push({ offset, limit });
    return pages[offset / 500];
  });
  assert.deepEqual(requests, [{ offset: 0, limit: 500 }, { offset: 500, limit: 500 }, { offset: 1000, limit: 500 }]);
  assert.equal(result.length, 1001);
});

test("construye arbol con parent_id, expone huerfanos y termina ante ciclos", () => {
  const tree = buildAccountTree([
    account(1, "1", "Activo"), account(2, "11", "Disponible", 1), account(3, "12", "Huerfana", 99),
    account(4, "13", "Ciclo A", 5), account(5, "14", "Ciclo B", 4),
  ]);
  assert.equal(tree.find((node) => node.id === 1)?.children[0].id, 2);
  assert.equal(tree.find((node) => node.id === 3)?.orphan, true);
  assert.equal(tree.find((node) => node.id === 4)?.orphan, true);
  assert.equal(tree.find((node) => node.id === 5)?.orphan, true);
  assert.equal(tree.length, 4);
});

test("distingue clases raiz validas de cuentas numericas sin ascendencia", () => {
  const tree = buildAccountTree([
    account(1, "1", "Activo"),
    account(2, "1105", "Caja sin padre"),
    account(3, "110505", "Auxiliar sin padre"),
  ]);
  assert.equal(tree.find((node) => node.code === "1")?.orphan, false);
  assert.equal(tree.find((node) => node.code === "1105")?.orphan, true);
  assert.equal(tree.find((node) => node.code === "110505")?.orphan, true);
});

test("filtra por codigo o nombre y conserva todos los ancestros", () => {
  const tree = buildAccountTree([
    account(1, "1", "Activo"), account(2, "11", "Disponible", 1), account(3, "1105", "Caja", 2), account(4, "2", "Pasivo"),
  ]);
  const filtered = filterAccountTree(tree, "Caja");
  assert.deepEqual(filtered.map((node) => node.code), ["1"]);
  assert.deepEqual(filtered[0].children[0].children.map((node) => node.code), ["1105"]);
});

test("normaliza preview y bloquea solo conflictos estructurales", () => {
  const ready = normalizeChartPreview({ existing_count: 3, total_catalog_entries: 2502, creates: [{ code: "11050501" }], repairs: [{ code: "1105" }], warnings: [{ code: "1105", reason: "Nombre distinto" }] });
  assert.deepEqual({ existing: ready.existing_count, catalog: ready.catalog_count, create: ready.create_count, link: ready.link_count }, { existing: 3, catalog: 2502, create: 1, link: 1 });
  assert.equal(ready.warning_count, 1);
  assert.equal(ready.apply_ready, true);
  const blocked = normalizeChartPreview({ missing_parent_count: 1, conflicts: [{ code: "11050501", reason: "Padre ausente" }] });
  assert.equal(blocked.conflict_count, 2);
  assert.equal(blocked.apply_ready, false);
});
