process.env.DISABLE_REDIS = "true";
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PUC_COLOMBIA_CATALOG,
  PUC_COLOMBIA_PROVENANCE,
  parsePucCatalogRecords,
  validatePucCatalog
} = require("../src/modules/accounting/puc-colombia-catalog");
const { validateChartTreeCatalog } = require("../src/modules/accounting/service");

test("el catalogo colombiano versionado conserva las 2.502 cuentas 1/2/4/6", () => {
  const rows = validatePucCatalog();
  assert.equal(rows.length, 2502);
  assert.deepEqual(
    Object.fromEntries([1, 2, 4, 6].map((length) => [length, rows.filter((row) => row.code_length === length).length])),
    { 1: 9, 2: 52, 4: 340, 6: 2101 }
  );
  assert.equal(rows.some((row) => row.code_length === 8), false);
  assert.equal(new Set(rows.map((row) => row.code)).size, rows.length);
  assert.equal(rows.some((row) => !row.name || row.parent_code === row.code), false);
  assert.ok(rows.every((row) => row.active === true && row.allows_tx === false));
});

test("tipa las nueve clases y mantiene padres de checkpoints PUC", () => {
  const rows = validatePucCatalog();
  const byCode = new Map(rows.map((row) => [row.code, row]));
  assert.equal(byCode.get("1").type, "asset");
  assert.equal(byCode.get("2").type, "liability");
  assert.equal(byCode.get("3").type, "equity");
  assert.equal(byCode.get("4").type, "income");
  assert.equal(byCode.get("5").type, "expense");
  assert.equal(byCode.get("6").type, "cost");
  assert.equal(byCode.get("7").type, "cost");
  assert.equal(byCode.get("8").type, "order");
  assert.equal(byCode.get("9").type, "order");
  assert.equal(byCode.get("1105").name, "Caja");
  assert.equal(byCode.get("110505").parent_code, "1105");
  assert.equal(byCode.get("110505").level, 4);
  assert.equal(byCode.get("110505").code_length, 6);
  assert.equal(byCode.get("1305").name, "Clientes");
});

test("la provenance declara las nueve fuentes publicas y calidad de extraccion", () => {
  assert.equal(PUC_COLOMBIA_PROVENANCE.record_count, 2502);
  assert.equal(PUC_COLOMBIA_PROVENANCE.source_pages.length, 9);
  assert.ok(PUC_COLOMBIA_PROVENANCE.source_pages.every((page) => page.status === 200));
  assert.deepEqual(PUC_COLOMBIA_PROVENANCE.counts_by_code_length, { "1": 9, "2": 52, "4": 340, "6": 2101 });
  assert.equal(PUC_COLOMBIA_PROVENANCE.quality.orphan_parent_count, 0);
  assert.equal(PUC_COLOMBIA_PROVENANCE.quality.contains_8_digit_codes, false);
  assert.match(PUC_COLOMBIA_PROVENANCE.legal_reference, /^https:\/\/puc\.com\.co\//);
});

test("el parser rechaza auxiliares de ocho digitos y padres inconsistentes", () => {
  assert.throws(() => parsePucCatalogRecords([{ code: "11050501", name: "Auxiliar", parent_code: "110505" }]), /PUC_INVALID_CODE/);
  assert.throws(() => parsePucCatalogRecords([{ code: "110505", name: "Caja general", parent_code: "11" }]), /PUC_INVALID_PARENT/);
});

assert.ok(PUC_COLOMBIA_CATALOG.length > 2000);




test("el catalogo completo cumple el contrato del arbol contable", () => {
  const rows = validateChartTreeCatalog(PUC_COLOMBIA_CATALOG);
  assert.equal(rows.length, 2502);
  assert.equal(rows[0].code, "1");
  assert.equal(rows.at(-1).code.length, 6);
});
