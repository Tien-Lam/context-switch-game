import { describe, expect, it } from "vitest";
import { availableModels, availableTickets } from "../src/game/selectors";
import { advanceGame, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";

describe("vertical slice", () => {
  it("can reach the authored ending without a deadlock", () => {
    let state = createInitialState();

    for (let step = 0; step < 40 && !state.ending; step += 1) {
      const ready = availableTickets(state);
      const models = availableModels(state);
      const idle = state.sessions.filter((session) => session.id < state.unlockedSessions && session.status === "idle");
      for (const [index, session] of idle.entries()) {
        const ticket = ready[index];
        if (!ticket) break;
        const model = models.find((candidate) => candidate.tier === ticket.recommendedTier) ?? models[0];
        state = startTicket(state, session.id, ticket.id, model.id, ticket.baseRisk >= 0.35);
      }
      state = advanceGame(state, 5000);
      for (const review of [...state.reviews]) {
        state = reviewTicket(state, review.id, "escalate");
      }
    }

    expect(state.completedTicketIds).toHaveLength(8);
    expect(state.ending).not.toBeNull();
    expect(state.ending?.scores.reliability).toBeGreaterThan(60);
  });
});
