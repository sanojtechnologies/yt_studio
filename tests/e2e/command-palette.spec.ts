import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "yt_api_key", value: "test-yt-key", url: "http://127.0.0.1:3100" },
    { name: "gemini_api_key", value: "test-gemini-key", url: "http://127.0.0.1:3100" },
  ]);
});

test("⌘K opens the palette, filters commands, and Esc closes it", async ({ page, browserName }) => {
  await page.goto("/lookup");

  // Use the OS-specific shortcut. macOS Chromium honours Meta+K; everything
  // else uses Ctrl+K.
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+K" : "Control+K");

  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();

  const input = page.getByPlaceholder(/Search channels, tools, settings/i);

  await input.fill("titles");
  await expect(dialog.getByRole("option", { name: /Title Lab/i })).toBeVisible();

  await input.fill("script");
  await expect(
    dialog.getByRole("option", { name: /Script outline generator/i })
  ).toBeVisible();

  await input.fill("a/b title");
  await expect(dialog.getByRole("option", { name: /A\/B title scorer/i })).toBeVisible();

  await input.fill("a/b thumbnail");
  await expect(
    dialog.getByRole("option", { name: /A\/B thumbnail comparator/i })
  ).toBeVisible();

  await input.fill("gap");
  await expect(
    dialog.getByRole("option", { name: /Competitor gap analysis/i })
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Prevent unused-variable warnings in environments where browserName is helpful for triage.
  expect(browserName).toBeTruthy();
});
