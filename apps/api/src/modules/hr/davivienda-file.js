// Archivo plano Davivienda "Pagos Masivos" (nomina). Registros fijos de 170 caracteres:
// 1 encabezado RC + N detalles TR, separados por CRLF y sin CRLF final. Valores en centavos.
const RECORD_LENGTH = 170;
const DOCUMENT_TYPE_CODES = { CC: "01", CE: "02", NIT: "03", TI: "04", PA: "05", PASAPORTE: "05", PEP: "05", PPT: "05" };

function fileError(message, details = []) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = "PLANO_DAVIVIENDA_INVALIDO";
  error.details = details;
  return error;
}

const digitsOnly = (value) => String(value ?? "").replace(/\D/g, "");
const padNum = (value, length) => String(value).padStart(length, "0");
const toCents = (amount) => Math.round(Number(amount) * 100);
const documentTypeCode = (type) => DOCUMENT_TYPE_CODES[String(type || "").trim().toUpperCase()] || "01";
const accountTypeCode = (type) => (/^(CC|corriente)$/i.test(String(type || "").trim()) ? "CC" : "CA");
const bankCode6 = (code) => padNum(digitsOnly(code), 6);

function formatDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.replace(/-/g, "") : "";
}

function buildHeader({ company, totalCents, count, applicationDate }) {
  const nit = padNum(digitsOnly(company.nit) + digitsOnly(company.dv), 16);
  return [
    "RC", nit, "NOMI", "NOMI", padNum(digitsOnly(company.debitAccount), 16), accountTypeCode(company.debitAccountType),
    "000051", padNum(totalCents, 18), padNum(count, 6), applicationDate, "000000", "0000", "9999",
    "00000000", "000000", "01", "01"
  ].join("").padEnd(RECORD_LENGTH, "0");
}

function buildDetail(row, cents) {
  return [
    "TR", padNum(digitsOnly(row.document), 16), "0".repeat(16), padNum(digitsOnly(row.accountNumber), 16),
    accountTypeCode(row.accountType), bankCode6(row.bankCode), padNum(cents, 18), "000000",
    documentTypeCode(row.documentType), "0", "9999"
  ].join("").padEnd(RECORD_LENGTH, "0");
}

function buildDaviviendaPayrollFile({ company = {}, applicationDate, rows = [], periodKey = "" } = {}) {
  const problems = [];
  const date = formatDate(applicationDate);
  if (!/^\d{1,15}$/.test(String(company.nit ?? "").trim())) problems.push("NIT de la empresa invalido o vacio (configuracion laboral > Archivo plano Davivienda).");
  if (!/^\d$/.test(String(company.dv ?? "").trim())) problems.push("Digito de verificacion de la empresa vacio.");
  if (!digitsOnly(company.debitAccount) || String(company.debitAccount).trim() !== digitsOnly(company.debitAccount) || digitsOnly(company.debitAccount).length > 16) problems.push("Cuenta debito de la empresa invalida o vacia.");
  if (!date) problems.push("Fecha de aplicacion invalida (use AAAA-MM-DD).");
  if (!rows.length) problems.push("No hay pagos para incluir en el archivo.");
  let totalCents = 0;
  const details = [];
  rows.forEach((row, index) => {
    const label = row.label || row.document || `fila ${index + 1}`;
    const doc = digitsOnly(row.document);
    const account = String(row.accountNumber ?? "").trim();
    const cents = toCents(row.amount);
    const before = problems.length;
    if (!doc || doc.length > 16) problems.push(`${label}: documento invalido.`);
    if (!account) problems.push(`${label}: sin numero de cuenta bancaria.`);
    else if (!/^\d+$/.test(account) || account.length > 16) problems.push(`${label}: cuenta bancaria invalida (solo digitos, maximo 16).`);
    if (!digitsOnly(row.bankCode) || digitsOnly(row.bankCode).length > 6) problems.push(`${label}: sin banco valido.`);
    if (!Number.isFinite(cents) || cents <= 0) problems.push(`${label}: el valor a pagar debe ser mayor que cero.`);
    else if (String(cents).length > 18) problems.push(`${label}: el valor excede el campo.`);
    if (problems.length === before) {
      totalCents += cents;
      details.push(buildDetail(row, cents));
    }
  });
  if (problems.length) throw fileError(`No se pudo generar el plano Davivienda: ${problems.join(" ")}`, problems);
  const header = buildHeader({ company, totalCents, count: details.length, applicationDate: date });
  const safePeriod = String(periodKey || "").replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  return {
    content: [header, ...details].join("\r\n"),
    totalCents,
    count: details.length,
    fileName: `DAVIVIENDA_NOMINA_${date}${safePeriod ? `_${safePeriod}` : ""}.txt`
  };
}

module.exports = { buildDaviviendaPayrollFile, buildHeader, buildDetail, toCents, documentTypeCode, accountTypeCode, bankCode6, RECORD_LENGTH };
