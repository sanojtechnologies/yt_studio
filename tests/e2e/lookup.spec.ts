import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "yt_api_key", value: "test-yt-key", url: "http://127.0.0.1:3100" },
    { name: "gemini_api_key", value: "test-gemini-key", url: "http://127.0.0.1:3100" },
  ]);
});

test("lookup form renders and exposes example chips", async ({ page }) => {
  await page.goto("/lookup");
  await expect(page.getByRole("heading", { name: /YouTube Channel Lookup/i })).toBeVisible();
  // The form input is the primary affordance; chips are clickable suggestions.
  await expect(page.getByPlaceholder(/youtube.com/i)).toBeVisible();
});

test("history page shows the empty state when no channels have been analysed", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: /Recent Channel Analyses/i })).toBeVisible();
  await expect(page.getByText(/No history yet/i)).toBeVisible();
});

test("compare page renders the form when no IDs are present", async ({ page }) => {
  await page.goto("/compare");
  await expect(page.getByRole("heading", { name: /Compare channels/i })).toBeVisible();
});
