import { expect, test } from "@playwright/test";

import { ChatPage } from "./pages/chat.page";
import { FeedbackPage } from "./pages/feedback.page";
import { SidebarPage } from "./pages/sidebar.page";

// E2E smoke pack for the conversational_ai POC — the RTM Phase P4 suite.
// Traces to Conversational_AI_POC_RTM.xlsx rows: Composer (RTM-001/002), Message
// renderer (RTM-004), Feedback loop (RTM-087), Chat history / state (RTM-003),
// Books-and-records persistence (RTM-121). Against the mock agent (default).
// Framework P2: the backend is started by playwright.config (no manual servers).

test("user sends a message and sees the mock reply", async ({ page }) => {
  const chat = new ChatPage(page);
  await chat.open();
  await expect(page.getByRole("heading", { name: "PFG Wealth Assistant" })).toBeVisible();

  await chat.send("Hello E2E");

  await expect(chat.replyFor("Hello E2E")).toBeVisible();
});

test("user rates an answer, adds details in the follow-up panel, and gets confirmation", async ({ page }) => {
  const chat = new ChatPage(page);
  const feedback = new FeedbackPage(page);
  await chat.open();
  await chat.send("Rate me");

  await expect(feedback.thumb("Helpful")).toBeVisible();

  // A bare up-rating saves immediately (replacement semantics, spec 002).
  await feedback.rate("Helpful");
  await expect(feedback.thumb("Helpful")).toHaveAttribute("aria-pressed", "true");

  // Switching to down opens the optional reason/comment panel.
  await feedback.rate("Not helpful");
  await expect(page.getByText("What went wrong? (optional)")).toBeVisible();
  await feedback.submitDetails("Other", "E2E comment");

  // One record, replaced: down + reason + comment confirmed.
  await expect(feedback.thumb("Not helpful")).toHaveAttribute("aria-pressed", "true");
  await expect(feedback.thanksNote()).toBeVisible();
});

test("conversation persists across a reload (history + sidebar)", async ({ page }) => {
  const chat = new ChatPage(page);
  const sidebar = new SidebarPage(page);
  await chat.open();
  const marker = `Persist-${Date.now()}`;
  await chat.send(marker);
  await expect(chat.replyFor(marker)).toBeVisible();

  // First user message becomes the sidebar title (max 80 chars).
  await expect(page.getByText(marker).first()).toBeVisible();

  await page.reload();
  // The welcome screen returns (no auto-open); the session lives in the sidebar.
  await sidebar.session(marker).click();
  await expect(chat.replyFor(marker)).toBeVisible();
});

test("conversation lives server-side; a fresh browser starts clean (TC-B09)", async ({ browser }) => {
  // Seed a conversation in this browser context.
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const chat1 = new ChatPage(page1);
  await chat1.open();
  const marker = `Server-${Date.now()}`;
  await chat1.send(marker);
  await expect(chat1.replyFor(marker)).toBeVisible();

  // The sidebar only lists ids from localStorage (convai.sessionIds).
  const ids = await page1.evaluate(() => JSON.parse(localStorage.getItem("convai.sessionIds") ?? "[]"));
  expect(Array.isArray(ids)).toBe(true);
  expect(ids.length).toBeGreaterThanOrEqual(1);
  const sid = ids[0] as string;
  await ctx1.close();

  // A brand-new browser has nothing local (TC-B09 second part).
  const ctx2 = await browser.newContext();
  const chat2 = new ChatPage(await ctx2.newPage());
  const sidebar2 = new SidebarPage(chat2.page);
  await chat2.open();
  await expect(sidebar2.emptyState()).toBeVisible();
  // ...but the conversation itself lives server-side: history is served by session id alone.
  const res = await chat2.page.request.get(`/api/chat/${sid}/history`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.messages.map((m: { content: string }) => m.content)).toContain(marker);
  await ctx2.close();
});

test("ratings persist across chat switches in the visit, then reset (TC-C12)", async ({ page }) => {
  const chat = new ChatPage(page);
  const sidebar = new SidebarPage(page);
  const feedback = new FeedbackPage(page);
  await chat.open();
  await chat.send("Rate me");
  await expect(feedback.thumb("Helpful")).toBeVisible();
  await feedback.rate("Helpful");
  await expect(feedback.thumb("Helpful")).toHaveAttribute("aria-pressed", "true");

  // Switch away to a new chat and back within the same visit: rating still shown (spec 004 FR-011).
  await sidebar.newChat.click();
  await chat.send("other chat");
  await expect(chat.replyFor("other chat")).toBeVisible();

  await sidebar.session("Rate me").click();
  await expect(feedback.thumb("Helpful")).toHaveAttribute("aria-pressed", "true");

  // A refresh starts a new visit: ratings are not restored, only messages are.
  await page.reload();
  await sidebar.session("Rate me").click();
  await expect(feedback.thumb("Helpful")).toHaveAttribute("aria-pressed", "false");
});

test("suggestion chip sends as chat (TC-A07 / TC-I12)", async ({ page }) => {
  const chat = new ChatPage(page);
  await chat.open();

  // Given: welcome screen shows all four chips
  for (const chip of [
    "What is my portfolio worth?",
    "How does my allocation compare to my target?",
    "Do I need to rebalance?",
    "Project $500 a month at 6% for 20 years",
  ]) {
    await expect(chat.suggestion(chip)).toBeVisible();
  }

  // When: click a chip
  await chat.clickSuggestion("Do I need to rebalance?");

  // Then: the suggestion posts as a chat (user + mock reply), welcome is gone
  await expect(chat.replyFor("Do I need to rebalance?")).toBeVisible();
  await expect(page.locator(".message", { hasText: "Do I need to rebalance?" }).first()).toBeVisible();
  await expect(page.getByText("How can I help with your portfolio today?")).toHaveCount(0);
});
