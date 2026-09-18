export type ExportColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

export async function exportCommercialReport<T>(fileName: string, sheetName: string, rows: T[], columns: ExportColumn<T>[]) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "APEX OS · Gestión Comercial";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map(column => ({ header: column.header, key: column.header, width: Math.max(14, Math.min(34, column.header.length + 6)) }));
  rows.forEach(row => sheet.addRow(Object.fromEntries(columns.map(column => [column.header, column.value(row) ?? ""]))));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
