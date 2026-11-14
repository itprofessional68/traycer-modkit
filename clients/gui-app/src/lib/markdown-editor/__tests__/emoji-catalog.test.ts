import { describe, expect, it } from "vitest";
import { EMOJI_GROUPS, searchEmoji } from "@/lib/markdown-editor/emoji-catalog";

describe("searchEmoji", () => {
  it("matches names and keywords, every word required", () => {
    expect(searchEmoji("rocket").map((entry) => entry.emoji)).toEqual(["🚀"]);
    expect(searchEmoji("deploy").map((entry) => entry.emoji)).toContain("🚀");
    expect(searchEmoji("check done").map((entry) => entry.emoji)).toEqual([
      "✅",
      "✔️",
      "☑️",
    ]);
  });

  it("is case-insensitive and finds nothing for an empty query", () => {
    expect(searchEmoji("BUG").map((entry) => entry.emoji)).toEqual(["🐛"]);
    expect(searchEmoji("   ")).toEqual([]);
  });

  it("lists each emoji once, since the picker keys its buttons by emoji", () => {
    const all = EMOJI_GROUPS.flatMap((group) =>
      group.entries.map((entry) => entry.emoji),
    );
    expect(new Set(all).size).toBe(all.length);
  });
});
