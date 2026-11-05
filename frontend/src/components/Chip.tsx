import { ArrowRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Shared chip shape and colors (Figma "AI / Button"), also used by ChoiceChips. */
export const chipBase =
  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
export const chipOutline = "border-ai text-primary hover:brightness-95";
export const chipFilled = "bg-ai text-white shadow-lift ring-[1.5px] ring-info-400 ring-inset";

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** For choices: sets aria-pressed and fills the chip. */
  selected?: boolean;
  /** Fill the chip without making it a toggle (e.g. the main action). */
  filled?: boolean;
  children: ReactNode;
};

/**
 * Alfred chip for quick replies and choices.
 * Filled: gradient with an arrow. Otherwise: gradient outline.
 */
export function Chip({ selected, filled = selected, className, children, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(chipBase, filled ? cn(chipFilled, "pr-1.5") : chipOutline, className)}
      {...props}
    >
      {children}
      {filled && (
        <span className="grid size-6 place-items-center rounded-full">
          <ArrowRight aria-hidden className="size-4" />
        </span>
      )}
    </button>
  );
}
