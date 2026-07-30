import type { ReactNode, TableHTMLAttributes } from "react";
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
