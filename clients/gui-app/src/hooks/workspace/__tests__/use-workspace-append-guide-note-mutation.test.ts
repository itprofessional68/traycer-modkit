import { describe, expect, it, vi } from "vitest";
import { appendGuideNote } from "@/hooks/workspace/use-workspace-append-guide-note-mutation";
import { fileContentRevision } from "@/lib/workspace/file-content-revision";

const NOTE = { repoPath: "/work/app", note: "Prefer Opus here." };

function readResponse(content: string | null) {
  return {
    workspacePath: "/work/app",
    filePath: ".traycer/agent-selection-guide.md",
    content,
    truncated: false,
    error: content === null ? "ENOENT" : null,
  };
}

describe("appendGuideNote", () => {
  it("writes the guide with the note, guarded by the read's revision", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(readResponse("# Guide\n"))
      .mockResolvedValueOnce({ status: "saved" });

    await expect(appendGuideNote({ request }, NOTE)).resolves.toBe("added");
    expect(request).toHaveBeenLastCalledWith("workspace.writeFile", {
      workspacePath: "/work/app",
      filePath: ".traycer/agent-selection-guide.md",
      expectedRevision: await fileContentRevision("# Guide\n"),
      content: "# Guide\n\nPrefer Opus here.\n",
    });
  });

  it("creates no guide when the host can't open one", async () => {
    const request = vi.fn().mockResolvedValueOnce(readResponse(null));

    await expect(appendGuideNote({ request }, NOTE)).resolves.toBe(
      "unreadable",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the guide already has the note", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(readResponse("# Guide\n\nPrefer Opus here.\n"));

    await expect(appendGuideNote({ request }, NOTE)).resolves.toBe("present");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reports a guide edited between the read and the write", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(readResponse("# Guide\n"))
      .mockResolvedValueOnce({ status: "conflict" });

    await expect(appendGuideNote({ request }, NOTE)).resolves.toBe("changed");
  });
});
