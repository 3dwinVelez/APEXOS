export type PayrollParty = {
  id: number;
  name?: string;
  legal_name?: string;
  tax_id?: string;
  tax_type?: string;
  verification_digit?: number | string | null;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  metadata?: { verification_digit?: number | string | null; person_type?: string; document_type?: string };
};

export function normalizePartyDocument(value: unknown) {
  return String(value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function findPartyByDocument(parties: PayrollParty[], document: string) {
  const normalized = normalizePartyDocument(document);
  if (!normalized) return null;
  const matches = parties.filter((party) => {
    const taxId = normalizePartyDocument(party.tax_id);
    const dv = party.verification_digit ?? party.metadata?.verification_digit;
    const combined = `${taxId}${normalizePartyDocument(dv)}`;
    return taxId === normalized || combined === normalized;
  });
  return matches.length === 1 ? matches[0] : null;
}

export function commonPartyFields(party: PayrollParty | null) {
  if (!party) return {};
  const verificationDigit = party.verification_digit ?? party.metadata?.verification_digit;
  return {
    nit: party.tax_id || "",
    verification_digit: verificationDigit == null ? "" : String(verificationDigit),
    legal_name: party.legal_name || party.name || ""
  };
}
