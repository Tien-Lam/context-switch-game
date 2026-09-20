import { describe, expect, it } from "vitest";
import { advanceGame, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { availableModels } from "../src/game/selectors";
import { content } from "../src/content";

describe("agent simulation", () => {
  it("moves completed work into a separate review queue", () => {
    const initial = createInitialState();
    const assigned = startTicket(initial, 0, "deployment-banner", "couplet", true);
    const stillWorking = advanceGame(assigned, 2);
    const completed = advanceGame(stillWorking, 2);

    expect(stillWorking.sessions[0].status).toBe("working");
    expect(completed.sessions[0].status).toBe("awaiting-review");
    expect(completed.reviews).toHaveLength(1);
    expect(completed.completedTicketIds).not.toContain("deployment-banner");
  });

  it("keeps every intended ticket run below sixteen seconds", () => {
    for (const ticket of content.tickets) {
      const candidates = content.models.filter((model) => model.tier === ticket.recommendedTier);
      expect(candidates.length).toBeGreaterThan(0);
      expect(Math.min(...candidates.map((model) => ticket.duration / model.speed))).toBeLessThanOrEqual(16);
    }
  });

  it("turns exhausted attention into rushed-review debt instead of blocking play", () => {
    const assigned = startTicket(createInitialState(), 0, "deployment-banner", "ballad");
    const ready = advanceGame(assigned, 5);
    const exhausted = { ...ready, attention: 0 };
    const reviewed = reviewTicket(exhausted, exhausted.reviews[0].id, "approve");

    expect(reviewed.completedTicketIds).toContain("deployment-banner");
    expect(reviewed.attention).toBe(0);
    expect(reviewed.debt).toBeGreaterThan(exhausted.debt);
    expect(reviewed.events.some((event) => event.title.includes("review rushed"))).toBe(true);
  });

  it("starts with both providers and unlocks parallel execution after the first shipped ticket", () => {
    let state = createInitialState();
    expect(availableModels(state).map((model) => model.id)).toEqual(expect.arrayContaining(["ballad", "spark"]));
    state = startTicket(state, 0, "deployment-banner", "ballad");
    state = advanceGame(state, 5);
    state = reviewTicket(state, state.reviews[0].id, "escalate");
    expect(state.unlockedSessions).toBe(2);
    state = startTicket(state, 0, "telemetry-toggle", "ballad", true);
    state = advanceGame(state, 8);
    state = reviewTicket(state, state.reviews[0].id, "escalate");

    expect(state.unlockedSessions).toBe(2);
    expect(state.completedTicketIds).toEqual(expect.arrayContaining(["deployment-banner", "telemetry-toggle"]));
    expect(state.events.some((event) => event.title.includes("Parallel operator"))).toBe(true);
  });

  it("turns a rushed cache review into a later traceable incident", () => {
    let state = createInitialState();
    const finish = (ticketId: string, decision: "approve" | "escalate", modelId = "ballad") => {
      const idle = state.sessions.find((session) => session.id < state.unlockedSessions && session.status === "idle");
      expect(idle).toBeDefined();
      state = startTicket(state, idle!.id, ticketId, modelId);
      state = advanceGame(state, 20);
      const review = state.reviews.find((candidate) => candidate.ticketId === ticketId);
      expect(review).toBeDefined();
      state = reviewTicket(state, review!.id, decision);
    };

    finish("deployment-banner", "escalate");
    finish("telemetry-toggle", "escalate");
    finish("cache-summary", "approve");
    finish("runtime-upgrade", "escalate", "spark");
    finish("parallel-reports", "escalate", "spark");
    finish("quota-display", "escalate", "couplet");

    expect(state.flags.cacheShortcut).toBe(true);
    expect(state.flags.incidentAnnounced).toBe(true);
    expect(state.events.some((event) => event.title.includes("SEV-2"))).toBe(true);
    expect(state.events.find((event) => event.title.includes("SEV-2"))?.message).toContain("PERF-204");
  });
});
