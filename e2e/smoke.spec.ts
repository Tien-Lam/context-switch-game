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

test("unlocked multiplexer shows two independently usable provider panes", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary"];
  game.unlockedSessions = 3;
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 6, savedAt: Date.now(), game: savedGame }));
  }, game);

  await page.goto("/");
  const anthill = page.getByRole("textbox", { name: "Anthill Code command" });
  await anthill.fill("pane split 2");
  await anthill.press("Enter");
  await expect(page.locator(".terminal-workspace.with-pane")).toBeVisible();
  const forge = page.getByRole("textbox", { name: "OpenMind Forge command" });
  await forge.fill("/status");
  await forge.press("Enter");
  await expect(page.locator(".secondary-pane")).toContainText("SESSION CONFIGURATION");
  await page.setViewportSize({ width: 568, height: 320 });
  const secondaryPromptBottom = await forge.evaluate((element) => element.getBoundingClientRect().bottom);
  expect(secondaryPromptBottom).toBeLessThanOrEqual(320);
  await anthill.fill("pane close");
  await anthill.press("Enter");
  await expect(page.locator(".secondary-pane")).toHaveCount(0);
});

test("same-provider tabs retain their own session status and event stream", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner", "telemetry-toggle"];
  game.unlockedSessions = 2;
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 6, savedAt: Date.now(), game: savedGame }));
  }, game);
  await page.goto("/");

  const first = page.getByRole("textbox", { name: "Anthill Code command" });
  await first.fill("work on PERF-204");
  await first.press("Enter");
  await first.fill("tab new anthill second");
  await first.press("Enter");
  const second = page.getByRole("textbox", { name: "Anthill Code command" });
  await second.fill("work on PLAT-77");
  await second.press("Enter");
  await expect(page.locator(".terminal-output .line-event")).toContainText("PLAT-77 → Ballad");
  await second.fill("/status");
  await second.press("Enter");
  await expect(page.getByText(/current task\s+PLAT-77/)).toBeVisible();
  await page.getByRole("tab", { name: /Anthill Code/ }).click();
  await expect(page.locator(".terminal-output .line-event").filter({ hasText: "PLAT-77 → Ballad" })).toHaveCount(0);
  await first.fill("/status");
  await first.press("Enter");
  await expect(page.getByText(/current task\s+PERF-204/)).toBeVisible();
});

test("importing a fresh save closes monitors that are no longer unlocked", async ({ page }) => {
  const advanced = createInitialState();
  advanced.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary"];
  advanced.unlockedSessions = 3;
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 6, savedAt: Date.now(), game: savedGame }));
  }, advanced);
  await page.goto("/");
  const command = page.getByRole("textbox", { name: "Anthill Code command" });
  await command.fill("watch events");
  await command.press("Enter");
  await expect(page.getByRole("tab", { name: /watch.events/ })).toBeVisible();
  await page.getByRole("tab", { name: /Anthill Code/ }).click();
  page.on("dialog", (dialog) => void dialog.accept());
  const chooserPromise = page.waitForEvent("filechooser");
  await command.fill("save import");
  await command.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "fresh.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 6, savedAt: Date.now(), game: createInitialState() })) });
  await expect(page.getByRole("tab", { name: /watch.events/ })).toHaveCount(0);
  await expect(page.locator(".terminal-contextbar")).toContainText("0 shipped");
});

test("tab capacity reports an error without discarding existing history", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner"];
  game.unlockedSessions = 2;
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 6, savedAt: Date.now(), game: savedGame }));
  }, game);
  await page.goto("/");
  const command = page.getByRole("textbox", { name: "Anthill Code command" });
  await command.fill("tickets list");
  await command.press("Enter");
  for (let index = 0; index < 7; index += 1) {
    await command.fill(`tab new anthill extra-${index}`);
    await command.press("Enter");
  }
  await expect(page.getByRole("tab")).toHaveCount(8);
  await expect(page.getByText(/eight tabs are open/)).toBeVisible();
  await page.getByRole("tab", { name: /Anthill Code/ }).click();
  await expect(page.locator(".terminal-output .line-output pre").filter({ hasText: "APP-118" }).first()).toBeVisible();
});
