import { expect, test, type Page } from "@playwright/test";

import { fixture, nextFrames } from "./support/fixtures.ts";

declare global {
  interface Window {
    __markdownSplitEditorProbe: {
      setWidth: (width: number) => void;
    };
  }
}

// The markdown split editor in a real browser: whether source and preview sit
// side by side or stack depends on a container query, and whether the
// toolbar and the emoji picker fit depends on real boxes - layout jsdom
// cannot decide.

test.use({ viewport: { width: 1200, height: 800 } });

async function openEditor(page: Page): Promise<void> {
  await page.goto(fixture("markdown-split-editor"));
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(
    page.getByTestId("markdown-split-preview").locator("h1"),
  ).toHaveText("Release notes");
}

async function setHostWidth(page: Page, width: number): Promise<void> {
  await page.evaluate((next) => {
    window.__markdownSplitEditorProbe.setWidth(next);
  }, width);
  await nextFrames(page, 2);
}

async function boxes(page: Page) {
  const source = await page.getByTestId("markdown-source-editor").boundingBox();
  const preview = await page
    .getByTestId("markdown-split-preview")
    .boundingBox();
  if (source === null || preview === null)
    throw new Error("panes not laid out");
  return { source, preview };
}

test("a wide tile shows the source beside the preview", async ({ page }) => {
  await openEditor(page);
  await setHostWidth(page, 1000);

  const { source, preview } = await boxes(page);
  expect(preview.x).toBeGreaterThanOrEqual(source.x + source.width - 1);
  expect(Math.abs(preview.y - source.y)).toBeLessThanOrEqual(1);
});

test("a narrow tile stacks the preview under the source", async ({ page }) => {
  await openEditor(page);
  await setHostWidth(page, 480);

  const { source, preview } = await boxes(page);
  expect(preview.y).toBeGreaterThanOrEqual(source.y + source.height - 1);
  expect(Math.abs(preview.x - source.x)).toBeLessThanOrEqual(1);
});

test("the toolbar wraps instead of overflowing a narrow tile", async ({
  page,
}) => {
  await openEditor(page);
  await setHostWidth(page, 320);

  const toolbar = page.getByTestId("markdown-editor-toolbar");
  const overflow = await toolbar.evaluate(
    (node) => node.scrollWidth - node.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const host = await page.getByTestId("markdown-split-host").boundingBox();
  const emoji = await page
    .getByRole("button", { name: "Insert emoji" })
    .boundingBox();
  if (host === null || emoji === null) throw new Error("not laid out");
  expect(emoji.x + emoji.width).toBeLessThanOrEqual(host.x + host.width);
});

test("the emoji picker opens inside the window and inserts at the caret", async ({
  page,
}) => {
  await openEditor(page);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");

  await page.getByRole("button", { name: "Insert emoji" }).click();
  const picker = page.getByTestId("markdown-emoji-picker");
  await expect(picker).toBeVisible();
  const box = await picker.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error("not laid out");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

  await picker.getByRole("textbox").fill("rocket");
  await picker.getByRole("button", { name: "rocket" }).click();

  await expect(picker).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("🚀");
});
