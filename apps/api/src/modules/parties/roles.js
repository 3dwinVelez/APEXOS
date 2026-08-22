const OPERATIONAL_PARTY_ROLES = ["customer", "supplier", "employee"];

function normalizePartyRoles(party = {}) {
  const flags = party.metadata?.role_flags || {};
  const roles = OPERATIONAL_PARTY_ROLES.filter((role) => flags[role] === true);
  if (OPERATIONAL_PARTY_ROLES.includes(party.type) && !roles.includes(party.type)) roles.push(party.type);
  return roles;
}

function hasPartyRole(party, role) {
  return normalizePartyRoles(party).includes(role);
}

function partyRoleWhere(role) {
  return {
    OR: [
      { type: role },
      { metadata: { path: ["role_flags", role], equals: true } }
    ]
  };
}

function withPartyRoles(metadata = {}, roles = [], options = {}) {
  const currentFlags = options.replace
    ? Object.fromEntries(OPERATIONAL_PARTY_ROLES.map((role) => [role, false]))
    : (metadata?.role_flags || {});
  const roleFlags = { ...currentFlags };
  for (const role of roles) {
    if (OPERATIONAL_PARTY_ROLES.includes(role)) roleFlags[role] = true;
  }
  return { ...(metadata || {}), role_flags: roleFlags };
}

function primaryPartyType(roles, fallback = "customer") {
  return OPERATIONAL_PARTY_ROLES.find((role) => roles.includes(role)) || fallback;
}

function presentPartyForRole(party, role) {
  if (!party) return party;
  return {
    ...party,
    roles: normalizePartyRoles(party),
    credit_limit: Number(party.metadata?.[`${role}_credit_limit`] ?? party.credit_limit ?? 0),
    credit_days: Number(party.metadata?.[`${role}_credit_days`] ?? party.credit_days ?? 0),
    balance: role === "supplier"
      ? (party.payable_balance ?? party.balance ?? 0)
      : (party.receivable_balance ?? party.balance ?? 0)
  };
}

module.exports = {
  OPERATIONAL_PARTY_ROLES,
  normalizePartyRoles,
  hasPartyRole,
  partyRoleWhere,
  withPartyRoles,
  primaryPartyType,
  presentPartyForRole
};
