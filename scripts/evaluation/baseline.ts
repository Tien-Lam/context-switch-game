import type { ReplayResult } from "./runner";

/** e1c55d8 systems-report routes; only the preserved baseline should satisfy this oracle. */
export const baselineGolden = [
  ["fastest", 119.8, 269.86, 20, 0, 49],
  ["planned", 264.2, 509.02, 70, 100, 0],
  ["revise", 232.9, 460.78, 67, 100, 0],
  ["escalate", 191.3, 352.68, 60, 100, 0],
  ["planned/anthill", 575.95, 520.74, 63, 100, 0],
  ["planned/openmind", 496.2, 501.56, 66, 100, 0],
  ["revise/upgrades", 113.75, 321.76, 68, 100, 0],
  ["planned/upgrades", 121.3, 353.66, 77, 100, 0],
  ["planned/low", 265.95, 525.42, 68, 100, 0],
  ["planned/high", 299.5, 553.93, 69, 100, 0],
  ["revise/bypass", 221.65, 448.68, 67, 100, 0],
  ["revise/bypass/followup", 242.8, 463.94, 67, 100, 0],
  ["planned/only-repo-playbook", 269.3, 496.74, 68, 100, 0],
  ["planned/only-fast-checks", 258.75, 499.64, 71, 100, 0],
  ["planned/only-context-notes", 258.75, 499.64, 71, 100, 0],
  ["planned/only-worktree-isolation", 256.55, 497.67, 71, 100, 0],
  ["planned/only-quota-plan", 222.2, 525.42, 69, 100, 0],
  ["planned/only-ci-integrity-guard", 264.2, 509.02, 70, 100, 0],
] as const;

export function verifyBaseline(replays: ReplayResult[]) {
  for (const [id, elapsed, quota, throughput, reliability, debt] of baselineGolden) {
    const replay = replays.find(value => value.config.id === id);
    if (!replay || replay.metrics.stopReason !== "ending") throw new Error(`Missing completed baseline route ${id}.`);
    if (Math.abs(replay.metrics.elapsedSeconds - elapsed) > 0.050001 || Math.abs(replay.metrics.quotaSpent - quota) > 0.010001) throw new Error(`Baseline timing/quota changed for ${id}.`);
    const scores = replay.finalState.ending?.scores;
    if (!scores || scores.throughput !== throughput || scores.reliability !== reliability || scores.debt !== debt || scores.trust !== 100) throw new Error(`Baseline scores changed for ${id}.`);
  }
  return { passed: true, routes: baselineGolden.length, elapsedToleranceSeconds: 0.05, quotaTolerance: 0.01 };
}
