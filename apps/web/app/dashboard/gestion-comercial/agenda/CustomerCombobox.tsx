"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

type Customer = { id: number; code?: string; legal_name: string; trade_name?: string; identification?: string; phone?: string; whatsapp?: string; city?: string; address?: string };
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const label = (customer: Customer) => `${customer.code || "Sin código"} · ${customer.legal_name}`;

export function CustomerCombobox({ customers: source, value, onChange }: { customers: any[]; value: string | number; onChange: (value: string) => void }) {
  const customers = source as Customer[];
  const selected = customers.find(customer => String(customer.id) === String(value));
  const [query, setQuery] = useState(selected ? label(selected) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const search = normalize(query);
    if (!search || selected && query === label(selected)) return customers;
    return customers.filter(customer => normalize([customer.code, customer.legal_name, customer.trade_name, customer.identification, customer.phone, customer.whatsapp, customer.city, customer.address].join(" ")).includes(search));
  }, [customers, query, selected]);
  function show() { setOpen(true); setActive(-1); }
  function choose(customer: Customer) { onChange(String(customer.id)); setQuery(label(customer)); setOpen(false); setActive(-1); }
  function clear() { onChange(""); setQuery(""); setOpen(false); setActive(-1); }
  return <div ref={root} className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label className="text-sm font-medium" htmlFor="visit-customer-search">Cliente (opcional)</label>
    <div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={17}/><input id="visit-customer-search" role="combobox" aria-autocomplete="list" aria-controls="visit-customer-list" aria-expanded={open} aria-activedescendant={open && active >= 0 ? `visit-customer-${filtered[active]?.id}` : undefined} className="h-10 w-full rounded-md border border-line bg-white pl-10 pr-20 text-sm outline-none focus:border-apex" placeholder="Código, nombre, documento, ciudad o teléfono" value={query} onFocus={show} onChange={event => { setQuery(event.target.value); onChange(""); setOpen(true); setActive(0); }} onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); if (!query.trim() || !open || selected && query === label(selected)) show(); else if (active >= 0 && filtered[active]) choose(filtered[active]); }
      else if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive(current => Math.min(filtered.length - 1, Math.max(0, current + 1))); }
      else if (event.key === "ArrowUp") { event.preventDefault(); setActive(current => Math.max(0, current - 1)); }
      else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
    }}/>{query || value ? <button type="button" aria-label="Limpiar cliente y programar sin cliente" className="absolute right-10 top-1 flex h-8 w-8 items-center justify-center rounded hover:bg-paper" onClick={clear}><X size={16}/></button> : null}<button type="button" aria-label="Mostrar lista de clientes" aria-haspopup="listbox" className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded hover:bg-paper" onClick={() => open ? setOpen(false) : show()}><ChevronDown size={17}/></button></div>
    {!value && <p className="mt-1 text-xs text-neutral-500">Sin selección se programará como prospección sin cliente. Presiona Enter o abre la lista.</p>}
    {open && <div id="visit-customer-list" role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-white p-1 shadow-xl"><button type="button" role="option" aria-selected={!value} className="flex w-full items-center justify-between rounded p-3 text-left text-sm hover:bg-paper" onMouseDown={event => event.preventDefault()} onClick={clear}><span><strong>Sin cliente / prospección</strong><small className="block text-neutral-500">La visita podrá vincular un cliente durante su ejecución.</small></span>{!value && <Check size={16} className="text-apex"/>}</button>{filtered.map((customer, index) => <button id={`visit-customer-${customer.id}`} type="button" role="option" aria-selected={String(value) === String(customer.id)} key={customer.id} className={`flex w-full items-center justify-between rounded p-3 text-left text-sm ${active === index ? "bg-teal-50" : "hover:bg-paper"}`} onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(customer)}><span><strong>{label(customer)}</strong><small className="block text-neutral-500">{[customer.identification, customer.city, customer.phone || customer.whatsapp].filter(Boolean).join(" · ") || "Sin datos adicionales"}</small></span>{String(value) === String(customer.id) && <Check size={16} className="text-apex"/>}</button>)}{!filtered.length && <p className="p-4 text-center text-sm text-neutral-500">No se encontraron clientes. Limpia el texto para ver toda la lista.</p>}</div>}
  </div>;
}
