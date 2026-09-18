const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  normalizePartyRoles,
  hasPartyRole,
  partyRoleWhere,
  withPartyRoles,
  presentPartyForRole
} = require("../src/modules/parties/roles");

test("legacy Party.type remains an operational role", () => {
  const party = { type: "supplier", metadata: {} };
  assert.deepEqual(normalizePartyRoles(party), ["supplier"]);
  assert.equal(hasPartyRole(party, "supplier"), true);
});

test("one party can be customer and supplier without duplicating the NIT", () => {
  const metadata = withPartyRoles({ source: "accounting" }, ["customer", "supplier"]);
  const party = { type: "customer", metadata };
  assert.deepEqual(normalizePartyRoles(party), ["customer", "supplier"]);
  assert.equal(hasPartyRole(party, "customer"), true);
  assert.equal(hasPartyRole(party, "supplier"), true);
});

test("canonical accounting edit can remove a role explicitly", () => {
  const metadata = withPartyRoles({ role_flags: { customer: true, supplier: true } }, ["customer"], { replace: true });
  assert.deepEqual(metadata.role_flags, { customer: true, supplier: false, employee: false });
});

test("role filters include canonical flags and legacy type", () => {
  assert.deepEqual(partyRoleWhere("customer"), {
    OR: [
      { type: "customer" },
      { metadata: { path: ["role_flags", "customer"], equals: true } }
    ]
  });
});

test("role views expose independent balances and credit conditions", () => {
  const party = { type: "customer", metadata: { role_flags: { supplier: true }, customer_credit_limit: 500, supplier_credit_days: 45 }, receivable_balance: 120, payable_balance: 75, credit_limit: 10, credit_days: 5 };
  assert.equal(presentPartyForRole(party, "customer").balance, 120);
  assert.equal(presentPartyForRole(party, "supplier").balance, 75);
  assert.equal(presentPartyForRole(party, "customer").credit_limit, 500);
  assert.equal(presentPartyForRole(party, "supplier").credit_days, 45);
});

test("canonical party migration is additive and backfills legacy roles", () => {
  const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20260806150000_canonical_party_roles/migration.sql"), "utf8");
  for (const token of ["ADD COLUMN \"receivable_balance\"", "ADD COLUMN \"payable_balance\"", "jsonb_set", "role_flags"]) {
    assert.ok(migration.includes(token), `Missing migration contract: ${token}`);
  }
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE|DELETE)\b/i);
});
