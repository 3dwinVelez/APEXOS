"use client";
import { useEffect, useState } from "react";
type Suggestion = { key: string; values: string[]; target: HTMLInputElement };
const prefix = "apex_field_history:";
function fieldKey(input: HTMLInputElement) { return input.name || input.id || input.placeholder?.slice(0, 40) || ""; }
function allowed(input: HTMLInputElement) { return !["password", "hidden", "file", "email", "tel"].includes(input.type) && !/token|secret|password|clave|document/i.test(fieldKey(input)); }
export function FieldProductivity() {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  useEffect(() => {
    const onFocus = (event: FocusEvent) => { const input = event.target as HTMLInputElement; if (!(input instanceof HTMLInputElement) || !allowed(input)) return; const key = fieldKey(input); if (!key) return; try { const values = JSON.parse(localStorage.getItem(`${prefix}${key}`) || "[]"); setSuggestion(Array.isArray(values) && values.length ? { key, values: values.slice(0, 5), target: input } : null); } catch { setSuggestion(null); } };
    const onBlur = (event: FocusEvent) => { const input = event.target as HTMLInputElement; if (!(input instanceof HTMLInputElement) || !allowed(input) || !input.value.trim()) return; const key = fieldKey(input); if (!key) return; let values: string[] = []; try { values = JSON.parse(localStorage.getItem(`${prefix}${key}`) || "[]"); } catch { values = []; } localStorage.setItem(`${prefix}${key}`, JSON.stringify([input.value.trim(), ...values.filter((value) => value !== input.value.trim())].slice(0, 5))); window.setTimeout(() => setSuggestion(null), 180); };
    const undo = () => document.execCommand("undo"); const redo = () => document.execCommand("redo");
    document.addEventListener("focusin", onFocus); document.addEventListener("focusout", onBlur); window.addEventListener("apex:undo", undo); window.addEventListener("apex:redo", redo);
    return () => { document.removeEventListener("focusin", onFocus); document.removeEventListener("focusout", onBlur); window.removeEventListener("apex:undo", undo); window.removeEventListener("apex:redo", redo); };
  }, []);
  if (!suggestion) return null;
  return <aside aria-label="Sugerencias recientes" className="fixed bottom-4 right-4 z-[65] w-72 rounded-card border border-line bg-surface p-3 shadow-overlay"><p className="text-xs font-semibold text-content-strong">Usados recientemente</p><div className="mt-2 flex flex-wrap gap-1">{suggestion.values.map((value) => <button className="max-w-full truncate rounded-control bg-surface-muted px-2 py-1 text-xs" key={value} onMouseDown={(event) => { event.preventDefault(); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(suggestion.target, value); suggestion.target.dispatchEvent(new Event("input", { bubbles: true })); suggestion.target.focus(); setSuggestion(null); }} type="button">{value}</button>)}</div></aside>;
}
