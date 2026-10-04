import { modelById } from "../../src/content";
import { advanceGame, mitigateIncident, reviewTicket, startTicket } from "../../src/game/engine";
import { createInitialState } from "../../src/game/initialState";
import { isReviewBlocked } from "../../src/game/selectors";
import type { GameState } from "../../src/game/types";

function finishWork(source: GameState) {
  let state = source;
  for (let tick = 0; tick < 3000 && !state.reviews.length; tick++) state = advanceGame(state, 0.05);
  if (!state.reviews.length) throw new Error("Fixture work exceeded its bound");
  return state;
}

/** Source-informed reachable route, not a first-player run or synthetic impossible finale. */
export function mixedReleaseReview() {
  let state = createInitialState();
  const route = [
    ["deployment-banner", "couplet"], ["telemetry-toggle", "forge"], ["cache-summary", "forge"],
    ["runtime-upgrade", "epic"], ["webhook-backoff", "forge"], ["parallel-reports", "foundry"],
    ["quota-display", "couplet"], ["stale-customer-data", "foundry"], ["investor-demo", "epic"],
    ["green-build", "forge"], ["account-api", "forge"], ["account-panel", "ballad"],
    ["contract-join", "couplet"], ["helpful-retry", "forge"], ["gateway-rollout", "forge"],
    ["retry-repair", "ballad"], ["release-two", "foundry"],
  ];
  for (const [ticketId, modelId] of route) {
    if (ticketId === "retry-repair") state = mitigateIncident(state, "rate-limit");
    for (let wait = 0; state.providerQuota[modelById.get(modelId)!.providerId] < 2; wait++) {
      if (wait > 1000) throw new Error("Fixture funding exceeded its bound");
      state = advanceGame(state, 1);
    }
    state = finishWork(startTicket(state, 0, ticketId, modelId));
    if (ticketId === "cache-summary") state = finishWork(reviewTicket(state, state.reviews[0].id, "revise", { remedy: "bypass" }));
    const acceptRisk = ["telemetry-toggle", "green-build", "helpful-retry"].includes(ticketId);
    for (let pass = 0; !acceptRisk && isReviewBlocked(state, state.reviews[0]); pass++) {
      if (pass > 12) throw new Error("Fixture review exceeded its bound");
      state = finishWork(reviewTicket(state, state.reviews[0].id, "revise"));
    }
    if (ticketId === "release-two") return state;
    state = reviewTicket(state, state.reviews[0].id, "approve");
  }
  throw new Error("Fixture did not reach SHIP-2");
}
