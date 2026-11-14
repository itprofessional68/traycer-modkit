import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TraycerMarkdown } from "@/markdown/traycer-markdown";

function renderMarkdown(content: string) {
  return render(
    <TraycerMarkdown
      className={null}
      proseSize="normal"
      components={null}
      remarkPlugins={null}
      rehypePlugins={null}
      quotable={false}
      isStreaming={false}
    >
      {content}
    </TraycerMarkdown>,
  );
}

describe("markdown underline", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an inline <u> tag as underlined text", () => {
    const { container } = renderMarkdown("Some <u>underlined</u> words.");

    const underline = container.querySelector("u");
    expect(underline?.textContent).toBe("underlined");
  });

  it("drops attributes written on a <u> tag", () => {
    const { container } = renderMarkdown(
      'Some <u onclick="alert(1)" style="color:red">text</u>.',
    );

    const underline = container.querySelector("u");
    expect(underline?.textContent).toBe("text");
    expect(underline?.getAttributeNames()).toEqual([]);
  });
});
