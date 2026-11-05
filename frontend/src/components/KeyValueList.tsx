import { cn } from "@/lib/cn";

export type KeyValueRow = { label: string; value: string };

/** Label on the left, bold value on the right, rows separated by a hairline. */
export function KeyValueList({ rows, className }: { rows: KeyValueRow[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-4">
          <dt className="text-base text-ink">{row.label}</dt>
          <dd className="text-base font-bold text-navy">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
