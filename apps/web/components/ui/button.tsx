import { ButtonHTMLAttributes, forwardRef } from "react";
import { twMerge } from "tailwind-merge";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "compact" | "default" | "touch";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-apex text-white hover:bg-teal-600",
  secondary: "border-line bg-surface text-content-strong hover:border-apex hover:bg-surface-muted",
  ghost: "border-transparent bg-transparent text-content-body hover:bg-surface-muted hover:text-content-strong",
  danger: "border-transparent bg-error text-white hover:bg-red-600"
};

const sizes: Record<ButtonSize, string> = {
  compact: "h-9 px-3",
  default: "h-10 px-4",
  touch: "h-12 px-5 text-base"
};

// Las acciones que por fuerza son enlace (wa.me, descarga firmada, Link de Next) pintan y
// se comportan igual que el boton: la misma tinta, el mismo alto y el mismo anillo de foco
// salen de aqui, no de una cadena copiada en cada pantalla.
const base =
  "inline-flex items-center justify-center gap-2 rounded-control border text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-apex focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "default", className?: string) {
  return twMerge(base, variants[variant], sizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "default", loading = false, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={buttonClasses(variant, size, className)}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </button>
  );
});

