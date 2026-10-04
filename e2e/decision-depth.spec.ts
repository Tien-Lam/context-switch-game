import { expect, test, type Page } from "@playwright/test";
import { SAVE_VERSION } from "../src/app/persistence";
import { advanceGame, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import type { GameState } from "../src/game/types";

function cacheReview() {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner", "telemetry-toggle", "runtime-upgrade"];
  game.unlockedSessions = 3;
  game.trust = 60;
  game.peakTrust = 60;
  return advanceGame(startTicket(game, 0, "cache-summary", "ballad"), 20);
}

async function seed(page: Page, game: GameState) {
  await page.addInitScript(({ game, version }) => {
    if (!localStorage.getItem("context-switch-emergency-save")) {
      localStorage.setItem("context-switch-emergency-save", JSON.stringify({ version, savedAt: Date.now(), game }));
    }
  }, { game, version: SAVE_VERSION });
  await page.goto("/");
  const shell = page.getByRole("textbox", { name: "Terminal command", exact: true });
  await shell.fill("anthill");
  await shell.press("Enter");
}

async function ask(page: Page, request: string) {
  const agent = page.getByRole("textbox", { name: "Anthill Code message" });
  await agent.fill(request);
  await agent.press("Enter");
}

test("natural cache decisions retain scope across reload and expose optional restoration", async ({ page }) => {
  await seed(page, cacheReview());
  await ask(page, "What changed in PERF-204?");
  await expect(page.locator(".line-output").last()).toContainText("scope choices");
  await ask(page, "Bypass the cache? I am only asking what this costs");
  await expect(page.locator(".terminal-contextbar")).toContainText("1 reviews");
  await ask(page, "Restore invalidation or bypass the cache");
  await expect(page.locator(".line-muted").last()).toContainText("No cache revision started");
  await ask(page, "Bypass the cache for now");
  await expect(page.locator(".line-event").filter({ hasText: "PERF-204 is ready for review" })).toHaveCount(1);
  await ask(page, "What changed in PERF-204?");
  await expect(page.locator(".line-output").last()).toContainText("Removed cached summary reads");
  await expect(page.locator(".line-output").last()).toContainText("+7 trust");
  await ask(page, "Approve PERF-204");
  await page.reload();
  await ask(page, "Tell me about PERF-205");
  await expect(page.locator(".line-output").last()).toContainText(/optional/i);
  await expect(page.locator(".line-output").last()).toContainText("+5 trust");
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminal = page.getByRole("textbox", { name: "Anthill Code command" });
  await terminal.fill("tickets list");
  await terminal.press("Enter");
  await expect(page.locator(".line-output").last()).toContainText("PERF-205");
  await expect(page.locator(".line-output").last()).not.toContainText("FIX-204");
});

test("supporting probes survive reload, display owner progress and release their slot", async ({ page }) => {
  let game = cacheReview();
  game = reviewTicket(game, game.reviews[0].id, "revise", { remedy: "restore", workflow: "probes" });
  game = structuredClone(game);
  game.providerQuota.anthill = 0;
  await seed(page, game);
  await ask(page, "agents list");
  await expect(page.locator(".line-output").last()).toContainText(/support.*1/i);
  await page.reload();
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminal = page.getByRole("textbox", { name: "Anthill Code command" });
  await terminal.fill("pane split agents");
  await terminal.press("Enter");
  await expect(page.getByLabel("agents monitor")).toContainText("supports #1");
  await expect(page.getByLabel("agents monitor").locator(".watch-row").nth(1)).not.toContainText("idle");
  await expect(page.getByLabel("agents monitor").locator(".watch-row").nth(1)).toContainText("idle", { timeout: 25_000 });
  await terminal.fill("reviews read PERF-204");
  await terminal.press("Enter");
  await expect(page.locator(".line-output").last()).toContainText("helper");
  await expect(page.locator(".line-output").last()).toContainText("+12 trust");
});

test("a rejected alternative cannot replace the selected remedy", async ({ page }) => {
  await seed(page, cacheReview());
  await ask(page, "Restore invalidation rather than bypass the cache");
  await expect(page.locator(".line-muted").last()).toContainText("restore / ledger");
  await expect(page.locator(".line-muted").last()).not.toContainText("speed deferred");
});
