// Demo sign-in only: the name is kept in this browser and nothing is checked or sent to a server.
// Replace with real authentication when the backend supports it.

export type User = { username: string; displayName: string };

const KEY = "convai.user";

/** "vinod.patil@example.com" → "Vinod"; "jane doe" → "Jane". */
export function displayNameFor(username: string): string {
  const first = username.trim().split("@")[0].split(/[\s._-]+/).find(Boolean) ?? "";
  return first ? first[0].toUpperCase() + first.slice(1) : "there";
}

export function getUser(): User | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<User>) : null;
    return parsed?.username ? { username: parsed.username, displayName: displayNameFor(parsed.username) } : null;
  } catch {
    return null;
  }
}

export function signIn(username: string): User {
  const user = { username: username.trim(), displayName: displayNameFor(username) };
  localStorage.setItem(KEY, JSON.stringify({ username: user.username }));
  return user;
}

export function signOut(): void {
  localStorage.removeItem(KEY);
}
