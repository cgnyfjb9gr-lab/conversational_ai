import type { Locator, Page } from "@playwright/test";

/** The chat surface: composer, send button and the reply bubbles (spec 003). */
export class ChatPage {
  readonly page: Page;
  readonly composer: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.composer = page.getByPlaceholder("Type a message");
    this.sendButton = page.getByRole("button", { name: "Send", exact: true });
  }

  async open() {
    await this.page.goto("/");
  }

  /** A suggestion chip on the welcome screen (App.tsx SUGGESTIONS). */
  suggestion(text: string) {
    return this.page.getByRole("button", { name: text, exact: true });
  }

  async clickSuggestion(text: string) {
    await this.suggestion(text).click();
  }

  async send(text: string) {
    await this.composer.fill(text);
    await this.sendButton.click();
  }

  /** The mock reply bubble for a given message (backend echo format). */
  replyFor(text: string) {
    return this.page.getByText(new RegExp(`You said: ${text}`));
  }
}
