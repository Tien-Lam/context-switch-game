import { expect, test } from "@playwright/test";

test("uses both provider CLIs and completes a ticket from a natural-language prompt", async ({ page }) => {
  test.setTimeout(35_000);
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Anthill Code/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /OpenMind Forge/ })).toBeVisible();
  const command = page.getByRole("textbox", { name: "Anthill Code command" });
  await expect(command).toBeVisible();
  await command.fill("/model couplet");
  await command.press("Enter");
  await expect(page.getByText("Switched active model to Couplet.")).toBeVisible();
  await command.fill("please implement APP-101");
  await command.press("Enter");
  await expect(page.getByText(/ANT · APP-101/)).toBeVisible();
  await expect(page.getByText(/APP-101 is ready for review/)).toBeVisible({ timeout: 8_000 });
  await command.fill("reviews approve APP-101");
  await command.press("Enter");
  await expect(page.getByText("APP-101 shipped")).toBeVisible();

  await page.getByRole("tab", { name: /OpenMind Forge/ }).click();
  const forgeCommand = page.getByRole("textbox", { name: "OpenMind Forge command" });
  await forgeCommand.fill("/status");
  await forgeCommand.press("Enter");
  await expect(page.getByText("SESSION CONFIGURATION")).toBeVisible();
  await expect(page.getByText(/model\s+Spark/)).toBeVisible();
});
