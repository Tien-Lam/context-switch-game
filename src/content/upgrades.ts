import type { UpgradeDefinition } from "./schema";

export const upgrades: UpgradeDefinition[] = [
  { id: "repo-playbook", name: "Repository playbook", description: "Clear conventions reduce ambiguity in every brief.", cost: 12, unlockAfter: 1, effect: "briefing" },
  { id: "fast-checks", name: "Fast checks", description: "Cheap tests expose more risk before review.", cost: 16, unlockAfter: 2, effect: "tests" },
  { id: "context-notes", name: "Context notes", description: "Handoffs and long sessions lose context more slowly.", cost: 18, unlockAfter: 3, effect: "handoff" },
  { id: "terminal-dashboard", name: "Live terminal dashboard", description: "Adds a graphical operations dashboard as a dedicated multiplexer tab.", cost: 14, unlockAfter: 3, effect: "dashboard" },
  { id: "worktree-isolation", name: "Workspace isolation", description: "Parallel sessions stop stepping on the same branch.", cost: 20, unlockAfter: 3, effect: "isolation" },
  { id: "observability", name: "Actual observability", description: "Incidents surface earlier and cost less trust.", cost: 24, unlockAfter: 4, effect: "observability" },
  { id: "quota-plan", name: "Definitely unlimited plan", description: "Both providers gain 35 quota. Terms may still change.", cost: 26, unlockAfter: 5, effect: "quota" },
];
