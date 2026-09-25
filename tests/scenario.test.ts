import { describe, expect, it } from "vitest";
import { availableModels, availableTickets } from "../src/game/selectors";
import { advanceGame, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { content } from "../src/content";

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
        const model = [...models]
          .filter((candidate) => candidate.tier === ticket.recommendedTier)
          .sort((a, b) => (state.providerQuota[b.providerId] ?? 0) - (state.providerQuota[a.providerId] ?? 0))[0] ?? models[0];
        const canPlan = (state.providerQuota[model.providerId] ?? 0) >= 7;
        state = startTicket(state, session.id, ticket.id, model.id, ticket.baseRisk >= 0.35 && canPlan);
      }
      state = advanceGame(state, 20);
      for (const review of [...state.reviews]) {
        const ticket = content.tickets.find((candidate) => candidate.id === review.ticketId)!;
        const session = state.sessions[review.sessionId];
        state = reviewTicket(state, review.id, ticket.riskFlag !== "none" && session.reviewRound === 0 ? "revise" : "approve");
      }
    }

    expect(state.completedTicketIds).toHaveLength(content.tickets.filter((ticket) => !ticket.incidentFor).length);
    expect(state.ending).not.toBeNull();
    expect(state.ending?.scores.reliability).toBeGreaterThan(60);
    expect(state.gameTime).toBeLessThanOrEqual(400);
  });
});
