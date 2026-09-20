import { expect, test } from "@playwright/test";

test("uses the CLI to complete a ticket and unlock another terminal tab", async ({ page }) => {
  test.setTimeout(35_000);
  await page.goto("/");
  const command = page.getByRole("textbox", { name: "Terminal command" });
  await expect(command).toBeVisible();
  await command.fill("speed 12");
  await command.press("Enter");
  await command.fill("tickets read APP-101");
  await command.press("Enter");
  await expect(page.getByText(/Change the staging banner copy/)).toBeVisible();
  await command.fill("agents run APP-101 --model couplet");
  await command.press("Enter");
  await expect(page.getByText(/tool agents.run · APP-101/)).toBeVisible();
  await expect(page.getByText(/APP-101 is ready for review/)).toBeVisible({ timeout: 20_000 });
  await command.fill("reviews approve APP-101");
  await command.press("Enter");
  await expect(page.getByText("APP-101 shipped")).toBeVisible();
  await command.fill("tab new review-shell");
  await command.press("Enter");
  await expect(page.getByRole("tab", { name: /review-shell/ })).toBeVisible();
});
