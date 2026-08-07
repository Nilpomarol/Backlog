import { describe, expect, it } from "vitest";
import { normalizeTitle, similarity } from "../api/router";

describe("duplicate request matching", () => {
  it("normalizes accents, punctuation, and casing", () => {
    expect(normalizeTitle("  Comparació RÀPIDA: països! ")).toBe("comparacio rapida paisos");
  });

  it("ranks identical and overlapping titles above unrelated ones", () => {
    const title = normalizeTitle("Afegeix comparació de països");
    expect(similarity(title, title)).toBe(1);
    expect(similarity(title, normalizeTitle("Comparació ràpida de països"))).toBeGreaterThan(0.4);
    expect(similarity(title, normalizeTitle("Mode fosc"))).toBe(0);
  });
});
