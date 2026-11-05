import { useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PrincipalLogo } from "@/components/Logo";
import { StatusTag } from "@/components/StatusTag";
import { TextField } from "@/components/TextField";

/** Demo sign-in page in the Principal style. Any username and password are accepted. */
export function LoginPage({ onSignIn }: { onSignIn: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      username: username.trim() ? undefined : "Enter your username.",
      password: password ? undefined : "Enter your password.",
    };
    setErrors(next);
    if (!next.username && !next.password) onSignIn(username);
  }

  return (
    <div className="relative flex min-h-full flex-col items-center overflow-hidden bg-page px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-125 left-1/2 h-185.75 w-321.5 -translate-x-1/2 bg-aura opacity-30"
      />
      <main className="relative flex w-full max-w-110 flex-col items-center gap-8 pt-[6vh]">
        <PrincipalLogo />
        <Card variant="tile" className="flex w-full flex-col gap-6 p-8">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-navy">Sign in to Alfred</h1>
            <p className="text-base text-muted">Your AI guide to your Principal plan.</p>
          </header>
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={errors.username}
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <Button type="submit" variant="primary" className="mt-2 w-full">
              Sign in
            </Button>
          </form>
          <p className="flex items-start gap-2 border-t border-line pt-4 text-sm text-muted">
            <StatusTag tone="neutral" className="shrink-0">
              Demo
            </StatusTag>
            Any username and password works. Nothing is checked or sent to a server.
          </p>
        </Card>
      </main>
    </div>
  );
}
