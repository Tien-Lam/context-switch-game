import { expect, test } from "@playwright/test";
import { createInitialState } from "../src/game/initialState";

test("uses both provider CLIs and completes a ticket from a natural-language prompt", async ({ page }) => {
  test.setTimeout(35_000);
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Anthill Code/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /OpenMind Forge/ })).toBeVisible();
  const anthillTab = page.getByRole("tab", { name: /Anthill Code/ });
  const forgeTab = page.getByRole("tab", { name: /OpenMind Forge/ });
  await anthillTab.press("ArrowRight");
  await expect(forgeTab).toHaveAttribute("aria-selected", "true");
  await forgeTab.press("Home");
  await expect(anthillTab).toHaveAttribute("aria-selected", "true");
  const command = page.getByRole("textbox", { name: "Anthill Code command" });
  await expect(command).toBeVisible();
  await command.fill("/model couplet");
  await command.press("Enter");
  await expect(page.getByText("Switched active model to Couplet.")).toBeVisible();
  await command.fill("please implement APP-101");
  await command.press("Enter");
  await expect(page.getByText(/ANT · APP-101/)).toBeVisible();
  await expect(page.getByText(/APP-101 is ready for review/)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: "reviews read APP-101" })).toBeVisible();
  await expect(page.locator(".terminal-contextbar")).toContainText("1/1 slots");
  await expect(page.locator(".mux-statusbar")).toContainText("APP-101 awaiting-review");
  await command.fill("/status");
  await command.press("Enter");
  await expect(page.getByText(/current task\s+APP-101 · 100%/)).toBeVisible();
  await expect(page.getByText(/task state\s+awaiting-review/)).toBeVisible();
  await command.fill("/context");
  await command.press("Enter");
  await expect(page.getByText(/Context is retained while the change awaits review/)).toBeVisible();
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

test("keeps inspection intent read-only and exposes save import", async ({ page }) => {
  await page.goto("/");
  const command = page.getByRole("textbox", { name: "Anthill Code command" });
  await command.fill("please inspect APP-101");
  await command.press("Enter");
  await expect(page.getByText("error: no pending review for that ticket")).toBeVisible();
  await expect(page.getByText(/APP-101 → Ballad/)).toHaveCount(0);

  const chooserPromise = page.waitForEvent("filechooser");
  await command.fill("save import");
  await command.press("Enter");
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(false);
  await expect(page.getByText("choose a Context Switch save to import…")).toBeVisible();
});

test("fits the terminal into a 320 by 568 viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await expect(page.locator(".mux-statusbar")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    statusBottom: document.querySelector(".mux-statusbar")?.getBoundingClientRect().bottom ?? Infinity,
  }));
  expect(dimensions.documentHeight).toBeLessThanOrEqual(dimensions.viewportHeight);
  expect(dimensions.statusBottom).toBeLessThanOrEqual(dimensions.viewportHeight);
});

test("starting another shift resets terminal tabs and history", async ({ page }) => {
  const game = createInitialState();
  game.ending = {
    title: "Finished",
    message: "Test ending",
    scores: { throughput: 80, reliability: 80, trust: 80, debt: 10 },
  };
  const oldTabs = [{
    id: "term-99",
    name: "old-operations",
    kind: "monitor",
    view: "events",
    input: "",
    history: [{ id: 99, kind: "output", text: "old terminal history" }],
    commands: [],
    commandCursor: 0,
  }];
  await page.addInitScript(({ savedGame, savedTabs }) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 1, savedAt: Date.now(), game: savedGame }));
    localStorage.setItem("context-switch-terminal-tabs-v2", JSON.stringify(savedTabs));
  }, { savedGame: game, savedTabs: oldTabs });

  await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Start another shift" }).click();
  await expect(page.getByRole("tab", { name: /Anthill Code/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /OpenMind Forge/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "old-operations" })).toHaveCount(0);
  await expect(page.getByText("old terminal history")).toHaveCount(0);
});
