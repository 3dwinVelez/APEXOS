type ReportPhoto = {
  type?: string;
  file_url?: string;
  base64_data?: string;
  metadata?: { file_name?: string; part_name?: string; mime_type?: string; [key: string]: unknown };
  created_at?: string;
};

type ReportOrder = {
  id: number | string;
  number?: string;
  status?: string;
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  invoice_number?: string;
  service_type?: string;
  started_at?: string;
  closed_at?: string;
  start_latitude?: number;
  start_longitude?: number;
  close_latitude?: number;
  close_longitude?: number;
  duration_minutes?: number;
  no_execution_reason?: string;
  reference?: { code?: string; name?: string };
  photos?: ReportPhoto[];
  incidents?: Array<{ type?: string; description?: string; created_at?: string }>;
  metadata?: {
    inspection?: { items?: Array<{ name?: string; quantity?: number; unit?: string; status?: string; comment?: string; action?: string; supplier_name?: string }> };
    satisfaction_survey?: { answers?: Array<{ question_id?: string; question?: string; rating?: number }>; average?: number };
  };
};

type EvidenceImage = {
  index: number;
  name: string;
  width: number;
  height: number;
  hex: string;
};

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  inspeccion: "Inspeccion",
  ejecucion: "Ejecucion",
  cerrada: "Cerrada",
  no_ejecutada: "No ejecutada"
};

const photoLabels: Record<string, string> = {
  fachada: "Fachada",
  pieza_averiada: "Pieza averiada/faltante",
  producto_abierto: "Producto abierto",
  producto_cerrado: "Producto cerrado",
  cliente: "Cliente recibe",
  firma_cliente: "Firma del cliente",
  no_ejecutada: "Evidencia no ejecutada"
};

function pdfEscape(value: unknown) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function clean(value: unknown, max = 110) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, max);
}

function formatDate(value?: string) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function wrap(value: unknown, maxChars = 74) {
  const words = clean(value, 260).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = `${current} ${word}`.trim();
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") + ">";
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function evidenceSource(photo: ReportPhoto) {
  const raw = photo.base64_data || photo.file_url || "";
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  if (/^[A-Za-z0-9+/=]+$/.test(raw.slice(0, 80)) && raw.length > 120) {
    return `data:${photo.metadata?.mime_type || "image/jpeg"};base64,${raw}`;
  }
  return raw;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No fue posible cargar imagen de evidencia."));
    image.src = src;
  });
}

async function prepareEvidenceImages(photos: ReportPhoto[]) {
  const prepared: EvidenceImage[] = [];
  for (const [index, photo] of photos.slice(0, 24).entries()) {
    const source = evidenceSource(photo);
    if (!source) continue;
    try {
      const image = await loadImage(source);
      const maxWidth = 900;
      const ratio = image.width > maxWidth ? maxWidth / image.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
      const base64 = dataUrl.split(",")[1] || "";
      if (!base64) continue;
      prepared.push({
        index,
        name: `Im${prepared.length + 1}`,
        width: canvas.width,
        height: canvas.height,
        hex: bytesToHex(base64ToBytes(base64))
      });
    } catch {
      // The report still includes the evidence metadata when the image URL is private or blocked by CORS.
    }
  }
  return prepared;
}

export async function buildServiceReportPdfBlob(order: ReportOrder) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const photos = order.photos || [];
  const imageByPhotoIndex = new Map((await prepareEvidenceImages(photos)).map((image) => [image.index, image]));
  const streams: string[] = [];
  let commands: string[] = [];
  let y = pageHeight - margin;

  function color(rgb: number[]) {
    return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
  }

  function addPage() {
    if (commands.length) streams.push(commands.join("\n"));
    commands = [];
    y = pageHeight - margin;
  }

  function ensure(height: number) {
    if (y - height < margin + 24) addPage();
  }

  function rect(x: number, top: number, width: number, height: number, fill: number[], stroke?: number[]) {
    commands.push("q", `${color(fill)} rg`, `${x} ${top} ${width} ${height} re f`);
    if (stroke) commands.push(`${color(stroke)} RG`, `${x} ${top} ${width} ${height} re S`);
    commands.push("Q");
  }

  function text(value: unknown, x: number, top: number, options: { bold?: boolean; size?: number; fill?: number[] } = {}) {
    commands.push("BT");
    commands.push(`/${options.bold ? "F2" : "F1"} ${options.size || 10} Tf`);
    commands.push(`${color(options.fill || [0.12, 0.14, 0.16])} rg`);
    commands.push(`${x} ${top} Td`);
    commands.push(`(${pdfEscape(clean(value))}) Tj`);
    commands.push("ET");
  }

  function title(value: string) {
    ensure(34);
    text(value, margin, y, { bold: true, size: 14, fill: [0.03, 0.29, 0.25] });
    y -= 8;
    rect(margin, y, pageWidth - margin * 2, 1.3, [0.03, 0.29, 0.25]);
    y -= 20;
  }

  function paragraph(value: unknown) {
    for (const line of wrap(value, 92)) {
      ensure(16);
      text(line, margin, y, { size: 9.5, fill: [0.32, 0.35, 0.38] });
      y -= 14;
    }
  }

  function keyValue(label: string, value: unknown, x: number, top: number, width: number) {
    rect(x, top - 36, width, 46, [0.97, 0.98, 0.97], [0.86, 0.88, 0.86]);
    text(label, x + 10, top - 4, { size: 7.5, bold: true, fill: [0.42, 0.45, 0.46] });
    wrap(value || "N/A", Math.max(18, Math.floor(width / 5.5))).slice(0, 2).forEach((line, index) => {
      text(line, x + 10, top - 20 - index * 12, { size: 9.5, bold: index === 0, fill: [0.08, 0.11, 0.13] });
    });
  }

  function row(values: Array<{ text: unknown; x: number; chars: number; bold?: boolean; lines?: number }>, height = 34) {
    ensure(height + 8);
    rect(margin, y - height + 6, pageWidth - margin * 2, height, [0.99, 0.99, 0.98], [0.88, 0.89, 0.88]);
    values.forEach((item) => {
      wrap(item.text, item.chars).slice(0, item.lines || 2).forEach((line, index) => {
        text(line, margin + item.x, y - 8 - index * 11, { size: 8.5, bold: item.bold && index === 0 });
      });
    });
    y -= height + 6;
  }

  function drawImage(image: EvidenceImage, x: number, bottom: number, boxWidth: number, boxHeight: number) {
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const left = x + (boxWidth - width) / 2;
    const top = bottom + (boxHeight - height) / 2;
    commands.push("q");
    commands.push(`${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${left.toFixed(2)} ${top.toFixed(2)} cm`);
    commands.push(`/${image.name} Do`);
    commands.push("Q");
  }

  function evidenceCard(photo: ReportPhoto, index: number) {
    const image = imageByPhotoIndex.get(index);
    const height = image ? 138 : 54;
    ensure(height + 8);
    const bottom = y - height + 6;
    rect(margin, bottom, pageWidth - margin * 2, height, [0.99, 0.99, 0.98], [0.88, 0.89, 0.88]);
    if (image) {
      rect(margin + 10, bottom + 12, 122, 104, [1, 1, 1], [0.84, 0.86, 0.84]);
      drawImage(image, margin + 14, bottom + 16, 114, 96);
      text(photoLabels[String(photo.type || "")] || photo.type || "Evidencia", margin + 148, y - 10, { size: 9.5, bold: true });
      wrap(photo.metadata?.file_name || photo.metadata?.part_name || "Imagen adjunta", 54).slice(0, 2).forEach((line, lineIndex) => {
        text(line, margin + 148, y - 26 - lineIndex * 11, { size: 8.5, fill: [0.32, 0.35, 0.38] });
      });
      text(`Fecha: ${formatDate(photo.created_at)}`, margin + 148, y - 58, { size: 8.5, fill: [0.32, 0.35, 0.38] });
      if (!photo.base64_data && photo.file_url && !photo.file_url.startsWith("data:")) {
        wrap(photo.file_url, 58).slice(0, 2).forEach((line, lineIndex) => {
          text(line, margin + 148, y - 76 - lineIndex * 10, { size: 7.5, fill: [0.42, 0.45, 0.46] });
        });
      }
    } else {
      row([
        { text: photoLabels[String(photo.type || "")] || photo.type || "Evidencia", x: 10, chars: 24, bold: true },
        { text: photo.metadata?.file_name || photo.metadata?.part_name || photo.file_url || "Imagen no disponible para embeber", x: 160, chars: 46, lines: 2 },
        { text: formatDate(photo.created_at), x: 410, chars: 22 }
      ], 36);
      return;
    }
    y -= height + 8;
  }

  rect(0, pageHeight - 108, pageWidth, 108, [0.03, 0.18, 0.16]);
  rect(0, pageHeight - 112, pageWidth, 4, [0.05, 0.55, 0.47]);
  text("APEXOS", margin, pageHeight - 48, { bold: true, size: 22, fill: [1, 1, 1] });
  text("Reporte empresarial de servicio", margin, pageHeight - 70, { size: 11, fill: [0.78, 0.9, 0.86] });
  text(`Orden ${order.number || order.id}`, pageWidth - 214, pageHeight - 48, { bold: true, size: 15, fill: [1, 1, 1] });
  text(statusLabels[String(order.status || "")] || order.status || "Sin estado", pageWidth - 214, pageHeight - 70, { size: 10, fill: [0.78, 0.9, 0.86] });
  y = pageHeight - 136;

  title("Resumen del servicio");
  keyValue("Cliente", order.customer_name, margin, y, 176);
  keyValue("Telefono", order.customer_phone || "N/A", margin + 188, y, 118);
  keyValue("Factura / pedido", order.invoice_number || "N/A", margin + 318, y, 126);
  keyValue("Estado", statusLabels[String(order.status || "")] || order.status || "N/A", margin + 456, y, 72);
  y -= 64;
  keyValue("Direccion", order.customer_address, margin, y, 250);
  keyValue("Referencia", `${order.reference?.code || ""} ${order.reference?.name || ""}`.trim(), margin + 262, y, 184);
  keyValue("Tipo", order.service_type || "N/A", margin + 458, y, 70);
  y -= 64;

  title("Control operativo");
  keyValue("Inicio", formatDate(order.started_at), margin, y, 166);
  keyValue("Cierre", formatDate(order.closed_at), margin + 178, y, 166);
  keyValue("Duracion", order.duration_minutes == null ? "N/A" : `${order.duration_minutes} min`, margin + 356, y, 84);
  keyValue("Evidencias", String(order.photos?.length || 0), margin + 452, y, 76);
  y -= 64;
  paragraph(`GPS inicio: ${order.start_latitude || "N/A"}, ${order.start_longitude || "N/A"} | GPS cierre: ${order.close_latitude || "N/A"}, ${order.close_longitude || "N/A"}`);
  if (order.no_execution_reason) paragraph(`Motivo no ejecucion: ${order.no_execution_reason}`);

  title("Inspeccion");
  const inspection = order.metadata?.inspection?.items || [];
  if (inspection.length) {
    inspection.slice(0, 40).forEach((item) => row([
      { text: `${item.name || "Pieza"} (${item.quantity || 1} ${item.unit || "und"})`, x: 10, chars: 36, bold: true },
      { text: item.status || "N/A", x: 230, chars: 16 },
      { text: [item.comment, item.action, item.supplier_name ? `Proveedor: ${item.supplier_name}` : ""].filter(Boolean).join(" / ") || "Sin observacion", x: 320, chars: 42, lines: 3 }
    ], 40));
  } else {
    paragraph("Sin inspeccion registrada.");
  }

  title("Novedades");
  const incidents = order.incidents || [];
  if (incidents.length) {
    incidents.slice(0, 30).forEach((incident) => row([
      { text: incident.type || "Novedad", x: 10, chars: 18, bold: true },
      { text: incident.description || "", x: 130, chars: 48, lines: 3 },
      { text: formatDate(incident.created_at), x: 410, chars: 22 }
    ], 42));
  } else {
    paragraph("Sin novedades registradas.");
  }

  title("Encuesta de satisfaccion");
  const survey = order.metadata?.satisfaction_survey;
  if (survey?.answers?.length) {
    survey.answers.slice(0, 10).forEach((answer) => row([
      { text: answer.question || answer.question_id || "Pregunta", x: 10, chars: 70, bold: true },
      { text: `${answer.rating || 0}/5`, x: 455, chars: 12 }
    ], 32));
    paragraph(`Promedio: ${Number(survey.average || 0).toFixed(1)}/5`);
  } else {
    paragraph("Sin encuesta de satisfaccion registrada.");
  }

  title("Evidencias");
  if (photos.length) {
    photos.slice(0, 50).forEach((photo, index) => evidenceCard(photo, index));
  } else {
    paragraph("Sin evidencias cargadas.");
  }

  ensure(38);
  rect(margin, y - 18, pageWidth - margin * 2, 28, [0.95, 0.98, 0.97], [0.78, 0.86, 0.82]);
  text("Documento generado por APEXOS. Validar evidencias originales en la plataforma.", margin + 10, y - 7, { size: 8.5, fill: [0.22, 0.34, 0.3] });

  if (commands.length) streams.push(commands.join("\n"));
  const images = Array.from(imageByPhotoIndex.values());
  const imageObjectStart = 5 + streams.length * 2;
  const imageObjectByName = new Map(images.map((image, index) => [image.name, imageObjectStart + index]));
  const xObjects = images.length
    ? `/XObject << ${images.map((image) => `/${image.name} ${imageObjectByName.get(image.name)} 0 R`).join(" ")} >>`
    : "";
  const pages = streams.map((stream, index) => ({ stream, pageObj: 5 + index * 2, contentObj: 6 + index * 2 }));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((page) => `${page.pageObj} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  pages.forEach((page) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjects} >> /Contents ${page.contentObj} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(page.stream).length} >>\nstream\n${page.stream}\nendstream`);
  });
  images.forEach((image) => {
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${image.hex.length} >>\nstream\n${image.hex}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
