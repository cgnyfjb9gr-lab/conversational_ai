import { ArrowRight, ChartPie, Scale, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

import { AlfredOrb } from "@/components/Logo";

// One click sends these from an empty chat (spec 005).
export const SUGGESTIONS: { icon: LucideIcon; question: string; detail: string }[] = [
  { icon: Wallet, question: "What is my portfolio worth?", detail: "See your total and what each holding adds up to." },
  {
    icon: ChartPie,
    question: "How does my allocation compare to my target?",
    detail: "Check stocks, bonds and cash against your plan.",
  },
  { icon: Scale, question: "Do I need to rebalance?", detail: "Find out whether your mix has drifted too far." },
  {
    icon: TrendingUp,
    question: "Project $500 a month at 6% for 20 years",
    detail: "See what steady saving could grow to.",
  },
];

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** Empty chat (Figma S1 "AI home"): greeting and suggestion cards. Choosing a card asks Alfred that question. */
export function Welcome({ name, onAsk }: { name: string; onAsk: (question: string) => void }) {
  return (
    <section className="flex flex-col items-center gap-7 pt-[6vh] pb-4">
      <AlfredOrb className="mb-4" />
      <h2 className="text-center text-4xl font-light tracking-[-0.5px] text-navy sm:text-5xl">
        {greetingFor(new Date())}, <span className="text-accent-bright">{name}.</span>
      </h2>
      <p className="max-w-150 text-center text-lg text-ink sm:text-xl">
        Ask about your holdings, allocation, rebalancing or savings projections. Answers use demo data and are for
        information only.
      </p>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map(({ icon: Icon, question, detail }) => (
          <button
            key={question}
            type="button"
            onClick={() => onAsk(question)}
            className="group flex flex-col gap-2 rounded-lg border border-line bg-white p-5 text-left shadow-hairline transition hover:border-info-300 hover:shadow-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon aria-hidden className="size-8 text-accent" strokeWidth={1.5} />
            <span className="pt-2 text-lg font-bold text-navy">{question}</span>
            <span className="flex items-end justify-between gap-3 text-sm text-muted">
              {detail}
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ai text-white shadow-lift transition group-hover:brightness-110">
                <ArrowRight aria-hidden className="size-4" />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
