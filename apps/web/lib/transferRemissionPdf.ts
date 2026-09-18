type Value = string | number | null | undefined;

export type TransferRemissionData = {
  number: string;
  society_code: string;
  status: string;
  reason?: string;
  created_at: string;
  dispatched_at?: string;
  created_by_user?: { name: string; email?: string } | null;
  dispatched_by_user?: { name: string; email?: string } | null;
  origin?: { code: string; name: string; warehouse_type?: string; address?: string; city?: string };
  destination?: { code: string; name: string; warehouse_type?: string; address?: string; city?: string };
  lines: Array<{ item?: { code: string; name: string; unit: string }; qty: number; lot?: string | null }>;
};

function clean(value: Value, max = 180) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").slice(0, max);
}
function escapePdf(value: Value) { return clean(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function date(value?: string) { return value ? new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "No despachado"; }
function warehouseType(value?: string) { return value === "consignment" ? "Consignacion" : value === "transit" ? "Transito" : "Propia"; }

export function buildTransferRemissionPdf(data: TransferRemissionData) {
  const width = 595, height = 842, margin = 36;
  const commands: string[] = [];
  const text = (value: Value, x: number, y: number, size = 9, bold = false, color = "0.12 0.14 0.16") => commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${escapePdf(value)}) Tj ET`);
  const rect = (x: number, y: number, w: number, h: number, fill = "1 1 1", stroke = "0.78 0.82 0.81") => commands.push(`q ${fill} rg ${stroke} RG ${x} ${y} ${w} ${h} re B Q`);
  const line = (x1: number, y1: number, x2: number, y2: number) => commands.push(`q 0.35 0.39 0.4 RG ${x1} ${y1} m ${x2} ${y2} l S Q`);

  rect(0, height - 92, width, 92, "0.03 0.18 0.16", "0.03 0.18 0.16");
  text("APEXOS", margin, height - 40, 19, true, "1 1 1");
  text("REMISION DE TRASLADO DE MERCANCIA", margin, height - 66, 12, true, "0.78 0.94 0.88");
  text(data.number, 430, height - 52, 14, true, "1 1 1");

  let y = height - 122;
  rect(margin, y - 82, width - margin * 2, 88, "0.96 0.98 0.97");
  text("SOCIEDAD", margin + 12, y - 14, 7, true, "0.35 0.39 0.4"); text(data.society_code, margin + 12, y - 29, 10, true);
  text("FECHA CREACION", 210, y - 14, 7, true, "0.35 0.39 0.4"); text(date(data.created_at), 210, y - 29, 9);
  text("FECHA DESPACHO", 380, y - 14, 7, true, "0.35 0.39 0.4"); text(date(data.dispatched_at), 380, y - 29, 9);
  text("MOTIVO", margin + 12, y - 52, 7, true, "0.35 0.39 0.4"); text(data.reason || "Sin motivo registrado", margin + 12, y - 68, 9);
  y -= 110;

  const warehouseBox = (title: string, warehouse: TransferRemissionData["origin"], x: number) => {
    rect(x, y - 94, 252, 98, "1 1 1"); text(title, x + 12, y - 17, 9, true, "0.03 0.35 0.31");
    text(`${warehouse?.code || "-"} - ${warehouse?.name || "No definida"}`, x + 12, y - 36, 10, true);
    text(`Tipo: ${warehouseType(warehouse?.warehouse_type)}`, x + 12, y - 54, 8);
    text(`Direccion: ${warehouse?.address || "No registrada"}`, x + 12, y - 70, 8);
    text(`Ciudad: ${warehouse?.city || "No registrada"}`, x + 12, y - 86, 8);
  };
  warehouseBox("BODEGA DE ORIGEN", data.origin, margin); warehouseBox("BODEGA DE DESTINO", data.destination, 307);
  y -= 122;

  const columns = [42, 100, 245, 70, 66];
  ["Pos.", "SKU", "Descripcion", "Cantidad", "Lote"].forEach((label, index) => { const x = margin + columns.slice(0, index).reduce((a, b) => a + b, 0); rect(x, y - 24, columns[index], 25, "0.08 0.42 0.38", "0.08 0.42 0.38"); text(label, x + 5, y - 15, 7, true, "1 1 1"); });
  y -= 28;
  data.lines.forEach((row, index) => {
    const values = [index + 1, row.item?.code || "-", row.item?.name || "Producto", `${Number(row.qty).toLocaleString("es-CO")} ${row.item?.unit || "UND"}`, row.lot || "-"];
    values.forEach((value, column) => { const x = margin + columns.slice(0, column).reduce((a, b) => a + b, 0); rect(x, y - 23, columns[column], 25, index % 2 ? "0.97 0.98 0.97" : "1 1 1"); text(value, x + 5, y - 14, 8); });
    y -= 25;
  });
  y = Math.min(y - 35, 280);
  text("OBSERVACIONES / NOVEDADES EN EL ENVIO", margin, y, 9, true);
  for (let index = 0; index < 4; index += 1) line(margin, y - 24 - index * 25, width - margin, y - 24 - index * 25);
  const signatureY = y - 155;
  line(margin, signatureY, 250, signatureY); line(345, signatureY, width - margin, signatureY);
  text("Entrega - nombre y firma", margin, signatureY - 17, 8); text("Recibe - nombre, firma y documento", 345, signatureY - 17, 8);
  text(`Generado por APEXOS | Creador: ${data.created_by_user?.name || data.created_by_user?.email || "No identificado"}`, margin, 24, 7, false, "0.35 0.39 0.4");

  const stream = commands.join("\n");
  const objects = ["", "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) { offsets[index] = pdf.length; pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`; }
  const xref = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`; for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function downloadTransferRemissionPdf(data: TransferRemissionData) {
  const url = URL.createObjectURL(new Blob([buildTransferRemissionPdf(data)], { type: "application/pdf" }));
  const link = document.createElement("a"); link.href = url; link.download = `Remision-${clean(data.number, 60)}.pdf`; link.click(); URL.revokeObjectURL(url);
}
