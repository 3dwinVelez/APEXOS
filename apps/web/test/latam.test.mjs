import assert from "node:assert/strict";
import test from "node:test";

import {
  currencyForCountry,
  taxIdLabel,
  taxRatesForCountry
} from "../lib/latam.ts";

test("uses safe fiscal defaults when a supplier has no country yet", () => {
  assert.equal(taxIdLabel(""), "ID fiscal");
  assert.equal(taxIdLabel(null), "ID fiscal");
  assert.equal(currencyForCountry("", "COP"), "COP");
  assert.deepEqual(taxRatesForCountry(""), [0, 5, 8, 10, 12, 13, 15, 16, 18, 19, 21, 22]);
});

test("keeps country-specific supplier configuration", () => {
  assert.equal(taxIdLabel("CO"), "NIT/CC");
  assert.equal(currencyForCountry("CO"), "COP");
  assert.deepEqual(taxRatesForCountry("CO"), [0, 5, 19]);
});
