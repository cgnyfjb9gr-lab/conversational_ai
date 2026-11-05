import { ToggleGroup } from "radix-ui";

import { chipBase, chipFilled, chipOutline } from "@/components/Chip";
import { cn } from "@/lib/cn";

export type Choice<T extends string> = { value: T; label: string };

/**
 * Pick one option from a row of chips. Screen readers get a radio group; the arrow keys move between
 * chips. Choosing the selected chip again clears the choice (value becomes "").
 */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Accessible name of the group, e.g. "Reason". */
  label: string;
  options: readonly Choice<T>[];
  value: T | "";
  onChange: (value: T | "") => void;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T | "")}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(chipBase, "h-8 px-3.5", o.value === value ? chipFilled : chipOutline)}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
