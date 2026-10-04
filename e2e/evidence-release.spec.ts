import { expect, test, type Page } from "@playwright/test";
import { SAVE_VERSION } from "../src/app/persistence";
import { advanceGame, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import type { GameState } from "../src/game/types";
import { mixedReleaseReview } from "../scripts/evaluation/releaseFixture";

async function seed(page: Page, game: GameState) {
  await page.addInitScript(({ game, version }) => {
    if (!localStorage.getItem("context-switch-emergency-save")) localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version, savedAt: Date.now(), game }));
  }, { game, version: SAVE_VERSION });
  await page.goto("/");
}
async function launch(page: Page, tab: number, command: string) {
  await page.getByRole("tab", { name: new RegExp(`^${tab} Terminal ${tab}$`) }).click();
  const shell = page.getByRole("textbox", { name: "Terminal command", exact: true });
  await shell.fill(command);
  await shell.press("Enter");
}
async function ask(page: Page, request: string, provider = "Anthill Code") {
  const input = page.getByRole("textbox", { name: `${provider} message` });
  await input.fill(request);
  await input.press("Enter");
}

test("reachable mixed final review remains honest through an additional verification pass", async ({ page }) => {
  await seed(page, mixedReleaseReview());
  await launch(page, 1, "anthill");
  await ask(page, "What changed in SHIP-2?");
  await expect(page.locator(".line-output").last()).toContainText("checkout rounding is unresolved");
  await expect(page.locator(".line-output").last()).toContainText("FIX-502 stopped");
  await expect(page.locator(".line-output").last()).not.toContainText("Checkout checks pass");
  await ask(page, "Please revise SHIP-2");
  await expect(page.locator(".line-event").filter({ hasText: "SHIP-2 is ready for review" })).toHaveCount(1, { timeout: 25_000 });
  await ask(page, "What changed in SHIP-2?");
  await expect(page.locator(".line-output").last()).toContainText("additional pass completed");
  await expect(page.locator(".line-output").last()).toContainText("checkout rounding is unresolved");
  await ask(page, "Approve SHIP-2 if it is safe");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".line-muted").last()).toContainText("No review decision made");
  await ask(page, "Approve SHIP-2");
  await expect(page.getByRole("dialog")).toContainText("Known risks remain");
});

test("duplicate restored terminal identifiers are repaired without losing transcripts", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner", "telemetry-toggle", "runtime-upgrade"];
  await page.addInitScript(() => {
    const common = { id: "term-1", kind: "provider", surface: "shell", cwd: "/workspace/delivery", input: "", commands: [], commandCursor: 0, shellInput: "", shellCommands: [], shellCommandCursor: 0, history: [] };
    localStorage.setItem("context-switch-terminal-tabs-v3", JSON.stringify([
      { ...common, name: "Terminal 1", shellHistory: [{ id: 1, kind: "output", text: "first transcript" }] },
      { ...common, name: "Terminal 2", shellHistory: [{ id: 2, kind: "output", text: "second transcript" }] },
    ]));
  });
  await seed(page, game);
  const tabs = page.getByRole("tab");
  expect(await tabs.nth(0).getAttribute("id")).not.toBe(await tabs.nth(1).getAttribute("id"));
  await tabs.nth(1).click();
  await expect(page.getByText("second transcript", { exact: true })).toBeVisible();
  const shell = page.getByRole("textbox", { name: "Terminal command", exact: true });
  await shell.fill("pane split quota");
  await shell.press("Enter");
  await expect(page.getByLabel("quota monitor")).toBeVisible();
  await expect(shell).toBeVisible();
});

test("cross-provider approval returns a local receipt while the owner's event remains single", async ({ page }) => {
  const initial = createInitialState();
  initial.completedTicketIds = ["deployment-banner"];
  initial.unlockedSessions = 2;
  await seed(page, advanceGame(startTicket(initial, 0, "telemetry-toggle", "ballad"), 20));
  await launch(page, 1, "anthill");
  await launch(page, 2, "forge");
  await ask(page, "Approve APP-118", "OpenMind Forge");
  await expect(page.locator(".line-success").last()).toContainText("APP-118 shipped · Anthill Code · session 1");
  await expect(page.locator(".line-success").last()).toContainText("Recovery: FIX-118");
  await expect(page.locator(".line-event").filter({ hasText: "APP-118 shipped" })).toHaveCount(0);
  await page.getByRole("tab", { name: "1 Anthill Code" }).click();
  await expect(page.locator(".line-event").filter({ hasText: "APP-118 shipped" })).toHaveCount(1);
  await page.getByRole("tab", { name: "2 OpenMind Forge" }).click();
  await page.reload();
  await expect(page.locator(".line-success").filter({ hasText: "Result: APP-118 shipped" })).toHaveCount(1);
  await expect(page.locator(".terminal-contextbar")).toContainText("2 shipped");
});

test("a request's disabled telemetry default is reflected in completed review evidence", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner"];
  await seed(page, game);
  await launch(page, 1, "anthill");
  await ask(page, "Please take APP-118 with telemetry off by default");
  await expect(page.locator(".line-success").last()).toContainText("planned brief");
  await expect(page.locator(".line-event").filter({ hasText: "APP-118 is ready for review" })).toHaveCount(1, { timeout: 15_000 });
  await ask(page, "What changed in APP-118?");
  await expect(page.locator(".line-output").last()).toContainText(/disabled|off/i);
  await expect(page.locator(".line-output").last()).not.toContainText("defaults to enabled");
});

test("dashboard purchase exposes its command and trust balance without changing views", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner", "telemetry-toggle", "runtime-upgrade"];
  game.trust = 60;
  game.peakTrust = 60;
  await seed(page, game);
  await launch(page, 1, "anthill");
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminal = page.getByRole("textbox", { name: "Anthill Code command" });
  await terminal.fill("upgrades buy terminal-dashboard");
  await terminal.press("Enter");
  await expect(page.locator(".line-success").last()).toContainText("14 trust · balance 46 trust");
  await expect(page.locator(".line-success").last()).toContainText("`dashboard`");
  await expect(terminal).toBeVisible();
  await expect(page.getByLabel("Live dashboard")).toHaveCount(0);
  await terminal.fill("dashboard");
  await terminal.press("Enter");
  await expect(page.getByLabel("Live dashboard")).toBeVisible();
});

test("legacy low terminal defaults normalize once without altering the active job", async ({ page }) => {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner"];
  const active = advanceGame(startTicket(game, 0, "telemetry-toggle", "ballad", false, "low"), 20);
  await page.addInitScript(() => {
    if (!localStorage.getItem("context-switch-terminal-tabs-v3")) localStorage.setItem("context-switch-terminal-tabs-v3", JSON.stringify([
      { id: "term-1", name: "Anthill Code", kind: "provider", providerId: "anthill", modelId: "ballad", boundSessionId: 0, permissionMode: "ask", reasoning: "low", surface: "agent", cwd: "/workspace/delivery", input: "", history: [], commands: [], commandCursor: 0, shellInput: "", shellHistory: [], shellCommands: [], shellCommandCursor: 0 },
    ]));
  });
  await seed(page, active);
  await expect(page.locator(".line-muted").filter({ hasText: "Low reasoning is no longer offered" })).toHaveCount(1);
  await expect(page.locator(".mux-statusbar")).toContainText("active low effort");
  await ask(page, "/status");
  await expect(page.locator(".line-output").last()).toContainText(/low/);
  await page.reload();
  await expect(page.locator(".line-muted").filter({ hasText: "Low reasoning is no longer offered" })).toHaveCount(1);
  await ask(page, "What changed in APP-118?");
  await expect(page.locator(".line-output").last()).toContainText("low reasoning +7");
});
