import { expect, test } from "@playwright/test";

test.describe("BYOK gating", () => {
  test("landing page shows both keys missing and hides the lookup CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /YT Studio Analyzer/i })).toBeVisible();
    // Both status pills should read 'Missing' on a fresh visit.
    const missingBadges = page.getByText("Missing", { exact: true });
    await expect(missingBadges).toHaveCount(2);
    await expect(page.getByRole("link", { name: /Open Channel Lookup/i })).toHaveCount(0);
  });

  test("studio redirects unauthenticated visitors to /keys", async ({ page }) => {
    await page.goto("/studio");
    await expect(page).toHaveURL(/\/keys$/);
  });

  test("once both keys are set, the lookup CTA appears and studio renders", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "yt_api_key",
        value: "test-yt-key",
        url: page.context().pages()[0]?.url() ?? "http://127.0.0.1:3100",
      },
      {
        name: "gemini_api_key",
        value: "test-gemini-key",
        url: "http://127.0.0.1:3100",
      },
    ]);

    await page.goto("/");
    await expect(page.getByRole("link", { name: /Open Channel Lookup/i })).toBeVisible();

    await page.goto("/studio");
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("heading", { name: /Creator Studio/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Title Lab/i })).toBeVisible();
  });
});
