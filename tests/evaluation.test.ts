import { describe, expect, it } from "vitest";
import { currentApi } from "../scripts/evaluation/api";
import { runReplay } from "../scripts/evaluation/runner";
import { cacheFixture, cacheCounterfactuals } from "../scripts/evaluation/fixtures";
import { createComparisonPair } from "../scripts/evaluation/compare";
import { compactionExperiment } from "../scripts/evaluation/compaction";

describe("developer deterministic evaluation", () => {
  it("repeats the same bounded policy, complete action states and ordered events without mutating its fixture", () => {
    const state = currentApi.createInitialState();
    const before = structuredClone(state);
    const config = { id: "opening", policy: "revise" as const, stopAfterShipments: 2 };
    const left = runReplay(config, { initialState: state, buildId: "test" });
    expect(runReplay(config, { initialState: state, buildId: "test" })).toEqual(left);
    expect(state).toEqual(before);
    expect(left.metrics.stopReason).toBe("shipment-budget");
    expect(left.actions.map(record => record.sequence)).toEqual(left.actions.map((_record, index) => index + 1));
    expect(left.events.every((event, index) => index === 0 || event.at >= left.events[index - 1].at)).toBe(true);
  });
  it("separates no-work waiting from quota-throttled work and integrates actual owner work", () => {
    const depleted = cacheFixture({ phase: "active", context: 80, quota: 0 });
    depleted.unlockedSessions = 1;
    const result = runReplay({ id: "depleted", policy: "revise", maxSeconds: 10 }, { initialState: depleted });
    expect(result.metrics.noWorkSeconds).toBeCloseTo(0, 8);
    expect(result.metrics.quotaPausedSeconds).toBeGreaterThan(9.9);
    expect(result.metrics.ownerWorkSeconds).toBeGreaterThan(0);
    expect(result.metrics.ownerWorkSeconds).toBeLessThan(result.metrics.elapsedSeconds);
    const waiting = runReplay({ id: "delay", policy: "revise", initialDelaySeconds: 5, maxSeconds: 5 });
    expect(waiting.metrics.noWorkSeconds).toBeCloseTo(5, 8);
    expect(waiting.metrics.quotaPausedSeconds).toBe(0);
  });
  it("bounds choices/time and rejects invalid configuration", () => {
    expect(runReplay({ id: "one", policy: "revise", maxActions: 1 }).metrics.stopReason).toBe("action-budget");
    expect(runReplay({ id: "time", policy: "revise", maxSeconds: 0.125 }).metrics.elapsedSeconds).toBeCloseTo(0.125, 8);
    expect(() => runReplay({ id: "bad", policy: "revise", tickSeconds: 0 })).toThrow("tickSeconds");
    expect(() => runReplay({ id: "bad", policy: "revise", provider: "missing" })).toThrow("provider");
  });
  it("reproduces scope/context/helper counterfactuals and refuses occupied probes", () => {
    const results = cacheCounterfactuals();
    expect(results).toHaveLength(24);
    const ledger = results.find(value => value.context === 0 && value.quota === 60 && value.choice === "ledger")!;
    const probes = results.find(value => value.context === 0 && value.quota === 60 && value.choice === "probes")!;
    expect(ledger.blocked).toBe(false);
    expect(probes.blocked).toBe(true);
    const occupied = cacheFixture({ helperOccupied: true });
    expect(() => currentApi.reviewTicket(occupied, occupied.reviews[0].id, "revise", { remedy: "restore", workflow: "probes" })).toThrow("free unlocked");
  });
  it("keeps mapping out of critic evidence, reverses order and rejects unmatched pairs", () => {
    const config = { id: "private-id", policy: "revise" as const, stopAfterShipments: 1 };
    const left = runReplay(config, { buildId: "secret-baseline" });
    const right = runReplay(config, { buildId: "secret-candidate" });
    const pair = createComparisonPair(left, right, "reverse");
    expect(pair.criticInput.presentationOrder).toEqual(["Cobalt", "Amber"]);
    const critic = JSON.stringify(pair.criticInput);
    expect(critic).not.toContain("secret-baseline");
    expect(critic).not.toContain("secret-candidate");
    expect(critic).not.toContain("private-id");
    expect(pair.privateMapping.Amber).toBe("secret-baseline");
    expect(() => createComparisonPair(left, { ...right, initialState: { ...right.initialState, trust: 0 } })).toThrow("starting states");
    const delayed = runReplay({ ...config, initialDelaySeconds: 2 });
    expect(() => createComparisonPair(left, delayed)).toThrow("matched policies");
    expect(createComparisonPair(left, delayed, "forward", true).criticInput.variants[1].metrics.noWorkSeconds).toBeGreaterThan(left.metrics.noWorkSeconds);
  });
  it("finds funded cache compaction still needs the same recovery and delays same-pool competition", () => {
    const experiment = compactionExperiment();
    expect(experiment.results).toHaveLength(12);
    for (const funded of experiment.results.filter(row => row.strategy.startsWith("hypothetical"))) {
      const control = experiment.results.find(row => row.competitor === funded.competitor && row.recovery === funded.recovery && row.strategy.startsWith("guidance"))!;
      expect(funded.firstReview.blocked).toBe(true);
      expect(funded.successfulActions).toBeGreaterThanOrEqual(control.successfulActions);
      expect(funded.quotaSpent).toBeGreaterThan(control.quotaSpent);
      if (funded.recovery === "ledger") expect(funded.extraRevisionPasses).toBe(control.extraRevisionPasses);
      if (funded.competitor) expect(funded.competingJobReviewAt!).toBeGreaterThan(control.competingJobReviewAt!);
    }
  });
});
