const { XMLParser, XMLValidator } = require("fast-xml-parser");

const MAX_XML_BYTES = 10 * 1024 * 1024;
const INVOICE_ROOTS = new Set(["Invoice", "CreditNote", "DebitNote"]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
});

function parseError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
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
  const value = node[`@_${name}`];
  return value === undefined || value === null ? null : String(value).trim() || null;
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanNit(raw) {
  const text = textOf(raw);
  if (!text) return null;
  const withoutDv = text.split("-")[0];
  const digits = withoutDv.replace(/[^0-9]/g, "");
  return digits || null;
}

function rawTaxId(raw) {
  const text = textOf(raw);
  if (!text) return null;
  const compact = text.toUpperCase().replace(/[\s.]/g, "").replace(/-/g, "");
  return compact || null;
}

function toAmount(value) {
  const raw = textOf(value);
  if (!raw) return null;
  const normalized = raw.replace(/[^\d.,-]/g, "");
  if (!normalized || normalized === "-") return null;
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function findDeep(node, name, depth = 0) {
  if (!node || typeof node !== "object" || depth > 20) return null;
  if (node[name] !== undefined && node[name] !== null) return node[name];
  for (const value of Object.values(node)) {
    const found = findDeep(value, name, depth + 1);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

function collectDeep(node, name, depth = 0, acc = []) {
  if (!node || typeof node !== "object" || depth > 20) return acc;
  for (const [key, value] of Object.entries(node)) {
    if (key === name && value !== undefined && value !== null) acc.push(value);
    else collectDeep(value, name, depth + 1, acc);
  }
  return acc;
}

function unwrapInvoiceRoot(document) {
  const entries = Object.entries(document).filter(([key]) => !key.startsWith("?") && key !== "#text");
  let [rootName, rootNode] = entries[0] || [];
  if (!rootName || !rootNode) throw parseError("El XML no contiene un documento reconocible.", "XML_NO_RECONOCIDO");

  if (!INVOICE_ROOTS.has(rootName) && rootName !== "AttachedDocument") {
    return { rootName, rootNode };
  }

  if (rootName === "AttachedDocument") {
    const embedded = collectDeep(rootNode, "Description")
      .flatMap((value) => asArray(value))
      .map((description) => {
        const text = textOf(description);
        return text && text.startsWith("<") ? text : null;
      })
      .filter(Boolean)
      .map((text) => {
        try {
          const validated = XMLValidator.validate(text);
          if (validated !== true) return null;
          return xmlParser.parse(text);
        } catch {
          return null;
        }
      })
      .map((embeddedDoc) => {
        if (!embeddedDoc) return null;
        const entry = Object.entries(embeddedDoc).find(([key]) => INVOICE_ROOTS.has(key));
        return entry ? { rootName: entry[0], rootNode: entry[1] } : null;
      })
      .find((candidate) => candidate !== null);
    if (embedded) return embedded;
    for (const name of INVOICE_ROOTS) {
      if (rootNode[name] !== undefined && rootNode[name] !== null) {
        return { rootName: name, rootNode: rootNode[name] };
      }
    }
    throw parseError("El AttachedDocument no contiene una factura legible.", "XML_ADJUNTO_SIN_FACTURA");
  }

  return { rootName, rootNode };
}

function partyOf(wrapper) {
  const party = asArray(wrapper?.Party)[0] || wrapper?.Party || {};
  let companyId = null;
  let registrationName = null;
  for (const taxScheme of asArray(party.PartyTaxScheme)) {
    companyId = companyId || textOf(taxScheme.CompanyID);
    registrationName = registrationName || textOf(taxScheme.RegistrationName);
  }
  if (!companyId) {
    for (const identification of asArray(party.PartyIdentification)) {
      companyId = companyId || textOf(identification.ID);
    }
  }
  const name = registrationName
    || textOf(party?.PartyLegalEntity?.RegistrationName)
    || textOf(asArray(party?.PartyName)[0]?.Name)
    || textOf(party?.PartyName?.Name);
  return {
    tax_id: cleanNit(companyId),
    tax_id_raw: rawTaxId(companyId),
    name
  };
}

function taxDetails(rootNode) {
  const ivaSubtotals = [];
  let ivaTotal = 0;
  let otherTaxTotal = 0;
  for (const taxTotal of asArray(rootNode.TaxTotal)) {
    for (const subtotal of asArray(taxTotal.TaxSubtotal)) {
      const schemeId = textOf(subtotal?.TaxCategory?.TaxScheme?.ID);
      const schemeName = textOf(subtotal?.TaxCategory?.TaxScheme?.Name) || "";
      const amount = toAmount(subtotal.TaxAmount) || 0;
      if (schemeId === "01" || /IVA/i.test(schemeName)) {
        const percentText = textOf(subtotal?.TaxCategory?.Percent);
        ivaSubtotals.push({
          percent: percentText !== null ? Number(percentText) : null,
          amount
        });
        ivaTotal += amount;
      } else {
        otherTaxTotal += amount;
      }
    }
  }
  const percents = [...new Set(ivaSubtotals
    .map((item) => item.percent)
    .filter((percent) => percent !== null && Number.isFinite(percent)))];
  return {
    has_iva: ivaSubtotals.length > 0 && ivaTotal > 0,
    iva_amount: Math.round(ivaTotal * 100) / 100,
    iva_percents: percents,
    other_tax_amount: Math.round(otherTaxTotal * 100) / 100
  };
}

function validateCufe(cufe, { schemeName = null } = {}) {
  const checks = [];
  if (!cufe) {
    return { valid: false, reason: "CUFE_NO_ENCONTRADO", checks };
  }
  const value = String(cufe).trim();
  const isHex96 = /^[0-9a-fA-F]{96}$/.test(value);
  const isBase64Sha384 = /^[A-Za-z0-9+/]{64}={0,2}$/.test(value) && !isHex96;
  const scheme = schemeName ? String(schemeName).toUpperCase() : null;
  const expectsSha384 = !scheme || scheme.includes("SHA384") || scheme.includes("CUFE") || scheme.includes("CUDE");

  checks.push({ check: "longitud", ok: value.length === 96 || value.length === 64, detail: `${value.length} caracteres` });
  checks.push({ check: "formato", ok: isHex96 || isBase64Sha384, detail: isHex96 ? "hex SHA-384" : isBase64Sha384 ? "base64 SHA-384" : "no reconocido" });
  if (scheme) {
    checks.push({ check: "esquema", ok: expectsSha384, detail: scheme });
  }
  const valid = checks.every((item) => item.ok);
  return {
    valid,
    cufe: value,
    format: isHex96 ? "hex" : isBase64Sha384 ? "base64" : "unknown",
    length: value.length,
    scheme_name: scheme,
    checks
  };
}

function extractInvoiceData(xml) {
  const raw = Buffer.isBuffer(xml) ? xml.toString("utf8") : String(xml || "");
  if (!raw.trim()) throw parseError("El XML está vacío.", "XML_VACIO");
  if (Buffer.byteLength(raw, "utf8") > MAX_XML_BYTES) throw parseError("El XML supera el tamaño permitido.", "XML_DEMASIADO_GRANDE");
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw parseError("El XML contiene declaraciones no permitidas.", "XML_NO_SEGURO");
  const validation = XMLValidator.validate(raw);
  if (validation !== true) throw parseError("El XML está mal formado o truncado.", "XML_INVALIDO");

  const document = xmlParser.parse(raw);
  const { rootName, rootNode } = unwrapInvoiceRoot(document);
  if (!INVOICE_ROOTS.has(rootName)) {
    throw parseError(`El documento raíz "${rootName}" no es una factura electrónica reconocida.`, "XML_NO_RECONOCIDO");
  }

  const uuidNode = rootNode.UUID;
  const cufe = textOf(uuidNode) || textOf(findDeep(rootNode, "CUFE"));
  const schemeName = attrOf(uuidNode, "schemeName") || attrOf(findDeep(rootNode, "CUFE"), "schemeName");
  const monetary = rootNode.LegalMonetaryTotal || rootNode.RequestedMonetaryTotal || {};
  const taxes = taxDetails(rootNode);
  const supplier = partyOf(rootNode.AccountingSupplierParty);
  const customer = partyOf(rootNode.AccountingCustomerParty);
  const total = toAmount(monetary.PayableAmount) ?? toAmount(monetary.TaxInclusiveAmount);

  return {
    document_type: rootName === "Invoice" ? "invoice" : rootName === "CreditNote" ? "credit_note" : "debit_note",
    invoice_number: textOf(rootNode.ID),
    issue_date: textOf(rootNode.IssueDate),
    issuer_tax_id: supplier.tax_id,
    issuer_tax_id_raw: supplier.tax_id_raw,
    issuer_name: supplier.name,
    receiver_tax_id: customer.tax_id,
    receiver_tax_id_raw: customer.tax_id_raw,
    receiver_name: customer.name,
    subtotal: toAmount(monetary.LineExtensionAmount) ?? toAmount(monetary.TaxExclusiveAmount),
    total_payable: total,
    currency: textOf(rootNode.DocumentCurrencyCode),
    has_iva: taxes.has_iva,
    iva_amount: taxes.has_iva ? taxes.iva_amount : 0,
    iva_percents: taxes.iva_percents,
    other_tax_amount: taxes.other_tax_amount,
    cufe,
    cufe_scheme: schemeName,
    cufe_validation: validateCufe(cufe, { schemeName })
  };
}

async function extractFromZip(zipBuffer, { fileName = null } = {}) {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(zipBuffer);
  const results = [];
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xml"));
  for (const entry of entries) {
    const content = await entry.async("string");
    try {
      results.push({ file: entry.name, ok: true, data: extractInvoiceData(content) });
    } catch (error) {
      results.push({ file: entry.name, ok: false, error: error.message, code: error.code });
    }
  }
  if (results.length === 0 && fileName) {
    throw parseError(`El zip "${fileName}" no contiene archivos XML.`, "ZIP_SIN_XML");
  }
  return results;
}

module.exports = {
  extractInvoiceData,
  extractFromZip,
  validateCufe,
  cleanNit
};
