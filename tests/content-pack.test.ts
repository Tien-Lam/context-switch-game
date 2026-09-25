import { describe, expect, it } from "vitest";
import { buyUpgrade, advanceGame, mitigateIncident, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { availableTickets, incidentIsOpen, isReviewBlocked } from "../src/game/selectors";
import { evaluateCommand } from "../src/ui/cli";

function readyFor(ticketIds: string[]) {
  const state = createInitialState();
  state.completedTicketIds = ticketIds;
  state.unlockedSessions = 3;
  return state;
}

function finish(state: ReturnType<typeof createInitialState>, ticketId: string, decision: "approve" | "revise" | "escalate" = "approve", modelId = "ballad") {
  const session = state.sessions.find((candidate) => candidate.status === "idle")!;
  const working = startTicket(state, session.id, ticketId, modelId);
  const awaiting = advanceGame(working, 15);
  const review = awaiting.reviews.find((candidate) => candidate.ticketId === ticketId)!;
  return reviewTicket(awaiting, review.id, decision);
}

describe("second chapter content pack", () => {
  it("turns the investor demo into a checkpoint and exposes the green build", () => {
    const state = readyFor(["investor-demo"]);
    expect(state.ending).toBeNull();
    expect(availableTickets(state).map((ticket) => ticket.id)).toContain("green-build");
    expect(() => buyUpgrade(state, "ci-integrity-guard")).toThrow(/QA-401/);
  });

  it("makes a green badge insufficient evidence and opens a traceable repair", () => {
    let state = readyFor(["investor-demo"]);
    state = startTicket(state, 0, "green-build", "ballad");
    state = advanceGame(state, 6);
    expect(isReviewBlocked(state, state.reviews[0])).toBe(true);
    expect(evaluateCommand("reviews read QA-401", state).messages[0].text).toContain("failing assertion was removed");
    state = reviewTicket(state, state.reviews[0].id, "approve");
    expect(state.flags.testIntegrityAccepted).toBe(true);
    expect(availableTickets(state).map((ticket) => ticket.id)).toContain("test-integrity-repair");
    expect(() => buyUpgrade(state, "ci-integrity-guard")).toThrow(/FIX-401/);
    state = finish(state, "test-integrity-repair");
    state = buyUpgrade(state, "ci-integrity-guard");
    expect(state.purchasedUpgradeIds).toContain("ci-integrity-guard");
  });

  it("explains when a two-branch repair is not ready yet", () => {
    let state = readyFor(["investor-demo", "green-build"]);
    state = finish(state, "account-api", "approve");
    const event = state.events.find((candidate) => candidate.title === "API-420 opened follow-up work");

    expect(availableTickets(state).map((ticket) => ticket.id)).not.toContain("contract-repair");
    expect(event?.message).toContain("FIX-420 unlocks after UI-421 ship");
    expect(event?.message).not.toContain("customer-visible");
  });

  it("makes the unlocked CI guard improve later review risk", () => {
    const state = readyFor(["investor-demo", "green-build"]);
    const baseline = advanceGame(startTicket(state, 0, "account-api", "ballad"), 8);
    const guarded = advanceGame(startTicket(buyUpgrade(state, "ci-integrity-guard"), 0, "account-api", "ballad"), 8);
    expect(guarded.reviews[0].risk).toBeCloseTo(baseline.reviews[0].risk - 0.05);
  });

  it("turns an unrepaired green-build shortcut into a later customer issue once", () => {
    let state = readyFor(["investor-demo", "green-build", "account-api"]);
    state.flags.testIntegrityAccepted = true;
    state = finish(state, "account-panel", "escalate");
    expect(state.flags.testConsequenceApplied).toBe(true);
    expect(state.events.filter((event) => event.title === "Invoice totals drifted by one cent")).toHaveLength(1);
    const trustAfter = state.trust;
    state = finish(state, "contract-join");
    expect(state.trust).toBeGreaterThan(trustAfter);
    expect(state.events.filter((event) => event.title === "Invoice totals drifted by one cent")).toHaveLength(1);
  });

  it("lets parallel branches pass alone, then blocks their join until the contract is repaired", () => {
    let state = readyFor(["investor-demo", "green-build"]);
    state = startTicket(state, 0, "account-api", "ballad");
    state = startTicket(state, 1, "account-panel", "spark");
    state = advanceGame(state, 10);
    expect(state.sessions[0].workedInParallel).toBe(true);
    expect(state.sessions[1].workedInParallel).toBe(true);
    for (const review of [...state.reviews]) state = reviewTicket(state, review.id, "approve");
    expect(state.flags.contractMismatchAccepted).toBe(true);
    expect(state.events.filter((event) => event.title === "Cross-branch contract failed")).toHaveLength(1);
    expect(availableTickets(state).map((ticket) => ticket.id)).not.toContain("contract-join");
    expect(availableTickets(state).map((ticket) => ticket.id)).toContain("contract-repair");
    state = finish(state, "contract-repair");
    expect(incidentIsOpen(state, "contract-mismatch")).toBe(false);
    expect(availableTickets(state).map((ticket) => ticket.id)).toContain("contract-join");
  });

  it("rewards fixing the retry before the gateway rollout", () => {
    let state = readyFor(["investor-demo", "green-build", "account-api", "account-panel", "contract-join"]);
    state = finish(state, "helpful-retry");
    expect(incidentIsOpen(state, "request-loop")).toBe(true);
    state = finish(state, "retry-repair");
    state = finish(state, "gateway-rollout");
    expect(state.incidentResponse).toBe("none");
    expect(state.events.some((event) => event.title === "Gateway canary stayed healthy")).toBe(true);
    expect(availableTickets(state).map((ticket) => ticket.id)).toContain("release-two");
  });

  it("requires containment before an active incident can be repaired", () => {
    let state = readyFor(["investor-demo", "green-build", "account-api", "account-panel", "contract-join", "helpful-retry"]);
    state.flags.requestLoopAccepted = true;
    state = finish(state, "gateway-rollout");
    expect(state.incidentResponse).toBe("active");
    expect(availableTickets(state).map((ticket) => ticket.id)).not.toContain("retry-repair");
    expect(evaluateCommand("incident status", state).messages[0].text).toContain("each render creates a fresh request-options object");
    expect(evaluateCommand("incident mitigate rollback", state).effect).toEqual({ type: "mitigate", action: "rollback" });

    const rolledBack = mitigateIncident(state, "rollback");
    const rateLimited = mitigateIncident(state, "rate-limit");
    expect(rolledBack.trust).toBe(rateLimited.trust - 2);
    expect(rolledBack.debt).toBe(rateLimited.debt - 2);
    expect(availableTickets(rolledBack).map((ticket) => ticket.id)).toContain("retry-repair");

    const healthBeforeScale = state.repoHealth;
    const scaled = mitigateIncident(state, "scale");
    expect(scaled.incidentResponse).toBe("scaled");
    expect(scaled.repoHealth).toBe(Math.min(100, healthBeforeScale + 8));
    expect(scaled.events[0].message).toContain("stabilized service and protected repository health");
    expect(availableTickets(scaled).map((ticket) => ticket.id)).not.toContain("retry-repair");
    expect(availableTickets(scaled).map((ticket) => ticket.id)).not.toContain("release-two");
    expect(mitigateIncident(scaled, "rate-limit").incidentResponse).toBe("rate-limited");

    state = finish(rateLimited, "retry-repair");
    expect(state.incidentResponse).toBe("resolved");
    expect(availableTickets(state).map((ticket) => ticket.id)).toContain("release-two");
  });
});
