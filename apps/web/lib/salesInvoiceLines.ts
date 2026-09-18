export type SalesInvoiceDraftLine = {
  item_id: number;
  item_code: string;
  item_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  discount: number;
  tax_rate: number;
  place_id: number | null;
  place_name: string;
  customer_invoice_number: string;
  source_order_line_id?: number;
};

export const SALES_INVOICE_INITIAL_ROWS = 10;

export function createEmptySalesInvoiceLine(placeId: number | null = null): SalesInvoiceDraftLine {
  return {
    item_id: 0,
    item_code: "",
    item_name: "",
    qty: 0,
    unit: "UND",
    unit_price: 0,
    discount: 0,
    tax_rate: 0,
    place_id: placeId,
    place_name: "",
    customer_invoice_number: ""
  };
}

export function padSalesInvoiceLines(
  lines: SalesInvoiceDraftLine[],
  minimum = SALES_INVOICE_INITIAL_ROWS,
  placeId: number | null = null
) {
  if (lines.length >= minimum) return lines;
  return [...lines, ...Array.from({ length: minimum - lines.length }, () => createEmptySalesInvoiceLine(placeId))];
}

export function enteredSalesInvoiceLines(lines: SalesInvoiceDraftLine[]) {
  return lines.filter((line) => line.item_id > 0 || line.item_code.trim().length > 0);
}
