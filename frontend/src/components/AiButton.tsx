import { ArrowRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Alfred's "AI / Button" (Figma S1 cards, route cards): gradient pill with the label on the left and an arrow. */
export function AiButton({
  children,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={cn(
        "flex h-12 items-center justify-between gap-4 rounded-full bg-ai pr-2 pl-6 text-base font-bold text-white shadow-lift ring-[1.5px] ring-info-400 ring-inset",
        "transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <span className="grid size-8 place-items-center">
        <ArrowRight aria-hidden className="size-4" />
      </span>
    </button>
  );
}
