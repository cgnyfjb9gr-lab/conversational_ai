import { LogOut, Sparkles } from "lucide-react";

import type { User } from "@/auth/user";
import { Button } from "@/components/Button";
import { PrincipalMark } from "@/components/Logo";

/** Alfred header (Figma "AI / Copilot header", full-screen variant), 58px high, above the rail and the chat. */
export function AlfredHeader({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <header className="relative z-20 flex h-14.5 shrink-0 items-center border-b border-line bg-white pr-4">
      <span className="grid w-12.5 shrink-0 place-items-center">
        <PrincipalMark />
      </span>
      <h1 className="flex flex-1 items-center gap-2 pl-4 text-base font-bold text-navy">
        <Sparkles aria-hidden className="size-4.5 text-primary" />
        Alfred
      </h1>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted sm:inline">
          Signed in as <b className="text-navy">{user.displayName}</b>
        </span>
        <Button variant="link" size="sm" onClick={onSignOut}>
          <LogOut aria-hidden className="size-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
