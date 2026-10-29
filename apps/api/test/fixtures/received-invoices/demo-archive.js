const JSZip = require("jszip");

const CUFE = "3f1c9a2b7d4e6f8a1c3b5d7e9f0a2c4b6d8e0f1a3c5b7d9e1f3a5c7b9d0e2f4a";

function money(value) {
  return Number(value).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// XML UBL 2.1 de ejemplo con la estructura que publica la DIAN. Sin namespaces
// en los prefijos para que sea legible, el parser los elimina igual.
function buildInvoiceXml(options = {}) {
  const data = {
    number: "FV-2026-000123",
    cufe: CUFE,
    issueDate: "2026-10-20",
    currency: "COP",
    issuerTaxId: "900123456",
    issuerName: "Distribuciones Andinas SAS",
    receiverTaxId: "901555777",
    receiverName: "Comercializadora Aurora SAS",
    subtotal: 1000000,
    iva: 190000,
    total: 1190000,
    ...options
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <UBLVersionID>UBL 2.1</UBLVersionID>
  <CustomizationID>DIAN 2.1</CustomizationID>
  <ID>${data.number}</ID>
  <UUID schemeID="2">${data.cufe}</UUID>
  <IssueDate>${data.issueDate}</IssueDate>
  <InvoiceTypeCode>01</InvoiceTypeCode>
  <DocumentCurrencyCode>${data.currency}</DocumentCurrencyCode>
  <AccountingSupplierParty>
    <Party>
      <PartyTaxScheme>
        <CompanyID>${data.issuerTaxId}</CompanyID>
        <TaxScheme><ID>01</ID><Name>IVA</Name></TaxScheme>
      </PartyTaxScheme>
      <PartyLegalEntity>
        <RegistrationName>${data.issuerName}</RegistrationName>
      </PartyLegalEntity>
    </Party>
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    <Party>
      <PartyTaxScheme>
        <CompanyID>${data.receiverTaxId}</CompanyID>
        <TaxScheme><ID>01</ID><Name>IVA</Name></TaxScheme>
      </PartyTaxScheme>
      <PartyLegalEntity>
        <RegistrationName>${data.receiverName}</RegistrationName>
      </PartyLegalEntity>
    </Party>
  </AccountingCustomerParty>
  <TaxTotal>
    <TaxAmount>${data.iva.toFixed(2)}</TaxAmount>
    <TaxSubtotal>
      <TaxableAmount>${data.subtotal.toFixed(2)}</TaxableAmount>
      <TaxAmount>${data.iva.toFixed(2)}</TaxAmount>
      <TaxCategory>
        <Percent>19.00</Percent>
        <TaxScheme><ID>01</ID><Name>IVA</Name></TaxScheme>
      </TaxCategory>
    </TaxSubtotal>
  </TaxTotal>
  <LegalMonetaryTotal>
    <LineExtensionAmount>${data.subtotal.toFixed(2)}</LineExtensionAmount>
    <TaxExclusiveAmount>${data.subtotal.toFixed(2)}</TaxExclusiveAmount>
    <TaxInclusiveAmount>${data.total.toFixed(2)}</TaxInclusiveAmount>
    <PayableAmount>${data.total.toFixed(2)}</PayableAmount>
  </LegalMonetaryTotal>
  <InvoiceLine>
    <ID>1</ID>
    <InvoicedQuantity unitCode="EA">10</InvoicedQuantity>
    <LineExtensionAmount>${data.subtotal.toFixed(2)}</LineExtensionAmount>
    <Item><Description>Servicio de distribucion</Description></Item>
  </InvoiceLine>
</Invoice>
`;
}

function escapePdfText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// PDF 1.4 minimo, sin compresion, con texto seleccionable. No usa librerias
// externas para que el fixture sea reproducible en cualquier entorno.
function buildInvoicePdf(options = {}) {
  const data = {
    number: "FV-2026-000123",
    cufe: CUFE,
    issueDate: "2026-10-20",
    issuerTaxId: "900123456",
    issuerName: "Distribuciones Andinas SAS",
    receiverName: "Comercializadora Aurora SAS",
    subtotal: 1000000,
    iva: 190000,
    total: 1190000,
    ...options
  };
  const lines = [
    "Factura electronica de venta",
    `Numero: ${data.number}`,
    `Fecha de emision: ${data.issueDate}`,
    `Emisor: ${data.issuerName}`,
    `NIT: ${data.issuerTaxId}`,
    `Receptor: ${data.receiverName}`,
    `Subtotal: $ ${money(data.subtotal)}`,
    "IVA (19%): $ " + money(data.iva),
    `Total a pagar: $ ${money(data.total)}`,
    `CUFE: ${data.cufe}`,
    "Aceptada por DIAN"
  ];
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 740 Td",
    ...lines.flatMap((line, index) => (index === 0
      ? [`(${escapePdfText(line)}) Tj`]
      : ["0 -22 Td", `(${escapePdfText(line)}) Tj`])),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n\r\n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function buildDemoZip({ withPdf = true, extraEntries = {} } = {}) {
  const zip = new JSZip();
  zip.file("FV-2026-000123.xml", buildInvoiceXml());
  if (withPdf) zip.file("FV-2026-000123.pdf", buildInvoicePdf());
  for (const [name, content] of Object.entries(extraEntries)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

module.exports = { CUFE, buildInvoiceXml, buildInvoicePdf, buildDemoZip };
