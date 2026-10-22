"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const readOptions = (node: HTMLSelectElement) => Array.from(node.options, option => ({ value: option.value, label: option.text, disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) }));
export function matchesTransportOption(label: string, query: string) {
  const text = normalize(label);
  const search = normalize(query);
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return !search || search.split(/\s+/).every(part => text.includes(part)) || words.map(word => word[0]).join("").startsWith(search.replace(/\s+/g, ""));
}

/** Keeps the original select as the form authority, including FormData and validation. */
export function TransportSearchSelect({ className, autoFocus, id, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const uid = useId();
  const listId = `${uid}-options`;
  const select = useRef<HTMLSelectElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [accessibleLabel, setAccessibleLabel] = useState("");
  const [active, setActive] = useState(0);
  const [options, setOptions] = useState<{ value: string; label: string; disabled: boolean }[]>([]);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 260 });
  useLayoutEffect(() => {
    const node = select.current;
    if (node) { setLabel(node.selectedOptions[0]?.text || ""); setSelectedValue(node.value); }
    if (open && node) setOptions(readOptions(node));
    const caption = input.current?.closest("label")?.cloneNode(true) as HTMLElement | undefined;
    caption?.querySelectorAll("select, input, button, [aria-hidden]").forEach(element => element.remove());
    setAccessibleLabel(caption?.textContent?.trim() || props.name?.replace(/_/g, " ") || "Buscar opción");
  }, [props.children, props.value, props.defaultValue, props.name, open]);
  useEffect(() => {
    const node = select.current;
    const reset = () => { setOpen(false); setQuery(""); requestAnimationFrame(() => {
      if (node && props.value !== undefined) node.value = String(props.value);
      setLabel(node?.selectedOptions[0]?.text || ""); setSelectedValue(node?.value || "");
    }); };
    node?.form?.addEventListener("reset", reset);
    return () => node?.form?.removeEventListener("reset", reset);
  }, [props.value]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close); };
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);
  function show() {
    if (props.disabled || !select.current || !input.current) return;
    setOptions(readOptions(select.current));
    const rect = input.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const height = Math.min(260, Math.max(100, below >= 160 ? below : rect.top - 12));
    setPosition({ left: rect.left, top: below >= 160 ? rect.bottom + 4 : Math.max(4, rect.top - height - 4), width: rect.width, maxHeight: height });
    setOpen(true);
    setActive(0);
  }
  const matches = options.filter(option => matchesTransportOption(option.label, query));
  function choose(value: string) {
    const node = select.current;
    if (!node) return;
    node.value = value;
    setSelectedValue(value);
    node.dispatchEvent(new Event("change", { bubbles: true }));
    setLabel(node.selectedOptions[0]?.text || "");
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => input.current?.select());
  }
  return <>
    <select {...props} ref={select} tabIndex={-1} aria-hidden="true" className="sr-only" onInvalid={event => { event.preventDefault(); input.current?.focus(); show(); }} />
    <span className="relative inline-flex min-w-0 align-middle" style={{ width: className?.includes("w-full") ? "100%" : undefined }}>
      <input ref={input} id={id} autoFocus={autoFocus} disabled={props.disabled} role="combobox" aria-label={props["aria-label"] || accessibleLabel} aria-labelledby={props["aria-labelledby"]} aria-describedby={props["aria-describedby"]} aria-required={props.required} aria-invalid={props["aria-invalid"]} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined} autoComplete="off" className={`${className || "h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"} min-w-0 pr-8 disabled:opacity-50`} value={open ? query : label} placeholder={label || "Buscar o presionar Enter…"}
        onFocus={event => event.currentTarget.select()}
        onClick={() => { if (!open) { setQuery(""); show(); } }}
        onChange={event => { setQuery(event.target.value); show(); }}
        onBlur={() => { setOpen(false); setQuery(""); }}
        onKeyDown={event => {
          if (["Enter", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) event.preventDefault();
          if (event.key === "Escape") { event.stopPropagation(); setOpen(false); setQuery(""); }
          else if (event.key === "Enter") { if (!open) { setQuery(""); show(); } else if (matches[active] && !matches[active].disabled) choose(matches[active].value); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!open) { setQuery(""); show(); }
            else { const direction = event.key === "ArrowDown" ? 1 : -1; let next = active + direction; while (matches[next]?.disabled) next += direction; if (matches[next]) setActive(next); }
          }
        }} />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-content-muted">⌕</span>
    </span>
    {open && createPortal(<div id={listId} role="listbox" aria-label={props["aria-label"] || "Opciones disponibles"} style={{ position: "fixed", ...position, zIndex: 10000 }} className="overflow-auto rounded-md border border-line bg-surface p-1 shadow-xl" onMouseDown={event => event.preventDefault()}>
      {matches.map((option, index) => <button type="button" role="option" tabIndex={-1} id={`${listId}-${index}`} key={`${option.value}-${index}`} aria-selected={selectedValue === option.value} disabled={option.disabled} className={`block min-h-10 w-full rounded px-3 py-2 text-left text-sm disabled:opacity-40 ${active === index ? "bg-teal-50 text-apex" : "hover:bg-paper"}`} onMouseEnter={() => setActive(index)} onClick={() => choose(option.value)}>{option.label}{selectedValue === option.value ? " ✓" : ""}</button>)}
      {!matches.length && <p role="status" className="p-3 text-sm text-content-muted">Sin coincidencias. Prueba otro nombre, código o iniciales.</p>}
    </div>, document.body)}
  </>;
}
