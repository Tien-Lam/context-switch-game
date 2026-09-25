import { describe, expect, it } from "vitest";
import { advanceGame, compactSession, computeEnding, GameRuleError, mitigateIncident, reviewTicket, startTicket } from "../src/game/engine";
import { BALANCE } from "../src/game/balance";
import { createInitialState } from "../src/game/initialState";
import { availableModels, availableTickets, incidentIsOpen, isReviewBlocked, visibleTickets } from "../src/game/selectors";
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

  it("lets the player approve directly from review evidence without spending a human resource", () => {
    const assigned = startTicket(createInitialState(), 0, "deployment-banner", "ballad");
    const ready = advanceGame(assigned, 5);
    const quotaBeforeReview = ready.providerQuota.anthill;
    const trustBeforeReview = ready.trust;
    const reviewed = reviewTicket(ready, ready.reviews[0].id, "approve");

    expect(reviewed.completedTicketIds).toContain("deployment-banner");
    expect(reviewed.providerQuota.anthill).toBe(quotaBeforeReview);
    expect(reviewed.trust).toBeGreaterThan(trustBeforeReview);
    expect(reviewed.events.some((event) => event.title.includes("review rushed"))).toBe(false);
  });

  it("charges planning and compaction to the active provider quota", () => {
    const initial = createInitialState();
    const assigned = startTicket(initial, 0, "deployment-banner", "ballad", true);
    expect(assigned.providerQuota.anthill).toBe(initial.providerQuota.anthill - BALANCE.improvedBriefQuotaCost);

    const compacted = compactSession(assigned, 0);
    expect(compacted.providerQuota.anthill).toBe(assigned.providerQuota.anthill - BALANCE.compactQuotaCost);
    expect(compacted.sessions[0].context).toBe(88);
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
    finish("webhook-backoff", "escalate");
    finish("parallel-reports", "escalate", "spark");
    finish("quota-display", "escalate", "couplet");

    expect(state.flags.cacheShortcut).toBe(true);
    expect(state.flags.incidentAnnounced).toBe(true);
    expect(state.events.some((event) => event.title.includes("SEV-2"))).toBe(true);
    expect(state.events.find((event) => event.title.includes("SEV-2"))?.message).toContain("PERF-204");
  });

  it("finishes fractional work smaller than a normal UI pulse", () => {
    const state = structuredClone(startTicket(createInitialState(), 0, "deployment-banner", "ballad"));
    state.sessions[0].progress = 0.999;

    const advanced = advanceGame(state, 0.25);

    expect(advanced.sessions[0].progress).toBe(1);
    expect(advanced.sessions[0].status).toBe("awaiting-review");
    expect(advanced.reviews).toHaveLength(1);
  });

  it("shares a depleted provider fairly between simultaneous sessions", () => {
    let state = createInitialState();
    state = startTicket(state, 0, "deployment-banner", "ballad");
    state = advanceGame(state, 5);
    state = reviewTicket(state, state.reviews[0].id, "approve");
    state = startTicket(state, 0, "telemetry-toggle", "ballad");
    state = startTicket(state, 1, "cache-summary", "ballad");
    state = structuredClone(state);
    state.providerQuota.anthill = 0;

    const advanced = advanceGame(state, 1);
    const firstWorkSeconds = advanced.sessions[0].progress * 7;
    const secondWorkSeconds = advanced.sessions[1].progress * 8;

    expect(firstWorkSeconds).toBeCloseTo(secondWorkSeconds, 10);
    expect(firstWorkSeconds).toBeGreaterThan(0);
    expect(advanced.sessions[0].status).toBe("quota-paused");
    expect(advanced.sessions[1].status).toBe("quota-paused");
    expect(advanced.stats.quotaSpent - state.stats.quotaSpent).toBeCloseTo(content.providers.find((provider) => provider.id === "anthill")!.regenPerSecond, 10);
  });

  it("keeps generated event IDs stable across elapsed-time partitions", () => {
    const setup = () => {
      let state = createInitialState();
      state = startTicket(state, 0, "deployment-banner", "ballad");
      state = advanceGame(state, 5);
      state = reviewTicket(state, state.reviews[0].id, "approve");
      state = startTicket(state, 0, "telemetry-toggle", "ballad");
      state = startTicket(state, 1, "cache-summary", "ballad");
      state = structuredClone(state);
      state.providerQuota.anthill = 0;
      return state;
    };
    const coarse = advanceGame(setup(), 25);
    let jittered = setup();
    for (let second = 0; second < 25; second += 1) {
      for (const pulse of [0.07, 0.18, 0.11, 0.39, 0.25]) jittered = advanceGame(jittered, pulse);
    }

    expect(jittered.events.map((event) => event.id)).toEqual(coarse.events.map((event) => event.id));
    expect(jittered.reviews.map((review) => review.id)).toEqual(coarse.reviews.map((review) => review.id));
  });

  it("tracks actual overlapping work so workspace isolation removes its risk", () => {
    const run = (isolated: boolean) => {
      let state = createInitialState();
      state = startTicket(state, 0, "deployment-banner", "ballad");
      state = advanceGame(state, 5);
      state = reviewTicket(state, state.reviews[0].id, "approve");
      if (isolated) {
        state = structuredClone(state);
        state.purchasedUpgradeIds.push("worktree-isolation");
      }
      state = startTicket(state, 0, "telemetry-toggle", "ballad");
      state = startTicket(state, 1, "cache-summary", "ballad");
      return advanceGame(state, 10);
    };

    const plain = run(false);
    const isolated = run(true);

    expect(plain.sessions.slice(0, 2).every((session) => session.workedInParallel)).toBe(true);
    expect(plain.reviews.map((review) => review.risk)).toEqual([0.35, 0.47]);
    expect(isolated.reviews.map((review) => review.risk)).toEqual([0.26, 0.38]);
  });

  it("requires the stated trust cost before escalating", () => {
    let state = startTicket(createInitialState(), 0, "deployment-banner", "ballad");
    state = advanceGame(state, 5);
    state = structuredClone(state);
    state.trust = BALANCE.escalationTrustCost - 1;

    expect(() => reviewTicket(state, state.reviews[0].id, "escalate")).toThrow(GameRuleError);
    expect(state.reviews).toHaveLength(1);
  });

  it("makes escalation trade delivery reward for immediate certainty", () => {
    const initial = createInitialState();
    let state = startTicket(initial, 0, "deployment-banner", "ballad");
    state = advanceGame(state, 5);
    state = reviewTicket(state, state.reviews[0].id, "escalate");

    expect(state.completedTicketIds).toContain("deployment-banner");
    expect(state.trust).toBe(30 - BALANCE.escalationTrustCost);
    expect(state.stats.escalations).toBe(1);
    expect(state.repoHealth).toBe(initial.repoHealth + 6.5);
  });

  it("turns an authored warning into a safe approval only after revision", () => {
    let state = createInitialState();
    state.completedTicketIds.push("deployment-banner");
    state.unlockedSessions = 2;
    state = startTicket(state, 0, "telemetry-toggle", "ballad");
    state = advanceGame(state, 8);
    state = reviewTicket(state, state.reviews[0].id, "revise");
    state = advanceGame(state, 4);
    state = reviewTicket(state, state.reviews[0].id, "approve");

    expect(state.flags.privacyDefaultedOn).toBe(false);
    expect(state.stats.defects).toBe(0);
  });

  it("lets strong planning address a warning before review", () => {
    let state = createInitialState();
    state.completedTicketIds.push("deployment-banner");
    state.unlockedSessions = 2;
    state = startTicket(state, 0, "telemetry-toggle", "ballad", true);
    state = advanceGame(state, 8);

    expect(state.reviews[0].risk).toBeLessThan(0.2);
    state = reviewTicket(state, state.reviews[0].id, "approve");
    expect(state.flags.privacyDefaultedOn).toBe(false);
    expect(state.stats.defects).toBe(0);
  });

  it("offers three ready tickets when the third execution slot unlocks", () => {
    const state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary"];
    state.unlockedSessions = 3;

    expect(availableTickets(state).map((ticket) => ticket.id)).toEqual(expect.arrayContaining([
      "runtime-upgrade",
      "quota-display",
      "webhook-backoff",
    ]));
  });

  it("opens a repair ticket after a rushed review and lets it prevent the later incident", () => {
    let state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "cache-summary", "parallel-reports", "quota-display"];
    state.unlockedSessions = 3;
    state.flags.cacheShortcut = true;

    expect(availableTickets(state).map((ticket) => ticket.id)).toContain("cache-repair");
    expect(visibleTickets(state).map((ticket) => ticket.id)).not.toContain("telemetry-repair");

    state = startTicket(state, 0, "cache-repair", "ballad");
    state = advanceGame(state, 7);
    state = reviewTicket(state, state.reviews[0].id, "approve");

    expect(incidentIsOpen(state, "cache-shortcut")).toBe(false);
    expect(state.completedTicketIds).toContain("cache-repair");
    expect(state.events.some((event) => event.title.includes("resolved the incident"))).toBe(true);
    expect(state.events.some((event) => event.title.includes("SEV-2"))).toBe(false);
    expect(state.events.some((event) => event.title === "Pre-demo freshness audit passed")).toBe(true);
  });

  it("keeps a failed repair and the freshness audit unresolved", () => {
    let state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "cache-summary", "webhook-backoff", "telemetry-toggle", "quota-display"];
    state.unlockedSessions = 3;
    state.flags.cacheShortcut = true;
    expect(availableTickets(state).map((ticket) => ticket.id)).not.toContain("stale-customer-data");

    state = startTicket(state, 0, "cache-repair", "spark");
    state = advanceGame(state, 6);
    state = structuredClone(state);
    state.reviews[0].risk = 0.74;
    state = reviewTicket(state, state.reviews[0].id, "approve");

    expect(state.completedTicketIds).not.toContain("cache-repair");
    expect(incidentIsOpen(state, "cache-shortcut")).toBe(true);
    expect(availableTickets(state).map((ticket) => ticket.id)).toContain("cache-repair");
    expect(availableTickets(state).map((ticket) => ticket.id)).not.toContain("stale-customer-data");
  });

  it("changes the Anthill plan once after the second shipment to motivate provider switching", () => {
    let state = createInitialState();
    state = startTicket(state, 0, "deployment-banner", "ballad");
    state = advanceGame(state, 5);
    state = reviewTicket(state, state.reviews[0].id, "approve");
    state = startTicket(state, 0, "telemetry-toggle", "ballad");
    state = advanceGame(state, 8);
    const before = state.providerQuota.anthill;
    const otherProvider = state.providerQuota.openmind;
    state = reviewTicket(state, state.reviews[0].id, "escalate");

    expect(state.providerQuota.anthill).toBeCloseTo(Math.max(0, before - 14));
    expect(state.providerQuota.openmind).toBe(otherProvider);
    expect(state.events.filter((event) => event.title === "Anthill changed the team plan")).toHaveLength(1);
  });

  it("never replays a consequence when its old activity entry is trimmed", () => {
    let state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "telemetry-toggle"];
    state.unlockedSessions = 2;
    state.flags.privacyDefaultedOn = true;
    state = startTicket(state, 0, "quota-display", "couplet");
    state = advanceGame(state, 6);
    state = reviewTicket(state, state.reviews[0].id, "approve");
    expect(state.flags.privacyConsequenceApplied).toBe(true);

    state = structuredClone(state);
    state.events = [];
    state = startTicket(state, 0, "cache-summary", "ballad");
    state = advanceGame(state, 9);
    const trustBefore = state.trust;
    state = reviewTicket(state, state.reviews[0].id, "escalate");

    expect(state.trust).toBe(trustBefore - BALANCE.escalationTrustCost);
    expect(state.events.some((event) => event.title === "Enterprise disabled telemetry")).toBe(false);
  });

  it("uses the displayed risk score to block a high-risk finale review", () => {
    const state = createInitialState();
    state.sessions[0] = { ...state.sessions[0], status: "awaiting-review", ticketId: "release-two", modelId: "spark", progress: 1 };
    const review = { id: "final-high-risk", ticketId: "release-two", sessionId: 0, risk: 0.72, createdAt: 1 };
    state.reviews.push(review);

    expect(isReviewBlocked(state, review)).toBe(true);
    expect(reviewTicket(state, review.id, "approve").stats.defects).toBe(1);
  });

  it("makes high reasoning spend quota to reduce review risk", () => {
    let state = createInitialState();
    state.completedTicketIds.push("deployment-banner");
    state.unlockedSessions = 2;
    const normal = advanceGame(startTicket(state, 0, "cache-summary", "spark", false, "medium"), 8);
    const high = advanceGame(startTicket(state, 0, "cache-summary", "spark", false, "high"), 8);

    expect(high.providerQuota.openmind).toBeCloseTo(normal.providerQuota.openmind - 4);
    expect(high.reviews[0].risk).toBeCloseTo(normal.reviews[0].risk - 0.09);
  });

  it("counts long idle waits toward throughput and explains the score", () => {
    const finish = (idleSeconds: number) => {
      let state = createInitialState();
      state.completedTicketIds = content.tickets.filter((ticket) => !ticket.incidentFor && ticket.kind !== "finale").map((ticket) => ticket.id);
      state.unlockedSessions = 3;
      state = advanceGame(state, idleSeconds);
      state = startTicket(state, 0, "release-two", "ballad");
      state = advanceGame(state, 13);
      state = reviewTicket(state, state.reviews[0].id, "approve");
      return state.ending!;
    };

    const withoutIdle = finish(0);
    const withIdle = finish(600);
    expect(withIdle.scores.throughput).toBeLessThan(withoutIdle.scores.throughput);
    expect(withIdle.scoreDetails?.throughput).toContain("includes idle time and quota restocks");
    expect(withIdle.scoreDetails?.reliability).toContain("repository health");
  });

  it("does not charge a repeated rate-limit mitigation", () => {
    const state = createInitialState();
    state.incidentResponse = "active";
    const limited = mitigateIncident(state, "rate-limit");
    const eventsBefore = limited.events.length;

    expect(() => mitigateIncident(limited, "rate-limit")).toThrow(/already rate-limited/i);
    expect(limited.trust).toBe(state.trust - 2);
    expect(limited.debt).toBe(state.debt + 3);
    expect(limited.events.length).toBe(eventsBefore);
  });

  it("describes a pre-rollout retry repair without inventing a mitigation", () => {
    const state = createInitialState();
    state.flags.requestLoopAccepted = true;
    state.completedTicketIds.push("retry-repair");

    expect(computeEnding(state).message).toContain("the retry loop was repaired before the gateway rollout");
    expect(computeEnding(state).message).not.toContain("after the mitigation");
  });
});
