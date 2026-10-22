"use client";

// Reuse the validated keyboard/form-control implementation across operational modules.
export { TransportSearchSelect as InventorySearchSelect } from "./transport/TransportSearchSelect";

export function InventoryPagination({ page, total, size = 25, onChange, label = "Páginas del reporte" }: { page: number; total: number; size?: number; onChange: (page: number) => void; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-3 text-sm"><span className="text-content-muted">{total ? (page - 1) * size + 1 : 0}–{Math.min(page * size, total)} de {total}</span><div className="flex items-center gap-2"><button className="min-h-10 rounded-lg border border-line px-3 disabled:opacity-40" type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</button><span>{page} / {pages}</span><button className="min-h-10 rounded-lg border border-line px-3 disabled:opacity-40" type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Siguiente</button></div></nav>;
}
