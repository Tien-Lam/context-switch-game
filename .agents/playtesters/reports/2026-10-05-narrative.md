# Narrative baseline evaluation — 2026-10-05

## Provenance and limits

Build: `e1c55d840c5d0d82238a2efd74367fb66fa8a9b1`. At inspection, gameplay files were clean; the dirty files were playtester instructions and the new protocol. This is an expert source audit with controlled deterministic engine/CLI traces, **not a rendered-browser playtest or a clean-context player sample**. This agent retains the preceding design discussion about revisions and provider habits. No other testers' reports were read before these findings.

Read `AGENTS.md`, `protocol.md`, and `quality_narrative.md`. Tried opening a separate hidden IAB tab at `http://127.0.0.1:5173`; the tool returned `Browser is not available: iab`. Available surface inventory returned no apps or browsers. Source examination and inline `mise exec -- bun -e` calls were the fallback. No gameplay files, server, installation, browser save, or external service were changed.

The traces invoke the actual `startTicket`, `advanceGame`, `reviewTicket`, `mitigateIncident`, selectors, and CLI formatter. They are source-informed policies, not player observations. Advances use 0.25-second simulation increments until review; serial execution deliberately isolates narrative continuity. Resource optimization, browser latency, and player reading time were not measured. No independent human preference or universal enjoyment score is claimed.

Final bounded trace coverage:

| Policy | Route | Mutating engine calls | Result |
| --- | --- | ---: | --- |
| Careful | 16 main tickets; clarify when affordable; revise blocked gates | 38 | Complete; 6 revisions, no escaped defects; cache restored; trust/reliability 100 |
| Fast with recovery | Approve main work; perform only repairs needed to advance; revise failed repair gates; rollback request loop | 42 | Complete; known privacy/runtime/export/checkout problems remain; ending reports them |
| Mixed with open checkout | Bypass cache; accept privacy/checkout/retry risk; revise other blocked gates; repair retry after rate limiting | 42 | Complete; bypass retained, PERF-205 skipped; privacy and checkout remain open |

These counts are engine mutations, **not UI command counts**. CLI reads were sampled at QA-401, SHIP-1, and SHIP-2. The equivalent command sequences below identify consequential actions; they were not typed in a browser. A preliminary indiscriminate fast harness exhausted its bound repeatedly retrying an unnecessary repair; it was discarded as a harness-prioritization error, not evidence of a game deadlock. The final fast policy repairs only release blockers.

Reproduction for the mixed trace: use session 1 serially, with no planned briefs or upgrades, and advance until each pending review. Dispatch in this order: APP-101/Couplet, APP-118/Forge, PERF-204/Forge, PLAT-77/Epic, API-88/Forge, DATA-312/Foundry, UI-229/Couplet, OPS-41/Foundry, SHIP-1/Epic, QA-401/Forge, API-420/Forge, UI-421/Ballad, INT-422/Couplet, UI-502/Forge, API-503/Forge, FIX-502/Ballad, SHIP-2/Foundry. These models unlock naturally in the trace. Approve APP-118, QA-401, and UI-502 despite their warnings. Use `reviews revise PERF-204 --remedy bypass`, wait, then approve. For the other tickets, revise blocked reviews until passed before approval. After API-503, use `incident mitigate rate-limit` before FIX-502. Never dispatch FIX-118, FIX-401, or PERF-205. Sample `reviews read SHIP-1` before/after its revision and `reviews read SHIP-2` before approval. This reproduces both N1 and N2 in a reachable campaign state.

Willingness-to-stop observation is unavailable: no actual browser session occurred. My expert preference is to shorten repeated reviews that change only a score, but that is a design judgment rather than a retention measurement.

## What currently earns its interaction cost

The cache prototype has consequential differences. Ledger work takes 5 seconds, 3 upfront quota, and one slot, with 12 context gained. Probes take 3 seconds, reserve a helper, charge helper quota, and gain 3 context. Either provider can use either method. Default probe work falls back when no helper is free. The output names completed ledger/probe evidence rather than declaring success from a request alone. See `src/content/cacheDecisions.ts:23`, `src/game/decisionDepth.ts:37`, and `src/game/engine.ts:645`.

Bypass is a legitimate safe scope reduction: 1.5 seconds, smaller immediate reward, slower fresh reads, and optional performance follow-up. The mixed trace reached SHIP-2 with `cacheOutcome=bypassed` and without `cache-followup`. Later review evidence and the ending remembered fresh-but-slow. It did not create a mandatory detour or falsely trigger stale-data consequences. Preserve this behavior. See `src/game/selectors.ts:64`, `src/game/decisionDepth.ts:66`, and `src/game/engine.ts:178`.

The request-loop incident also has real immediate responses: rollback removes the feature temporarily; rate limiting preserves it with delayed requests; scaling protects health but leaves the cause active. Repair before the overlap prevents the incident. These distinctions are useful foundations, not a reason to add more options everywhere.

The source audit establishes different costs, not that one workflow or remedy is preferred by real players. No always-best provider was demonstrated. The same provider can use either workflow; the distinction currently is its default and explanation. Whether bypass has enough value in ordinary parallel play remains for the systems/browser evaluation.

## Agent-ready recommendations

### N1 — Make final release evidence acknowledge unresolved checkout defects

Priority: P1. Classification: confirmed continuity defect in engine/CLI output.

Evidence: The mixed trace approved QA-401, completed both compatible account branches, accepted UI-502, rate-limited the gateway, and completed FIX-502. It deliberately skipped FIX-401. At `reviews read SHIP-2`, the output simultaneously said:

```text
tests       Contract, checkout, retry, and gateway checks pass.
history     tests assertion missing · contract compatible
guidance    PASS: approve is supported by the current evidence
```

The ending correctly retained “the green build hid a checkout defect.” The displayed checkout pass therefore contradicts the known unresolved defect rather than merely expressing aggregate confidence.

Relevant files: `src/content/tickets.ts:502`, `src/ui/cli.ts:319`, `src/game/decisionDepth.ts:62`, `src/game/selectors.ts:99`.

Player impact: A player who knowingly accepted a defect cannot tell whether final checks fixed it automatically or the release still contains it. This undermines trust in evidence and the meaning of repair work.

Proposed scope: Derive SHIP-2's test/evidence wording from existing open/repaired test-integrity state. Clearly distinguish aggregate review readiness from known unresolved release risks. Keep intentional approval with known risk available; this ticket does not mandate FIX-401 or change scoring.

Acceptance criteria:

- An unresolved QA-401 assertion never produces an unconditional checkout-pass claim in the final review.
- A restored assertion through revision or FIX-401 produces appropriate passing evidence.
- History, review evidence, and ending agree for clean, unresolved, and repaired checkout states.
- Bypass still appears as fresh-but-slow and remains optional to reverse.
- Focused deterministic scenarios cover those states and retain release completion with deliberately accepted risks.

Dependencies/boundaries: Existing incident selectors are sufficient; coordinate with the rules owner if final gate semantics are changed. No new save field, mandatory ticket, or balance change is required for the wording correction. Keep final release scope broader than the cache alone.

Risk: Turning this into an unconditional release block would remove the intended risk-acceptance route instead of fixing the misleading evidence.

### N2 — Give aggregate-risk revisions a visible completed result

Priority: P2. Classification: confirmed repeated output behavior; benefit is a taste hypothesis.

Evidence: In the mixed trace, SHIP-1 scored 60 and was blocked. After `reviews revise SHIP-1`, it scored 42 and passed. Its `change`, `tests`, and `warning` text was exactly unchanged: “Built the release candidate and recorded unresolved risks,” “Critical path passes,” and the same milestone/cache description. The cache evidence wrapper returns the static ticket evidence for SHIP-1, overriding even the generic revised label. The generic engine pass otherwise uses the same 62% restart and risk reduction for every non-cache ticket.

Relevant files: `src/game/decisionDepth.ts:69`, `src/game/engine.ts:672`, `src/game/engine.ts:70`, `src/ui/cli.ts:293`.

Player impact: The operator's requested pass appears to lower a hidden confidence number rather than accomplish identifiable work. A second or third such review becomes repeated input with little additional payoff.

Proposed scope: Author a concise completed-pass result for aggregate-risk revisions at SHIP-1 and SHIP-2. State what was rechecked or bounded and what remains unresolved. Ensure the review renderer preserves completed revision evidence while appending cache scope. Avoid claiming that a general pass repaired a named incident whose repair state is still open.

Acceptance criteria:

- The SHIP-1 reproduction shows a concrete new completed check/result after revision.
- A repeat pass explains remaining uncertainty or the additional verification performed instead of recycling an identical change report.
- Existing privacy/checkout incidents do not disappear from evidence merely because the score falls below 60.
- Revisions retain current immediate pacing and require no new inquiry, dialog, or mandatory command.
- Scenario verification confirms evidence becomes available only after the pass finishes.

Dependencies/boundaries: Can follow N1 and reuse its consistent release-evidence formatter. Changes stay in authored content and the current deterministic review state. Generalizing authored pass results to every ticket is a separate task, not necessary here.

Risk: Copy can falsely imply a mechanical repair. Each claimed result must correspond to the actual pass and state; additional prose alone is not proof of added agency.

### N3 — Test transfer of provider working habits in one later encounter

Priority: P3 experiment. Classification: structural gap and hypothesis, not a confirmed fun defect.

Evidence: The meaningful ledger/probe distinction is restricted to PERF-204 (`getCacheRevisionQuote` exits for every other ticket). API-420/UI-421 and INT-422 are thematically about cross-branch evidence, but use the standard model modifiers, static evidence, and generic pass. Thus learning how an occupied helper slot changes OpenMind's preferred method currently has no second explicit encounter in which to apply that rule.

Relevant files: `src/game/decisionDepth.ts:27`, `src/content/cacheDecisions.ts:40`, `src/content/tickets.ts:332`, `src/content/tickets.ts:403`, `src/game/engine.ts:610`.

Player impact hypothesis: A second application could make providers feel like collaborators whose habits the player has learned, rather than personalities attached to one tutorial-like decision.

Proposed scope: A bounded INT-422 prototype that reuses the already learned one-slot ledger versus helper probes as alternative ways to complete the existing contract matrix. Keep both providers able to follow either method. Do not add an extra review stage or a third menu, and do not promise four passing combinations before the work finishes. Compare occupied-helper and free-helper situations before shipping the experiment.

Acceptance criteria:

- One later encounter has different actual work/slot/quota/context consequences for the two methods and corresponding completed artifacts.
- Both methods can deliver the same required compatibility promise safely; differences concern commitments and resource use rather than provider-specific random mistakes.
- Occupying the helper changes feasibility or opportunity cost and the provider acknowledges it before work begins.
- In bounded rendered play, the player can explain the learned tradeoff and apply it in this encounter without new terminology or additional compulsory commands.
- Reject or reduce the prototype if both resource situations lead to the same preference without a meaningful opportunity cost, or if extra interaction only repeats information.

Dependencies/boundaries: Requires the systems owner to establish a useful normal-route resource tradeoff, followed by independent browser testing. Needs deterministic scenario tests and save normalization/migration if workflow state expands. This is not authorization to port scope choices to the entire campaign.

Risk: INT-422 already verifies the matrix. Adding another preliminary compatibility ritual could create redundant mandatory work; the experiment must replace a method of existing work, not append a detour. Provider defaults must remain overrideable and must not become safe-brand/reckless-brand stereotypes.

### N4 — Give recovery a distinct closing acknowledgment

Priority: P2. Classification: confirmed ending structure; desired emotional payoff is a taste judgment.

Evidence: A preliminary completed mixed trace repaired all three accepted privacy/checkout/retry defects, reached repository health 100, trust 100, debt 0, and reliability 79. It received the same “Legal has follow-up questions” title as the final fast trace with unresolved privacy/runtime/export/checkout problems, reliability 0, and debt 98. The existing ledger did distinguish the states correctly. The title primarily branches on total historical defect count; successful recovery does not receive a distinct top-level acknowledgment. Mara appears in QA-401/FIX-401 but has no state-dependent closing response.

Relevant files: `src/game/engine.ts:96`, `src/game/engine.ts:107`, `src/game/engine.ts:196`, `src/content/tickets.ts:289`, `src/content/tickets.ts:314`.

Player impact hypothesis: Recovery is mechanically valuable but its closing tone resembles shipping with problems still live. One brief acknowledgment could reward taking responsibility without erasing the cost of mistakes.

Proposed scope: Add a recovery-aware closing sentence or title variant derived from existing open/repaired incidents, plus one short checkout callback from Mara when the relevant work is clean or repaired. Preserve score penalties and honest history. Example intent: acknowledgment that checkout coverage was restored after the escaped defect, rather than pretending it was always intact.

Acceptance criteria:

- Clean prevention, unresolved escaped defects, and repaired escaped defects receive distinguishable closing acknowledgment.
- A repaired route retains its historical penalties and states that repair occurred.
- The callback never describes affected invoices on a prevented route or a still-missing assertion after FIX-401.
- Text remains brief; no new dialog, mandatory task, or decorative intermediate notification is added.
- Deterministic state cases verify clean, repaired, and unresolved variants.

Dependencies/boundaries: Can use existing flags/completed-ticket IDs without new persistence fields. N1 should settle consistent open-versus-repaired evidence first. This ticket changes authored payoff, not scoring or incident triggers.

Risk: A warmly written ending could minimize real unresolved defects; unresolved state takes precedence. Conversely, historical penalties need not force every repaired ending to sound like the release is still broken.

## Follow-up evaluation

This is baseline evidence, not a comparison with an improved build. N1 and N2 have reproducible continuity/output evidence. N3 and N4 need independent rendered play under the shared taste brief. Preserve disagreement between fast delivery and careful review objectives. Success means honest evidence, decisions that change useful work, and concise payoff—not more options, more text, or a higher claimed fun score.
