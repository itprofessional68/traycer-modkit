import { describe, expect, it } from "vitest";
import { guideWithNote } from "@/lib/agent-presets/guide-note";

describe("guideWithNote", () => {
  it("adds the note as its own last paragraph", () => {
    expect(guideWithNote("# Guide\nUse Codex.", "Prefer Opus here.")).toBe(
      "# Guide\nUse Codex.\n\nPrefer Opus here.\n",
    );
    expect(guideWithNote("# Guide\n", "Prefer Opus here.")).toBe(
      "# Guide\n\nPrefer Opus here.\n",
    );
    expect(guideWithNote("# Guide\n\n", "Prefer Opus here.")).toBe(
      "# Guide\n\nPrefer Opus here.\n",
    );
  });

  it("keeps the file's own line endings", () => {
    expect(guideWithNote("# Guide\r\n", "One\ntwo")).toBe(
      "# Guide\r\n\r\nOne\r\ntwo\r\n",
    );
  });

  it("changes nothing when the guide already has the note", () => {
    expect(
      guideWithNote("# Guide\n\nPrefer Opus here.\n", " Prefer Opus here. "),
    ).toBeNull();
  });
});
