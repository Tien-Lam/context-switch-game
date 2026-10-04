import { currentApi, type EvaluationApi } from "./api";
import { advanceToReview, cacheFixture } from "./fixtures";
import type { GameState } from "../../src/game/types";

/** Bounded, local opportunity-cost model; never a production scheduler or saved pending request. */
function fundCompaction(source: GameState, api: EvaluationApi) {
  const provider = api.content.providers.find(value => value.id === "anthill")!;
  const fundingSeconds = api.BALANCE.compactQuotaCost / provider.regenPerSecond;
  let state = structuredClone(source);
  const suspended = state.sessions.filter(session => ["working", "quota-paused"].includes(session.status) && api.modelById.get(session.modelId ?? "")?.providerId === provider.id).map(session => ({ id: session.id, status: session.status }));
  // Reserve incoming regeneration first: same-pool work makes zero progress during funding.
  for (const session of suspended) state.sessions[session.id].status = "awaiting-review";
  state = api.advanceGame(state, fundingSeconds);
  state = structuredClone(state);
  for (const session of suspended) state.sessions[session.id].status = session.status;
  state = api.compactSession(state, 0);
  return { state, fundingSeconds, samePoolCompetitors: suspended.length - 1 };
}

export function compactionExperiment(api: EvaluationApi = currentApi) {
  const results = [];
  for (const competitor of [false, true]) for (const funded of [false, true]) for (const recovery of ["ledger", "bypass", "escalate"] as const) {
    const initial = cacheFixture({ phase: "active", context: 30, quota: 0, helperOccupied: competitor }, api);
    let state = initial, successfulActions = 0, fundingSeconds = 0;
    if (funded) {
      const reservation = fundCompaction(state, api);
      state = reservation.state;
      fundingSeconds = reservation.fundingSeconds;
      successfulActions++;
    }
    state = advanceToReview(state, api);
    const firstReview = { elapsedSeconds: state.gameTime, context: state.sessions[0].context, risk: state.reviews.find(review => review.sessionId === 0)!.risk, blocked: api.isReviewBlocked(state, state.reviews.find(review => review.sessionId === 0)!) };
    let extraRevisionPasses = 0;
    for (let attempts = 0; attempts < 12 && !state.completedTicketIds.includes("cache-summary"); attempts++) {
      const review = state.reviews.find(value => value.sessionId === 0)!;
      if (recovery === "escalate") { state = api.reviewTicket(state, review.id, "escalate"); successfulActions++; break; }
      if (!api.isReviewBlocked(state, review)) { state = api.reviewTicket(state, review.id, "approve"); successfulActions++; break; }
      const options = recovery === "bypass" ? { remedy: "bypass" as const } : { remedy: "restore" as const, workflow: "ledger" as const };
      // Existing guidance: the review owner consumes no quota while it waits for setup funding.
      if (recovery === "ledger" && state.providerQuota.anthill < 3) {
        // A competing active same-pool job may consume regeneration until its review.
        for (let ticks = 0; ticks < 120000 && state.providerQuota.anthill < 3 - 1e-9; ticks++) state = api.advanceGame(state, 0.01);
        if (state.providerQuota.anthill < 3) state = api.advanceGame(state, 1e-8);
      }
      state = api.reviewTicket(state, review.id, "revise", options);
      successfulActions++; extraRevisionPasses++;
      state = advanceToReview(state, api);
    }
    const competingSession = state.sessions[1];
    results.push({ competitor, strategy: funded ? "hypothetical funded compact then guidance recovery" : "guidance-only existing recovery", recovery, fundingSeconds, firstReview, elapsedSeconds: Math.round(state.gameTime * 1e6) / 1e6, successfulActions, extraRevisionPasses, quotaSpent: Math.round((state.stats.quotaSpent - initial.stats.quotaSpent) * 1e6) / 1e6, contextAfter: state.sessions[0].context, scope: state.cacheOutcome, trust: state.trust, competingJobReviewAt: state.reviews.find(review => review.sessionId === 1)?.createdAt ?? null, competingJobProgress: competingSession.progress });
  }
  return { evidence: "synthetic local funding model, not a pending-state scheduler or browser play", recommendation: "reject production reservation for this demonstrated cache scenario", reason: "Context recovery does not clear the authored first-pass gate; existing ledger recovery already passes. Reservation adds an action, quota and same-pool delay. This bounded evidence does not establish every possible low-context route.", untested: ["production reservation cancellation/import/helper teardown", "coarse/fine/jitter/offline pending-state equivalence", "independent browser explanation of opportunity cost", "naturally occurring prevalence"], results };
}
