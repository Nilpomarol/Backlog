import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";

describe("write throttling", () => {
  it("blocks requests after the limit and resets after the window", () => {
    const store = new Map();
    expect(checkRateLimit("user", { limit: 2, windowMs: 1000, now: 100, store }).allowed).toBe(true);
    expect(checkRateLimit("user", { limit: 2, windowMs: 1000, now: 200, store }).allowed).toBe(true);
    const blocked = checkRateLimit("user", { limit: 2, windowMs: 1000, now: 300, store });
    expect(blocked).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    expect(checkRateLimit("user", { limit: 2, windowMs: 1000, now: 1100, store }).allowed).toBe(true);
  });

  it("keeps users in separate buckets", () => {
    const store = new Map();
    checkRateLimit("first", { limit: 1, windowMs: 1000, now: 0, store });
    expect(checkRateLimit("second", { limit: 1, windowMs: 1000, now: 0, store }).allowed).toBe(true);
  });
});
