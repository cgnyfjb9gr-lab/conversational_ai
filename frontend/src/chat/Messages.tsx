import { CircleAlert, Copy, Info, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import { parseServerTime } from "@/lib/time";
import { Markdown } from "@/markdown";
import { splitDisclaimer } from "@/messageText";

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

// `message`, `disclaimer` and `pending` are test hooks: keep them.

/** Member's message (Figma "Evo / User message"): right-aligned white bubble with its time and a copy action. */
export function UserMessage({ text, time }: { text: string; time?: string }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <p className="message max-w-[80%] rounded-lg bg-white px-5 py-3 text-lg whitespace-pre-wrap text-ink shadow-hairline">
        {text}
      </p>
      <div className="flex items-center gap-1 text-sm text-muted">
        {time && <time dateTime={time}>{timeFormat.format(parseServerTime(time))}</time>}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Copy message"
          onClick={() => void navigator.clipboard?.writeText(text)}
        >
          <Copy aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/**
 * Alfred's reply: Markdown on the page (no bubble, as in Figma), a trailing _italic_ disclaimer as a muted
 * note under it, and `footer` (the feedback controls) below that.
 */
export function AssistantMessage({ text, failed, footer }: { text: string; failed?: boolean; footer?: ReactNode }) {
  const { body, disclaimer } = splitDisclaimer(text);
  return (
    <div className="flex flex-col gap-2.5">
      {body &&
        (failed ? (
          <p className="flex items-center gap-2 rounded-md border border-warning-100 bg-white px-4 py-3 text-base text-warning-700">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <span className="message">{body}</span>
          </p>
        ) : (
          <div
            className={cn(
              "message text-base text-ink",
              "[&_li+li]:mt-1.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-3 [&_strong]:font-bold [&_strong]:text-navy",
              "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:marker:text-navy [&>:first-child]:mt-0 [&>:last-child]:mb-0",
            )}
          >
            <Markdown text={body} />
          </div>
        ))}
      {disclaimer && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info aria-hidden className="mt-1 size-3.5 shrink-0" />
          <span className="disclaimer">{disclaimer}</span>
        </p>
      )}
      {footer}
    </div>
  );
}

/** Shown while Alfred is working on a reply. */
export function PendingReply() {
  return (
    <p role="status" className="pending flex items-center gap-2 text-sm text-muted">
      <Sparkles aria-hidden className="size-4 text-primary" />
      <span aria-hidden className="flex gap-1">
        {["[animation-delay:-0.3s]", "[animation-delay:-0.15s]", ""].map((delay) => (
          <span
            key={delay}
            className={cn("size-1.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none", delay)}
          />
        ))}
      </span>
      <span>Alfred is thinking…</span>
      <span className="sr-only">Waiting for reply</span>
    </p>
  );
}
