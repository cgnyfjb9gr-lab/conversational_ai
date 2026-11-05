import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** Multi-line text box with the same border and focus ring as TextField. Label it with aria-label or a <label>. */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full resize-y rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted",
        "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        className,
      )}
      {...props}
    />
  );
}
