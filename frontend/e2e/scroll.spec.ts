import { expect, test } from "@playwright/test";

import { ChatPage } from "./pages/chat.page";

// TC-I07: scroll-to-latest button and auto-follow behavior.
// The button is the App.tsx MessageScrollerButton (accessible name "Scroll to latest",
// data-active only when scrolled away). Auto-follow is the MessageScrollerProvider autoScroll prop.
test.describe("short viewport", () => {
  test.use({ viewport: { width: 1280, height: 400 } });

  test("latest stays visible; button appears when scrolled away (TC-I07)", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.open();

    // Fill the thread until it overflows the short viewport.
    for (let i = 1; i <= 6; i++) {
      const text = `Scroll-${i}-${"x".repeat(60)}`;
      await chat.send(text);
      await expect(chat.replyFor(text)).toBeVisible();
    }
    // Auto-follow: latest reply is on screen without manual scroll.
    await expect(chat.replyFor("Scroll-6-")).toBeVisible();

    const viewport = page.locator('[data-slot="message-scroller-viewport"]');
    const scrollToLatest = page.getByRole("button", { name: "Scroll to latest" });

    // Scrolled away: button becomes active/visible.
    await viewport.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await expect(scrollToLatest).toHaveAttribute("data-active", "true");
    await expect(scrollToLatest).toBeVisible();

    // Click: jumps to latest.
    await scrollToLatest.click();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-slot="message-scroller-viewport"]');
      if (!el) return false;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      return atBottom;
    });
    await expect(chat.replyFor("Scroll-6-")).toBeVisible();
  });
});
