import type { GameState } from "../../src/game/types";
import { currentApi, type EvaluationApi } from "./api";

export function advanceToReview(source: GameState, api: EvaluationApi = currentApi, tick = 0.01, ownerId = 0) {
  let state = source;
  for (let steps = 0; steps < 120000; steps++) {
    if (state.reviews.some(review => review.sessionId === ownerId)) return state;
    state = api.advanceGame(state, tick);
  }
  throw new Error("Fixture did not reach review within 120000 ticks.");
}

/** Synthetic mutations are explicit; these are not claims about save prevalence. */
export function cacheFixture(options: { phase?: "active" | "review"; context?: number; quota?: number; helperOccupied?: boolean } = {}, api: EvaluationApi = currentApi) {
  let state = api.createInitialState();
  state.completedTicketIds = ["deployment-banner"];
  state.peakTrust = 100;
  state.trust = 50;
  state.unlockedSessions = 2;
  state = api.startTicket(state, 0, "cache-summary", "ballad");
  if ((options.phase ?? "review") === "review") state = advanceToReview(state, api);
  if (options.helperOccupied) state = api.startTicket(state, 1, "telemetry-toggle", "ballad");
  state = structuredClone(state);
  state.sessions[0].context = options.context ?? 100;
  state.providerQuota.anthill = options.quota ?? 60;
  return state;
}

export function cacheCounterfactuals(api: EvaluationApi = currentApi) {
  const results = [];
  for (const context of [0, 30, 100]) for (const quota of [0, 60]) for (const choice of ["ledger", "probes", "bypass", "escalate"] as const) {
    const initialState = cacheFixture({ context, quota }, api);
    let state = initialState;
    let error: string | undefined;
    try {
      state = api.reviewTicket(state, state.reviews[0].id, choice === "escalate" ? "escalate" : "revise", choice === "escalate" ? undefined : choice === "bypass" ? { remedy: "bypass" } : { remedy: "restore", workflow: choice });
      if (choice !== "escalate") state = advanceToReview(state, api);
    } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    results.push({ context, quota, choice, synthetic: true, elapsedSeconds: Math.round((state.gameTime - initialState.gameTime) * 1e6) / 1e6, quotaSpent: Math.round((state.stats.quotaSpent - initialState.stats.quotaSpent) * 1e6) / 1e6, risk: state.reviews[0]?.risk, blocked: state.reviews[0] ? api.isReviewBlocked(state, state.reviews[0]) : false, contextAfter: state.sessions[0].context, ...(error ? { error } : {}) });
  }
  return results;
}
