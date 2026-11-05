import { cn } from "@/lib/cn";

/** Figma "progress bar": 16px pill track with a blue fill. `value` is a percentage, clamped to 0–100. */
export function ProgressBar({
  value,
  label,
  className,
  fillClassName,
}: {
  value: number;
  label: string;
  className?: string;
  fillClassName?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("h-4 w-full overflow-hidden rounded-full border border-white bg-black/10", className)}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-[width] duration-500", fillClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
