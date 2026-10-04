import { describe, expect, it } from "vitest";
import { content } from "../src/content";
import { CACHE_DECISIONS, CACHE_EVIDENCE, CACHE_PROVIDER_HABITS } from "../src/content/cacheDecisions";

describe("authored cache decisions", () => {
  it("keeps the performance follow-up optional and outside required ticket prerequisites", () => {
    const followup = content.tickets.find((ticket) => ticket.id === CACHE_DECISIONS.followup.id)!;
    expect(followup.optional).toBe(true);
    expect(followup.key).toBe(CACHE_DECISIONS.followup.key);
    expect(followup.duration).toBe(CACHE_DECISIONS.followup.duration);
    expect(followup.rewardTrust).toBe(CACHE_DECISIONS.followup.rewardTrust);
    expect(content.tickets.filter((ticket) => !ticket.optional).some((ticket) => ticket.prerequisites.includes(followup.id))).toBe(false);
  });

  it("keeps authored provider habits and scope evidence available for each supported choice", () => {
    for (const provider of content.providers) {
      const habit = CACHE_PROVIDER_HABITS[provider.id as keyof typeof CACHE_PROVIDER_HABITS];
      expect(habit).toBeDefined();
      expect(CACHE_DECISIONS[habit.preferredWorkflow]).toBeDefined();
      for (const workflow of ["ledger", "probes"] as const) {
        expect(habit[workflow]).not.toHaveLength(0);
        expect(CACHE_EVIDENCE[workflow].summary).not.toBe(CACHE_EVIDENCE[workflow].tests);
        expect(CACHE_EVIDENCE[workflow].scope).not.toHaveLength(0);
      }
    }
    expect(CACHE_EVIDENCE.bypass.scope).toContain(CACHE_DECISIONS.followup.key);
  });
});
