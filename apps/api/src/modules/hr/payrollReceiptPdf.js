function pdfEscape(value) {
  return String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/[^\x20-\xFF]/g, "-").replace(/[\\()]/g, "\\$&");
}

function renderPayrollReceipt(document) {
  const name = document.employee_name || document.source_summary?.employee_name || `Empleado ${document.employee_id}`;
  const summary = document.source_summary || {};
  const receiptLines = (Array.isArray(document.lines) ? document.lines : []).filter((line) => Number(line.amount || 0) !== 0);
  const positive = receiptLines.filter((line) => Number(line.amount) > 0);
  const deductions = receiptLines.filter((line) => Number(line.amount) < 0);
  const fmt = (value) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const shortDate = (value) => {
    if (!value) return "-";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const raw = String(value);
    const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10);
  };
  const maskedAccount = summary.bank_account_code ? `***${String(summary.bank_account_code).slice(-4)}` : "No registrada";
  const paymentBenefit = (line) => line.salary_constitutive === false || line.legal_group === "auxilio" || line.metadata?.legal_group === "auxilio";
  const shouldShowQuantity = (line) => {
    const code = String(line.code || "").toUpperCase();
    const amount = Number(line.amount || 0);
    if (amount <= 0) return false;
    if (code === "AUX_TRANSPORTE" || code.includes("AUXILIO_TRANSPORTE")) return false;
    return Number(line.quantity || 0) > 0;
  };
  let content = [];
  const clipText = (value, max = 34) => {
    const text = String(value ?? "-");
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}.` : text;
  };
  const drawText = (text, x, y, size = 9, font = "F1") => content.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`);
  const drawLine = (x1, y1, x2, y2) => content.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const drawRect = (x, y, w, h) => content.push(`${x} ${y} ${w} ${h} re S`);
  const fillRect = (x, y, w, h, gray = 0.88) => content.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`);
  const rightText = (text, x, y, width, size = 9, font = "F1") => {
    const approx = String(text).length * size * 0.48;
    drawText(text, x + Math.max(0, width - approx), y, size, font);
  };
  const labelValue = (label, value, x, y, width = 220, labelWidth = 130, maxChars = 32) => {
    drawText(label, x, y, 8.5, "F2");
    drawText(clipText(value || "-", maxChars), x + labelWidth, y, 8.5);
    drawLine(x + labelWidth, y - 3, x + width, y - 3);
  };
  const detailRow = (label, value, x, y, valueX, valueWidth, maxChars = 28) => {
    drawText(label, x, y, 7.8, "F2");
    const text = clipText(value || "-", maxChars);
    drawText(text, valueX, y, Math.min(7.8, valueWidth / Math.max(text.length * 0.55, 1)));
    drawLine(valueX, y - 3, valueX + valueWidth, y - 3);
  };

  const streams = [];
  const pageCount = Math.max(1, Math.ceil(receiptLines.length / 11));
  for (let page = 0; page < pageCount; page++) {
  content = [];
  drawRect(24, 522, 564, 245);
  drawText("APEX OS", 32, 738, 12, "F2");
  drawText("NIT: __________________", 32, 724, 9, "F2");
  drawText("COMPROBANTE DE LIQUIDACION DE NOMINA", 310, 738, 9.5, "F2");
  if (document.period_type === "retiro") drawText("Liquidacion de trabajador por retiro", 380, 722, 9);
  fillRect(32, 690, 548, 16, 0.9);
  drawText("Datos del empleado", 40, 695, 8.5, "F2");
  drawText("Datos de liquidacion", 330, 695, 8.5, "F2");
  drawLine(318, 535, 318, 705);
  [
    ["Nomina", document.period_type === "retiro" ? "Retiro de trabajador" : document.period_type === "mes" ? "Nomina mensual" : "Nomina quincenal", "Periodo de Liquidacion", `${shortDate(document.date_start)} a ${shortDate(document.date_end)}`],
    ["Empleado", name, "Salario mensual", `$ ${fmt(summary.base_salarial ?? summary.salario_base_periodo ?? summary.salary_base ?? document.employee_salary_base ?? 0)}`],
    ["Numero de Identificacion", document.employee_document || summary.employee_document || "No registrada", "Neto a pagar", `$ ${fmt(document.net)}`],
    ["Fecha Ingreso", shortDate(summary.fecha_ingreso || summary.hire_date), "Metodo Retencion", summary.retention_method || "-"],
    ["Cargo", summary.position || summary.cargo || "-", "% Retencion", String(summary.retention_percent || "0")],
    ["Centro de costos", summary.cost_center_code || summary.cost_center || "-", "Cuenta Bancaria", maskedAccount],
    ["Entidad Promotora de Salud", summary.eps_name || "-", "Codigo Empleado", document.employee_code || String(document.employee_id)],
    ["Entidad Bancaria", summary.bank_entity_name || "-", "", ""],
    ["Fondo Pensiones Obligatorias", summary.pension_name || "-", "", ""]
  ].forEach(([leftLabel, leftValue, rightLabel, rightValue], index) => {
    const rowY = 674 - index * 15;
    detailRow(leftLabel, leftValue, 40, rowY, 178, 126, 34);
    if (rightLabel) detailRow(rightLabel, rightValue, 330, rowY, 466, 108, 32);
  });

  drawRect(24, 310, 564, 203);
  fillRect(318, 495, 160, 12, 0.72);
  fillRect(482, 495, 82, 12, 0.72);
  drawText("Devengado", 376, 498, 8.5, "F2");
  drawText("Deducciones", 499, 498, 8.5, "F2");
  fillRect(28, 480, 184, 12, 0.82);
  fillRect(218, 480, 54, 12, 0.82);
  fillRect(278, 480, 54, 12, 0.82);
  fillRect(338, 480, 70, 12, 0.82);
  fillRect(414, 480, 70, 12, 0.82);
  fillRect(490, 480, 74, 12, 0.82);
  drawText("Conceptos Liquidados", 80, 483, 8, "F2");
  drawText("Cantidad", 226, 483, 8, "F2");
  drawText("Unidad", 290, 483, 8, "F2");
  drawText("Pagos", 360, 483, 8, "F2");
  drawText("Beneficios", 430, 483, 8, "F2");
  drawText("Descuentos", 502, 483, 8, "F2");
  let y = 466;
  const rowHeight = 10.8;
  for (const line of receiptLines.slice(page * 11, (page + 1) * 11)) {
    const amount = Number(line.amount || 0);
    drawText(String(line.name || line.code).slice(0, 36), 30, y, 7.7);
    if (shouldShowQuantity(line)) {
      rightText(String(line.quantity || ""), 218, y, 54, 7.7);
      const code = String(line.code || "").toUpperCase();
      const dayUnit = code.includes("SALARIO") || ["PRIMA_SERVICIOS", "CESANTIAS", "INTERESES_CESANTIAS", "VACACIONES"].includes(code);
      drawText(line.unit || (dayUnit ? "DIA" : /^(HED|HEN|RN|RD|RECARGO|HORA|JORNADA_ORDINARIA)/.test(code) ? "HORA" : "UND"), 286, y, 7.7);
    }
    if (amount > 0 && !paymentBenefit(line)) rightText(fmt(amount), 338, y, 70, 7.7);
    if (amount > 0 && paymentBenefit(line)) rightText(fmt(amount), 414, y, 70, 7.7);
    if (amount < 0) rightText(fmt(Math.abs(amount)), 490, y, 74, 7.7);
    drawLine(28, y - 4, 564, y - 4);
    y -= rowHeight;
  }
  const benefitTotal = positive.filter(paymentBenefit).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const payTotal = positive.filter((line) => !paymentBenefit(line)).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  if (page === pageCount - 1) {
  fillRect(28, 333, 536, 12, 0.92);
  drawText("Totales", 280, 336, 8.5, "F2");
  rightText(fmt(payTotal), 338, 336, 70, 8.5, "F2");
  rightText(fmt(benefitTotal), 414, 336, 70, 8.5, "F2");
  rightText(fmt(document.deductions), 490, 336, 74, 8.5, "F2");
  drawLine(28, 329, 564, 329);
  drawText("Total Devengado", 248, 321, 8.5, "F2");
  rightText(fmt(document.gross), 338, 321, 146, 8.5, "F2");
  drawText("Neto a pagar en cuenta nomina", 210, 313, 8.5, "F2");
  rightText(fmt(document.net), 338, 313, 146, 8.5, "F2");
  } else drawText("Conceptos continuan en la siguiente pagina. Totales al final.", 40, 330, 8.5);

  drawRect(24, 222, 564, 78);
  fillRect(28, 282, 430, 12, 0.72);
  drawText("Detalle Prestamos", 220, 285, 8.5, "F2");
  fillRect(28, 266, 184, 12, 0.82);
  fillRect(222, 266, 80, 12, 0.82);
  fillRect(314, 266, 80, 12, 0.82);
  fillRect(406, 266, 80, 12, 0.82);
  drawText("Concepto", 95, 269, 8, "F2");
  drawText("Valor Prestamo", 230, 269, 8, "F2");
  drawText("Valor Cuota", 328, 269, 8, "F2");
  drawText("Saldo Actual", 418, 269, 8, "F2");
  const loanLines = receiptLines.filter((line) => String(line.source || "").toLowerCase().includes("libranza") || String(line.legal_group || "").toLowerCase().includes("libranza"));
  if (loanLines.length) {
    let loanY = 252;
    for (const line of loanLines.slice(0, 3)) {
      drawText(String(line.name || line.code).slice(0, 26), 30, loanY, 7.7);
      rightText(fmt(line.metadata?.original_amount || 0), 222, loanY, 80, 7.7);
      rightText(fmt(Math.abs(Number(line.amount || 0))), 314, loanY, 80, 7.7);
      rightText(fmt(line.metadata?.balance_after ?? line.metadata?.balance_amount ?? 0), 406, loanY, 80, 7.7);
      loanY -= 13;
    }
  } else {
    drawText("Sin prestamos o libranzas registradas en el comprobante.", 30, 252, 8);
  }

  drawRect(24, 130, 564, 86);
  fillRect(32, 198, 544, 12, 0.86);
  drawText("Bases para calculo de seguridad social", 38, 201, 8.2, "F2");
  fillRect(32, 184, 400, 10, 0.94);
  fillRect(438, 184, 138, 10, 0.94);
  drawText("Base", 38, 187, 7.4, "F2");
  drawText("Valor", 492, 187, 7.4, "F2");
  const ibc = Number(summary.ibc || 0);
  [
    ["Ingreso Base Cotizacion Salud Periodo", ibc],
    ["Ingreso Base Cotizacion Salud Mes", ibc],
    ["Ingreso Base Cotizacion Siguiente", 0],
    ["Ingreso Base Cotizacion Pension Periodo", ibc],
    ["Ingreso Base Cotizacion Pension Mes", ibc]
  ].forEach(([label, value], index) => {
    const rowY = 173 - index * 9.5;
    drawText(label, 38, rowY, 7.2);
    rightText(fmt(value), 456, rowY, 90, 7.2);
    if (index < 4) drawLine(32, rowY - 3.2, 576, rowY - 3.2);
  });

  drawRect(24, 78, 564, 50);
  fillRect(32, 111, 544, 12, 0.86);
  drawText("Mensaje Empresarial", 38, 114, 8.2, "F2");
  drawText("Documento generado por APEX OS. Sin QR.", 38, 99, 8);
  drawText(`Pagina ${page + 1} de ${pageCount}`, 270, 55, 10);
  drawText("COLABORADOR", 32, 36, 8);
  drawText("Firma empleado", 125, 36, 7.5);
  drawText("Cedula o NIT", 32, 24, 7.5);
  drawLine(125, 28, 270, 28);
  drawText("LA EMPRESA", 330, 36, 8);
  drawText("NIT", 330, 24, 7.5);
  drawLine(410, 28, 560, 28);
  drawText(`Fecha de elaboracion: ${new Date().toISOString().slice(0, 10)}`, 390, 12, 7.5);
  streams.push(content.join("\n"));
  }
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    `2 0 obj << /Type /Pages /Kids [${streams.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${pageCount} >> endobj`,
    "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj"
  ];
  streams.forEach((stream, i) => {
    objects.push(`${5 + i * 2} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >> endobj`);
    objects.push(`${6 + i * 2} 0 obj << /Length ${Buffer.byteLength(stream, "latin1")} >> stream\n${stream}\nendstream endobj`);
  });
  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  const body = objects.map((obj) => {
    xref.push(String(offset).padStart(10, "0") + " 00000 n ");
    offset += Buffer.byteLength(obj + "\n", "latin1");
    return obj;
  }).join("\n") + "\n";
  const header = "%PDF-1.4\n";
  const xrefStart = Buffer.byteLength(header + body, "latin1");
  const trailer = `xref\n0 ${xref.length}\n${xref.join("\n")}\ntrailer << /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(header + body + trailer, "latin1");
}

module.exports = { renderPayrollReceipt };
