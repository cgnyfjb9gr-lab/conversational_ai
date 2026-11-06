import type { Locator, Page } from "@playwright/test";

/** The sessions sidebar (spec 001): list, selection, empty state, new chat. */
export class SidebarPage {
  readonly page: Page;
  readonly newChat: Locator;
  readonly menuButton: Locator;
  readonly aside: Locator;
  readonly backdrop: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newChat = page.getByRole("button", { name: "New chat" });
    // Mobile header toggle (App.tsx `md:hidden` button, test hook `layout`/`backdrop`).
    this.menuButton = page.getByRole("button", { name: "Chats" });
    this.aside = page.locator("aside");
    this.backdrop = page.locator(".backdrop");
  }

  session(title: string | RegExp) {
    return this.page.getByRole("button", { name: new RegExp(`^${title instanceof RegExp ? title.source : title} `) });
  }

  async openSession(title: string) {
    await this.session(title).click();
  }

  /** Mobile drawer: toggle the off-canvas sidebar (App.tsx `sidebarOpen`). */
  async toggleDrawer() {
    await this.menuButton.click();
  }

  /** Mobile drawer: tap-outside closes (backdrop is tab-focus-skip, clicks only). */
  async tapBackdrop() {
    await this.backdrop.click({ force: true, position: { x: 350, y: 300 } });
  }

  emptyState() {
    return this.page.getByText("No past chats yet.");
  }
}
