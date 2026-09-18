import test from "node:test";
import assert from "node:assert/strict";
import {
  SALES_INVOICE_INITIAL_ROWS,
  createEmptySalesInvoiceLine,
  enteredSalesInvoiceLines,
  padSalesInvoiceLines
} from "../lib/salesInvoiceLines.ts";

test("la factura de venta inicia con diez filas vacias", () => {
  const rows = padSalesInvoiceLines([]);
  assert.equal(rows.length, SALES_INVOICE_INITIAL_ROWS);
  assert.ok(rows.every((row) => row.item_id === 0 && row.item_code === "" && row.qty === 0));
});

test("las filas existentes se conservan y solo se completa el minimo", () => {
  const selected = { ...createEmptySalesInvoiceLine(9), item_id: 41, item_code: "SKU-41", qty: 2 };
  const rows = padSalesInvoiceLines([selected]);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], selected);
  assert.ok(rows.slice(1).every((row) => row.place_id === null));
});

test("la simulacion y emision excluyen filas totalmente vacias", () => {
  const selected = { ...createEmptySalesInvoiceLine(9), item_id: 41, item_code: "SKU-41", qty: 2 };
  const rows = padSalesInvoiceLines([selected]);
  assert.deepEqual(enteredSalesInvoiceLines(rows), [selected]);
});

test("un codigo digitado se considera una fila iniciada para mostrar validacion", () => {
  const row = { ...createEmptySalesInvoiceLine(), item_code: "NO-EXISTE" };
  assert.deepEqual(enteredSalesInvoiceLines([row]), [row]);
});
