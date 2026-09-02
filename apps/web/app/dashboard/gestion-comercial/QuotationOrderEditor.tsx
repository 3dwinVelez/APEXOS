"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { X } from "lucide-react";
type Row = Record<string, any>;
type Line = { product_id: number; code: string; name: string; original: number; quantity: number; discount: number; source: boolean };
const money = (value: number) => value.toLocaleString("es-CO", { style: "currency", currency: "COP" });
export function QuotationOrderEditor({ quotationId, onClose, onCreated }: { quotationId: number; onClose: () => void; onCreated: (order: Row) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [quote, setQuote] = useState<Row | null>(null);
  const [products, setProducts] = useState<Row[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api<Row>(`/api/v1/commercial-management/quotations/${quotationId}`, { cache: "no-store" }), api<Row[]>("/api/v1/commercial-management/products", { cache: "no-store" })]).then(([quotation, catalog]) => {
      if (!active) return;
      setQuote(quotation); setProducts(catalog.filter(product => product.active !== false));
      const byProduct = new Map<number, Line>();
      for (const line of quotation.lines) {
        const item = byProduct.get(line.product_id) || { product_id: line.product_id, code: line.product_code, name: line.product_name, original: 0, quantity: 0, discount: 0, source: true };
        item.original += Number(line.quantity); item.quantity += Number(line.quantity); item.discount += Number(line.discount || 0); byProduct.set(line.product_id, item);
      }
      setLines([...byProduct.values()]);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [quotationId]);
  const price = (line: Line) => Number(products.find(product => product.id === line.product_id)?.unit_price || 0);
  const discount = (line: Line) => line.original ? Math.round(line.discount / line.original * line.quantity * 100) / 100 : 0;
  const total = lines.reduce((sum, line) => sum + price(line) * line.quantity - discount(line), 0);
  const unavailable = lines.some(line => line.quantity > 0 && !products.some(product => product.id === line.product_id));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const order = await api<Row>(`/api/v1/commercial-management/quotations/${quotationId}/convert-to-order`, { method: "POST", body: JSON.stringify({ lines: lines.map(line => ({ product_id: line.product_id, quantity: line.quantity })) }) });
      window.dispatchEvent(new Event("commercial-documents-changed"));
      onCreated(order);
    } catch (e) { setError(e instanceof Error ? e.message : "No fue posible generar el pedido."); }
    finally { setBusy(false); }
  }
  return <dialog ref={ref} onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose} aria-label="Generar pedido desde cotización" className="m-auto max-h-[90vh] w-[95vw] max-w-5xl overflow-auto rounded-xl bg-white p-5 shadow-xl backdrop:bg-black/45">
    <form onSubmit={submit}><header className="flex justify-between gap-3"><div><h2 className="text-xl font-semibold">Generar pedido · {quote?.quotation_number || "Cargando…"}</h2><p className="text-sm">{quote?.customer?.legal_name}</p></div><button type="button" disabled={busy} aria-label="Cerrar" onClick={onClose}><X size={20}/></button></header>
      <p className="my-3 text-sm text-neutral-600">La cotización original no cambia. Ajusta cantidades o agrega productos. Usa 0 si un producto cotizado no se pide; su fila permanece para comparación. Los precios provienen del catálogo vigente y los descuentos originales se ajustan proporcionalmente.</p>
      {error && <p role="alert" className="my-3 rounded bg-red-50 p-3 text-red-700">{error}</p>}
      {quote && <><fieldset disabled={busy}><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-paper"><tr>{["Código / producto", "Cotizado", "Pedido", "Diferencia", "Precio vigente", "Descuento", "Total", ""].map((label, i) => <th className="p-2" key={i}>{label}</th>)}</tr></thead><tbody>{lines.map(line => <tr key={line.product_id} className="border-t border-line"><td className="p-2"><strong>{line.code}</strong><p>{line.name}</p>{!line.source && <span className="text-xs text-apex">Agregado al pedido</span>}</td><td className="p-2">{line.original}</td><td className="p-2"><input required aria-label={`Cantidad pedido ${line.code}`} type="number" min="0" step="any" value={line.quantity} className="h-10 w-24 rounded border border-line px-2" onChange={e => setLines(current => current.map(item => item.product_id === line.product_id ? { ...item, quantity: Number(e.target.value) } : item))}/></td><td className="p-2">{Number((line.quantity - line.original).toFixed(4))}</td><td className="p-2">{products.some(product => product.id === line.product_id) ? money(price(line)) : "No disponible"}</td><td className="p-2">{money(discount(line))}</td><td className="p-2">{money(price(line) * line.quantity - discount(line))}</td><td className="p-2">{!line.source && <button type="button" aria-label={`Quitar agregado ${line.code}`} onClick={() => setLines(current => current.filter(item => item.product_id !== line.product_id))}><X size={16}/></button>}</td></tr>)}</tbody></table></div>
      <label className="mt-4 block text-sm font-semibold">Agregar productos<input className="mt-1 h-10 w-full rounded border border-line px-3 font-normal" placeholder="Buscar por código o nombre…" value={query} onChange={e => setQuery(e.target.value)}/></label>
      {query && <div className="mt-2 max-h-44 overflow-auto rounded border border-line">{products.filter(product => !lines.some(line => line.product_id === product.id) && `${product.code} ${product.name}`.toLowerCase().includes(query.toLowerCase())).slice(0, 30).map(product => <button type="button" key={product.id} className="block w-full border-b border-line p-2 text-left text-sm hover:bg-paper" onClick={() => { setLines(current => [...current, { product_id: product.id, code: product.code, name: product.name, original: 0, quantity: 1, discount: 0, source: false }]); setQuery(""); }}>{product.code} · {product.name} · {money(Number(product.unit_price))}</button>)}</div>}</fieldset>
      {unavailable && <p className="mt-3 text-sm text-red-700">Hay productos no disponibles. Ajusta su cantidad a 0 para continuar.</p>}
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><strong>Total estimado {money(total)}</strong><button type="submit" disabled={busy || unavailable || !lines.some(line => line.quantity > 0)} className="apex-primary-action h-10 px-4 text-sm font-semibold">{busy ? "Generando…" : "Confirmar y generar pedido"}</button></footer></>}
    </form>
  </dialog>;
}
