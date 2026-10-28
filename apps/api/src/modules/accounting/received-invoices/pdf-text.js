const { appError } = require("./errors");
const { finalizeDraft, toAmount, toDate } = require("./parser");

function normalizeText(value) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function compact(value) {
  return String(value || "").toLowerCase().replace(/[\s._-]/g, "");
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractPdfDate(text) {
  const raw = firstMatch(text, [
    /fecha\s*(?:de\s*)?(?:emisi[oó]n|expedici[oó]n|factura)?\s*[:]?\s*(\d{4}-\d{2}-\d{2})/i,
    /fecha\s*(?:de\s*)?(?:emisi[oó]n|expedici[oó]n|factura)?\s*[:]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i
  ]);
  if (!raw) return null;
  const parts = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (parts) {
    const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
    return toDate(`${year}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`);
  }
  return toDate(raw);
}

function extractPdfInvoice(text, { fileName = null } = {}) {
  const normalized = normalizeText(text);
  if (normalized.length < 40) return null;
  const number = firstMatch(normalized, [
    /(?:factura\s*(?:electr[oó]nica)?\s*(?:de\s*venta)?|folio|invoice)\s*(?:no\.?|n[uú]mero|#|:)?\s*[:#]?\s*([A-Z]{0,8}[- ]?\d[\d-]{2,24})/i,
    /(?:n[uú]mero|no\.?)\s*(?:de\s*factura)?\s*[:#]?\s*([A-Z]{0,8}[- ]?\d[\d-]{2,24})/i
  ]);
  const total = toAmount(firstMatch(normalized, [
    /\btotal\s*(?:a\s*pagar|factura|general)?\s*[:$]?\s*\$?\s*([\d.,]+)/i
  ]));
  if (!number || total === null) return null;

  const subtotal = toAmount(firstMatch(normalized, [
    /\bsubtotal\b\s*[:$]?\s*\$?\s*([\d.,]+)/i,
    /(?:base\s*gravada|valor\s*antes\s*de\s*impuestos)\s*[:$]?\s*\$?\s*([\d.,]+)/i
  ]));
  const iva = toAmount(firstMatch(normalized, [
    /\biva\b(?:\s*\(?\d{1,2}%\)?)?\s*[:$]?\s*\$?\s*([\d.,]+)/i,
    /impuesto\s*sobre\s*las\s*ventas(?:\s*\(?\d{1,2}%\)?)?\s*[:$]?\s*\$?\s*([\d.,]+)/i
  ])) || 0;
  const nit = firstMatch(normalized, [
    /(?:nit|rfc)\s*[:#]?\s*([0-9A-Z][0-9A-Z.-]{5,20})/i
  ]);
  const cufe = firstMatch(normalized, [
    /(?:cufe|cude|uuid)\s*[:#]?\s*([a-f0-9-]{20,})/i
  ]);
  const currency = firstMatch(normalized, [/\b(COP|USD|EUR|MXN|PEN|CLP)\b/i]);
  const validation = /aceptada\s*(?:por|de)?\s*(?:la\s*)?dian/i.test(normalized)
    ? "Aceptada por DIAN"
    : /rechazada\s*(?:por|de)?\s*(?:la\s*)?dian/i.test(normalized)
      ? "Rechazada por DIAN"
      : null;
  const type = /nota\s*cr[eé]dito/i.test(normalized)
    ? "credit_note"
    : /nota\s*d[eé]bito/i.test(normalized)
      ? "debit_note"
      : "invoice";

  return finalizeDraft({
    document_type: type,
    cufe,
    prefix: null,
    invoice_number: number,
    full_number: number,
    issue_date: extractPdfDate(normalized),
    issuer_tax_id: nit,
    issuer_name: null,
    receiver_tax_id: null,
    receiver_name: null,
    subtotal: subtotal ?? (total !== null ? Math.round((total - iva) * 100) / 100 : null),
    iva,
    ica: 0,
    inc: 0,
    tax_total: iva,
    total,
    currency,
    dian_validation_status: validation,
    extraction_source: "pdf",
    issues: [{
      code: "PDF_UNICO",
      message: "El ZIP no incluyó el XML; los datos se extrajeron del texto del PDF y requieren confirmación.",
      field: "extraction_source",
      severity: "warning"
    }],
    file_name: fileName
  });
}

async function extractPdfText(buffer) {
  if (!buffer?.length) throw appError("El archivo PDF está vacío.", "PDF_VACIO", 422);
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw appError("El contenido no corresponde a un PDF válido.", "PDF_INVALIDO", 422);
  }
  let parsed;
  try {
    const pdfParse = require("pdf-parse");
    // pdfjs 1.10 usa bytes.buffer para crear sub-streams: con un Buffer pequeno
    // (pool de Node) el offset del pool corrompe las posiciones del PDF.
    parsed = await pdfParse(Uint8Array.from(buffer));
  } catch (error) {
    const message = String(error?.message || "");
    if (/password|encrypt/i.test(message)) {
      throw appError("El PDF está protegido con contraseña.", "PDF_PROTEGIDO", 422);
    }
    throw appError("El PDF está dañado o no se pudo leer.", "PDF_DANADO", 422, { detail: message.slice(0, 200) });
  }
  const text = normalizeText(parsed?.text);
  return {
    text,
    page_count: Number(parsed?.numpages || 0) || null,
    has_text: text.length >= 40,
    ocr_available: false
  };
}

function totalVariants(total) {
  const value = Number(total);
  if (!Number.isFinite(value)) return [];
  const fixed = value.toFixed(2);
  const integer = Math.round(value).toString();
  const grouped = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const groupedInteger = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
  return [...new Set([fixed, fixed.replace(".", ","), grouped, groupedInteger, integer])];
}

function comparePdfWithDraft(text, draft) {
  const normalized = normalizeText(text);
  if (normalized.length < 40) {
    return {
      available: false,
      issues: [{
        code: "PDF_SIN_TEXTO",
        message: "El PDF no contiene texto seleccionable (posible escaneo). Revise visualmente el documento.",
        field: "pdf",
        severity: "warning"
      }]
    };
  }
  const issues = [];
  const number = compact(draft.full_number || draft.invoice_number);
  const numberFound = number ? compact(normalized).includes(number) : false;
  if (!numberFound) {
    issues.push({
      code: "PDF_NUMERO_NO_ENCONTRADO",
      message: "No se localizó el número de la factura en el texto del PDF; confirme que correspondan.",
      field: "invoice_number",
      severity: "warning"
    });
  }
  const totalFound = totalVariants(draft.total).some((variant) => normalized.includes(variant));
  if (!totalFound) {
    issues.push({
      code: "PDF_TOTAL_NO_ENCONTRADO",
      message: "No se localizó el total de la factura en el texto del PDF; confirme que correspondan.",
      field: "total",
      severity: "warning"
    });
  }

  const parsed = extractPdfInvoice(normalized, { fileName: "pdf" });
  if (parsed) {
    if (parsed.total !== null && draft.total !== null && Math.abs(parsed.total - draft.total) > 0.05) {
      issues.push({
        code: "PDF_TOTAL_DIFERENTE",
        message: `El total del PDF (${parsed.total}) difiere del XML (${draft.total}).`,
        field: "total",
        severity: "critical"
      });
    }
    if (parsed.invoice_number && draft.invoice_number
      && compact(parsed.invoice_number) !== compact(draft.invoice_number)
      && !compact(parsed.invoice_number).endsWith(compact(draft.invoice_number))) {
      issues.push({
        code: "PDF_NUMERO_DIFERENTE",
        message: `El número del PDF (${parsed.invoice_number}) difiere del XML (${draft.invoice_number}).`,
        field: "invoice_number",
        severity: "critical"
      });
    }
  }

  return { available: true, issues, pdf_total: parsed?.total ?? null, pdf_number: parsed?.invoice_number ?? null };
}

module.exports = {
  extractPdfText,
  extractPdfInvoice,
  comparePdfWithDraft,
  normalizeText
};
