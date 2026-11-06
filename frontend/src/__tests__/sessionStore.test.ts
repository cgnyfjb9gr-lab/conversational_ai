import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "convai.sessionIds";

// The store keeps module-level fallback state, so each test loads a fresh copy.
async function loadStore() {
  vi.resetModules();
  return import("../sessionStore");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sessionStore", () => {
  it("returns an empty list when nothing is stored", async () => {
    const { getSessionIds } = await loadStore();
    expect(getSessionIds()).toEqual([]);
  });

  it("adds new ids at the front and moves existing ids to the front without duplicates", async () => {
    const { getSessionIds, rememberSession } = await loadStore();
    rememberSession("a");
    rememberSession("b");
    rememberSession("c");
    expect(getSessionIds()).toEqual(["c", "b", "a"]);

    rememberSession("a");
    expect(getSessionIds()).toEqual(["a", "c", "b"]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["a", "c", "b"]);
  });

  it("keeps at most 200 ids, dropping the oldest", async () => {
    const { getSessionIds, rememberSession } = await loadStore();
    for (let i = 0; i < 205; i++) rememberSession(`s${i}`);
    const ids = getSessionIds();
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe("s204");
    expect(ids[199]).toBe("s5");
    expect(ids).not.toContain("s4");
  });

  it("treats a malformed stored value as an empty list", async () => {
    const { getSessionIds, rememberSession } = await loadStore();
    localStorage.setItem(KEY, "{not json");
    expect(getSessionIds()).toEqual([]);

    localStorage.setItem(KEY, JSON.stringify({ not: "an array" }));
    expect(getSessionIds()).toEqual([]);

    localStorage.setItem(KEY, JSON.stringify(["ok", 42, null]));
    expect(getSessionIds()).toEqual(["ok"]);

    rememberSession("new");
    expect(getSessionIds()).toEqual(["new", "ok"]);
  });

  it("falls back to memory when localStorage throws", async () => {
    const { getSessionIds, rememberSession } = await loadStore();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(getSessionIds()).toEqual([]);
    rememberSession("a");
    rememberSession("b");
    expect(getSessionIds()).toEqual(["b", "a"]);
  });

  it("uses memory when reads work but writes fail", async () => {
    const { getSessionIds, rememberSession } = await loadStore();
    localStorage.setItem(KEY, JSON.stringify(["old"]));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    rememberSession("new");
    expect(getSessionIds()).toEqual(["new", "old"]);
  });
});

describe("sessionStore hardening: blocked localStorage", () => {
  it("falls back to in-memory storage and keeps working (TC-H04)", async () => {
    const native = Object.getOwnPropertyDescriptor(window, "localStorage")?.value;
    vi.resetModules();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      },
    });
    try {
      const store = await import("../sessionStore");
      store.rememberSession("a");
      expect(store.getSessionIds()).toEqual(["a"]); // in-memory fallback, no crash
      store.rememberSession("b");
      expect(store.getSessionIds()).toEqual(["b", "a"]);
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: native });
    }
  });
});
