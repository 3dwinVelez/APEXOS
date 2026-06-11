type ReportValue = string | number | null | undefined;

export type ReportColumn<T> = {
  key: keyof T;
  label: string;
  width?: number;
};

export type ReportSheet = {
  name: string;
  columns: Array<{ key: string; label: string; width?: number }>;
  rows: Array<Record<string, ReportValue>>;
};

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function xml(value: ReportValue) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Reporte";
}

export function downloadExcelWorkbook(filename: string, sheets: ReportSheet[]) {
  const worksheets = sheets.map((sheet) => {
    const header = sheet.columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(column.label)}</Data></Cell>`).join("");
    const rows = sheet.rows.map((row) => `<Row>${sheet.columns.map((column) => {
      const value = row[column.key];
      const type = typeof value === "number" ? "Number" : "String";
      return `<Cell><Data ss:Type="${type}">${xml(value)}</Data></Cell>`;
    }).join("")}</Row>`).join("");
    const widths = sheet.columns.map((column) => `<Column ss:AutoFitWidth="0" ss:Width="${column.width || 120}"/>`).join("");
    return `<Worksheet ss:Name="${xml(safeSheetName(sheet.name))}"><Table>${widths}<Row>${header}</Row>${rows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
  }).join("");
  const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top"/><Font ss:FontName="Calibri" ss:Size="11"/></Style><Style ss:ID="Header"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#146C63" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style></Styles>${worksheets}</Workbook>`;
  downloadBlob(filename, new Blob(["\ufeff", workbook], { type: "application/vnd.ms-excel;charset=utf-8" }));
}

function pdfEscape(value: ReportValue) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(value: ReportValue, max: number) {
  const words = pdfEscape(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = `${line} ${word}`.trim();
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function downloadTablePdf<T extends Record<string, ReportValue>>(filename: string, title: string, subtitle: string, columns: Array<ReportColumn<T>>, rows: T[]) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 30;
  const usableWidth = pageWidth - margin * 2;
  const totalWeight = columns.reduce((sum, column) => sum + (column.width || 120), 0);
  const widths = columns.map((column) => usableWidth * ((column.width || 120) / totalWeight));
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = pageHeight - margin;

  const text = (value: ReportValue, x: number, top: number, size = 7.5, bold = false, color = "0.12 0.14 0.16") => {
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x.toFixed(2)} ${top.toFixed(2)} Td (${pdfEscape(value)}) Tj ET`);
  };
  const rect = (x: number, bottom: number, width: number, height: number, fill: string, stroke = "0.84 0.86 0.84") => {
    commands.push(`q ${fill} rg ${x.toFixed(2)} ${bottom.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f ${stroke} RG ${x.toFixed(2)} ${bottom.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q`);
  };
  const header = () => {
    rect(0, pageHeight - 78, pageWidth, 78, "0.03 0.18 0.16", "0.03 0.18 0.16");
    text("APEXOS", margin, pageHeight - 34, 18, true, "1 1 1");
    text(title, margin, pageHeight - 56, 11, true, "0.78 0.9 0.86");
    text(subtitle, 400, pageHeight - 48, 8, false, "0.78 0.9 0.86");
    y = pageHeight - 100;
    let x = margin;
    columns.forEach((column, index) => {
      rect(x, y - 22, widths[index], 24, "0.08 0.42 0.38", "0.08 0.42 0.38");
      text(column.label, x + 4, y - 13, 7, true, "1 1 1");
      x += widths[index];
    });
    y -= 28;
  };
  const addPage = () => {
    if (commands.length) pages.push(commands);
    commands = [];
    header();
  };
  header();
  rows.forEach((row, rowIndex) => {
    const cellLines = columns.map((column, index) => wrap(row[column.key], Math.max(8, Math.floor(widths[index] / 4.5))).slice(0, 3));
    const height = Math.max(24, Math.max(...cellLines.map((lines) => lines.length)) * 10 + 8);
    if (y - height < margin) addPage();
    let x = margin;
    cellLines.forEach((lines, index) => {
      rect(x, y - height + 3, widths[index], height, rowIndex % 2 ? "0.97 0.98 0.97" : "1 1 1");
      lines.forEach((line, lineIndex) => text(line, x + 4, y - 9 - lineIndex * 9));
      x += widths[index];
    });
    y -= height;
  });
  if (!rows.length) text("Sin registros para los filtros seleccionados.", margin, y - 16, 10);
  pages.push(commands);

  const objects: string[] = ["", "<< /Type /Catalog /Pages 2 0 R >>", ""];
  const pageObjectIds: number[] = [];
  const streamObjectIds: number[] = [];
  pages.forEach((page) => {
    pageObjectIds.push(objects.length);
    objects.push("");
    streamObjectIds.push(objects.length);
    const stream = page.join("\n");
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  const fontRegularId = objects.length;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = objects.length;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  pageObjectIds.forEach((id, index) => {
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${streamObjectIds[index]} 0 R >>`;
  });
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadBlob(filename, new Blob([pdf], { type: "application/pdf" }));
}
