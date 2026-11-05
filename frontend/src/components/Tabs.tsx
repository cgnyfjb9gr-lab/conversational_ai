import { Tabs as RadixTabs } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type TabDef<T extends string> = { readonly id: T; readonly label: string };

/**
 * Secondary navigation tabs ("Overview", "Retirement", ...). Panels are <TabPanel>s passed as children.
 * `header` lets the tab row render inside another element (e.g. a page header) while panels render below.
 */
export function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  children,
  listClassName,
  header = (list) => list,
}: {
  /** Accessible name of the tab row. */
  label: string;
  tabs: readonly TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  children?: ReactNode;
  listClassName?: string;
  header?: (list: ReactNode) => ReactNode;
}) {
  return (
    <RadixTabs.Root value={active} onValueChange={(v) => onChange(v as T)} activationMode="manual">
      {header(
        <RadixTabs.List aria-label={label} className={cn("flex gap-2 pt-4", listClassName)}>
          {tabs.map((tab) => (
            <RadixTabs.Trigger
              key={tab.id}
              value={tab.id}
              className={cn(
                "h-8 rounded-t-sm border-b-3 border-transparent px-2 text-sm font-bold text-ink-2",
                "hover:text-primary focus-visible:outline-2 focus-visible:outline-primary data-[state=active]:border-link",
              )}
            >
              {tab.label}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>,
      )}
      {children}
    </RadixTabs.Root>
  );
}

export function TabPanel({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <RadixTabs.Content value={id} className={cn("outline-none", className)}>
      {children}
    </RadixTabs.Content>
  );
}
