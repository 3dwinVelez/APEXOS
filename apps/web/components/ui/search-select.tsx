"use client";

import { matchesSelectOption } from "@/lib/selectMatch";
import { Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { twMerge } from "tailwind-merge";

export { matchesSelectOption };

const readOptions = (node: HTMLSelectElement) =>
  Array.from(node.options, (option) => ({
    value: option.value,
    label: option.text,
    disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled)
  }));

export type SearchSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Etiqueta visible del campo; el select nativo conserva su valor y su evento change. */
  label?: string;
  /** Ayuda bajo el control. */
  hint?: string;
  /** Error bajo el control; se anuncia como alerta. */
  error?: string;
  /** Se invoca al cerrar el campo visible sin elegir, para marcar el campo como tocado. */
  onClose?: () => void;
};

/**
 * Selector canónico con búsqueda. El `<select>` original sigue siendo la autoridad
 * del formulario (name, required, FormData y validación), y el campo visible solo
 * decide qué opción se elige: el valor y el `onChange` no cambian respecto al select.
 */
export function SearchSelect({ className, autoFocus, id, label, hint, error, onClose, ...props }: SearchSelectProps) {
  const uid = useId();
  const listId = `${uid}-options`;
  const labelId = `${uid}-label`;
  const messageId = `${uid}-message`;
  const select = useRef<HTMLSelectElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [labelText, setLabelText] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [accessibleLabel, setAccessibleLabel] = useState("");
  const [active, setActive] = useState(0);
  const [options, setOptions] = useState<{ value: string; label: string; disabled: boolean }[]>([]);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 260 });
  useLayoutEffect(() => {
    const node = select.current;
    if (node) { setLabelText(node.selectedOptions[0]?.text || ""); setSelectedValue(node.value); }
    if (open && node) setOptions(readOptions(node));
    const caption = input.current?.closest("label")?.cloneNode(true) as HTMLElement | undefined;
    caption?.querySelectorAll("select, input, button, [aria-hidden]").forEach((element) => element.remove());
    setAccessibleLabel(caption?.textContent?.trim() || props.name?.replace(/_/g, " ") || "Buscar opción");
  }, [props.children, props.value, props.defaultValue, props.name, open]);
  useEffect(() => {
    const node = select.current;
    const reset = () => { setOpen(false); setQuery(""); requestAnimationFrame(() => {
      if (node && props.value !== undefined) node.value = String(props.value);
      setLabelText(node?.selectedOptions[0]?.text || ""); setSelectedValue(node?.value || "");
    }); };
    node?.form?.addEventListener("reset", reset);
    return () => node?.form?.removeEventListener("reset", reset);
  }, [props.value]);
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);
  function place() {
    const node = input.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const height = Math.min(260, Math.max(100, below >= 160 ? below : rect.top - 12));
    setPosition({ left: rect.left, top: below >= 160 ? rect.bottom + 4 : Math.max(4, rect.top - height - 4), width: rect.width, maxHeight: height });
  }
  function show() {
    if (props.disabled || !select.current || !input.current) return;
    setOptions(readOptions(select.current));
    place();
    setOpen(true);
    setActive(0);
  }
  const matches = options.filter((option) => matchesSelectOption(option.label, query));
  function choose(value: string) {
    const node = select.current;
    if (!node) return;
    node.value = value;
    setSelectedValue(value);
    node.dispatchEvent(new Event("change", { bubbles: true }));
    setLabelText(node.selectedOptions[0]?.text || "");
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => input.current?.select());
  }
  const controlClass = className
    ? twMerge(className, "pr-8 focus:border-apex focus:outline-none focus:ring-2 focus:ring-apex/20", error && "border-error")
    : twMerge("h-10 w-full min-w-0 rounded-md border border-line bg-surface px-3 text-sm text-content-strong outline-none transition-colors focus:border-apex focus:ring-2 focus:ring-apex/20 disabled:cursor-not-allowed disabled:opacity-60", "pr-8", error && "border-error");
  const describedBy = error || hint ? messageId : props["aria-describedby"];
  const combobox = <>
    <select {...props} ref={select} tabIndex={-1} aria-hidden="true" className="sr-only" onInvalid={(event) => { event.preventDefault(); input.current?.focus(); show(); }} />
    <span className="relative inline-flex min-w-0 align-middle" style={{ width: className?.includes("w-full") || !className ? "100%" : undefined }}>
      <input ref={input} id={id} autoFocus={autoFocus} disabled={props.disabled} role="combobox" aria-label={props["aria-label"] || (label ? undefined : accessibleLabel)} aria-labelledby={label ? labelId : props["aria-labelledby"]} aria-describedby={describedBy} aria-required={props.required} aria-invalid={error ? true : props["aria-invalid"]} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined} autoComplete="off" className={controlClass} value={open ? query : labelText} placeholder={labelText || "Buscar o presionar Enter…"}
        onFocus={(event) => event.currentTarget.select()}
        onClick={() => { if (!open) { setQuery(""); show(); } }}
        onChange={(event) => { setQuery(event.target.value); show(); }}
        onBlur={() => { setOpen(false); setQuery(""); onClose?.(); }}
        onKeyDown={(event) => {
          if (["Enter", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) event.preventDefault();
          if (event.key === "Escape") { event.stopPropagation(); setOpen(false); setQuery(""); }
          else if (event.key === "Enter") { if (!open) { setQuery(""); show(); } else if (matches[active] && !matches[active].disabled) choose(matches[active].value); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!open) { setQuery(""); show(); }
            else { const direction = event.key === "ArrowDown" ? 1 : -1; let next = active + direction; while (matches[next]?.disabled) next += direction; if (matches[next]) setActive(next); }
          }
        }} />
      <Search aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle" size={14} />
    </span>
    {open && createPortal(<div id={listId} role="listbox" aria-label={props["aria-label"] || label || "Opciones disponibles"} style={{ position: "fixed", ...position, zIndex: 10000 }} className="overflow-auto rounded-control border border-line bg-surface p-1 shadow-overlay" onMouseDown={(event) => event.preventDefault()}>
      {matches.map((option, index) => <button type="button" role="option" tabIndex={-1} id={`${listId}-${index}`} key={`${option.value}-${index}`} aria-selected={selectedValue === option.value} disabled={option.disabled} className={twMerge("block min-h-10 w-full rounded px-3 py-2 text-left text-sm text-content-body disabled:opacity-40", active === index && "bg-apex/10 text-apex-ink", "hover:bg-surface-muted")} onMouseEnter={() => setActive(index)} onClick={() => choose(option.value)}>{option.label}{selectedValue === option.value ? " ✓" : ""}</button>)}
      {!matches.length && <p role="status" className="p-3 text-sm text-content-muted">Sin coincidencias. Prueba otro nombre, código o iniciales.</p>}
    </div>, document.body)}
  </>;

  if (!label && !hint && !error) return combobox;
  return <div className="grid min-w-0 gap-1.5 text-sm font-medium text-content-strong">
    {label ? <span id={labelId}>{label}{props.required ? <span className="ml-1 text-error" aria-hidden="true">*</span> : null}</span> : null}
    {combobox}
    {error || hint ? <span id={messageId} role={error ? "alert" : undefined} className={error ? "text-xs text-error" : "text-xs text-content-muted"}>{error || hint}</span> : null}
  </div>;
}
