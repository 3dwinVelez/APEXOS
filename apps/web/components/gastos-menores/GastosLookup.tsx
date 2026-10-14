"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export type GastosLookupOption = {
  value: string;
  label: string;
  search?: string;
  aliases?: string[];
};

type Props = {
  "aria-label": string;
  className?: string;
  placeholder?: string;
  value: string;
  options: GastosLookupOption[];
  optional?: boolean;
  disabled?: boolean;
  onResolve: (value: string, option: GastosLookupOption) => void;
  onClear: () => void;
  onInvalid?: (text: string) => void;
  onEnterResolved?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelected?: (input: HTMLInputElement) => void;
  onValidityChange?: (valid: boolean) => void;
  resetToken?: string;
};

function matches(option: GastosLookupOption, text: string) {
  const needle = text.trim().toLocaleLowerCase();
  if (!needle) return false;
  return [option.value, option.label, option.search || "", ...(option.aliases || [])].some((value) => value.toLocaleLowerCase() === needle);
}

export function GastosLookup({
  "aria-label": ariaLabel,
  className,
  placeholder = "Código o nombre",
  value,
  options,
  optional = false,
  disabled = false,
  onResolve,
  onClear,
  onInvalid,
  onEnterResolved,
  onSelected,
  onValidityChange,
  resetToken
}: Props) {
  const selected = options.find((option) => option.value === value) || null;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dirtyRef = useRef(false);
  const validityRef = useRef(onValidityChange);
  const selectedLabelRef = useRef(selected?.label);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!dirtyRef.current) setText(selected?.label || "");
  }, [selected?.label, value]);

  useEffect(() => {
    validityRef.current = onValidityChange;
  }, [onValidityChange]);

  useEffect(() => {
    selectedLabelRef.current = selected?.label;
  }, [selected?.label]);

  useEffect(() => {
    dirtyRef.current = false;
    setText(selectedLabelRef.current || "");
    validityRef.current?.(true);
  }, [resetToken]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return options;
    return options.filter((option) => [option.value, option.label, option.search || "", ...(option.aliases || [])].some((field) => field.toLocaleLowerCase().includes(needle)));
  }, [options, query]);

  function close(restoreFocus = true) {
    setOpen(false);
    setQuery("");
    setActive(0);
    if (restoreFocus) window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function choose(option: GastosLookupOption, advance = false) {
    dirtyRef.current = false;
    onResolve(option.value, option);
    setText(option.label);
    onValidityChange?.(true);
    close(!advance);
    if (advance && onSelected) window.setTimeout(() => { if (inputRef.current) onSelected(inputRef.current); }, 0);
  }

  function resolveOrSearch(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    const trimmed = text.trim();
    if (!trimmed) {
      onValidityChange?.(true);
      setQuery("");
      setActive(0);
      setOpen(true);
      window.setTimeout(() => searchRef.current?.focus(), 0);
      return;
    }
    const exactMatches = options.filter((option) => matches(option, trimmed));
    if (exactMatches.length !== 1) {
      onInvalid?.(trimmed);
      onValidityChange?.(false);
      return;
    }
    choose(exactMatches[0], true);
    onEnterResolved?.(event);
  }

  function handleBlur() {
    if (optional && !text.trim()) onClear();
  }

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  });

  return (
    <>
      <div className="relative">
        <input
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={listId}
          autoComplete="off"
          aria-expanded={open}
          className={className}
          disabled={disabled}
          onBlur={handleBlur}
          onChange={(event) => {
            dirtyRef.current = true;
            setText(event.target.value);
            if (value) onClear();
            onValidityChange?.(!event.target.value.trim() || options.some((option) => matches(option, event.target.value)));
          }}
          onKeyDown={resolveOrSearch}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          onInvalid={() => onValidityChange?.(false)}
          required={false}
          value={text}
        />
        <button
          aria-label={`Buscar ${ariaLabel}`}
          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded text-apex hover:bg-paper"
          disabled={disabled}
          onClick={() => {
            setQuery(text);
            setActive(0);
            setOpen(true);
            window.setTimeout(() => searchRef.current?.focus(), 0);
          }}
          tabIndex={-1}
          type="button"
        >
          <Search size={15} />
        </button>
      </div>
      {open ? (
        <div aria-label={`Buscar ${ariaLabel}`} aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Buscar {ariaLabel}</h2>
                <p className="text-sm text-neutral-600">Busca por código o nombre. Usa ↑ ↓ y Enter para seleccionar.</p>
              </div>
              <button aria-label="Cerrar buscador" className="rounded-md border border-line p-2" onClick={() => close()} type="button"><X size={18} /></button>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-3 text-neutral-400" size={17} />
              <input
                aria-label={`Filtro ${ariaLabel}`}
                autoFocus
                autoComplete="off"
                className="control w-full pl-10"
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0))); }
                  if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
                  if (event.key === "Enter") { event.preventDefault(); const option = visible[active]; if (option) choose(option, true); }
                }}
                ref={searchRef}
                value={query}
              />
            </div>
            <div className="mt-3 max-h-[50vh] overflow-auto rounded-md border border-line" id={listId} role="listbox">
              {visible.map((option, index) => (
                <button
                  aria-selected={index === active}
                  className={`flex w-full items-center justify-between border-b border-line p-3 text-left text-sm last:border-b-0 ${index === active ? "bg-paper" : "hover:bg-paper"}`}
                  key={option.value}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(index)}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                </button>
              ))}
              {!visible.length ? <p className="p-6 text-center text-sm text-neutral-500">No hay resultados.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
