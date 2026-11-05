import { describe, expect, it } from "vitest";

import { parseServerTime } from "../lib/time";

describe("parseServerTime", () => {
  it("reads a timestamp without an offset as UTC (SQLite)", () => {
    expect(parseServerTime("2026-11-05T08:59:44").toISOString()).toBe("2026-11-05T08:59:44.000Z");
  });

  it("keeps an explicit offset or Z (Postgres)", () => {
    expect(parseServerTime("2026-11-05T08:59:44+00:00").toISOString()).toBe("2026-11-05T08:59:44.000Z");
    expect(parseServerTime("2026-11-05T14:29:44+05:30").toISOString()).toBe("2026-11-05T08:59:44.000Z");
    expect(parseServerTime("2026-11-05T08:59:44.123Z").toISOString()).toBe("2026-11-05T08:59:44.123Z");
  });
});
