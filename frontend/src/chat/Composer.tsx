import { ArrowUp, CornerDownLeft } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";

/**
 * Alfred's message box (Figma "AI / Composer") with the disclosure line under it.
 * Enter sends, Shift+Enter adds a new line (spec 003 FR-004). The box grows with its text.
 */
export function Composer({
  value,
  onChange,
  onSend,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** A reply is pending: Send is disabled. */
  busy: boolean;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSend();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy) e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="relative flex flex-col items-center gap-2.5 pb-4">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-14 h-14 bg-linear-to-b from-page/0 to-page" />
      <form
        onSubmit={submit}
        className="relative flex w-full items-end gap-2 rounded-2xl border border-line bg-white py-2 pr-2 pl-5 shadow-sm focus-within:border-info-400"
      >
        <textarea
          aria-label="Message Alfred"
          placeholder="Ask anything about your money…"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="field-sizing-content max-h-40 min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1 text-base text-ink outline-none placeholder:text-muted"
        />
        <CornerDownLeft aria-hidden className="mx-1 mb-2 hidden size-4 shrink-0 text-subtle sm:block" />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-ai text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUp aria-hidden className="size-4" />
        </button>
      </form>
      <p className="text-center text-sm text-muted">
        AI-generated from demo data. It can be wrong, so check important figures. Not financial advice.
      </p>
    </div>
  );
}
