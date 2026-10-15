const test = require("node:test");
const assert = require("node:assert/strict");

const matcher = require("../src/modules/hr/laborEntityPartyMatcher");

test("separa un DV explícitamente delimitado y no lo inventa", () => {
  assert.deepEqual(matcher.normalizeTaxId("900.123.456-7"), {
    base: "900123456",
    verification_digit: "7",
    compact: "9001234567"
  });
  assert.deepEqual(matcher.normalizeTaxId("900123456"), {
    base: "900123456",
    verification_digit: null,
    compact: "900123456"
  });
});

test("compara NIT con y sin separadores sin forzar base+DV", () => {
  assert.equal(matcher.taxIdsMatch("900.123.456-7", "9001234567"), true);
  assert.equal(matcher.taxIdsMatch("900.123.456", "900123456-7"), true);
  assert.equal(matcher.taxIdsMatch("900123456", "901123456-7"), false);
});

test("el prefiltro devuelve solo campos comunes y excluye finanzas/metadata", () => {
  const rows = matcher.filterPartyCandidates([
    {
      id: 3,
      active: true,
      tax_id: "900.123.456-7",
      tax_type: "NIT",
      name: "EPS Uno",
      legal_name: "EPS Uno S.A.S.",
      email: "eps@example.test",
      phone: "3001234567",
      address: "Calle 1",
      city: "Bogotá",
      balance: 999,
      metadata: { trade_name: "EPS Uno", receivable_account_code: "130505" }
    },
    { id: 4, active: false, tax_id: "900123457", name: "Inactiva" }
  ], "9001234567");

  assert.deepEqual(rows, [{
    id: 3,
    tax_id: "900.123.456-7",
    tax_type: "NIT",
    verification_digit: "7",
    name: "EPS Uno",
    legal_name: "EPS Uno S.A.S.",
    trade_name: "EPS Uno",
    email: "eps@example.test",
    phone: "3001234567",
    address: "Calle 1",
    city: "Bogotá",
    country: "CO"
  }]);
});

test("el vínculo requiere selección explícita y valida NIT", () => {
  const parties = [{ id: 8, active: true, tax_id: "900123456-7", name: "Entidad" }];
  assert.equal(matcher.resolveExplicitParty({ parties, nit: "900123456-7" }).party, null);
  assert.equal(matcher.resolveExplicitParty({ parties, accounting_party_id: 8, nit: "900123456-7" }).ok, true);
  assert.equal(matcher.resolveExplicitParty({ parties, accounting_party_id: 8, nit: "901123456-7" }).code, "TERCERO_NIT_NO_COINCIDE");
  assert.equal(matcher.resolveExplicitParty({ parties, accounting_party_id: 99 }).code, "TERCERO_CONTABLE_NO_ENCONTRADO");
});

test("usa el DV del Party aunque esté separado en metadata y rechaza un DV distinto", () => {
  const parties = [{ id: 12, active: true, tax_id: "900123456", name: "EPS con DV", metadata: { verification_digit: "7" } }];
  assert.equal(matcher.resolveExplicitParty({ parties, accounting_party_id: 12, nit: "900123456-7" }).ok, true);
  assert.equal(matcher.resolveExplicitParty({ parties, accounting_party_id: 12, nit: "900123456-8" }).code, "TERCERO_NIT_NO_COINCIDE");
  assert.equal(matcher.resolveExplicitParty({ parties, accounting_party_id: 12, nit: "900123456" }).ok, true);
  assert.equal(matcher.partyMatchesSearch(parties[0], "9001234567"), true);
  assert.equal(matcher.partyMatchesSearch(parties[0], "900123456-8"), false);
});

