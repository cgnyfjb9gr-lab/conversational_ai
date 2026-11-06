import { expect, test } from "@playwright/test";

import { ChatPage } from "./pages/chat.page";
import { SidebarPage } from "./pages/sidebar.page";

// TC-M02 (RTM-042): mobile viewport 375px — sidebar drawer + backdrop, chat functional.
// The `Chats` toggle and `.backdrop` are App.tsx test hooks (md breakpoint 768px).
test.describe("mobile 375px", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("sidebar drawer + backdrop, chat stays functional (TC-M02)", async ({ page }) => {
    const chat = new ChatPage(page);
    const sidebar = new SidebarPage(page);
    await chat.open();

    // Given: narrow viewport
    await expect(sidebar.menuButton).toBeVisible();
    await expect(page.locator(".layout")).not.toHaveClass(/open/);
    await expect(sidebar.backdrop).toHaveCount(0);

    // When: open the drawer
    await sidebar.toggleDrawer();
    await expect(page.locator(".layout")).toHaveClass(/open/);
    await expect(sidebar.menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar.backdrop).toBeVisible();
    await expect(sidebar.aside).toBeVisible();

    // When: tap outside closes it
    await sidebar.tapBackdrop();
    await expect(page.locator(".layout")).not.toHaveClass(/open/);
    await expect(sidebar.menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar.backdrop).toHaveCount(0);

    // Seed a session so the drawer has something to select
    const marker = `Mobile-${Date.now()}`;
    await chat.send(marker);
    await expect(chat.replyFor(marker)).toBeVisible();

    // When: reopen drawer and select the session
    await sidebar.toggleDrawer();
    await expect(sidebar.aside).toBeVisible();
    await sidebar.openSession(marker);
    // Then: selection closes the drawer and the chat still renders
    await expect(page.locator(".layout")).not.toHaveClass(/open/);
    await expect(chat.replyFor(marker)).toBeVisible();

    // And: chat functional — composer accepts a second message at 375px
    await chat.send(`${marker}-2`);
    await expect(chat.replyFor(`${marker}-2`)).toBeVisible();
  });
});
