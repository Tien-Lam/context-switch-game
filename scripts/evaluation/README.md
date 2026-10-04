# Deterministic developer replays

This is source-informed local evidence using the real simulation. It does not run AI services, touch player saves, measure browser latency, or certify enjoyment. TIE-365 stage 1 is tooling; candidate correctness, actual desktop/narrow-sidebar play and independent comparative acceptance remain separate work.

Run from the repository with `mise exec -- bun run evaluate suite --out /tmp/context-switch-replays.json`. Without a package script, use `mise exec -- bun scripts/evaluation/cli.ts` with the same arguments. JSON includes build identity, declared config, initial/final states, ordered successful/rejected actions with state snapshots, captured engine events, pool/context troughs, score details, scope and outcomes. Provide `--build <exact-commit>`; the default says working-tree/unversioned honestly. There are no random choices or seeds: initial state, policy and stable authored ordering determine the result. Output filenames are chosen explicitly; existing files at those paths are overwritten.

The four policies preserve the systems-report heuristics. Fastest picks fastest usable models and approves warnings; planned prefers the recommended tier and highest available pool, planning every assignment; revise uses the same dispatch without planning and revises warnings; escalate spends trust to escalate warnings. All prioritize incident repairs, greedily fill unlocked slots, roll back the gateway incident, compact active work below 40 context and skip optional work unless requested. Upgrade order and provider/reasoning/scope overrides are explicit in `runner.ts`. No policy claims optimality. Identical rejected attempts are recorded once until relevant state changes; successful choice sequences match the source report. Snapshots omit the bounded event ring because the full captured event stream is separate. Numeric snapshots use nine decimal places.

The default suite has 17 routes: the four policies, provider restrictions, all-upgrade variants, high reasoning, bypass/follow-up and six upgrade ablations. Legacy low is opt-in because current controls remove it. To reproduce all 18 historical routes, use a preserved baseline checkout with its dependencies available:

```sh
mise exec -- bun run evaluate suite --engine-root /absolute/baseline-checkout --build e1c55d840c5d0d82238a2efd74367fb66fa8a9b1 --legacy-low --verify-baseline --out /tmp/baseline.json
```

The historical oracle in `baseline.ts` verifies route elapsed time within one 0.05-second policy tick, quota within 0.01, and exact ending scores. Candidate results should change when intended rules change; do not force them to satisfy the old oracle. The engine adapter loads baseline modules from the supplied path without modifying that checkout. Wall-clock/process/browser timing is deliberately absent from deterministic JSON.

## Timing and scope definitions

- Elapsed seconds are simulated engine time since the starting state. Engine active seconds use its exact integral while any owner works, including quota-throttled work. No-work seconds are elapsed minus that active integral, so final fractions of a decision tick count honestly; this differs from the old report's tick-sampled no-work column by those fractions.
- Owner work seconds sum progress gained times each owner's actual work duration. They exclude setup and compaction; with concurrent owners their sum can exceed elapsed time. Quota-paused means work continues at regeneration rate, not stopped work. Paused elapsed/slot seconds and occupied/support slot seconds are sampled at tick starts; error is bounded by one tick per status transition per slot. Utilization divides occupied slot-seconds by unlocked capacity slot-seconds.
- Pool troughs sample every action and advance; context trough excludes idle sessions. End scores come directly from the selected engine. Cache freshness/speedup/follow-up are separate outcome facts, never a fun score. The same repair cannot invent optional performance delivery.

`--config path.json` accepts one config for `replay`, an array for `suite`. Config fields include `policy`, `provider`, `reasoning`, ordered `upgrades`, `cache`, `optional`, positive `tickSeconds`, `maxSeconds`, `maxActions`, `stopAfterShipments`, and nonnegative `initialDelaySeconds`. Invalid config fails explicitly. Default bounds are 1200 simulated seconds/2000 recorded choices. The state is cloned. `replay --state path.json` uses an explicit local engine state, not browser storage.

## Fixtures and held-out cases

`releaseFixture.ts` also exposes `mixedReleaseReview()`, a bounded source-informed route that actually reaches SHIP-2 after accepting checkout/privacy risks, repairing the retry and leaving those two risks outstanding. Browser regressions import it as a save fixture; it is not new-player discovery or a manufactured finale that skips the live-incident gate.

```sh
mise exec -- bun run evaluate replay --config scripts/evaluation/fixtures/opening.json --build <commit> --out /tmp/opening.json
mise exec -- bun run evaluate replay --config scripts/evaluation/fixtures/release-risk.json --build <commit> --out /tmp/release-risk.json
mise exec -- bun run evaluate fixtures --out /tmp/cache-counterfactuals.json
mise exec -- bun run evaluate state --phase review --context 0 --quota 60 --helper-occupied --out /tmp/cache-state.json
mise exec -- bun run evaluate compaction --out /tmp/compaction.json
```

The 24 cache cases vary context 0/30/100, quota 0/60 and ledger/probes/bypass/escalate. `state` builds the same valid fixture and exposes optional helper occupancy for caller-controlled rendered views. These are synthetic mutations, not naturally reached-player frequency evidence. Keep exhausted context, occupied-helper, single-provider and upgrade-only routes held out while selecting a candidate from opening and release-risk routes; inspect them only after naming that candidate. Browser fixture loading, command/response episodes and clean new-player runs must be recorded separately by the coordinator.

## Neutral comparison handoff

```sh
mise exec -- bun run evaluate pair --left /tmp/left.json --right /tmp/right.json --order forward --mapping-out /tmp/coordinator-private.json --out /tmp/critic-forward.json
mise exec -- bun run evaluate pair --left /tmp/left.json --right /tmp/right.json --order reverse --mapping-out /tmp/coordinator-private.json --out /tmp/critic-reverse.json
```

Give critics only the critic file. The private mapping stores build identities and original config IDs; keep it and implementation rationale out of critic prompts. Pairing verifies identical initial states, ticket IDs/prerequisites/durations, model identities and declared policy/budgets. It permits changed evidence/copy/rules in candidates. Labels do not erase a critic's prior rationale knowledge. Critics must not implement the change, must cite action sequence/event time, and may prefer either variant, tie or find evidence insufficient. Preserve regressions/disagreement; no majority vote certifies release. Use fresh critics for both orders when capacity allows. The finding shape distinguishes replay judgment from live browser experience, structural metrics and preference under the named taste brief.

For a short sensitivity control, clone the opening config and add `initialDelaySeconds: 5`, replay from the same initial state, then pair with `--diagnostic-control`. Only this flag permits a delay mismatch; its label is stored solely in private mapping. A critic who overlooks the extra no-work time supplies weaker evidence. This is a deliberately degraded diagnostic control, not a production change. Creating a pair is not completing or interpreting an independent comparison.

## Compaction experiment boundary

`compaction` compares guidance-only ledger/bypass/escalation recovery with one hypothetical funded request at active cache context 30/quota 0, with/without a same-pool competing job. Incoming regeneration funds the existing 3-quota charge before that pool works again; both same-pool jobs stall 3.75 seconds, independent pools keep advancing. Existing paid compaction performs context recovery once. This local opportunity-cost model has no pending saved state, queue, cancellation/import behavior or production scheduler, and does not claim coarse/fine/jitter/offline reservation equivalence. The first-pass authored gate remains blocked even after compaction. The probe reports rejection for the demonstrated cache route; it does not prove all possible low-context routes lack value. Production shipping would additionally require independent review/browser evidence and all TIE-364 lifecycle/equivalence tests.
