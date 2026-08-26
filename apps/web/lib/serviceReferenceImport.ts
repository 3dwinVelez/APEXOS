export const SERVICE_REFERENCE_SHEET = "Referencias";

export const SERVICE_REFERENCE_COLUMNS = [
  { key: "code", header: "codigo" },
  { key: "name", header: "nombre" },
  { key: "category", header: "categoria" },
  { key: "description", header: "descripcion" },
  { key: "estimated_minutes", header: "minutos_estimados" },
  { key: "brand", header: "marca" },
  { key: "model", header: "modelo" },
  { key: "active", header: "activa" },
  { key: "part_name", header: "pieza" },
  { key: "part_quantity", header: "cantidad_pieza" },
  { key: "part_unit", header: "unidad_pieza" },
  { key: "part_description", header: "descripcion_pieza" },
  { key: "manual_title", header: "titulo_manual" },
  { key: "manual_url", header: "url_manual" },
  { key: "manual_notes", header: "notas_manual" }
] as const;

export type ServiceReferenceImportRow = Record<(typeof SERVICE_REFERENCE_COLUMNS)[number]["key"], string | number | boolean>;
export type ServiceReferenceImportIssue = { row: number; field: string; message: string };
export type ServiceReferenceImportValidation = {
  rows: ServiceReferenceImportRow[];
  issues: ServiceReferenceImportIssue[];
  referenceCount: number;
};

const allowedCategories = new Set(["muebles", "colchones", "electrodomesticos", "cocina", "oficina", "decoracion", "iluminacion", "textiles", "otros"]);
const requiredHeaders = SERVICE_REFERENCE_COLUMNS.map((column) => column.header);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedHeader(value: unknown) {
  return text(value).toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

function cellValue(value: unknown): string | number | boolean {
  if (value && typeof value === "object") {
    if ("text" in value) return text((value as { text?: unknown }).text);
    if ("result" in value) return cellValue((value as { result?: unknown }).result);
    if ("hyperlink" in value) return text((value as { hyperlink?: unknown }).hyperlink);
    if ("richText" in value) return (value as { richText?: Array<{ text?: string }> }).richText?.map((part) => part.text || "").join("") || "";
  }
  return typeof value === "number" || typeof value === "boolean" ? value : text(value);
}

export function rowsFromWorksheet(values: unknown[][]): { rows: Array<Record<string, unknown>>; issues: ServiceReferenceImportIssue[] } {
  if (!values.length) return { rows: [], issues: [{ row: 1, field: "archivo", message: "La hoja Referencias esta vacia." }] };
  const headers = values[0].map(normalizedHeader);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) {
    return { rows: [], issues: [{ row: 1, field: "encabezados", message: `Faltan columnas obligatorias: ${missing.join(", ")}. Descarga una plantilla nueva.` }] };
  }
  const rows = values.slice(1).map((valuesRow, index) => ({
    __row: index + 2,
    ...Object.fromEntries(SERVICE_REFERENCE_COLUMNS.map((column) => [column.key, cellValue(valuesRow[headers.indexOf(column.header)] ?? "")]))
  })).filter((row) => SERVICE_REFERENCE_COLUMNS.some((column) => text(row[column.key]) !== ""));
  return { rows, issues: [] };
}

function pushLengthIssue(issues: ServiceReferenceImportIssue[], row: number, field: string, value: string, max: number) {
  if (value.length > max) issues.push({ row, field, message: `Supera el maximo de ${max} caracteres.` });
}

export function validateServiceReferenceImport(rawRows: Array<Record<string, unknown>>): ServiceReferenceImportValidation {
  const issues: ServiceReferenceImportIssue[] = [];
  const rows: ServiceReferenceImportRow[] = [];
  const referenceValues = new Map<string, { row: number; signature: string; parts: Set<string>; manuals: Set<string> }>();

  if (!rawRows.length) issues.push({ row: 2, field: "archivo", message: "No hay datos en la hoja Referencias." });
  if (rawRows.length > 2000) issues.push({ row: 2, field: "archivo", message: "La plantilla admite maximo 2.000 filas." });

  rawRows.slice(0, 2000).forEach((raw, index) => {
    const rowNumber = Number(raw.__row || index + 2);
    const code = text(raw.code).toUpperCase();
    const name = text(raw.name);
    const category = text(raw.category).toLocaleLowerCase();
    const description = text(raw.description);
    const minutesText = text(raw.estimated_minutes);
    const brand = text(raw.brand);
    const model = text(raw.model);
    const activeText = raw.active === true ? "SI" : raw.active === false ? "NO" : text(raw.active).toLocaleUpperCase();
    const partName = text(raw.part_name);
    const quantityText = text(raw.part_quantity).replace(",", ".");
    const partUnit = text(raw.part_unit).toLocaleLowerCase();
    const partDescription = text(raw.part_description);
    const manualTitle = text(raw.manual_title);
    const manualUrl = text(raw.manual_url);
    const manualNotes = text(raw.manual_notes);
    const minutes = Number(minutesText);
    const quantity = Number(quantityText);

    if (!code) issues.push({ row: rowNumber, field: "codigo", message: "El codigo es obligatorio." });
    else if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(code)) issues.push({ row: rowNumber, field: "codigo", message: "Usa entre 2 y 40 caracteres: letras, numeros, punto, guion o guion bajo." });
    if (name.length < 2) issues.push({ row: rowNumber, field: "nombre", message: "El nombre es obligatorio y debe tener al menos 2 caracteres." });
    if (!allowedCategories.has(category)) issues.push({ row: rowNumber, field: "categoria", message: "Selecciona una categoria incluida en la plantilla." });
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) issues.push({ row: rowNumber, field: "minutos_estimados", message: "Debe ser un numero entero entre 1 y 1.440." });
    if (!new Set(["SI", "NO"]).has(activeText)) issues.push({ row: rowNumber, field: "activa", message: "Indica SI o NO." });
    if (partName.length < 2) issues.push({ row: rowNumber, field: "pieza", message: "Cada fila debe incluir una pieza de al menos 2 caracteres." });
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) issues.push({ row: rowNumber, field: "cantidad_pieza", message: "Debe ser un numero mayor que 0 y menor o igual a 999.999." });
    if (!partUnit || partUnit.length > 20) issues.push({ row: rowNumber, field: "unidad_pieza", message: "La unidad es obligatoria y admite maximo 20 caracteres." });
    if ((manualTitle && !manualUrl) || (!manualTitle && manualUrl)) issues.push({ row: rowNumber, field: "manual", message: "Titulo y URL del manual deben diligenciarse juntos." });
    if (manualUrl) {
      try {
        const url = new URL(manualUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
      } catch {
        issues.push({ row: rowNumber, field: "url_manual", message: "Usa una URL completa que comience por http:// o https://." });
      }
    }
    [["nombre", name, 160], ["descripcion", description, 1000], ["marca", brand, 120], ["modelo", model, 120], ["pieza", partName, 160], ["descripcion_pieza", partDescription, 500], ["titulo_manual", manualTitle, 160], ["url_manual", manualUrl, 1000], ["notas_manual", manualNotes, 500]].forEach(([field, value, max]) => pushLengthIssue(issues, rowNumber, String(field), String(value), Number(max)));

    const signature = JSON.stringify([name, category, description, minutes, brand, model, activeText]);
    const seen = referenceValues.get(code);
    if (code && seen) {
      if (seen.signature !== signature) issues.push({ row: rowNumber, field: "codigo", message: `Los datos generales no coinciden con la fila ${seen.row} del mismo codigo.` });
      const partKey = partName.toLocaleLowerCase();
      if (partKey && seen.parts.has(partKey)) issues.push({ row: rowNumber, field: "pieza", message: `La pieza esta repetida para ${code}.` });
      if (partKey) seen.parts.add(partKey);
      const manualKey = manualUrl.toLocaleLowerCase();
      if (manualKey && seen.manuals.has(manualKey)) issues.push({ row: rowNumber, field: "url_manual", message: `El manual esta repetido para ${code}.` });
      if (manualKey) seen.manuals.add(manualKey);
    } else if (code) {
      referenceValues.set(code, { row: rowNumber, signature, parts: new Set(partName ? [partName.toLocaleLowerCase()] : []), manuals: new Set(manualUrl ? [manualUrl.toLocaleLowerCase()] : []) });
    }

    rows.push({ code, name, category, description, estimated_minutes: minutes, brand, model, active: activeText === "SI", part_name: partName, part_quantity: quantity, part_unit: partUnit, part_description: partDescription, manual_title: manualTitle, manual_url: manualUrl, manual_notes: manualNotes });
  });

  if (referenceValues.size > 500) issues.push({ row: 2, field: "archivo", message: "La plantilla admite maximo 500 referencias distintas." });
  return { rows, issues, referenceCount: referenceValues.size };
}
