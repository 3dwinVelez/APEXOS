export const LATAM_COUNTRIES = [
  { code: "AR", name: "Argentina", currency: "ARS", taxId: "CUIT", taxRates: [0, 10.5, 21] },
  { code: "BO", name: "Bolivia", currency: "BOB", taxId: "NIT", taxRates: [0, 13] },
  { code: "BR", name: "Brasil", currency: "BRL", taxId: "CNPJ/CPF", taxRates: [0, 7, 12, 17] },
  { code: "CL", name: "Chile", currency: "CLP", taxId: "RUT", taxRates: [0, 19] },
  { code: "CO", name: "Colombia", currency: "COP", taxId: "NIT/CC", taxRates: [0, 5, 19] },
  { code: "CR", name: "Costa Rica", currency: "CRC", taxId: "Cedula juridica", taxRates: [0, 1, 2, 13] },
  { code: "DO", name: "Republica Dominicana", currency: "DOP", taxId: "RNC/Cedula", taxRates: [0, 16, 18] },
  { code: "EC", name: "Ecuador", currency: "USD", taxId: "RUC", taxRates: [0, 12, 15] },
  { code: "GT", name: "Guatemala", currency: "GTQ", taxId: "NIT", taxRates: [0, 12] },
  { code: "HN", name: "Honduras", currency: "HNL", taxId: "RTN", taxRates: [0, 15, 18] },
  { code: "MX", name: "Mexico", currency: "MXN", taxId: "RFC", taxRates: [0, 8, 16] },
  { code: "NI", name: "Nicaragua", currency: "NIO", taxId: "RUC", taxRates: [0, 15] },
  { code: "PA", name: "Panama", currency: "PAB", taxId: "RUC", taxRates: [0, 7] },
  { code: "PE", name: "Peru", currency: "PEN", taxId: "RUC", taxRates: [0, 18] },
  { code: "PY", name: "Paraguay", currency: "PYG", taxId: "RUC", taxRates: [0, 5, 10] },
  { code: "SV", name: "El Salvador", currency: "USD", taxId: "NIT/NRC", taxRates: [0, 13] },
  { code: "UY", name: "Uruguay", currency: "UYU", taxId: "RUT", taxRates: [0, 10, 22] },
  { code: "VE", name: "Venezuela", currency: "VES", taxId: "RIF", taxRates: [0, 8, 16] }
] as const;

export const LATAM_CURRENCIES = Array.from(new Set(LATAM_COUNTRIES.map((country) => country.currency).concat("USD"))).sort();

export function countryConfig(country: string | null) {
  return LATAM_COUNTRIES.find((entry) => entry.code === country);
}

export function currencyForCountry(country: string | null, fallback = "USD") {
  return countryConfig(country)?.currency || fallback;
}

export function taxIdLabel(country: string | null) {
  return countryConfig(country)?.taxId || "ID fiscal";
}

export function taxRatesForCountry(country: string | null) {
  return countryConfig(country)?.taxRates || [0, 5, 8, 10, 12, 13, 15, 16, 18, 19, 21, 22];
}

export function money(value: number, currency = "USD") {
  const zeroDecimal = ["CLP", "COP", "PYG"].includes(currency);
  return new Intl.NumberFormat("es-419", {
    style: "currency",
    currency,
    maximumFractionDigits: zeroDecimal ? 0 : 2
  }).format(Number(value || 0));
}
