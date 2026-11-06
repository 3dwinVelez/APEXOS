"use client";

import { useId, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { twMerge } from "tailwind-merge";

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  /** Etiqueta visible del campo. */
  label?: string;
  /** Valor controlado: la pantalla filtra con el texto tal como se escribe. */
  value: string;
  onChange: (value: string) => void;
  /** Ayuda bajo el campo (por ejemplo, qué campos ignora la búsqueda). */
  hint?: string;
};

/**
 * Búsqueda canónica del producto: texto acotado, icono de lupa, botón para limpiar y
 * etiqueta asociada por id. El label vive fuera del <label> para que el botón de limpiar
 * no herede la acción del recuadro. Reemplaza los campos de búsqueda sueltos de los
 * listados (apps/web/app/dashboard/**) sin cambiar el estado que controla el filtrado.
 */
export function SearchField({ className, hint, label = "Buscar", onChange, placeholder, value, ...props }: SearchFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const filled = value.trim().length > 0;
  return (
    <div className={twMerge("grid min-w-0 gap-1.5 text-sm font-medium text-content-strong", className)}>
      <label className="sr-only sm:not-sr-only" htmlFor={id}>{label}</label>
      <span className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
        <input
          {...props}
          aria-describedby={hint ? hintId : undefined}
          autoComplete="off"
          className={twMerge("control", "h-10 pl-9 pr-9")}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
        {filled ? (
          <button
            aria-label="Limpiar la búsqueda"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-content-muted outline-none hover:bg-surface-muted hover:text-content-strong focus-visible:ring-2 focus-visible:ring-apex/40"
            onClick={() => onChange("")}
            title="Limpiar la búsqueda"
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </span>
      {hint ? <span className="text-xs font-normal text-content-muted" id={hintId}>{hint}</span> : null}
    </div>
  );
}
