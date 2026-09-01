"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "@/lib/api";
import { downloadCommercialDocumentPdf } from "@/lib/commercialDocumentPdf";
import { Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CustomerCombobox } from "./agenda/CustomerCombobox";

type Row = Record<string, any>;
type Line = { product_id: string; product_code: string; quantity: number };
const input = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-apex";
const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });

export function StandaloneCommercialDocumentEditor({ kind, onClose, onCreated }: { kind: "quotation" | "order"; onClose: () => void; onCreated: (document: Row) => void }) {
  const [customers, setCustomers] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", product_code: "", quantity: 1 }]);
  const [notes, setNotes] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [searching, setSearching] = useState<number | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Row[]>("/api/v1/commercial-management/customers?active=true", { cache: "no-store" }),
      api<Row[]>("/api/v1/commercial-management/products?active=true", { cache: "no-store" }),
      kind === "quotation" ? api<Row>("/api/v1/commercial-management/settings", { cache: "no-store" }) : Promise.resolve(null),
    ]).then(([customerRows, productRows, settings]) => {
      if (!active) return;
      setCustomers(customerRows);
      setProducts(productRows.filter(product => product.active !== false));
      if (settings?.default_quote_validity_days) setValidityDays(String(settings.default_quote_validity_days));
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "No fue posible cargar los maestros."); });
    return () => { active = false; };
  }, [kind]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      if (searching !== null) setSearching(null);
      else onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose, searching]);

  const selectedCustomer = customers.find(customer => String(customer.id) === customerId);
  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase("es");
    return products.filter(product => !query || [product.code, product.name, product.category?.name, product.subcategory?.name, product.product_line?.name].some(value => String(value || "").toLocaleLowerCase("es").includes(query)));
  }, [products, productQuery]);
  const detailed = lines.map(line => ({ ...line, product: products.find(product => String(product.id) === line.product_id) }));
  const total = detailed.reduce((sum, line) => sum + (line.product ? Number(line.product.unit_price) * Number(line.quantity) : 0), 0);

  function resolveProduct(index: number) {
    const code = lines[index].product_code.trim();
    const product = code ? products.find(item => String(item.code).toLocaleLowerCase("es") === code.toLocaleLowerCase("es")) : null;
    if (product) {
      setLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, product_id: String(product.id), product_code: String(product.code) } : line));
      setError("");
      return;
    }
    setProductQuery(code);
    setSearching(index);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!customerId) return setError("Selecciona el cliente.");
    if (detailed.some(line => !line.product || Number(line.quantity) <= 0)) return setError("Selecciona un producto válido y una cantidad mayor que cero en cada línea.");
    setBusy(true); setError("");
    try {
      const body = { customer_id: Number(customerId), notes: notes.trim() || undefined, ...(kind === "quotation" && validityDays ? { validity_days: Number(validityDays) } : {}), lines: lines.map(line => ({ product_id: Number(line.product_id), quantity: Number(line.quantity) })) };
      const created = await api<Row>(`/api/v1/commercial-management/${kind === "quotation" ? "quotations" : "orders"}`, { method: "POST", body: JSON.stringify(body) });
      downloadCommercialDocumentPdf({ kind: kind === "quotation" ? "COTIZACION" : "PEDIDO", number: created.quotation_number || created.order_number, date: created.quotation_date || created.order_date, valid_until: created.valid_until, status: created.status, customer: created.customer, advisor: created.advisor, lines: created.lines, subtotal: created.subtotal, discount: created.discount, total: created.total, notes: created.notes });
      onCreated(created);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible generar el documento."); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="standalone-document-title">
    <form className="max-h-[96vh] w-full max-w-5xl overflow-auto rounded-t-xl bg-white p-4 shadow-xl sm:max-h-[92vh] sm:rounded-xl sm:p-5" onSubmit={submit}>
      <header className="sticky top-0 z-20 -mx-4 -mt-4 flex items-start justify-between gap-3 border-b border-line bg-white p-4 sm:-mx-5 sm:-mt-5 sm:p-5"><div><p className="text-xs font-semibold uppercase text-apex">Documento independiente · sin visita</p><h2 id="standalone-document-title" className="text-xl font-semibold">{kind === "quotation" ? "Nueva cotización" : "Nuevo pedido"}</h2><p className="text-sm text-neutral-600">El asesor se toma del maestro del cliente seleccionado.</p></div><button aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-md border border-line" disabled={busy} onClick={onClose} type="button"><X size={18}/></button></header>
      <fieldset className="mt-4 space-y-4 [&>div:nth-of-type(2)]:hidden md:[&>div:nth-of-type(2)]:block" disabled={busy}>
        <div className={`grid gap-3 ${kind === "quotation" ? "md:grid-cols-[1fr_180px]" : ""}`}><div><CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} optional={false}/>{selectedCustomer ? <p className="mt-1 text-xs text-neutral-500">Asesor: {selectedCustomer.advisor?.name || "Asignado al cliente"}</p> : null}</div>{kind === "quotation" ? <label className="text-sm font-medium">Vigencia (días)<input className={`${input} mt-1`} min="1" max="365" required type="number" value={validityDays} onChange={event => setValidityDays(event.target.value)}/></label> : null}</div>
        <div className="overflow-x-auto rounded-md border border-line"><table className="w-full min-w-[760px] text-sm"><thead className="bg-paper text-left text-xs uppercase text-neutral-500"><tr><th className="p-3">Código</th><th className="p-3">Producto</th><th className="p-3">Cantidad</th><th className="p-3 text-right">Precio</th><th className="p-3 text-right">Total</th><th className="p-3"/></tr></thead><tbody>{detailed.map((line, index) => <tr className="border-t border-line" key={index}><td className="p-2"><div className="relative"><input aria-label={`Código de producto ${index + 1}`} className={`${input} pr-10 font-mono`} value={line.product_code} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, product_code: event.target.value, product_id: "" } : item))} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); resolveProduct(index); } }}/><button aria-label="Buscar producto" className="absolute right-1 top-1 h-8 w-8 rounded hover:bg-paper" onClick={() => resolveProduct(index)} type="button"><Search className="mx-auto" size={16}/></button></div></td><td className="p-2"><input className={`${input} cursor-not-allowed bg-paper`} readOnly value={line.product?.name || ""}/></td><td className="p-2"><input className={`${input} w-28`} min="0.0001" required step="0.01" type="number" value={line.quantity} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))}/></td><td className="p-3 text-right">{money.format(Number(line.product?.unit_price || 0))}</td><td className="p-3 text-right font-semibold">{money.format(Number(line.product?.unit_price || 0) * line.quantity)}</td><td className="p-2"><button aria-label="Eliminar producto" className="h-10 w-10 rounded border border-line" disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, i) => i !== index))} type="button"><Trash2 className="mx-auto" size={15}/></button></td></tr>)}</tbody></table></div>
        <div className="space-y-3 md:hidden">{detailed.map((line, index) => <article className="rounded-lg border border-line p-3" key={index}><div className="mb-3 flex items-center justify-between"><strong className="text-sm">Producto {index + 1}</strong><button aria-label={`Eliminar producto ${index + 1}`} className="flex h-11 w-11 items-center justify-center rounded border border-line" disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, i) => i !== index))} type="button"><Trash2 size={16}/></button></div><label className="text-sm font-medium">Código<div className="relative mt-1"><input className={`${input} pr-12 font-mono`} value={line.product_code} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, product_code: event.target.value, product_id: "" } : item))} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); resolveProduct(index); } }}/><button aria-label="Buscar producto" className="absolute right-0 top-0 flex h-10 w-11 items-center justify-center" onClick={() => resolveProduct(index)} type="button"><Search size={17}/></button></div></label><p className="mt-3 text-sm"><span className="block text-xs text-neutral-500">Producto</span><strong>{line.product?.name || "Sin seleccionar"}</strong></p><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm font-medium">Cantidad<input className={`${input} mt-1`} min="0.0001" required step="0.01" type="number" value={line.quantity} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))}/></label><p className="pt-1 text-right text-sm"><span className="block text-xs text-neutral-500">Precio / total</span>{money.format(Number(line.product?.unit_price || 0))}<strong className="block">{money.format(Number(line.product?.unit_price || 0) * line.quantity)}</strong></p></div></article>)}</div>
        <button className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-apex" onClick={() => setLines(current => [...current, { product_id: "", product_code: "", quantity: 1 }])} type="button"><Plus size={15}/>Agregar producto</button>
        <textarea className="min-h-20 w-full rounded-md border border-line p-3 text-sm" maxLength={2000} placeholder="Observaciones del documento" value={notes} onChange={event => setNotes(event.target.value)}/>
      </fieldset>
      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <footer className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-4 flex flex-col gap-3 border-t border-line bg-white p-4 sm:-mx-5 sm:-mb-5 sm:flex-row sm:items-center sm:justify-between sm:p-5"><strong className="text-xl">Total {money.format(total)}</strong><button className="apex-primary-action h-11 px-5 text-sm font-semibold" disabled={busy} type="submit">{busy ? "Generando…" : kind === "quotation" ? "Generar cotización y PDF" : "Generar pedido y PDF"}</button></footer>
    </form>
    {searching !== null ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"><div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><h3 className="text-lg font-semibold">Buscar producto</h3><button aria-label="Cerrar buscador" onClick={() => setSearching(null)} type="button"><X size={18}/></button></div><input autoFocus className={`${input} mt-3`} placeholder="Código, nombre, categoría, subcategoría o línea" value={productQuery} onChange={event => setProductQuery(event.target.value)}/><div className="mt-3 max-h-96 overflow-auto rounded border border-line">{visibleProducts.slice(0, 50).map(product => <button className="flex w-full justify-between border-b border-line p-3 text-left text-sm hover:bg-paper" key={product.id} onClick={() => { setLines(current => current.map((line, index) => index === searching ? { ...line, product_id: String(product.id), product_code: String(product.code) } : line)); setSearching(null); setProductQuery(""); }} type="button"><span><strong>{product.code}</strong> · {product.name}</span><strong>{money.format(Number(product.unit_price))}</strong></button>)}{!visibleProducts.length ? <p className="p-6 text-center text-sm text-neutral-500">No se encontraron productos.</p> : null}</div></div></div> : null}
  </div>;
}
