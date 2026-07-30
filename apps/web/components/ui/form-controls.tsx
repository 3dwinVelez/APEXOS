import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

const controlClass = "w-full rounded-md border border-line bg-surface px-3 text-sm text-content-strong outline-none transition-colors duration-150 placeholder:text-content-muted focus:border-apex focus:ring-2 focus:ring-apex/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";

type FieldProps = { label?: string; hint?: string; error?: string };

function FieldMessage({ hint, error }: Pick<FieldProps, "hint" | "error">) {
  const message = error || hint;
  return message ? <span className={error ? "text-xs text-error" : "text-xs text-content-muted"}>{message}</span> : null;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  function Input({ className, label, hint, error, id, ...props }, ref) {
    const inputId = id || props.name;
    return <label className="grid gap-1.5 text-sm font-medium text-content-strong">
      {label ? <span>{label}</span> : null}
      <input ref={ref} id={inputId} aria-invalid={Boolean(error)} className={twMerge(controlClass, "h-10", error && "border-error focus:border-error focus:ring-error/20", className)} {...props} />
      <FieldMessage hint={hint} error={error} />
    </label>;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(
  function Select({ className, label, hint, error, children, id, ...props }, ref) {
    const selectId = id || props.name;
    return <label className="grid gap-1.5 text-sm font-medium text-content-strong">
      {label ? <span>{label}</span> : null}
      <select ref={ref} id={selectId} aria-invalid={Boolean(error)} className={twMerge(controlClass, "h-10", error && "border-error focus:border-error focus:ring-error/20", className)} {...props}>{children}</select>
      <FieldMessage hint={hint} error={error} />
    </label>;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(
  function Textarea({ className, label, hint, error, id, ...props }, ref) {
    const textareaId = id || props.name;
    return <label className="grid gap-1.5 text-sm font-medium text-content-strong">
      {label ? <span>{label}</span> : null}
      <textarea ref={ref} id={textareaId} aria-invalid={Boolean(error)} className={twMerge(controlClass, "min-h-24 py-2", error && "border-error focus:border-error focus:ring-error/20", className)} {...props} />
      <FieldMessage hint={hint} error={error} />
    </label>;
  }
);
