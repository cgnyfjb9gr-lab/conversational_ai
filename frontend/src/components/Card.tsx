import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** White surface. `panel` is the large bordered container (24px radius); `tile` is the raised 12px card. */
export function Card({
  variant = "panel",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { variant?: "panel" | "tile" }) {
  return (
    <section
      className={cn(
        "bg-white",
        variant === "panel" ? "rounded-2xl border border-line p-6" : "rounded-lg p-6 shadow-card",
        className,
      )}
      {...props}
    />
  );
}
