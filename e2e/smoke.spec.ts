import { expect, test } from "@playwright/test";
import { createInitialState } from "../src/game/initialState";
import { computeEnding } from "../src/game/engine";

async function launchInTab(page: import("@playwright/test").Page, index: 1 | 2, command: "anthill" | "forge") {
  await page.getByRole("tab", { name: new RegExp(`Terminal ${index}`) }).click();
  const terminal = page.getByRole("textbox", { name: "Terminal command" });
  await terminal.fill(command);
  await terminal.press("Enter");
  const provider = command === "anthill" ? "Anthill Code" : "OpenMind Forge";
  await expect(page.getByRole("textbox", { name: `${provider} message` })).toBeVisible();
}

test("starts with two shells and launches either provider by command", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Terminal 1/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Terminal 2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agent", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Terminal command" })).toBeVisible();
  await launchInTab(page, 1, "anthill");
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Anthill Code command" })).toBeVisible();
  await expect(page.locator(".terminal-output")).toContainText("Launching Anthill Code");
  await launchInTab(page, 2, "forge");
  await expect(page.getByRole("tab", { name: /Anthill Code/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /OpenMind Forge/ })).toBeVisible();
});

test("pre-launch shell inspects tickets but cannot assign work without an agent", async ({ page }) => {
  await page.goto("/");
  const terminal = page.getByRole("textbox", { name: "Terminal command" });
  await terminal.fill("tickets list");
  await terminal.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("APP-101");
  await terminal.fill("agents run APP-101");
  await terminal.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("launch an agent with `anthill` or `forge` first");
  await expect(page.locator(".terminal-contextbar")).toContainText("0/1 slots");
  await terminal.fill("forge");
  await terminal.press("Enter");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "OpenMind Forge message" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Terminal 2/ })).toBeVisible();
});

test("uses both provider CLIs and completes a ticket from a natural-language prompt", async ({ page }) => {
  test.setTimeout(35_000);
  await page.goto("/");
  await launchInTab(page, 1, "anthill");
  await launchInTab(page, 2, "forge");
  await expect(page.getByRole("tab", { name: /Anthill Code/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /OpenMind Forge/ })).toBeVisible();
  const anthillTab = page.getByRole("tab", { name: /Anthill Code/ });
  const forgeTab = page.getByRole("tab", { name: /OpenMind Forge/ });
  await anthillTab.press("ArrowRight");
  await expect(forgeTab).toHaveAttribute("aria-selected", "true");
  await forgeTab.press("Home");
  await expect(anthillTab).toHaveAttribute("aria-selected", "true");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
  await expect(command).toBeVisible();
  await command.fill("/model couplet");
  await command.click();
  await command.press("Enter");
  await expect(page.getByText("Switched active model to Couplet.")).toBeVisible();
  await command.fill("Could you take care of the deployment banner?");
  await command.press("Enter");
  await expect(page.getByText(/ANT · APP-101/)).toBeVisible();
  await expect(page.getByText(/APP-101 is ready for review/)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: "What changed in APP-101?" })).toBeVisible();
  await expect(page.locator(".terminal-contextbar")).toContainText("1/1 slots");
  await expect(page.locator(".mux-statusbar")).toContainText("APP-101 awaiting-review");
  await command.fill("/status");
  await command.press("Enter");
  await expect(page.getByText(/current task\s+APP-101 · 100%/)).toBeVisible();
  await expect(page.getByText(/task state\s+awaiting-review/)).toBeVisible();
  await command.fill("/context");
  await command.press("Enter");
  await expect(page.getByText(/Context is retained while the change awaits review/)).toBeVisible();
  await command.fill("Is this safe to approve?");
  await command.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("PASS: approve is supported by the current evidence");
  await command.fill("Approve it");
  await command.press("Enter");
  await expect(page.getByText("APP-101 shipped")).toBeVisible();

  await page.getByRole("tab", { name: /OpenMind Forge/ }).click();
  const forgeCommand = page.getByRole("textbox", { name: "OpenMind Forge message" });
  await forgeCommand.fill("/status");
  await forgeCommand.press("Enter");
  await expect(page.getByText("SESSION CONFIGURATION")).toBeVisible();
  await expect(page.getByText(/model\s+Spark/)).toBeVisible();
});

test("switches between natural agent chat and exact terminal tools", async ({ page }) => {
  await page.goto("/");
  await launchInTab(page, 1, "anthill");
  const agent = page.getByRole("textbox", { name: "Anthill Code message" });
  await agent.fill("What should I work on next?");
  await agent.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("APP-101");
  await expect(page.locator(".terminal-output")).not.toContainText("APP-101 → session");

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminal = page.getByRole("textbox", { name: "Anthill Code command" });
  await expect(terminal).toBeVisible();
  await terminal.fill("Could you handle the banner?");
  await terminal.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("command not found");
  await terminal.fill("tickets list");
  await terminal.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("Rename the deployment banner");

  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await expect(agent).toBeVisible();
  await expect(page.locator(".terminal-output")).not.toContainText("command not found");
  await agent.fill("Please handle the deployment banner");
  await agent.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("APP-101 → session");
});

test("shows the active model in its provider banner and refuses negated work intent", async ({ page }) => {
  const game = createInitialState();
  game.peakTrust = 60;
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 8, savedAt: Date.now(), game: savedGame }));
  }, game);
  await page.goto("/");
  await launchInTab(page, 2, "forge");
  await launchInTab(page, 1, "anthill");
  const openmindTab = page.getByRole("tab", { name: /OpenMind Forge/ });
  await openmindTab.click();
  const forge = page.getByRole("textbox", { name: "OpenMind Forge message" });
  await forge.fill("/model forge");
  await forge.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("model:     Forge balanced");
  await expect(page.locator(".terminal-output")).not.toContainText("Spark quick");

  await page.getByRole("tab", { name: /Anthill Code/ }).click();
  const anthill = page.getByRole("textbox", { name: "Anthill Code message" });
  await anthill.fill("I do not want you to work on APP-101");
  await anthill.press("Enter");
  await expect(page.getByText(/No work started for APP-101/)).toBeVisible();
  await expect(page.getByText(/ANT · APP-101 →/)).toHaveCount(0);
});

test("continues a completed demo save into the green-build chapter", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary", "runtime-upgrade", "webhook-backoff", "parallel-reports", "quota-display", "stale-customer-data", "investor-demo"];
  game.unlockedSessions = 3;
  game.ending = { title: "Demo complete", message: "Old ending", scores: { throughput: 80, reliability: 80, trust: 80, debt: 5 } };
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 6, savedAt: Date.now(), game: savedGame }));
  }, game);

  await page.goto("/");
  await launchInTab(page, 1, "anthill");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".terminal-output")).toContainText("Objective: ship QA-401, then a safe first release.");
  await expect(page.locator(".terminal-output")).not.toContainText("work on APP-101");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
  await command.fill("tickets read QA-401");
  await command.press("Enter");
  await expect(page.getByText(/QA-401 · The green build/)).toBeVisible();
  await expect(page.getByText(/state\s+Ready/)).toBeVisible();
});

test("refreshes a new conversation with the current chapter objective", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary", "runtime-upgrade", "webhook-backoff", "parallel-reports", "quota-display", "stale-customer-data", "investor-demo"];
  game.unlockedSessions = 3;
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 8, savedAt: Date.now(), game: savedGame }));
  }, game);

  await page.goto("/");
  await launchInTab(page, 1, "anthill");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
  await command.fill("/new");
  await command.press("Enter");
  await expect(page.locator(".terminal-output")).toContainText("Objective: ship QA-401, then a safe first release.");
  await expect(page.locator(".terminal-output")).toContainText("Ask me to take the next ticket in your own words");
  await expect(page.locator(".terminal-output")).not.toContainText("work on APP-101");
});

test("keeps the full ending and restart action reachable on small viewports", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner", "investor-demo", "green-build", "account-api", "account-panel", "contract-join", "helpful-retry", "gateway-rollout", "retry-repair", "release-two"];
  game.ending = computeEnding(game);
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 8, savedAt: Date.now(), game: savedGame }));
  }, game);

  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const card = page.locator(".ending-card");
    await expect(card).toBeVisible();
    const needsScroll = await card.evaluate((element) => element.scrollHeight > element.clientHeight);
    expect(needsScroll).toBe(true);
    await page.getByRole("button", { name: "Start another shift" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Start another shift" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("contains the gateway incident through the provider CLI", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["investor-demo", "green-build", "account-api", "account-panel", "contract-join", "helpful-retry", "gateway-rollout"];
  game.unlockedSessions = 3;
  game.flags.requestLoopAccepted = true;
  game.flags.retryAuditAnnounced = true;
  game.incidentResponse = "active";
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 7, savedAt: Date.now(), game: savedGame }));
  }, game);

  await page.goto("/");
  await launchInTab(page, 1, "anthill");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
  await command.fill("incident status");
  await command.press("Enter");
  await expect(page.getByText(/GATEWAY INCIDENT · SEV-1/)).toBeVisible();
  await command.fill("incident mitigate rollback");
  await command.press("Enter");
  await expect(page.getByText("Retry feature rolled back")).toBeVisible();
  await command.fill("tickets read FIX-502");
  await command.press("Enter");
  await expect(page.getByText(/FIX-502 · Stop the request loop/)).toBeVisible();
  await expect(page.getByText(/state\s+Ready/)).toBeVisible();
});

test("prevents repeating an incident mitigation", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["investor-demo", "green-build", "account-api", "account-panel", "contract-join", "helpful-retry", "gateway-rollout"];
  game.unlockedSessions = 3;
  game.flags.requestLoopAccepted = true;
  game.flags.retryAuditAnnounced = true;
  game.incidentResponse = "active";
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 7, savedAt: Date.now(), game: savedGame }));
  }, game);

  await page.goto("/");
  await launchInTab(page, 1, "anthill");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
  await command.fill("incident mitigate rate-limit");
  await command.press("Enter");
  await expect(page.getByText("Gateway rate-limited")).toBeVisible();
  await command.fill("incident mitigate rate-limit");
  await command.press("Enter");
  await expect(page.getByText(/error: the gateway is already rate-limited/)).toBeVisible();
  await expect(page.getByText("Gateway rate-limited")).toHaveCount(1);
});

test("plays the scaled-incident recovery through the final release in the browser", async ({ page }) => {
  test.setTimeout(35_000);
  const game = createInitialState();
  game.completedTicketIds = ["investor-demo", "green-build", "account-api", "account-panel", "contract-join", "helpful-retry", "gateway-rollout"];
  game.unlockedSessions = 3;
  game.flags.requestLoopAccepted = true;
  game.flags.retryAuditAnnounced = true;
  game.incidentResponse = "active";
  await page.addInitScript((savedGame) => {
    localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version: 8, savedAt: Date.now(), game: savedGame }));
  }, game);

  await page.goto("/");
  await launchInTab(page, 1, "anthill");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
  await command.fill("incident mitigate scale");
  await command.press("Enter");
  await expect(page.getByText("Gateway scaled; loop persists")).toBeVisible();
  await expect(page.getByText(/stabilized service and protected repository health/)).toBeVisible();
  await command.fill("incident mitigate rate-limit");
  await command.press("Enter");
  await expect(page.getByText("Gateway rate-limited")).toBeVisible();

  await command.fill("work on FIX-502");
  await command.press("Enter");
  await expect(page.getByText(/FIX-502 is ready for review/)).toBeVisible({ timeout: 8_000 });
  await command.fill("reviews approve FIX-502");
  await command.press("Enter");
  await expect(page.getByText("FIX-502 shipped")).toBeVisible();

  await command.fill("work on SHIP-2");
  await command.press("Enter");
  await expect(page.getByText(/SHIP-2 is ready for review/)).toBeVisible({ timeout: 10_000 });
  await command.fill("reviews approve SHIP-2");
  await command.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("repaired after rate-limiting traffic");
  await expect(page.getByRole("dialog")).toContainText("includes idle time and quota restocks");
  await expect(page.getByRole("dialog")).toContainText("elapsed-time points");
});

test("keeps inspection intent read-only and exposes save import", async ({ page }) => {
  await page.goto("/");
  await launchInTab(page, 1, "anthill");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
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
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    statusBottom: document.querySelector(".mux-statusbar")?.getBoundingClientRect().bottom ?? Infinity,
  }));
  expect(dimensions.documentHeight).toBeLessThanOrEqual(dimensions.viewportHeight);
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
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
  await expect(page.getByRole("tab", { name: /Terminal 1/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Terminal 2/ })).toBeVisible();
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
  await launchInTab(page, 2, "forge");
  await launchInTab(page, 1, "anthill");
  const anthill = page.getByRole("textbox", { name: "Anthill Code message" });
  await anthill.fill("pane split 2");
  await anthill.press("Enter");
  await expect(page.locator(".terminal-workspace.with-pane")).toBeVisible();
  const forge = page.getByRole("textbox", { name: "OpenMind Forge message" });
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
  await launchInTab(page, 1, "anthill");

  const first = page.getByRole("textbox", { name: "Anthill Code message" });
  await first.fill("work on PERF-204");
  await first.press("Enter");
  await first.fill("tab new second");
  await first.press("Enter");
  const newShell = page.getByRole("textbox", { name: "Terminal command" });
  await newShell.fill("anthill");
  await newShell.press("Enter");
  const second = page.getByRole("textbox", { name: "Anthill Code message" });
  await second.fill("work on PLAT-77");
  await second.press("Enter");
  await expect(page.locator(".terminal-output .line-event")).toContainText("PLAT-77 → Ballad");
  await second.fill("/status");
  await second.press("Enter");
  await expect(page.getByText(/current task\s+PLAT-77/)).toBeVisible();
  await page.getByRole("tab", { name: /Anthill Code/ }).first().click();
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
  await launchInTab(page, 1, "anthill");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
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
  await launchInTab(page, 1, "anthill");
  const command = page.getByRole("textbox", { name: "Anthill Code message" });
  await command.fill("tickets list");
  await command.press("Enter");
  for (let index = 0; index < 7; index += 1) await page.getByRole("button", { name: "New terminal tab" }).click();
  await expect(page.getByRole("tab")).toHaveCount(8);
  await expect(page.getByText(/eight tabs are open/)).toBeVisible();
  await page.getByRole("tab", { name: /Anthill Code/ }).click();
  await expect(page.locator(".terminal-output .line-output pre").filter({ hasText: "APP-118" }).first()).toBeVisible();
});
