const COMMON_PARTY_FIELDS = [
  "id",
  "tax_id",
  "tax_type",
  "name",
  "legal_name",
  "email",
  "phone",
  "address",
  "city",
  "country"
];

function compactTaxId(value) {
  return String(value == null ? "" : value)
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s.]/g, "")
    .replace(/[^0-9A-Z-]/g, "");
}

/**
 * Parses a Colombian tax id without guessing a verification digit when the
 * source does not delimit one. A final hyphen followed by one alphanumeric
 * character is the only delimiter treated as an explicit DV.
 */
function normalizeTaxId(value) {
  const compact = compactTaxId(value);
  const match = compact.match(/^(.+)-([0-9A-Z])$/);
  if (!match) return { base: compact.replace(/-/g, ""), verification_digit: null, compact: compact.replace(/-/g, "") };
  return { base: match[1].replace(/-/g, ""), verification_digit: match[2], compact: `${match[1].replace(/-/g, "")}${match[2]}` };
}

function taxIdsMatch(left, right) {
  const a = normalizeTaxId(left);
  const b = normalizeTaxId(right);
  if (!a.base || !b.base) return false;
  if (a.compact === b.compact) return true;
  // A query without DV may match the base of a stored, explicitly DV-suffixed NIT.
  if (a.verification_digit == null && b.verification_digit != null) return a.base === b.base;
  if (b.verification_digit == null && a.verification_digit != null) return a.base === b.base;
  return false;
}

function partyVerificationDigit(party) {
  if (party?.verification_digit != null && String(party.verification_digit).trim() !== "") return String(party.verification_digit).trim().toUpperCase();
  return party?.metadata?.verification_digit
    ?? party?.metadata?.verificationDigit
    ?? normalizeTaxId(party?.tax_id).verification_digit
    ?? null;
}

function partyTaxIdForComparison(party = {}) {
  const parsed = normalizeTaxId(party.tax_id);
  if (parsed.verification_digit != null || !partyVerificationDigit(party)) return party.tax_id;
  return `${parsed.base}-${partyVerificationDigit(party)}`;
}

function partyCommonFields(party = {}) {
  return {
    id: party.id,
    tax_id: party.tax_id || null,
    tax_type: party.tax_type || party.metadata?.document_type || null,
    verification_digit: partyVerificationDigit(party),
    name: party.name || null,
    legal_name: party.legal_name || party.name || null,
    trade_name: party.metadata?.trade_name || party.metadata?.commercial_name || null,
    email: party.email || null,
    phone: party.phone || null,
    address: party.address || null,
    city: party.city || null,
    country: party.country || "CO"
  };
}

function partyMatchesSearch(party, search = "") {
  const term = String(search || "").trim();
  if (!term) return true;
  if (taxIdsMatch(term, party.tax_id)) return true;
  const normalized = term.toLowerCase();
  return [party.name, party.legal_name, party.metadata?.trade_name, party.metadata?.commercial_name]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function filterPartyCandidates(parties, search = "", limit = 50) {
  return (Array.isArray(parties) ? parties : [])
    .filter((party) => party && party.active !== false && partyMatchesSearch(party, search))
    .slice(0, Math.max(1, Math.min(Number(limit) || 50, 100)))
    .map(partyCommonFields);
}

function resolveExplicitParty({ parties, accounting_party_id, nit }) {
  const partyId = accounting_party_id == null || accounting_party_id === "" ? null : Number(accounting_party_id);
  if (accounting_party_id != null && accounting_party_id !== "" && !Number.isInteger(partyId)) {
    return { ok: false, code: "TERCERO_CONTABLE_INVALIDO" };
  }
  if (partyId == null) return { ok: true, party: null, common_fields: null };
  const party = (Array.isArray(parties) ? parties : []).find((item) => Number(item.id) === partyId && item.active !== false);
  if (!party) return { ok: false, code: "TERCERO_CONTABLE_NO_ENCONTRADO" };
  if (nit && party.tax_id && !taxIdsMatch(nit, partyTaxIdForComparison(party))) {
    return { ok: false, code: "TERCERO_NIT_NO_COINCIDE", party: partyCommonFields(party) };
  }
  return { ok: true, party: partyCommonFields(party), common_fields: partyCommonFields(party) };
}

module.exports = {
  COMMON_PARTY_FIELDS,
  normalizeTaxId,
  compactTaxId,
  taxIdsMatch,
  partyCommonFields,
  partyTaxIdForComparison,
  partyMatchesSearch,
  filterPartyCandidates,
  resolveExplicitParty
};
