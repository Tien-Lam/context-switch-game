import { describe, expect, it } from "vitest";
import { content, modelById, ticketById } from "../src/content";
import { CACHE_DECISIONS } from "../src/content/cacheDecisions";
import { getCacheReviewEvidence, getCacheRevisionQuote } from "../src/game/decisionDepth";
import { advanceGame, computeEnding, GameRuleError, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { availableTickets, incidentIsOpen, isReviewBlocked, visibleTickets } from "../src/game/selectors";
import type { CacheRevisionOptions, GameState, ReviewState } from "../src/game/types";

function cacheReview(modelId = "ballad") {
  const initial = createInitialState();
  initial.completedTicketIds = ["deployment-banner"];
  initial.unlockedSessions = 3;
  initial.trust = 40;
  initial.peakTrust = 60;
  return structuredClone(advanceGame(startTicket(initial, 0, "cache-summary", modelId), 20));
}

function reviseCache(state: GameState, options?: CacheRevisionOptions) {
  return reviewTicket(state, state.reviews.find((review) => review.ticketId === "cache-summary")!.id, "revise", options);
}

function approveCache(state: GameState) {
  return reviewTicket(state, state.reviews.find((review) => review.ticketId === "cache-summary")!.id, "approve");
}

function callbackReview(ticketId: string): ReviewState {
  return { id: `callback-${ticketId}`, ticketId, sessionId: 0, risk: 0.1, createdAt: 0 };
}

describe("cache scope decisions and evidence workflows", () => {
  it("cannot flip approval at an exact risk boundary between offline and frame-sized work", () => {
    const ready = cacheReview("spark");
    ready.sessions[0].context = 42.2;
    ready.providerQuota.openmind = 0.1;
    const revised = reviseCache(ready, { remedy: "restore", workflow: "probes" });
    const coarse = advanceGame(revised, 100);
    let fine = revised;
    for (let i = 0; i < 1000; i += 1) fine = advanceGame(fine, 0.1);
    expect(coarse.reviews[0].risk).toBe(0.6);
    expect(fine.reviews[0].risk).toBe(0.6);
    expect(isReviewBlocked(coarse, coarse.reviews[0])).toBe(true);
    expect(isReviewBlocked(fine, fine.reviews[0])).toBe(true);
    expect(approveCache(coarse).stats.defects).toBe(approveCache(fine).stats.defects);
  });
  it("keeps the chosen bypass on generic additional passes, but accepts an explicit scope change", () => {
    const ready = cacheReview();
    const checked = advanceGame(reviseCache(ready, { remedy: "bypass" }), 10);
    expect(getCacheRevisionQuote(checked, checked.reviews[0].id)).toMatchObject({ remedy: "bypass", workflow: null, seconds: 1.5 });
    const repeated = reviseCache(checked);
    expect(repeated.sessions[0].cacheRemedy).toBe("bypass");
    expect(getCacheRevisionQuote(checked, checked.reviews[0].id, { remedy: "restore" })).toMatchObject({ remedy: "restore", workflow: "ledger" });
  });

  it("keeps rounded evidence stable across floating-point work partitions", () => {
    const ready = cacheReview("epic");
    ready.sessions[0].context = 0;
    ready.providerQuota.anthill = 0;
    const revised = reviseCache(ready, { remedy: "bypass" });
    const coarse = advanceGame(revised, 100);
    let fine = revised;
    for (let i = 0; i < 1000; i += 1) fine = advanceGame(fine, 0.1);
    expect(coarse.reviews[0].riskFactors).toEqual(fine.reviews[0].riskFactors);
    expect(coarse.events.find((event) => event.title === "PERF-204 is ready for review")?.message).toEqual(fine.events.find((event) => event.title === "PERF-204 is ready for review")?.message);
  });

  it("keeps the context-factor threshold stable at exactly 80 context", () => {
    const ready = cacheReview();
    ready.sessions[0].context = 75.2;
    ready.providerQuota.anthill = 3;
    const revised = reviseCache(ready, { remedy: "restore", workflow: "ledger" });
    const coarse = advanceGame(revised, 100);
    let fine = revised;
    for (let i = 0; i < 1000; i += 1) fine = advanceGame(fine, 0.1);
    expect(coarse.reviews[0].riskFactors).toEqual(fine.reviews[0].riskFactors);
    expect(coarse.reviews[0].riskFactors?.some((factor) => factor.includes("thin context"))).toBe(false);
  });
  it("restores invalidation with a charged ledger pass and preserves the full delivery reward", () => {
    const ready = cacheReview();
    ready.sessions[0].context = 50;
    const quote = getCacheRevisionQuote(ready, ready.reviews[0].id)!;
    expect(quote).toMatchObject({ remedy: "restore", workflow: "ledger", seconds: 5, setupQuota: 3, contextGain: 12, helperNeeded: false });
    const revised = reviseCache(ready);
    expect(revised.sessions[0]).toMatchObject({ context: 62, cacheRemedy: "restore", cacheWorkflow: "ledger", workDuration: 5, progress: 0 });
    expect(revised.providerQuota.anthill).toBe(ready.providerQuota.anthill - 3);
    expect(revised.stats.quotaSpent).toBe(ready.stats.quotaSpent + 3);
    expect(advanceGame(revised, 4.99).reviews).toHaveLength(0);
    const checked = advanceGame(revised, 5);
    expect(isReviewBlocked(checked, checked.reviews[0])).toBe(false);
    expect(getCacheReviewEvidence(checked, checked.reviews[0])).toMatchObject({ tests: expect.stringContaining("ledger"), signal: expect.stringContaining("invalidates") });
    const shipped = approveCache(checked);
    expect(shipped.trust).toBe(checked.trust + 12);
    expect(shipped.cacheOutcome).toBe("restored");
    expect(shipped.flags.cacheShortcut).toBe(false);
    expect(visibleTickets(shipped).some((ticket) => ticket.id === CACHE_DECISIONS.followup.id)).toBe(false);
    expect(shipped.sessions[0]).toMatchObject({ cacheRemedy: null, cacheWorkflow: null, workDuration: null, supportForSessionId: null });
  });

  it("bypasses quickly with a smaller reward, fresh direct reads, and an optional performance follow-up", () => {
    const ready = cacheReview();
    ready.sessions[0].context = 50;
    const quote = getCacheRevisionQuote(ready, ready.reviews[0].id, { remedy: "bypass" })!;
    expect(quote).toMatchObject({ seconds: 1.5, setupQuota: 0, contextGain: 2, rewardTrust: 7, helperNeeded: false, workflow: null });
    const revised = reviseCache(ready, { remedy: "bypass" });
    expect(revised.sessions[0].context).toBe(52);
    expect(revised.providerQuota).toEqual(ready.providerQuota);
    const checked = advanceGame(revised, 1.5);
    expect(checked.stats.quotaSpent - revised.stats.quotaSpent).toBeCloseTo(modelById.get("ballad")!.quotaRate * 1.5);
    expect(getCacheReviewEvidence(checked, checked.reviews[0])).toMatchObject({ signal: expect.stringContaining("slower"), scope: expect.stringContaining("+7 trust") });
    const shipped = approveCache(checked);
    expect(shipped.trust).toBe(checked.trust + 7);
    expect(shipped.cacheOutcome).toBe("bypassed");
    expect(incidentIsOpen(shipped, "cache-shortcut")).toBe(false);
    expect(availableTickets(shipped).some((ticket) => ticket.id === CACHE_DECISIONS.followup.id)).toBe(true);
    expect(visibleTickets(shipped).some((ticket) => ticket.id === CACHE_DECISIONS.followup.id)).toBe(true);
  });

  it("uses Forge's preferred probes, occupying a helper slot and charging its quota only during owner work", () => {
    const ready = cacheReview("forge");
    ready.sessions[0].context = 50;
    const quote = getCacheRevisionQuote(ready, ready.reviews[0].id)!;
    expect(quote).toMatchObject({ workflow: "probes", helperNeeded: true, helperSessionId: 1, seconds: 3, setupQuota: 0, contextGain: 3 });
    const revised = reviseCache(ready);
    expect(revised.sessions[0].context).toBe(53);
    expect(revised.sessions[1]).toMatchObject({ status: "supporting", ticketId: null, modelId: "forge", supportForSessionId: 0 });
    expect(() => startTicket(revised, 1, "telemetry-toggle", "ballad")).toThrow(/occupied/);
    const checked = advanceGame(revised, 3);
    expect(checked.stats.quotaSpent - revised.stats.quotaSpent).toBeCloseTo(3 * 2.8 * 1.5);
    expect(checked.reviews).toHaveLength(1);
    expect(checked.sessions[0]).toMatchObject({ status: "awaiting-review", cacheWorkflow: "probes", cacheRemedy: "restore" });
    expect(checked.sessions[1]).toMatchObject({ status: "idle", ticketId: null, modelId: null, supportForSessionId: null });
    expect(getCacheReviewEvidence(checked, checked.reviews[0])!.tests).toContain("helper");
    const later = advanceGame(checked, 30);
    expect(later.stats.quotaSpent).toBe(checked.stats.quotaSpent);
    expect(later.reviews).toHaveLength(1);
  });

  it("allows either provider to use either workflow", () => {
    for (const [modelId, workflow] of [["ballad", "probes"], ["forge", "ledger"]] as const) {
      const ready = cacheReview(modelId);
      const revised = reviseCache(ready, { remedy: "restore", workflow });
      expect(revised.sessions[0].cacheWorkflow).toBe(workflow);
      expect(revised.sessions.filter((session) => session.status === "supporting")).toHaveLength(workflow === "probes" ? 1 : 0);
      const checked = advanceGame(revised, CACHE_DECISIONS[workflow].seconds);
      expect(approveCache(checked).cacheOutcome).toBe("restored");
    }
  });

  it("visibly falls back from default probes, while an explicit probes request without a slot is atomic", () => {
    const ready = cacheReview("forge");
    ready.unlockedSessions = 1;
    const quote = getCacheRevisionQuote(ready, ready.reviews[0].id)!;
    expect(quote.workflow).toBe("ledger");
    expect(quote.fallbackReason).toContain("No free supporting slot");
    const before = structuredClone(ready);
    expect(() => reviseCache(ready, { remedy: "restore", workflow: "probes" })).toThrow(GameRuleError);
    expect(ready).toEqual(before);
    const revised = reviseCache(ready);
    expect(revised.events[0].message).toContain("fall back");
    expect(revised.sessions[0].cacheWorkflow).toBe("ledger");
  });

  it("rejects insufficient setup quota and invalid option combinations without consuming the review", () => {
    const ready = cacheReview();
    ready.providerQuota.anthill = 2;
    const before = structuredClone(ready);
    expect(() => reviseCache(ready, { remedy: "restore", workflow: "ledger" })).toThrow(/upfront/);
    expect(() => reviseCache(ready, { remedy: "bypass", workflow: "ledger" })).toThrow(/no restoration workflow/);
    expect(() => reviseCache(ready, { remedy: "magic" } as unknown as CacheRevisionOptions)).toThrow(/restore or bypass/);
    expect(() => reviseCache(ready, { remedy: "restore", workflow: "magic" } as unknown as CacheRevisionOptions)).toThrow(/ledger or probes/);
    expect(() => reviewTicket(ready, ready.reviews[0].id, "approve", { remedy: "bypass" })).toThrow(/only/);
    expect(ready).toEqual(before);
    expect(reviseCache(ready, { remedy: "bypass" }).sessions[0].status).toBe("working");
  });

  it("keeps the numerical review gate honest even after explicit repair evidence", () => {
    const ready = cacheReview("spark");
    ready.sessions[0].context = 0;
    ready.repoHealth = 0;
    const checked = advanceGame(reviseCache(ready, { remedy: "bypass" }), 1.5);
    expect(getCacheReviewEvidence(checked, checked.reviews[0])!.signal).toContain("fresh");
    expect(isReviewBlocked(checked, checked.reviews[0])).toBe(true);
    const shipped = approveCache(checked);
    expect(shipped.stats.defects).toBe(1);
    expect(shipped.flags.cacheShortcut).toBe(false);
    expect(shipped.cacheOutcome).toBe("bypassed");
    expect(incidentIsOpen(shipped, "cache-shortcut")).toBe(false);
  });

  it("exposes repair evidence only after the requested pass finishes", () => {
    const ready = cacheReview();
    expect(getCacheReviewEvidence(ready, ready.reviews[0])).toBeNull();
    const originalReview = ready.reviews[0];
    const revised = reviseCache(ready, { remedy: "restore", workflow: "probes" });
    expect(getCacheReviewEvidence(revised, originalReview)).toBeNull();
    expect(revised.cacheOutcome).toBe("none");
    expect(getCacheRevisionQuote(revised, originalReview.id)).toBeNull();
  });

  it("keeps generic ticket revisions unchanged and rejects cache options on them", () => {
    const ready = advanceGame(startTicket(createInitialState(), 0, "deployment-banner", "ballad"), 5);
    expect(getCacheRevisionQuote(ready, ready.reviews[0].id)).toBeNull();
    expect(() => reviewTicket(ready, ready.reviews[0].id, "revise", { remedy: "bypass" })).toThrow(/only/);
    const revised = reviewTicket(ready, ready.reviews[0].id, "revise");
    expect(revised.sessions[0]).toMatchObject({ progress: 0.62, workDuration: null, cacheRemedy: null, cacheWorkflow: null });
  });

  it("keeps helper quota starvation fair and equivalent across coarse and fine time advancement", () => {
    const ready = cacheReview("forge");
    ready.providerQuota.openmind = 0.1;
    const revised = reviseCache(ready, { remedy: "restore", workflow: "probes" });
    const paused = advanceGame(revised, 1);
    expect(paused.sessions[0].status).toBe("quota-paused");
    expect(paused.sessions[1].status).toBe("supporting");
    expect(paused.sessions[0].progress).toBeCloseTo((0.1 + 0.9) / (2.8 * 1.5) / 3);
    const coarse = advanceGame(revised, 20);
    let fine = revised;
    for (let index = 0; index < 200; index += 1) fine = advanceGame(fine, 0.1);
    expect(coarse.stats.quotaSpent).toBeCloseTo(fine.stats.quotaSpent, 8);
    expect(coarse.providerQuota.openmind).toBeCloseTo(fine.providerQuota.openmind, 8);
    expect(coarse.sessions[0].context).toBeCloseTo(fine.sessions[0].context, 8);
    expect(coarse.reviews[0].createdAt).toBeCloseTo(fine.reviews[0].createdAt, 8);
    expect(coarse.reviews[0].risk).toBeCloseTo(fine.reviews[0].risk, 8);
    expect(coarse.reviews).toHaveLength(1);
    expect(coarse.sessions[1].status).toBe("idle");
    expect(coarse.stats.quotaSpent - revised.stats.quotaSpent).toBeCloseTo(3 * 2.8 * 1.5);
  });

  it("shares a depleted pool fairly between the probe team and an unrelated working session", () => {
    const ready = cacheReview("forge");
    const parallel = structuredClone(startTicket(ready, 2, "telemetry-toggle", "forge"));
    parallel.providerQuota.openmind = 0.1;
    const revised = reviseCache(parallel, { remedy: "restore", workflow: "probes" });
    const advanced = advanceGame(revised, 1);
    const actualWorkSeconds = (0.1 + 0.9) / (2.8 * 1.5 + 2.8);
    expect(advanced.sessions[0].progress).toBeCloseTo(actualWorkSeconds / 3);
    expect(advanced.sessions[2].progress).toBeCloseTo(actualWorkSeconds / (7 / 1.08));
    expect(advanced.stats.quotaSpent - revised.stats.quotaSpent).toBeCloseTo(1);
    expect(advanced.sessions[1].status).toBe("supporting");
    const coarse = advanceGame(revised, 45);
    let fine = revised;
    for (let index = 0; index < 450; index += 1) fine = advanceGame(fine, 0.1);
    expect(coarse.stats.quotaSpent).toBeCloseTo(fine.stats.quotaSpent, 8);
    expect(coarse.providerQuota.openmind).toBeCloseTo(fine.providerQuota.openmind, 8);
    expect(coarse.reviews).toHaveLength(2);
    expect(coarse.reviews.map((review) => review.createdAt)).toEqual(fine.reviews.map((review) => expect.closeTo(review.createdAt, 8)));
    expect(coarse.sessions[1].status).toBe("idle");
  });

  it("releases helper capacity before escalation and never awards the same delivery twice", () => {
    const checked = advanceGame(reviseCache(cacheReview("forge")), 3);
    const id = checked.reviews[0].id;
    const shipped = reviewTicket(checked, id, "escalate");
    expect(shipped.sessions.every((session) => session.supportForSessionId === null)).toBe(true);
    expect(shipped.stats.shipped).toBe(1);
    expect(shipped.cacheOutcome).toBe("restored");
    expect(() => reviewTicket(shipped, id, "approve")).toThrow(/no longer available/);
    expect(shipped.stats.shipped).toBe(1);
  });

  it("distinguishes fresh-fast, fresh-slow, and stale in subsequent review evidence and the ending", () => {
    const restored = approveCache(advanceGame(reviseCache(cacheReview()), 5));
    const bypassed = approveCache(advanceGame(reviseCache(cacheReview(), { remedy: "bypass" }), 1.5));
    const stale = approveCache(cacheReview());
    for (const ticketId of ["stale-customer-data", "investor-demo", "release-two"]) {
      expect(getCacheReviewEvidence(restored, callbackReview(ticketId))!.scope).toContain("speedup is retained");
      expect(getCacheReviewEvidence(bypassed, callbackReview(ticketId))!.scope).toContain("PERF-205 is optional");
      expect(getCacheReviewEvidence(stale, callbackReview(ticketId))!.scope).toContain("Stale");
    }
    expect(computeEnding(restored).message).toContain("dashboard speedup held");
    expect(computeEnding(bypassed).message).toContain("safe bypass");
    expect(computeEnding(stale).message).toContain("still served stale data");
  });

  it("restores the deferred performance promise through optional PERF-205 without counting it as a main ticket", () => {
    const bypassed = approveCache(advanceGame(reviseCache(cacheReview(), { remedy: "bypass" }), 1.5));
    const assigned = startTicket(bypassed, 0, CACHE_DECISIONS.followup.id, "ballad");
    const checked = advanceGame(assigned, 6);
    const review = checked.reviews.find((candidate) => candidate.ticketId === CACHE_DECISIONS.followup.id)!;
    expect(getCacheReviewEvidence(checked, review)!.scope).toContain("optional");
    const shipped = reviewTicket(checked, review.id, "approve");
    expect(shipped.trust - checked.trust).toBe(5);
    expect(shipped.cacheOutcome).toBe("restored");
    expect(computeEnding(shipped).scores.throughput).toBe(computeEnding(bypassed).scores.throughput + CACHE_DECISIONS.scopeCredit.speedup);
    expect(computeEnding(shipped).scoreDetails!.throughput).toContain("2 main tickets");
    const slow = { ...shipped, gameTime: 300 };
    expect(computeEnding(slow).scores.throughput).toBeLessThan(computeEnding(shipped).scores.throughput);
  });

  it("can finish the release with a legitimate bypass and no optional performance work", () => {
    let state = createInitialState();
    for (let turns = 0; turns < 80 && !state.ending; turns += 1) {
      const ticket = availableTickets(state).find((candidate) => !candidate.optional && !candidate.incidentFor);
      expect(ticket).toBeDefined();
      state = startTicket(state, 0, ticket!.id, "ballad");
      state = advanceGame(state, 60);
      let review = state.reviews[0];
      if (ticket!.id === "cache-summary") {
        state = reviewTicket(state, review.id, "revise", { remedy: "bypass" });
        state = advanceGame(state, 60);
        review = state.reviews[0];
      }
      while (isReviewBlocked(state, review)) {
        state = reviewTicket(state, review.id, "revise");
        state = advanceGame(state, 60);
        review = state.reviews[0];
      }
      state = reviewTicket(state, review.id, "approve");
    }
    expect(state.ending).not.toBeNull();
    expect(state.cacheOutcome).toBe("bypassed");
    expect(state.completedTicketIds).not.toContain(CACHE_DECISIONS.followup.id);
    expect(state.completedTicketIds).toHaveLength(content.tickets.filter((ticket) => !ticket.optional && !ticket.incidentFor).length);
    expect(state.stats.defects).toBe(0);
    expect(state.events.some((event) => event.title.includes("SEV-2"))).toBe(false);
    expect(state.ending!.message).toContain("safe bypass");
    expect(ticketById.get("release-two")!.prerequisites).not.toContain(CACHE_DECISIONS.followup.id);
  });
});
