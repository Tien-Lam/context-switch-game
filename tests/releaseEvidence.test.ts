import { describe, expect, it } from "vitest";
import { content, modelById } from "../src/content";
import { CACHE_DECISIONS } from "../src/content/cacheDecisions";
import { getCacheScopeCredit, getQuotaThrottleCue, getReviewEvidence, getRevisionQuote } from "../src/game/decisionDepth";
import { advanceGame, compactSession, computeEnding, mitigateIncident, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { availableModels, availableTickets, incidentIsOpen, isReviewBlocked } from "../src/game/selectors";
import type { GameState } from "../src/game/types";

function untilReview(source: GameState) {
  let state = source;
  for (let i = 0; i < 3000 && !state.reviews.length; i++) state = advanceGame(state, 0.05);
  expect(state.reviews.length).toBeGreaterThan(0);
  return state;
}

/** Reach the audited mixed release route, including actual gateway containment/repair. */
function releaseRoute(repairCheckout = false, preventFindings = false) {
  let state = createInitialState();
  const route = [
    ["deployment-banner", "couplet"], ["telemetry-toggle", "forge"], ["cache-summary", "forge"],
    ["runtime-upgrade", "epic"], ["webhook-backoff", "forge"], ["parallel-reports", "foundry"],
    ["quota-display", "couplet"], ["stale-customer-data", "foundry"], ["investor-demo", "epic"],
    ["green-build", "forge"], ...(repairCheckout ? [["test-integrity-repair", "ballad"]] : []),
    ["account-api", "forge"], ["account-panel", "ballad"], ["contract-join", "couplet"],
    ["helpful-retry", "forge"], ["gateway-rollout", "forge"], ...(!preventFindings ? [["retry-repair", "ballad"]] : []),
    ["release-two", "foundry"],
  ];
  let demoBefore = "";
  let demoAfter = "";
  for (const [ticketId, modelId] of route) {
    if (ticketId === "retry-repair") {
      expect(state.incidentResponse).toBe("active");
      expect(availableTickets(state).some((ticket) => ticket.id === "release-two")).toBe(false);
      state = mitigateIncident(state, "rate-limit");
      expect(availableTickets(state).some((ticket) => ticket.id === "release-two")).toBe(false);
    }
    while (state.providerQuota[modelById.get(modelId)!.providerId] < 2) state = advanceGame(state, 1);
    state = untilReview(startTicket(state, 0, ticketId, modelId));
    if (ticketId === "cache-summary") state = untilReview(reviewTicket(state, state.reviews[0].id, "revise", { remedy: "bypass" }));
    if (ticketId === "investor-demo") demoBefore = getReviewEvidence(state, state.reviews[0])!.tests;
    const accept = !preventFindings && ["telemetry-toggle", "green-build", "helpful-retry"].includes(ticketId);
    while (!accept && isReviewBlocked(state, state.reviews[0])) {
      const review = state.reviews[0];
      state = reviewTicket(state, review.id, "revise");
      if (ticketId === "investor-demo") expect(getReviewEvidence(state, review)!.tests).not.toContain("additional pass completed");
      state = untilReview(state);
    }
    if (ticketId === "investor-demo") demoAfter = getReviewEvidence(state, state.reviews[0])!.tests;
    if (ticketId === "release-two") return { state, demoBefore, demoAfter };
    state = reviewTicket(state, state.reviews[0].id, "approve");
  }
  throw new Error("Route did not reach release review");
}

describe("honest release verification", () => {
  it("reaches the mixed release, retains open checkout/privacy risks, and changes completed demo recheck evidence", () => {
    const { state, demoBefore, demoAfter } = releaseRoute();
    expect(demoAfter).not.toBe(demoBefore);
    expect(demoAfter).toContain("additional pass completed");
    expect(state.incidentResponse).toBe("resolved");
    expect(incidentIsOpen(state, "request-loop")).toBe(false);
    const evidence = getReviewEvidence(state, state.reviews[0])!;
    const plannedInitial = structuredClone(state);
    plannedInitial.sessions[0].briefImproved = true;
    plannedInitial.sessions[0].reviewRound = 0;
    plannedInitial.reviews[0].risk = 0.1;
    expect(getReviewEvidence(plannedInitial, plannedInitial.reviews[0])!.tests).not.toContain("additional pass completed");
    expect(evidence.tests).toContain("checkout rounding is unresolved");
    expect(evidence.tests).toContain("privacy still defaults to enabled");
    expect(evidence.tests).toContain("FIX-502 stopped");
    expect(evidence.tests).not.toContain("Checkout checks pass");
    expect(evidence.scope).toContain("PERF-205 is optional");
    const recheck = untilReview(reviewTicket(state, state.reviews[0].id, "revise"));
    const checked = getReviewEvidence(recheck, recheck.reviews[0])!;
    expect(checked.summary).toContain("Rechecked");
    expect(checked.tests).toContain("checkout rounding is unresolved");
    expect(checked.tests).toContain("privacy still defaults to enabled");
    const shipped = reviewTicket(recheck, recheck.reviews[0].id, "approve");
    expect(shipped.ending).not.toBeNull();
    expect(shipped.ending!.title).toContain("Known risks remain");
    expect(shipped.ending!.message).toContain("green build hid a checkout defect");
    expect(shipped.completedTicketIds).not.toContain("test-integrity-repair");
  });

  it("credits an actual checkout repair while retaining escaped-defect history", () => {
    const { state } = releaseRoute(true);
    const evidence = getReviewEvidence(state, state.reviews[0])!;
    expect(evidence.tests).toContain("FIX-401 restored the assertion");
    expect(evidence.tests).not.toContain("checkout rounding is unresolved");
    expect(state.stats.defects).toBeGreaterThan(0);
    expect(computeEnding(state).scoreDetails!.reliability).toContain(`${state.stats.defects} escaped defects`);
  });

  it("keeps original-ticket revisions able to prevent the checkout finding and distinguishes clean, repaired and live acknowledgments", () => {
    const { state } = releaseRoute(false, true);
    expect(state.flags.testIntegrityAccepted).toBe(false);
    expect(getReviewEvidence(state, state.reviews[0])!.tests).toContain("original assertion intact");
    expect(computeEnding(state).message).toContain("Review prevented");
    const repaired = structuredClone(state);
    repaired.flags.testIntegrityAccepted = true;
    repaired.completedTicketIds.push("test-integrity-repair");
    repaired.stats.defects = 3;
    expect(computeEnding(repaired).title).toContain("repairs held");
    expect(computeEnding(repaired).message).toContain("checkout coverage was restored");
    expect(computeEnding(repaired).message).toContain("historical costs");
    const open = structuredClone(repaired);
    open.flags.privacyDefaultedOn = true;
    expect(computeEnding(open).title).toContain("Known risks remain");
    expect(computeEnding(open).message).toContain("remaining risks");
    expect(computeEnding(open).scores.reliability).toBe(computeEnding(repaired).scores.reliability);
  });
});

function cacheReview() {
  const state = createInitialState();
  state.completedTicketIds = ["deployment-banner"];
  state.unlockedSessions = 3;
  state.peakTrust = 100;
  return structuredClone(untilReview(startTicket(state, 0, "cache-summary", "forge")));
}

describe("rule-derived work and throttle quotes", () => {
  it("quotes the existing generic progress setback and context semantics for legacy low work", () => {
    const state = untilReview(startTicket(createInitialState(), 0, "deployment-banner", "ballad", false, "low"));
    expect(state.events.find((event) => event.title.includes("APP-101 →"))!.message).toContain("Choose medium for future assignments");
    expect(state.events.find((event) => event.title.includes("APP-101 →"))!.message).not.toContain("saved setup quota");
    const quote = getRevisionQuote(state, state.reviews[0].id)!;
    expect(quote).toMatchObject({ seconds: 4 * 0.38, setupQuota: 0, quotaRate: 2.6, helperQuotaRate: 0, contextGain: 6, providerId: "anthill" });
    const started = reviewTicket(state, state.reviews[0].id, "revise");
    expect(started.sessions[0].context).toBe(quote.contextAfterSetup);
    expect(started.providerQuota).toEqual(state.providerQuota);
    expect(started.events[0].message).toContain(`${quote.seconds} work-seconds`);
    const checked = advanceGame(started, quote.seconds);
    expect(checked.sessions[0].status).toBe("awaiting-review");
    expect(checked.sessions[0].context).toBeCloseTo(quote.contextAfterWork);
    expect(checked.stats.quotaSpent - started.stats.quotaSpent).toBeCloseTo(quote.seconds * quote.quotaRate);
  });

  it("distinguishes setup from owner/helper drain and explains a starved three-work-second pass", () => {
    const state = cacheReview();
    state.providerQuota.openmind = 0;
    const quote = getRevisionQuote(state, state.reviews[0].id)!;
    expect(quote).toMatchObject({ seconds: 3, setupQuota: 0, quotaRate: 2.8, helperQuotaRate: 1.4 });
    const cue = getQuotaThrottleCue(state, { sessionId: 0, modelId: "forge", seconds: quote.seconds, helperNeeded: true })!;
    expect(cue.message).toContain("Owner and helper share");
    expect(cue.independentProviderIds).toEqual(["anthill"]);
    const started = reviewTicket(state, state.reviews[0].id, "revise");
    const coarse = advanceGame(started, 20);
    let fine = started;
    let jittered = started;
    for (let i = 0; i < 200; i++) fine = advanceGame(fine, 0.1);
    for (let i = 0; i < 100; i++) {
      jittered = advanceGame(jittered, 0.03);
      jittered = advanceGame(jittered, 0.17);
    }
    expect(coarse.reviews[0].createdAt - started.gameTime).toBeCloseTo(14);
    for (const result of [coarse, fine, jittered]) {
      expect(result.reviews[0].createdAt).toBeCloseTo(coarse.reviews[0].createdAt, 8);
      expect(result.sessions[0].context).toBeCloseTo(quote.contextAfterWork, 8);
      expect(result.stats.quotaSpent - started.stats.quotaSpent).toBeCloseTo((quote.quotaRate + quote.helperQuotaRate) * quote.seconds, 8);
    }
    expect(state.sessions[0].modelId).toBe("forge");
  });

  it("keeps funded solo output brief, detects depleted solo and shared pools, and ignores early-finishing commitments", () => {
    const state = cacheReview();
    const input = { sessionId: 0, modelId: "forge", seconds: 3 };
    state.providerQuota.openmind = 55;
    expect(getQuotaThrottleCue(state, input)).toBeNull();
    state.providerQuota.openmind = 0;
    expect(getQuotaThrottleCue(state, input)!.message).toContain("This pool will throttle");
    state.providerQuota.anthill = 0;
    expect(getQuotaThrottleCue(state, input)!.independentProviderIds).toEqual([]);
    state.providerQuota.openmind = 10;
    const shared = structuredClone(startTicket(state, 1, "telemetry-toggle", "forge"));
    expect(getQuotaThrottleCue(shared, input)!.sharedSessions).toEqual([1]);
    expect(getQuotaThrottleCue(shared, input)!.message).toContain("concurrent sessions");
    shared.sessions[1].progress = 0.999;
    expect(getQuotaThrottleCue(shared, input)).toBeNull();
  });
});

describe("authored progression event hints", () => {
  it("announces the third-session pane command at the actual unlock", () => {
    let state = createInitialState();
    for (const ticketId of ["deployment-banner", "telemetry-toggle", "cache-summary"]) {
      state = untilReview(startTicket(state, 0, ticketId, "ballad"));
      while (isReviewBlocked(state, state.reviews[0])) state = untilReview(reviewTicket(state, state.reviews[0].id, "revise"));
      state = reviewTicket(state, state.reviews[0].id, "approve");
    }
    expect(state.unlockedSessions).toBe(3);
    expect(state.events.find((event) => event.title === "Session 3 unlocked")!.message).toContain("pane split quota");
  });
});

/** The audited parallel revise-warning policy, with the scope choice as its only input. */
function scopeRoute(remedy: "restore" | "bypass", optional = false) {
  let state = createInitialState();
  for (let steps = 0; steps < 24000 && !state.ending; steps++) {
    for (const review of [...state.reviews]) {
      const decision = isReviewBlocked(state, review) ? "revise" : "approve";
      state = reviewTicket(state, review.id, decision, review.ticketId === "cache-summary" && decision === "revise" && remedy === "bypass" ? { remedy } : undefined);
    }
    for (const session of state.sessions) {
      if (["working", "quota-paused"].includes(session.status) && session.context < 40) {
        try { state = compactSession(state, session.id); } catch { /* The policy compacts only when currently funded. */ }
      }
    }
    for (const session of state.sessions.filter((candidate) => candidate.id < state.unlockedSessions && candidate.status === "idle")) {
      const ticket = availableTickets(state).filter((candidate) => !candidate.optional || optional)
        .sort((a, b) => Number(Boolean(b.incidentFor)) - Number(Boolean(a.incidentFor)) || Number(a.kind === "finale") - Number(b.kind === "finale"))[0];
      if (!ticket || state.ending) break;
      const models = availableModels(state);
      const desired = models.filter((model) => model.tier === ticket.recommendedTier);
      const model = (desired.length ? desired : models).filter((choice) => state.providerQuota[choice.providerId] >= 2)
        .sort((a, b) => state.providerQuota[b.providerId] - state.providerQuota[a.providerId] || b.speed - a.speed)[0];
      if (model) state = startTicket(state, session.id, ticket.id, model.id);
    }
    state = advanceGame(state, 0.05);
  }
  expect(state.ending).not.toBeNull();
  return state;
}

describe("delivered cache scope accounting", () => {
  it("splits the existing contribution, distinguishes equal-time outcomes, and restores deferred credit only once", () => {
    expect(CACHE_DECISIONS.scopeCredit.freshness + CACHE_DECISIONS.scopeCredit.speedup).toBe(5);
    const bypass = createInitialState();
    bypass.completedTicketIds = ["deployment-banner", "cache-summary"];
    bypass.cacheOutcome = "bypassed";
    bypass.trust = 100;
    const restored = { ...bypass, cacheOutcome: "restored" as const };
    expect(getCacheScopeCredit(bypass)).toMatchObject({ freshness: 4, speedup: 0, delivered: 4, deferred: 1, total: 5 });
    expect(computeEnding(restored).scores.throughput - computeEnding(bypass).scores.throughput).toBe(1);
    const followup = { ...restored, completedTicketIds: [...restored.completedTicketIds, "cache-followup"] };
    expect(computeEnding(followup).scores.throughput).toBe(computeEnding(restored).scores.throughput);
    expect(computeEnding(bypass).scoreDetails!.throughput).toContain("4/5");
    expect(computeEnding(followup).scoreDetails!.throughput).toContain("5/5");
    expect(computeEnding(followup).scoreDetails!.throughput).toContain("2 main tickets");
  });

  it("preserves a speed-first bypass and a scope-completion restore/followup objective in matched full routes", () => {
    const restore = scopeRoute("restore");
    const bypass = scopeRoute("bypass");
    const followup = scopeRoute("bypass", true);
    expect(bypass.gameTime).toBeLessThan(restore.gameTime);
    expect(bypass.gameTime).toBeLessThan(followup.gameTime);
    expect(restore.ending!.scores.throughput).toBeGreaterThan(bypass.ending!.scores.throughput);
    expect(followup.ending!.scores.throughput).toBeGreaterThan(bypass.ending!.scores.throughput);
    expect(restore.stats.revisions).toBe(bypass.stats.revisions);
    expect(restore.stats.defects).toBe(0);
    expect(bypass.stats.defects).toBe(0);
    expect(followup.stats.defects).toBe(0);
    expect(bypass.completedTicketIds).not.toContain("cache-followup");
    expect(followup.completedTicketIds.filter((id) => id === "cache-followup")).toHaveLength(1);
    expect(restore.completedTicketIds.filter((id) => !content.tickets.find((ticket) => ticket.id === id)?.optional).length)
      .toBe(bypass.completedTicketIds.length);
  });
});
