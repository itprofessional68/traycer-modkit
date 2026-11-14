import { useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownSplitEditor } from "@/components/markdown-editor/markdown-split-editor";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_THEME_PRESET } from "@/lib/theme-presets";
import { ResolvedThemeContext } from "@/providers/use-resolved-theme";
import "@/index.css";

const CONTENT = [
  "# Release notes",
  "",
  "Some **bold** and <u>underlined</u> text.",
  "",
  "- [ ] write the changelog",
  "- [x] tag the build",
  "",
].join("\n");

function noop(): void {}

export function MarkdownSplitEditorFixture() {
  const [width, setWidth] = useState(1000);
  const [value, setValue] = useState(CONTENT);
  useLayoutEffect(() => {
    window.__markdownSplitEditorProbe = { setWidth };
  }, []);
  return (
    <ResolvedThemeContext.Provider
      value={{ resolvedTheme: "light", themePreset: DEFAULT_THEME_PRESET }}
    >
      <TooltipProvider>
        {/* A tile body of known size; the editor fills it. */}
        <div
          data-testid="markdown-split-host"
          className="flex flex-col bg-canvas"
          style={{ width, height: 600 }}
        >
          <MarkdownSplitEditor
            value={value}
            readOnly={false}
            fileName="NOTES.md"
            notice={null}
            onChange={setValue}
            onBlur={noop}
            onSave={noop}
            onPreviewRootChange={noop}
          />
        </div>
      </TooltipProvider>
    </ResolvedThemeContext.Provider>
  );
}

declare global {
  interface Window {
    __markdownSplitEditorProbe: {
      setWidth: (width: number) => void;
    };
  }
}

const container = document.querySelector("#root");
if (container === null) throw new Error("probe root missing");
createRoot(container).render(<MarkdownSplitEditorFixture />);
