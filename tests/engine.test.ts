import { describe, expect, it } from "vitest";
import { advanceGame, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { availableModels } from "../src/game/selectors";

describe("agent simulation", () => {
  it("moves completed work into a separate review queue", () => {
    const initial = createInitialState();
    const assigned = startTicket(initial, 0, "deployment-banner", "couplet", true);
    const completed = advanceGame(assigned, 500);

    expect(completed.sessions[0].status).toBe("awaiting-review");
    expect(completed.reviews).toHaveLength(1);
    expect(completed.completedTicketIds).not.toContain("deployment-banner");
  });

  it("starts with both providers and unlocks parallel execution after two shipped tickets", () => {
    let state = createInitialState();
    expect(availableModels(state).map((model) => model.id)).toEqual(expect.arrayContaining(["ballad", "spark"]));
    state = startTicket(state, 0, "deployment-banner", "ballad");
    state = advanceGame(state, 800);
    state = reviewTicket(state, state.reviews[0].id, "escalate");
    state = startTicket(state, 0, "telemetry-toggle", "ballad", true);
    state = advanceGame(state, 1000);
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
      state = advanceGame(state, 3000);
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
