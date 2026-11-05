import type { SessionSummary } from "@/api";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import { parseServerTime } from "@/lib/time";

type Props = {
  sessions: SessionSummary[];
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
  error: string | null;
  onRetry: () => void;
  loading: boolean;
};

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Past chats, opened from the rail's History button. `session-title` and `session-marker` are test hooks. */
export function HistoryPanel({ sessions, activeSessionId, onSelect, error, onRetry, loading }: Props) {
  return (
    <nav aria-label="Past chats" className="flex flex-col gap-3 p-3">
      <h2 className="px-2 pt-2 text-xs font-bold tracking-wide text-muted uppercase">Recent chats</h2>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-md bg-warning-100 px-3 py-2 text-sm text-warning-700"
        >
          <span>{error}</span>
          <Button size="sm" className="h-7 px-3" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {sessions.length === 0 && !loading && !error && <p className="px-2 text-sm text-muted">No past chats yet.</p>}
      <ul className="flex flex-col gap-1">
        {sessions.map((s) => {
          const active = s.session_id === activeSessionId;
          return (
            <li key={s.session_id}>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(s.session_id)}
                className={cn(
                  "relative flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md py-2 pr-3 pl-4 text-left",
                  "hover:bg-info-75 focus-visible:outline-2 focus-visible:outline-primary",
                )}
              >
                {/* The selected chat gets a rounded bar on its left edge instead of a filled background. */}
                {active && (
                  <span aria-hidden className="session-marker absolute inset-y-1.5 left-1 w-1 rounded-full bg-primary" />
                )}
                <span className={cn("session-title w-full truncate text-sm text-ink", active && "font-bold text-navy")}>
                  {s.title}
                </span>
                <time className="text-xs text-muted" dateTime={s.last_active_at}>
                  {timeFormat.format(parseServerTime(s.last_active_at))}
                </time>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
