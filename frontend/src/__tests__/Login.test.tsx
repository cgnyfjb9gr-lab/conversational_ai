// Demo sign-in: shown until someone signs in; any username and password are accepted.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { displayNameFor, getUser } from "../auth/user";
import { installServer, messageBox, signInAs } from "./helpers";

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

function signInWith(username: string, password: string) {
  fireEvent.change(field("Username"), { target: { value: username } });
  fireEvent.change(field("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  localStorage.clear();
  installServer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("demo sign-in", () => {
  it("shows the sign-in page, not the chat, when nobody is signed in", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sign in to Alfred");
    expect(screen.getByRole("img", { name: "Principal" })).toBeTruthy();
    expect(field("Password").type).toBe("password");
    expect(screen.getByText(/any username and password works/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message Alfred" })).toBeNull();
  });

  it("asks for both fields and stays on the page until they are filled", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your username.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(field("Username").getAttribute("aria-invalid")).toBe("true");

    signInWith("   ", "secret");
    expect(screen.getByText("Enter your username.")).toBeTruthy();
    expect(screen.queryByText("Enter your password.")).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("opens the chat and greets the member after signing in with any details", () => {
    render(<App />);
    signInWith("vinod.patil@example.com", "anything");
    expect(messageBox()).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /vinod/i })).toBeTruthy();
    expect(getUser()).toEqual({ username: "vinod.patil@example.com", displayName: "Vinod" });
  });

  it("stays signed in after a reload, and never stores the password", () => {
    render(<App />);
    signInWith("jane", "hunter2");
    cleanup();
    render(<App />);
    expect(messageBox()).toBeTruthy();
    expect(JSON.stringify({ ...localStorage })).not.toContain("hunter2");
  });

  it("returns to the sign-in page on Sign out, keeping this browser's chat list", () => {
    signInAs("jane");
    localStorage.setItem("convai.sessionIds", JSON.stringify(["a"]));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sign in to Alfred");
    expect(getUser()).toBeNull();
    expect(localStorage.getItem("convai.sessionIds")).toBe(JSON.stringify(["a"]));
  });
});

describe("displayNameFor", () => {
  it("uses the first word of the name or email, capitalised", () => {
    expect(displayNameFor("vinod.patil@example.com")).toBe("Vinod");
    expect(displayNameFor("jane doe")).toBe("Jane");
    expect(displayNameFor("  sam_lee ")).toBe("Sam");
    expect(displayNameFor("@")).toBe("there");
  });
});
