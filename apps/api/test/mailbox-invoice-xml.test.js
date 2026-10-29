const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractInvoiceData,
  extractFromZip,
  validateCufe,
  cleanNit
} = require("../src/modules/mailbox/invoice-xml");

const HEX_CUFE = "a3f1".padEnd(96, "0");
const B64_CUFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function invoiceXml({ cufe = HEX_CUFE, schemeName = "CUFE-SHA384", withIva = true, extraIvaSubtotal = null } = {}) {
  const subtotals = [];
  if (withIva) {
    subtotals.push(`<cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="COP">19000.00</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>19.00</cbc:Percent>
          <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`);
  }
  if (extraIvaSubtotal) subtotals.push(extraIvaSubtotal);
  const taxTotal = subtotals.length > 0
    ? `<cac:TaxTotal>
      <cbc:TaxAmount currencyID="COP">19000.00</cbc:TaxAmount>
      ${subtotals.join("\n      ")}
    </cac:TaxTotal>`
    : "";
  const payable = withIva ? "119000.00" : "100000.00";
  const taxInclusive = withIva ? "119000.00" : "100000.00";
  return `<?xml version="1.0" encoding="utf-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>FE123456</cbc:ID>
  <cbc:UUID schemeID="1" schemeName="${schemeName}">${cufe}</cbc:UUID>
  <cbc:IssueDate>2026-10-09</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>EMPRESA EMISORA S.A.S.</cbc:RegistrationName>
        <cbc:CompanyID schemeID="8">901514713-1</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>01</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>RECEPTOR PRUEBA S.A.S.</cbc:RegistrationName>
        <cbc:CompanyID schemeID="4">900255181</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  ${taxTotal}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">100000.00</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${taxInclusive}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${payable}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}

function attachedDocumentXml(innerInvoice) {
  return `<?xml version="1.0" encoding="utf-8"?>
<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>1</cbc:ID>
  <cbc:IssueDate>2026-10-09</cbc:IssueDate>
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:Description><![CDATA[${innerInvoice}]]></cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
  <cac:ParentDocumentLineReference>
    <cbc:LineID>1</cbc:LineID>
    <cac:DocumentReference>
      <cbc:ID>1</cbc:ID>
    </cac:DocumentReference>
  </cac:ParentDocumentLineReference>
</AttachedDocument>`;
}

test("cleanNit remueve DV y caracteres no numéricos", () => {
  assert.equal(cleanNit("901.514.713-1"), "901514713");
  assert.equal(cleanNit("900255181"), "900255181");
  assert.equal(cleanNit("ABC"), null);
  assert.equal(cleanNit(null), null);
});

test("validateCufe acepta SHA-384 en hex (96) y base64 (64)", () => {
  const hex = validateCufe(HEX_CUFE, { schemeName: "CUFE-SHA384" });
  assert.equal(hex.valid, true);
  assert.equal(hex.format, "hex");
  const b64 = validateCufe(B64_CUFE, { schemeName: "CUFE-SHA384" });
  assert.equal(b64.valid, true);
  assert.equal(b64.format, "base64");
});

test("validateCufe rechaza valores cortos o ausentes", () => {
  assert.equal(validateCufe("abc123").valid, false);
  const missing = validateCufe(null);
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, "CUFE_NO_ENCONTRADO");
});

test("extrae datos de un Invoice UBL directo", () => {
  const data = extractInvoiceData(invoiceXml());
  assert.equal(data.document_type, "invoice");
  assert.equal(data.invoice_number, "FE123456");
  assert.equal(data.issue_date, "2026-10-09");
  assert.equal(data.issuer_tax_id, "901514713");
  assert.equal(data.issuer_name, "EMPRESA EMISORA S.A.S.");
  assert.equal(data.receiver_tax_id, "900255181");
  assert.equal(data.receiver_name, "RECEPTOR PRUEBA S.A.S.");
  assert.equal(data.total_payable, 119000);
  assert.equal(data.subtotal, 100000);
  assert.equal(data.currency, "COP");
  assert.equal(data.has_iva, true);
  assert.equal(data.iva_amount, 19000);
  assert.deepEqual(data.iva_percents, [19]);
  assert.equal(data.cufe, HEX_CUFE);
  assert.equal(data.cufe_validation.valid, true);
});

test("factura sin IVA reporta has_iva false", () => {
  const data = extractInvoiceData(invoiceXml({ withIva: false }));
  assert.equal(data.has_iva, false);
  assert.equal(data.iva_amount, 0);
  assert.deepEqual(data.iva_percents, []);
  assert.equal(data.total_payable, 100000);
});

test("desempaqueta AttachedDocument con CDATA y conserva el CUFE base64", () => {
  const data = extractInvoiceData(attachedDocumentXml(invoiceXml({ cufe: B64_CUFE })));
  assert.equal(data.invoice_number, "FE123456");
  assert.equal(data.issuer_tax_id, "901514713");
  assert.equal(data.total_payable, 119000);
  assert.equal(data.has_iva, true);
  assert.deepEqual(data.iva_percents, [19]);
  assert.equal(data.cufe, B64_CUFE);
  assert.equal(data.cufe_validation.valid, true);
  assert.equal(data.cufe_validation.format, "base64");
});

test("respeta múltiples porcentajes de IVA", () => {
  const xml = invoiceXml({
    extraIvaSubtotal: `<cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="COP">5000.00</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>5.00</cbc:Percent>
          <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`
  });
  const data = extractInvoiceData(xml);
  assert.deepEqual(data.iva_percents.sort((a, b) => a - b), [5, 19]);
  assert.equal(data.iva_amount, 24000);
});

test("rechaza XML mal formado y raíces no factura", () => {
  assert.throws(() => extractInvoiceData("<Invoice><cbc:ID>1</cbc:ID>"), (err) => err.code === "XML_INVALIDO");
  assert.throws(() => extractInvoiceData("<html><body/></html>"), (err) => err.code === "XML_NO_RECONOCIDO");
  assert.throws(() => extractInvoiceData(""), (err) => err.code === "XML_VACIO");
  assert.throws(() => extractInvoiceData("<!DOCTYPE foo><Invoice/>"), (err) => err.code === "XML_NO_SEGURO");
});

test("extractFromZip extrae todas las facturas del zip y reporta las no legibles", async () => {
  const JSZip = require("jszip");
  const zip = new JSZip();
  zip.file("factura-a.xml", invoiceXml());
  zip.file("nota.xml", invoiceXml({ withIva: false, cufe: B64_CUFE }));
  zip.file("leeme.xml", "<html><body/></html>");
  zip.file("imagen.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const results = await extractFromZip(buffer, { fileName: "prueba.zip" });
  assert.equal(results.length, 3);
  const ok = results.filter((item) => item.ok);
  const failed = results.filter((item) => !item.ok);
  assert.equal(ok.length, 2);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].file, "leeme.xml");
  assert.equal(failed[0].code, "XML_NO_RECONOCIDO");
  assert.equal(ok[0].data.invoice_number, "FE123456");
});

test("extractFromZip falla cuando no hay XML", async () => {
  const JSZip = require("jszip");
  const zip = new JSZip();
  zip.file("solo.png", Buffer.from([0x89, 0x50]));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(
    () => extractFromZip(buffer, { fileName: "vacio.zip" }),
    (err) => err.code === "ZIP_SIN_XML"
  );
});
