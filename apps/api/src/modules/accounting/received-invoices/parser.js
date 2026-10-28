const { XMLParser, XMLValidator } = require("fast-xml-parser");
const { appError } = require("./errors");
const { DOCUMENT_TYPES, LIMITS } = require("./constants");

const ARRAY_TAGS = new Set([
  "TaxTotal",
  "TaxSubtotal",
  "WithholdingTaxTotal",
  "InvoiceLine",
  "CreditNoteLine",
  "DebitNoteLine",
  "DocumentReference",
  "Response",
  "Attachment",
  "Traslado",
  "Retencion",
  "PartyTaxScheme",
  "PartyLegalEntity",
  "PartyName",
  "PartyIdentification",
  "TaxScheme"
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name)
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value["#text"] === "string") return value["#text"].trim() || null;
    if (typeof value["#cdata"] === "string") return value["#cdata"].trim() || null;
  }
  return null;
}

function attrOf(node, name) {
  if (!node || typeof node !== "object") return null;
  const value = node[`@_${name}`] ?? node[`@${name}`];
  if (value === undefined || value === null) return null;
  return String(value).trim() || null;
}

function child(node, name) {
  if (!node || typeof node !== "object") return undefined;
  return node[name];
}

function firstChild(node, ...names) {
  for (const name of names) {
    const value = child(node, name);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function at(node, path) {
  let current = node;
  for (const part of String(path).split(".")) {
    if (current === undefined || current === null) return null;
    if (Array.isArray(current)) current = current[0];
    current = current?.[part];
  }
  return current ?? null;
}

function deepFind(node, name, depth = 0) {
  if (!node || typeof node !== "object" || depth > 20) return null;
  if (child(node, name) !== undefined && child(node, name) !== null) return child(node, name);
  for (const value of Object.values(node)) {
    const found = deepFind(value, name, depth + 1);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

function findDeepValue(node, matcher, depth = 0) {
  if (!node || typeof node !== "object" || depth > 18) return null;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_") && matcher(key.slice(2))) {
      const text = textOf(value);
      if (text) return text;
      continue;
    }
    if (matcher(key)) {
      const text = textOf(value);
      if (text) return text;
    }
    const nested = findDeepValue(value, matcher, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function roundMoney(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Math.round(Number(value) * 100) / 100;
}

function toAmount(value) {
  const raw = textOf(value);
  if (!raw) return null;
  let normalized = raw.replace(/[^\d.,-]/g, "");
  if (!normalized || normalized === "-") return null;
  const lastDot = normalized.lastIndexOf(".");
  const lastComma = normalized.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = normalized.length - lastComma - 1;
    normalized = decimals > 0 && decimals <= 2
      ? normalized.replace(/,/g, ".")
      : normalized.replace(/,/g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function toDate(value) {
  const raw = textOf(value);
  if (!raw) return null;
  const trimmed = raw.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00.000Z`)
    : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTaxId(value) {
  const raw = textOf(value);
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/[\s.]/g, "").replace(/-/g, "");
  return compact || null;
}

function splitInvoiceNumber(raw, prefixHint) {
  const full = String(raw || "").trim();
  if (!full) return { prefix: prefixHint ? String(prefixHint).trim() : null, number: null, full: null };
  const hint = String(prefixHint || "").trim();
  if (hint) {
    const escaped = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = full.match(new RegExp(`^${escaped}[-_ ]*(.*)$`, "i"));
    if (match && match[1]) return { prefix: hint, number: match[1].trim(), full };
    return { prefix: hint, number: full, full: `${hint}-${full}` };
  }
  const match = full.match(/^(.+?)[-_ ](\d+)$/);
  if (match) return { prefix: match[1].trim(), number: match[2].trim(), full };
  return { prefix: null, number: full, full };
}

function issue(code, message, field, severity = "warning") {
  return { code, message, field, severity };
}

function normalizeDraft(draft) {
  return {
    document_type: draft.document_type || "invoice",
    document_type_label: DOCUMENT_TYPES[draft.document_type] || DOCUMENT_TYPES.unknown,
    cufe: draft.cufe ? String(draft.cufe).trim() : null,
    prefix: draft.prefix || null,
    invoice_number: draft.invoice_number ? String(draft.invoice_number).trim() : null,
    full_number: draft.full_number || (draft.invoice_number ? String(draft.invoice_number).trim() : null),
    issue_date: draft.issue_date || null,
    issuer_tax_id: draft.issuer_tax_id || null,
    issuer_name: draft.issuer_name || null,
    receiver_tax_id: draft.receiver_tax_id || null,
    receiver_name: draft.receiver_name || null,
    subtotal: roundMoney(draft.subtotal),
    iva: roundMoney(draft.iva) ?? 0,
    ica: roundMoney(draft.ica) ?? 0,
    inc: roundMoney(draft.inc) ?? 0,
    tax_total: roundMoney(draft.tax_total) ?? 0,
    total: roundMoney(draft.total),
    currency: draft.currency ? String(draft.currency).trim().toUpperCase() : null,
    dian_validation_status: draft.dian_validation_status || null,
    extraction_source: draft.extraction_source || "xml",
    line_count: Number(draft.line_count || 0),
    issues: Array.isArray(draft.issues) ? draft.issues : []
  };
}

function finalizeDraft(input) {
  const draft = normalizeDraft(input);
  const issues = [...draft.issues];
  const missing = [];
  const check = (field, value, code, label, severity = "warning") => {
    const absent = field === "total" ? !(Number(value) > 0) : value === null || value === undefined || value === "";
    if (!absent) return;
    missing.push(field);
    issues.push(issue(code, `${label} no identificado en el documento.`, field, severity));
  };

  check("invoice_number", draft.invoice_number, "NUMERO_NO_IDENTIFICADO", "Número de factura", "critical");
  check("issue_date", draft.issue_date, "FECHA_NO_IDENTIFICADA", "Fecha de emisión");
  check("issuer_tax_id", draft.issuer_tax_id, "EMISOR_NIT_NO_IDENTIFICADO", "NIT del emisor", "critical");
  check("issuer_name", draft.issuer_name, "EMISOR_NOMBRE_NO_IDENTIFICADO", "Nombre del emisor");
  check("receiver_tax_id", draft.receiver_tax_id, "RECEPTOR_NIT_NO_IDENTIFICADO", "NIT del receptor");
  check("receiver_name", draft.receiver_name, "RECEPTOR_NOMBRE_NO_IDENTIFICADO", "Nombre del receptor");
  check("total", draft.total, "TOTAL_NO_IDENTIFICADO", "Total de la factura", "critical");
  if (!draft.cufe) {
    missing.push("cufe");
    issues.push(issue("CUFE_NO_IDENTIFICADO", "CUFE/CUDE no identificado; el control de duplicados usará emisor y número.", "cufe", "warning"));
  }

  if (draft.subtotal !== null && draft.total !== null && draft.subtotal > 0) {
    const expected = roundMoney((draft.subtotal || 0) + (draft.tax_total || 0));
    if (expected !== null && Math.abs(expected - draft.total) > 0.05) {
      issues.push(issue(
        "TOTALES_INCONSISTENTES",
        `Subtotal más impuestos (${expected}) no coincide con el total informado (${draft.total}).`,
        "total",
        "critical"
      ));
    }
  }

  if (draft.extraction_source === "pdf") {
    issues.push(issue(
      "DATOS_DESDE_PDF",
      "Los datos se obtuvieron de un PDF; confirme número, NIT y total antes de aprobar.",
      "document_type",
      "warning"
    ));
  }

  draft.missing_fields = [...new Set(missing)];
  draft.validation_issues = issues;
  draft.needs_review = draft.extraction_source === "pdf" || issues.some((item) => item.severity === "critical");
  return draft;
}

function validationResponse(root) {
  const response = asArray(root.DocumentResponse)[0] || root.DocumentResponse || root;
  const code = textOf(deepFind(response, "ResponseCode")) || textOf(deepFind(response, "ResponseCodeCode"));
  const description = textOf(deepFind(response, "Description")) || textOf(deepFind(response, "ResponseCodeDescription"));
  const reference = deepFind(response, "DocumentReference") || at(response, "DocumentReference");
  const referencedNumber = textOf(child(reference, "ID")) || textOf(child(reference, "DocumentID")) || textOf(deepFind(response, "ParentDocumentID"));
  const referencedUuid = textOf(child(reference, "UUID")) || textOf(deepFind(response, "UUID"));
  const labels = {
    "00": "Aceptada por DIAN",
    "01": "Rechazada por DIAN",
    "02": "Aceptada con observaciones",
    "03": "Rechazada por DIAN"
  };
  return {
    ok: true,
    kind: "application_response",
    format: "dian_application_response",
    response_code: code,
    status: labels[code] || description || (code ? `Respuesta DIAN ${code}` : null),
    description,
    referenced_number: referencedNumber,
    referenced_uuid: referencedUuid
  };
}

function partyFrom(wrapper) {
  const party = asArray(wrapper?.Party)[0] || wrapper?.Party || wrapper || {};
  let companyId = null;
  for (const taxScheme of asArray(party.PartyTaxScheme)) {
    companyId = companyId
      || textOf(child(taxScheme, "CompanyID"))
      || textOf(child(taxScheme, "TaxID"));
  }
  if (!companyId) {
    for (const identification of asArray(party.PartyIdentification)) {
      companyId = companyId || textOf(child(identification, "ID"));
    }
  }
  const name = textOf(at(party, "PartyLegalEntity.RegistrationName"))
    || textOf(at(party, "PartyName.Name"))
    || textOf(deepFind(party, "RegistrationName"))
    || textOf(deepFind(party, "Name"));
  return {
    tax_id: normalizeTaxId(companyId),
    name
  };
}

function taxBreakdown(invoice) {
  let iva = 0;
  let ica = 0;
  let inc = 0;
  let taxTotal = 0;
  for (const totalNode of asArray(invoice.TaxTotal)) {
    const declared = toAmount(textOf(child(totalNode, "TaxAmount")));
    if (declared !== null) taxTotal += declared;
    for (const subtotal of asArray(child(totalNode, "TaxSubtotal"))) {
      const scheme = textOf(at(subtotal, "TaxCategory.TaxScheme.Name"))
        || textOf(at(subtotal, "TaxCategory.TaxScheme.ID"))
        || textOf(at(subtotal, "TaxCategory.Name"))
        || "";
      const amount = toAmount(textOf(child(subtotal, "TaxAmount"))) || 0;
      if (/IVA/i.test(scheme)) iva += amount;
      else if (/ICA/i.test(scheme)) ica += amount;
      else if (/INC|CONSUMO|IEPS/i.test(scheme)) inc += amount;
    }
  }
  if (!taxTotal) taxTotal = iva + ica + inc;
  return { iva, ica, inc, tax_total: taxTotal };
}

function parseUbl(root, kind) {
  const fullNumber = textOf(child(root, "ID")) || textOf(child(root, "InvoiceNumber"));
  const prefixHint = textOf(at(root, "InvoiceControl.InvoiceAuthorization.Prefix"))
    || attrOf(root, "Prefix");
  const number = splitInvoiceNumber(fullNumber, prefixHint);
  const supplier = partyFrom(child(root, "AccountingSupplierParty"));
  const customer = partyFrom(child(root, "AccountingCustomerParty"));
  const totals = taxBreakdown(root);
  const money = child(root, "LegalMonetaryTotal") || {};
  const subtotal = toAmount(textOf(child(money, "LineExtensionAmount")))
    ?? toAmount(textOf(child(money, "TaxExclusiveAmount")));
  const taxInclusive = toAmount(textOf(child(money, "TaxInclusiveAmount")));
  const payable = toAmount(textOf(child(money, "PayableAmount")));
  let total = payable ?? taxInclusive;
  if (total === null && subtotal !== null) total = roundMoney(subtotal + totals.tax_total);
  if ((total === null || total === 0) && taxInclusive) total = taxInclusive;

  const draft = {
    document_type: kind,
    cufe: textOf(child(root, "UUID")) || textOf(deepFind(root, "UUID")),
    prefix: number.prefix,
    invoice_number: number.number,
    full_number: number.full,
    issue_date: toDate(textOf(child(root, "IssueDate")) || textOf(child(root, "IssueDateTime"))),
    issuer_tax_id: supplier.tax_id,
    issuer_name: supplier.name,
    receiver_tax_id: customer.tax_id,
    receiver_name: customer.name,
    subtotal: subtotal ?? (total !== null ? roundMoney(total - totals.tax_total) : null),
    iva: totals.iva,
    ica: totals.ica,
    inc: totals.inc,
    tax_total: totals.tax_total,
    total,
    currency: textOf(child(root, "DocumentCurrencyCode")) || textOf(deepFind(root, "DocumentCurrencyCode")),
    dian_validation_status: null,
    extraction_source: "xml",
    line_count: asArray(child(root, "InvoiceLine")).length
      + asArray(child(root, "CreditNoteLine")).length
      + asArray(child(root, "DebitNoteLine")).length,
    issues: []
  };
  return { ok: true, kind: "invoice", format: "dian_ubl", draft: finalizeDraft(draft) };
}

function parseCfdi(root) {
  const typeCode = attrOf(root, "TipoDeComprobante");
  const documentType = typeCode === "E"
    ? "credit_note"
    : typeCode === "I"
      ? "invoice"
      : typeCode === "N"
        ? "payroll"
        : typeCode === "P" || typeCode === "T"
          ? "unknown"
          : "invoice";
  const serie = attrOf(root, "Serie");
  const folio = attrOf(root, "Folio");
  const number = splitInvoiceNumber(folio || attrOf(root, "Numero"), serie);
  const emisor = child(root, "Emisor") || {};
  const receptor = child(root, "Receptor") || {};
  const timbre = deepFind(child(root, "Complemento"), "TimbreFiscalDigital") || {};
  const impuestos = child(root, "Impuestos") || {};
  let iva = 0;
  let inc = 0;
  let taxTotal = 0;
  for (const traslado of asArray(at(impuestos, "Traslados.Traslado"))) {
    const code = attrOf(traslado, "Impuesto");
    const amount = toAmount(attrOf(traslado, "Importe")) || 0;
    taxTotal += amount;
    if (code === "002") iva += amount;
    else if (code === "003") inc += amount;
  }
  const declaredTax = toAmount(attrOf(impuestos, "TotalImpuestosTrasladados"));
  if (declaredTax !== null) taxTotal = declaredTax;
  const subtotal = toAmount(attrOf(root, "SubTotal"));
  const total = toAmount(attrOf(root, "Total"));
  const uuid = attrOf(timbre, "UUID");
  const draft = {
    document_type: documentType,
    cufe: uuid,
    prefix: serie || null,
    invoice_number: number.number,
    full_number: number.full,
    issue_date: toDate(attrOf(root, "Fecha")),
    issuer_tax_id: normalizeTaxId(attrOf(emisor, "Rfc")),
    issuer_name: attrOf(emisor, "Nombre"),
    receiver_tax_id: normalizeTaxId(attrOf(receptor, "Rfc")),
    receiver_name: attrOf(receptor, "Nombre"),
    subtotal,
    iva,
    ica: 0,
    inc,
    tax_total: taxTotal,
    total,
    currency: attrOf(root, "Moneda"),
    dian_validation_status: uuid ? "Timbrado (SAT)" : null,
    extraction_source: "xml",
    line_count: asArray(at(root, "Conceptos.Concepto")).length,
    issues: []
  };
  return { ok: true, kind: "invoice", format: "cfdi", draft: finalizeDraft(draft) };
}

function parseGeneric(root) {
  const value = (names) => {
    const matcher = (key) => names.some((name) => String(key).toLowerCase() === name.toLowerCase());
    return findDeepValue(root, matcher);
  };
  const fullNumber = value(["InvoiceNumber", "InvoiceNo", "Folio", "Numero", "Número", "Number"]);
  const total = toAmount(value(["Total", "TotalAmount", "PayableAmount", "GrandTotal", "ImporteTotal"]));
  if (!fullNumber && total === null) return null;
  const number = splitInvoiceNumber(fullNumber, value(["Serie", "Prefix", "Prefijo"]));
  const draft = {
    document_type: "invoice",
    cufe: value(["CUFE", "CUDE", "UUID"]),
    prefix: number.prefix,
    invoice_number: number.number,
    full_number: number.full,
    issue_date: toDate(value(["IssueDate", "Fecha", "FechaEmision", "Fecha de emisión"])),
    issuer_tax_id: normalizeTaxId(value(["NIT", "Rfc", "RFC", "TaxId", "CompanyID", "IssuerTaxId"])),
    issuer_name: value(["IssuerName", "SupplierName", "Emisor", "RegistrationName"]),
    receiver_tax_id: normalizeTaxId(value(["ReceiverTaxId", "CustomerTaxId", "Receptor"])),
    receiver_name: value(["ReceiverName", "CustomerName", "Receptor"]),
    subtotal: toAmount(value(["SubTotal", "Subtotal", "LineExtensionAmount"])),
    iva: toAmount(value(["IVA", "VAT", "TaxAmount"])) || 0,
    ica: 0,
    inc: 0,
    tax_total: toAmount(value(["TaxTotal", "TotalTaxes", "TotalImpuestos"])) || 0,
    total,
    currency: value(["Currency", "Moneda", "DocumentCurrencyCode"]),
    dian_validation_status: null,
    extraction_source: "xml",
    issues: []
  };
  return { ok: true, kind: "invoice", format: "generic", draft: finalizeDraft(draft) };
}

function embeddedInvoice(xml) {
  const match = String(xml).match(/<(?:[A-Za-z0-9]+:)?(Invoice|CreditNote|DebitNote)\b[\s\S]*?<\/(?:[A-Za-z0-9]+:)?\1>/);
  if (!match) return null;
  return match[0];
}

function parseInvoiceXml(xml, { fileName = null } = {}) {
  const raw = typeof xml === "string" ? xml : Buffer.from(xml || "").toString("utf8");
  if (!raw.trim()) throw appError("El archivo XML está vacío.", "XML_VACIO", 422, { file_name: fileName });
  if (Buffer.byteLength(raw, "utf8") > LIMITS.MAX_XML_BYTES) {
    throw appError("El XML supera el tamaño permitido.", "XML_DEMASIADO_GRANDE", 413, { file_name: fileName });
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) {
    throw appError("El XML contiene declaraciones no permitidas (DOCTYPE/ENTITY).", "XML_NO_SEGURO", 422, { file_name: fileName });
  }
  const validation = XMLValidator.validate(raw);
  if (validation !== true) {
    throw appError("El XML está mal formado o truncado.", "XML_INVALIDO", 422, { file_name: fileName, detail: validation.err });
  }
  const document = xmlParser.parse(raw);
  const entries = Object.entries(document).filter(([key]) => !key.startsWith("?") && key !== "#text");
  const [rootName, rootNode] = entries[0] || [];
  if (!rootName || !rootNode) throw appError("El XML no contiene un documento reconocible.", "XML_NO_RECONOCIDO", 422, { file_name: fileName });

  if (rootName === "AttachedDocument") {
    const attachment = deepFind(rootNode, "Attachment");
    const description = textOf(deepFind(attachment, "Description")) || textOf(attachment);
    const embedded = description ? embeddedInvoice(description) : null;
    if (embedded) return parseInvoiceXml(embedded, { fileName });
    throw appError("El documento adjunto no contiene una factura legible.", "XML_ADJUNTO_SIN_FACTURA", 422, { file_name: fileName });
  }
  if (rootName === "ApplicationResponse") {
    return validationResponse(rootNode);
  }
  if (rootName === "Comprobante") {
    return parseCfdi(rootNode);
  }
  if (rootName === "Invoice") {
    return parseUbl(rootNode, "invoice");
  }
  if (rootName === "CreditNote") {
    return parseUbl(rootNode, "credit_note");
  }
  if (rootName === "DebitNote") {
    return parseUbl(rootNode, "debit_note");
  }
  const generic = parseGeneric(rootNode);
  if (generic) return generic;
  throw appError("El XML no contiene campos de factura reconocibles.", "XML_NO_RECONOCIDO", 422, { file_name: fileName });
}

function buildDedupeKey(draft) {
  const cufe = String(draft.cufe || "").trim().toLowerCase();
  if (cufe) return `cufe:${cufe}`;
  const issuer = normalizeTaxId(draft.issuer_tax_id) || "sin-nit";
  const prefix = String(draft.prefix || "").trim().toLowerCase();
  const number = String(draft.invoice_number || "").trim().toLowerCase();
  const total = Number(draft.total || 0).toFixed(2);
  return `doc:${issuer}|${prefix}|${number}|${total}`;
}

module.exports = {
  parseInvoiceXml,
  finalizeDraft,
  buildDedupeKey,
  normalizeTaxId,
  normalizeDraft,
  splitInvoiceNumber,
  toAmount,
  toDate,
  roundMoney
};
