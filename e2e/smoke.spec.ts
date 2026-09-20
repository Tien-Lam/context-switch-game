import { expect, test } from "@playwright/test";

test("starts and completes the tutorial ticket", async ({ page }) => {
  test.setTimeout(35_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
  await page.getByRole("button", { name: "12×" }).click();
  await page.getByRole("button", { name: "Start agent" }).click();
  await expect(page.getByText("APP-101 · Rename the deployment banner", { exact: true })).toBeVisible();
  await expect(page.getByText("APP-101 is ready for review")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Approve/ }).click();
  await expect(page.getByText("APP-101 shipped")).toBeVisible();
});
