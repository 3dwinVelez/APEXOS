"use client";

import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode, type TableHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";
import { EmptyState, Skeleton } from "./feedback";

type DataTableProps = TableHTMLAttributes<HTMLTableElement> & {
  loading?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
  toolbar?: ReactNode;
};

export function DataTable({ loading, empty, emptyTitle = "Sin resultados", emptyDetail, toolbar, className, children, ...props }: DataTableProps) {
  return <section className="min-w-0">
    {toolbar ? <div className="mb-3 flex flex-wrap items-center gap-2">{toolbar}</div> : null}
    {loading ? <div className="grid gap-2" aria-label="Cargando tabla"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div> :
      empty ? <EmptyState title={emptyTitle} detail={emptyDetail} /> :
      <div className="max-w-full overflow-auto border-y border-line">
        <table className={twMerge("w-full min-w-[48rem] border-collapse text-left text-sm", className)} {...props}>{children}</table>
      </div>}
  </section>;
}

export function Pagination({ page, totalPages, onPrevious, onNext }: { page: number; totalPages: number; onPrevious: () => void; onNext: () => void }) {
  return <nav aria-label="Paginacion" className="mt-3 flex items-center justify-between gap-3 text-sm">
    <button className="h-9 rounded-md border border-line px-3 disabled:opacity-50" disabled={page <= 1} onClick={onPrevious} type="button">Anterior</button>
    <span className="text-content-muted">Pagina {page} de {Math.max(totalPages, 1)}</span>
    <button className="h-9 rounded-md border border-line px-3 disabled:opacity-50" disabled={page >= totalPages} onClick={onNext} type="button">Siguiente</button>
  </nav>;
}

export type DataColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  sortValue?: (row: Row) => string | number;
  className?: string;
  hideable?: boolean;
};

type SmartDataTableProps<Row> = {
  rows: Row[];
  columns: DataColumn<Row>[];
  rowKey: (row: Row) => string | number;
  storageKey: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
  pageSize?: number;
  bulkActions?: (selected: Row[], clear: () => void) => ReactNode;
};

export function SmartDataTable<Row>({ rows, columns, rowKey, storageKey, loading, emptyTitle, emptyDetail, pageSize = 10, bulkActions }: SmartDataTableProps<Row>) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [sort, setSort] = useState<{ id: string; direction: "asc" | "desc" } | null>(null);
  const [visible, setVisible] = useState<string[]>(() => columns.map((column) => column.id));
  const [configOpen, setConfigOpen] = useState(false);
  const columnSignature = columns.map((column) => column.id).join("|");

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(`apex_table_columns:${storageKey}`) || "null"); if (Array.isArray(saved)) setVisible(columnSignature.split("|").filter((id) => saved.includes(id))); } catch { /* Mantener columnas predeterminadas. */ }
  }, [columnSignature, storageKey]);

  const shownColumns = columns.filter((column) => visible.includes(column.id));
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.id === sort.id);
    if (!column?.sortValue) return rows;
    return [...rows].sort((left, right) => {
      const a = column.sortValue?.(left) ?? "";
      const b = column.sortValue?.(right) ?? "";
      const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es", { numeric: true });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [columns, rows, sort]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedRows = rows.filter((row) => selected.includes(rowKey(row)));
  const pageKeys = pageRows.map(rowKey);
  const allPageSelected = Boolean(pageKeys.length) && pageKeys.every((key) => selected.includes(key));

  function toggleColumn(id: string) {
    const next = visible.includes(id) ? visible.filter((item) => item !== id) : [...visible, id];
    if (!next.length) return;
    setVisible(next);
    localStorage.setItem(`apex_table_columns:${storageKey}`, JSON.stringify(next));
  }
  function toggleSort(column: DataColumn<Row>) {
    if (!column.sortValue) return;
    setSort((current) => current?.id === column.id ? { id: column.id, direction: current.direction === "asc" ? "desc" : "asc" } : { id: column.id, direction: "asc" });
  }

  return <section className="min-w-0" aria-label="Tabla de datos">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p aria-live="polite" className="text-sm text-content-muted">{rows.length} registros · {selected.length} seleccionados</p>
      <div className="relative">
        <button aria-expanded={configOpen} className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm" onClick={() => setConfigOpen((value) => !value)} type="button"><Columns3 size={16}/> Columnas</button>
        {configOpen ? <div className="absolute right-0 z-20 mt-2 min-w-56 rounded-card border border-line bg-surface p-2 shadow-card">{columns.filter((column) => column.hideable !== false).map((column) => <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-muted" key={column.id}><input checked={visible.includes(column.id)} onChange={() => toggleColumn(column.id)} type="checkbox"/>{column.header}</label>)}</div> : null}
      </div>
    </div>
    {selectedRows.length && bulkActions ? <div className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-apex/30 bg-apex/10 p-2">{bulkActions(selectedRows, () => setSelected([]))}</div> : null}
    {loading ? <div aria-label="Cargando tabla" className="grid gap-2"><Skeleton className="h-10"/><Skeleton className="h-10"/><Skeleton className="h-10"/></div> : !rows.length ? <EmptyState title={emptyTitle || "Sin resultados"} detail={emptyDetail}/> : <div className="max-h-[70vh] max-w-full overflow-auto rounded-card border border-line" role="region" aria-label="Resultados virtualizados" tabIndex={0}><table className="w-full min-w-[48rem] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-surface-muted"><tr><th className="w-10 px-3 py-2"><input aria-label="Seleccionar página" checked={allPageSelected} onChange={() => setSelected((current) => allPageSelected ? current.filter((key) => !pageKeys.includes(key)) : [...new Set([...current, ...pageKeys])])} type="checkbox"/></th>{shownColumns.map((column) => <th aria-sort={sort?.id === column.id ? (sort.direction === "asc" ? "ascending" : "descending") : undefined} className={twMerge("px-3 py-2 font-semibold", column.className)} key={column.id}>{column.sortValue ? <button className="inline-flex items-center gap-1" onClick={() => toggleSort(column)} type="button">{column.header}{sort?.id === column.id ? sort.direction === "asc" ? <ChevronUp size={14}/> : <ChevronDown size={14}/> : null}</button> : column.header}</th>)}</tr></thead><tbody>{pageRows.map((row) => { const key = rowKey(row); return <tr className="apex-virtual-row border-t border-line hover:bg-surface-muted/60" key={key}><td className="px-3 py-2"><input aria-label={`Seleccionar registro ${key}`} checked={selected.includes(key)} onChange={() => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} type="checkbox"/></td>{shownColumns.map((column) => <td className={twMerge("px-3 py-2", column.className)} key={column.id}>{column.cell(row)}</td>)}</tr>; })}</tbody></table></div>}
    {rows.length > pageSize ? <Pagination page={safePage} totalPages={totalPages} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))}/> : null}
  </section>;
}
