import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionSummary } from "../api";
import { HistoryPanel } from "../chat/HistoryPanel";

const sessions: SessionSummary[] = [
  {
    session_id: "b",
    title: "second topic",
    created_at: "2026-11-04T09:05:00+00:00",
    last_active_at: "2026-11-04T09:10:00+00:00",
  },
  {
    session_id: "a",
    title: "first topic",
    created_at: "2026-11-04T09:00:00+00:00",
    last_active_at: "2026-11-04T09:01:00+00:00",
  },
];

function renderPanel(overrides: Partial<Parameters<typeof HistoryPanel>[0]> = {}) {
  const props = {
    sessions,
    activeSessionId: "a",
    onSelect: vi.fn(),
    error: null,
    onRetry: vi.fn(),
    loading: false,
    ...overrides,
  };
  render(<HistoryPanel {...props} />);
  return props;
}

afterEach(cleanup);

describe("HistoryPanel", () => {
  it("lists sessions in the given order with title and last-active time", () => {
    renderPanel();
    const items = screen.getAllByRole("button", { name: /topic/ });
    expect(items.map((b) => b.querySelector(".session-title")?.textContent)).toEqual([
      "second topic",
      "first topic",
    ]);
    for (const item of items) {
      expect(item.querySelector("time")?.getAttribute("datetime")).toBeTruthy();
      expect(item.querySelector("time")?.textContent).not.toBe("");
    }
  });

  it("shows an empty state when there are no sessions", () => {
    renderPanel({ sessions: [] });
    expect(screen.getByText(/no past chats yet/i)).toBeTruthy();
  });

  it("shows no empty state while loading", () => {
    renderPanel({ sessions: [], loading: true });
    expect(screen.queryByText(/no past chats yet/i)).toBeNull();
  });

  it("marks the active session", () => {
    renderPanel({ activeSessionId: "a" });
    expect(screen.getByRole("button", { name: /first topic/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: /second topic/ }).getAttribute("aria-current")).toBeNull();
  });

  it("highlights the active session with a left marker only, not a filled background", () => {
    renderPanel({ activeSessionId: "a" });
    const active = screen.getByRole("button", { name: /first topic/ });
    const other = screen.getByRole("button", { name: /second topic/ });
    expect(active.querySelector(".session-marker")).not.toBeNull();
    expect(other.querySelector(".session-marker")).toBeNull();
    expect(active.className).toBe(other.className);
  });

  it("shows a pointer cursor on every chat in the list", () => {
    renderPanel();
    for (const name of [/first topic/, /second topic/]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/\bcursor-pointer\b/);
    }
  });

  it("calls onSelect with the session id when an entry is clicked", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /second topic/ }));
    expect(props.onSelect).toHaveBeenCalledWith("b");
  });

  it("shows the error with a Retry button", () => {
    const props = renderPanel({ error: "Couldn't load chats." });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load chats.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(props.onRetry).toHaveBeenCalled();
  });
});
