# Funded compaction experiment — 2026-10-05

Recommendation: reject a production reservation scheduler for the demonstrated cache recovery problem. The guidance-only control already offers ledger restoration, faster safe bypass or immediate escalation. One funded compaction raises context but removes none of those subsequent decisions; it adds an action, quota and same-pool delay. This is a bounded structural result, not an independent browser preference judgment or proof about every low-context route.

Build: preserved baseline `e1c55d840c5d0d82238a2efd74367fb66fa8a9b1`; local harness in `scripts/evaluation`. Read AGENTS.md, protocol, pickup report, full TIE-364/TIE-365 briefs and clarifications, and systems reproduction programs. Source-informed developer evaluation, no human gameplay, no browser latency/retention measurement. Production rules, persistence and saves were not changed by this experiment. Baseline suite reproduces all 18 systems routes within 0.05 simulated seconds/0.01 quota and exact historical scores.

Reproduce with a preserved baseline checkout and dependencies available:

```sh
mise exec -- bun run evaluate compaction --engine-root /absolute/baseline-checkout --build e1c55d840c5d0d82238a2efd74367fb66fa8a9b1 --out /tmp/compaction.json
mise exec -- bun run test tests/evaluation.test.ts
```

Starting state is synthetic: APP-101 marked completed, peak trust 100, current trust 50, two unlocked slots, active Ballad PERF-204 at progress 0/context 30/Anthill quota 0. A matched competitor condition starts APP-118 with Ballad in the second slot. Initial assignments are excluded from successful recovery-action counts in both variants. Existing compact rejects at quota 0; first review cannot compact because the owner is no longer active. Existing quota guidance leads the player to review and choose a paid revision or escalation; the route is winnable.

The bounded hypothetical model reserves future incoming regeneration before all same-pool work: 3 quota / 0.8 regeneration per second = 3.75 seconds. Both same-pool owners make zero progress until funded; other pools continue. It then calls the existing paid compact exactly once, charging 3 quota and recovering context to 88. Progress begins at zero, so the existing 0.08 setback is clipped to zero. This is an optimistic case for reservation; later requests can lose more implementation momentum. The model deliberately has no pending persisted state and is not a scheduler implementation.

| Recovery after first review, no competitor | Guidance elapsed / actions / quota | Funded elapsed / actions / quota | Delivered scope |
|---|---|---|---|
| Ledger, approve | 46s / 2 / 36.8 | 49.75s / 3 / 39.8 | Freshness and speedup |
| Bypass, approve | 30.88s / 2 / 24.7 | 34.63s / 3 / 27.7 | Freshness, speed deferred |
| Escalate | 26s / 1 / 20.8 | 29.75s / 2 / 23.8 | Freshness and speedup; delivery reward forfeited |

Without funded compaction, first review arrives at 26s/context 18.48/risk 68.76%. Funded compaction reaches first review at 29.75s/context 76.48/risk 39.76%. Both are blocked: first-pass cache acceptance requires the authored invalidation evidence, regardless of this lower risk. One ledger revision already passes in both controls. Safe bypass also passes after one revision. Ledger ends with context 25.28 versus 83.28, a reserve for later assignments, but the measured same-ticket recovery, scope and trust outcomes are identical; this test does not validate downstream campaign benefit from that extra context.

With another active same-pool job, first review arrives at 48.75s versus 52.5s, again blocked. Ledger ends at 68.75s versus 72.5s; bypass at 53.63s versus 57.38s; escalation at 48.75s versus 52.5s. The competitor's own review moves from 45.5s to 49.25s. Every funded condition spends exactly 3 extra quota and one extra successful action, with the same number of later revisions, same chosen scope and same trust. No negative pool balance/free compaction was used in the local model.

The exact choice that would justify acceptance is missing: a normal affected route where the deliberate reservation avoids a later recovery pass or provides a useful downstream allocation tradeoff sufficient to justify pending-state/scheduler/save complexity. These synthetic results support retaining the simpler guidance control and existing immediate funded compaction. They do not justify shipping a pending request merely because its accounting could be made deterministic.

Unvalidated: natural-player prevalence, downstream value of preserved context, independent browser ability to explain opportunity cost, full pending-state cancellation/completion/reload/import/helper teardown, simultaneous reservation ordering, and coarse/fine/jitter/offline equivalence. Those lifecycle checks were not required for this rejected local model and are not claimed completed. No willingness-to-stop observation was made. TIE-365 comparative candidate acceptance remains open; this report does not replace actual desktop/sidebar play or independent critics.
