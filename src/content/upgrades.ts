import type { UpgradeDefinition } from "./schema";

export const upgrades: UpgradeDefinition[] = [
  { id: "repo-playbook", name: "Repository playbook", description: "Clear conventions reduce ambiguity in every brief.", cost: 18, unlockAfter: 1, effect: "briefing" },
  { id: "fast-checks", name: "Fast checks", description: "Cheap tests expose more risk before review.", cost: 24, unlockAfter: 2, effect: "tests" },
  { id: "context-notes", name: "Context notes", description: "Handoffs and long sessions lose context more slowly.", cost: 30, unlockAfter: 3, effect: "handoff" },
  { id: "worktree-isolation", name: "Workspace isolation", description: "Parallel sessions stop stepping on the same branch.", cost: 34, unlockAfter: 3, effect: "isolation" },
  { id: "observability", name: "Actual observability", description: "Incidents surface earlier and cost less trust.", cost: 40, unlockAfter: 4, effect: "observability" },
  { id: "quota-plan", name: "Definitely unlimited plan", description: "Both providers gain 35 quota. Terms may still change.", cost: 48, unlockAfter: 5, effect: "quota" },
];
