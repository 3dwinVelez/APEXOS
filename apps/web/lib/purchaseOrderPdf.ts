type PdfValue = string | number | null | undefined;

export type PurchaseOrderPdfData = {
  number: string;
  status: string;
  created_at: string;
  due_date?: string | null;
  currency?: string;
  subtotal: number;
  tax_total?: number;
  total: number;
  notes?: string | null;
  metadata?: { payment_terms?: string; priority?: string; tags?: string[]; manual_closure?: { reason?: string } };
  company: { name: string; tax_id?: string | null; country?: string | null; society_code?: string | null; society_name?: string | null };
  warehouse?: { code: string; name: string; address?: string | null; city?: string | null; country?: string | null; cost_center_code?: string | null } | null;
  party: { name: string; legal_name?: string | null; tax_id?: string | null; email?: string | null; phone?: string | null; address?: string | null; city?: string | null };
  created_by_user?: { name: string; email?: string | null } | null;
  lines: Array<{ position: number; sku: string; description: string; unit?: string; qty: number; unit_cost: number; total: number; received_quantity?: number; pending_quantity?: number }>;
};

const statusLabels: Record<string, string> = {
  draft: "Borrador", sent: "Enviada", confirmed: "Aprobada", partial: "Recibida parcial",
  received: "Recibida", cancelled: "Cancelada", closed: "Cerrada"
};

function clean(value: PdfValue, max = 220) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, max);
}

function escapePdf(value: PdfValue) {
  return clean(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(value: PdfValue, maxChars: number) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = `${line} ${word}`.trim();
    if (line && next.length > maxChars) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function date(value?: string | null) {
  if (!value) return "No definida";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? clean(value) : new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(parsed);
}

function amount(value: number, currency = "COP") {
  return `${currency} ${Number(value || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildPurchaseOrderPdf(data: PurchaseOrderPdfData) {
  const width = 842;
  const height = 595;
  const margin = 30;
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = height - 30;

  const text = (value: PdfValue, x: number, top: number, size = 8, bold = false, color = "0.12 0.14 0.16") => {
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x.toFixed(2)} ${top.toFixed(2)} Td (${escapePdf(value)}) Tj ET`);
  };
  const rect = (x: number, bottom: number, w: number, h: number, fill = "1 1 1", stroke = "0.82 0.85 0.84") => {
    commands.push(`q ${fill} rg ${stroke} RG ${x.toFixed(2)} ${bottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B Q`);
  };
  const labelValue = (label: string, value: PdfValue, x: number, top: number, boxWidth: number) => {
    text(label.toUpperCase(), x, top, 6.5, true, "0.35 0.39 0.4");
    wrap(value || "-", Math.floor(boxWidth / 5)).slice(0, 2).forEach((line, index) => text(line, x, top - 12 - index * 9, 8, index === 0));
  };
  const pageHeader = (continuation = false) => {
    rect(0, height - 76, width, 76, "0.03 0.18 0.16", "0.03 0.18 0.16");
    text(data.company.name || "Sociedad", margin, height - 31, 17, true, "1 1 1");
    text(`NIT ${data.company.tax_id || "No registrado"}  |  Sociedad ${data.company.society_code || "-"}`, margin, height - 49, 8, false, "0.8 0.9 0.87");
    text(continuation ? `OC ${data.number} - CONT.` : "ORDEN DE COMPRA", 500, height - 31, 12, true, "1 1 1");
    text(data.number, 650, height - 52, 15, true, "0.72 0.94 0.88");
    y = height - 96;
  };
  const tableHeader = () => {
    const columns = [35, 70, 90, 260, 48, 60, 90, 75, 70];
    const labels = ["Pos.", "SKU", "Descripcion", "Unidad", "Pedido", "Recibido", "Pendiente", "Costo unit.", "Total"];
    let x = margin;
    labels.forEach((label, index) => {
      const w = columns[index];
      rect(x, y - 22, w, 24, "0.08 0.42 0.38", "0.08 0.42 0.38");
      text(label, x + 4, y - 13, 6.5, true, "1 1 1");
      x += w;
    });
    y -= 28;
    return columns;
  };

  pageHeader();
  rect(margin, y - 82, width - margin * 2, 86, "0.96 0.98 0.97");
  labelValue("Proveedor", data.party.legal_name || data.party.name, margin + 12, y - 15, 210);
  labelValue("NIT proveedor", data.party.tax_id || "No registrado", 250, y - 15, 120);
  labelValue("Estado", statusLabels[data.status] || data.status, 390, y - 15, 110);
  labelValue("Creada", date(data.created_at), 520, y - 15, 135);
  labelValue("Entrega esperada", date(data.due_date), 675, y - 15, 125);
  labelValue("Bodega de entrega", data.warehouse ? `${data.warehouse.code} - ${data.warehouse.name}` : "No definida", margin + 12, y - 53, 220);
  labelValue("Direccion / ciudad", data.warehouse ? [data.warehouse.address, data.warehouse.city, data.warehouse.country].filter(Boolean).join(", ") || "Sin direccion registrada" : "-", 270, y - 53, 245);
  labelValue("Creada por", data.created_by_user?.name || data.created_by_user?.email || "No identificado", 535, y - 53, 145);
  labelValue("Condicion de pago", data.metadata?.payment_terms || "No definida", 690, y - 53, 110);
  y -= 105;

  rect(margin, y - 43, width - margin * 2, 47, "1 1 1");
  labelValue("Empresa compradora", data.company.name || "No configurada", margin + 12, y - 14, 230);
  labelValue("NIT / pais", [data.company.tax_id || "No registrado", data.company.country].filter(Boolean).join(" / "), 280, y - 14, 160);
  labelValue("Sociedad", [data.company.society_code, data.company.society_name].filter(Boolean).join(" - ") || "No configurada", 465, y - 14, 205);
  labelValue("Centro de costo", data.warehouse?.cost_center_code || "-", 695, y - 14, 105);
  y -= 65;

  let columns = tableHeader();
  data.lines.forEach((line, rowIndex) => {
    const descriptionLines = wrap(line.description, 42).slice(0, 3);
    const rowHeight = Math.max(24, descriptionLines.length * 9 + 9);
    if (y - rowHeight < 85) {
      pages.push(commands);
      commands = [];
      pageHeader(true);
      columns = tableHeader();
    }
    const values: Array<PdfValue | string[]> = [line.position, line.sku, descriptionLines, line.unit || "UND", line.qty, line.received_quantity || 0, line.pending_quantity || 0, amount(line.unit_cost, data.currency), amount(line.total, data.currency)];
    let x = margin;
    values.forEach((value, index) => {
      rect(x, y - rowHeight + 3, columns[index], rowHeight, rowIndex % 2 ? "0.97 0.98 0.97" : "1 1 1");
      const lines = Array.isArray(value) ? value : [String(value)];
      lines.forEach((entry, lineIndex) => text(entry, x + 4, y - 9 - lineIndex * 9, 7));
      x += columns[index];
    });
    y -= rowHeight;
  });

  if (y < 165) { pages.push(commands); commands = []; pageHeader(true); }
  rect(margin, y - 64, 500, 68, "0.97 0.98 0.97");
  labelValue("Observaciones", data.notes || "Sin observaciones", margin + 12, y - 14, 470);
  if (data.status === "closed" && data.metadata?.manual_closure?.reason) labelValue("Motivo de cierre", data.metadata.manual_closure.reason, margin + 12, y - 44, 470);
  rect(550, y - 64, 262, 68, "0.94 0.97 0.96");
  text("Subtotal", 565, y - 15, 8, true); text(amount(data.subtotal, data.currency), 690, y - 15, 8, true);
  text("Impuestos", 565, y - 34, 8); text(amount(data.tax_total || 0, data.currency), 690, y - 34, 8);
  text("TOTAL ORDEN", 565, y - 54, 10, true, "0.03 0.3 0.27"); text(amount(data.total, data.currency), 680, y - 54, 10, true, "0.03 0.3 0.27");
  pages.push(commands);

  pages.forEach((page, index) => {
    page.push(`BT /F1 7 Tf 0.35 0.39 0.4 rg ${margin} 22 Td (Documento generado por APEXOS - ${escapePdf(date(new Date().toISOString()))}) Tj ET`);
    page.push(`BT /F2 7 Tf 0.35 0.39 0.4 rg 760 22 Td (Pagina ${index + 1} de ${pages.length}) Tj ET`);
  });

  const objects: string[] = ["", "<< /Type /Catalog /Pages 2 0 R >>", ""];
  const pageIds: number[] = [];
  const streamIds: number[] = [];
  pages.forEach((page) => {
    pageIds.push(objects.length); objects.push("");
    streamIds.push(objects.length);
    const stream = page.join("\n");
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  const regular = objects.length; objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const bold = objects.length; objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  pageIds.forEach((id, index) => { objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${streamIds[index]} 0 R >>`; });
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) { offsets[index] = pdf.length; pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function downloadPurchaseOrderPdf(data: PurchaseOrderPdfData) {
  const bytes = buildPurchaseOrderPdf(data);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${clean(data.number, 60) || "orden-compra"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
