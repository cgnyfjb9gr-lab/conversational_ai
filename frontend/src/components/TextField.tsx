import { useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** Labelled single-line input with an optional error message under it. */
export function TextField({
  label,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-bold text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "h-12 rounded-md border border-rule bg-white px-4 text-base text-ink outline-none placeholder:text-muted",
          "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
          "aria-invalid:border-warning-500",
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-warning-700">
          {error}
        </p>
      )}
    </div>
  );
}
