import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const tones = {
  warning: "bg-warning-100 text-warning-700",
  neutral: "bg-line text-neutral-700",
  success: "bg-success-100 text-success-700",
} as const;

/** Figma "status badge": small rounded label such as "Needs attention". */
export function StatusTag({
  tone,
  children,
  className,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-sm px-1 text-sm font-bold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
