# Blind comparative replay critic: Amber then Cobalt

Named preference: fast CLI orchestration with understandable consequences, useful recoveries and decisions rather than waiting.

Verdict: narrowly prefer **Cobalt for explanatory copy**. Tie for observed orchestration, recoveries, decisions and pacing. This evidence does not support a broader gameplay preference. The shared taste brief supports the copy preference; the route is too narrow to establish that players discover or use the advertised capabilities.

## Evidence and bounds

I read `.agents/playtesters/protocol.md`, then the Amber replay, then Cobalt in `/tmp/context-switch-critic-forward.json`. These are captured, source-informed deterministic heuristic replays, not browser play or independent discovery. I used read-only shell and `mise exec -- bun` to select actions, state summaries and events. I did not inspect game source, tests, README, other reports, private mappings or implementation rationale. Build identities were deliberately withheld; the neutral labels identify this comparison.

Both declare `fastest`, a 1,200 simulated-second budget, 2,000 action budget and 0.05-second ticks. Initial state, action sequences/times/acceptance, final rules state excluding the ending prose, and metrics match exactly. Each route stops at the ending at 119.8 simulated seconds, covers both chapters and seven named repair tickets, and delivers cache freshness and speedup. Optional follow-up, revisions, escalation, upgrades and actual pane use are absent. There are 59 action records: 25 successful assignments, 25 approvals, three compactions, one mitigation and five rejected compactions. These are rule actions, not measured terminal command counts. Simulated quota-paused time is 67.6 seconds; no-work time is 0.269 seconds. Tool latency is not game waiting.

## Supporting moments

1. **Conditional work time is clearer in Cobalt.** At action 23 (31.1s), FIX-312 starts on Spark. Amber says estimated review in 6s; Cobalt says 6 work-seconds at full speed. Spark hits its limit at 33.021s and review arrives at 49.704s, 18.604s after assignment. At actions 32–34 (60s), three Spark tasks start with four/five-second messages, but their reviews arrive at 80.667s and 87.185s. Cobalt's qualifier better explains why these are not wall-clock promises. This does not remove the stalls: all timestamps match.

2. **Cobalt supplies a concrete next capability at an unlock.** At 8.05s, after action 7, both unlock session three. Cobalt names split panes and supplies `pane split quota`; Amber names `watch agents` and Workspace Isolation. The pool later bottoms out at 13.830s, so the advertised quota view has a relevant purpose. This is a discovery affordance, not evidence that the pane works or improves play: neither replay invokes it.

3. **Cobalt credits the observed repairs at the ending.** Action 59 at 119.8s reaches the ending. Earlier action 10 resolves privacy at 11.4s, action 16 resolves the runtime issue at 20.65s, action 28 resolves the export incident at 56.15s, action 35 restores test integrity at 80.7s, action 40 resolves the contract at 91.65s and action 57 resolves retry at 109.95s. Amber's title says Legal has follow-up questions while its own body lists the repairs. Cobalt's title says the repairs held and its extra sentence explicitly distinguishes repaired defects from historical costs. That better explains useful recovery without changing the identical throughput 20, reliability 0, trust 100 and debt 49 ending scores.

## Shared structural observations and tradeoffs

Recovery changes the next action in both. Actions 25–28 approve a blocked export repair at 49.75s, switch Spark to Couplet, compact at 52.35s, and deliver the clean repair at 56.15s. Actions 54–57 repeat this pattern for retry: blocked repair at 105.15s, Couplet reassignment, compaction at 105.55s, clean resolution at 109.95s. This is a useful recovery sequence; the second occurrence also risks becoming a routine rather than adding a new choice. The replays do not establish an everywhere-dominant provider or distinguish how much benefit came from provider switch versus compaction.

The contract consequence at 87.2s is actionable: the event names the unresolved compatibility warning, FIX-420 and the block on INT-422; actions 39–42 repair then join. That is stronger evidence of an understandable consequence than confidence percentages alone. The pre-approval review evidence and actual conversations are not captured, so I cannot judge whether a newcomer could predict each risk before approving it.

The retry route has a clarity question shared by both: action 47 assigns FIX-502 at 100.55s, then the 101.35s event says containment is required before FIX-502 can start. Action 49 rolls back at 101.4s. This may be a mid-work gating explanation rather than a defect, but the replay does not resolve the apparent ordering. Four rejected compactions at actions 50–53 (104.05–104.2s) have no captured rejection responses, so their learnability is unassessed.

Cobalt adds text to the unlock and ending score explanation. Its ending formula explains the cache commitment and a deferred optional speedup credit, but this route already earns all five cache points and never takes that branch. The extra formula may help a different route; here it adds reading without changing a decision. I would not count length as a benefit. No measured mechanical regression is shown; no UI, accessibility or save-compatibility conclusion is possible from these snapshots.

## Follow-up that would discriminate

At the 8.05s unlock, a visible-information browser route should attempt `pane split quota`, use it when the pool hits zero, and record whether it changes the next useful action. This would establish whether Cobalt's concrete prompt earns its extra text.

At the first quota stall (13.830s), compare a policy that immediately spreads work between independent pools with this fastest replay. Success would mean less simulated stall or a meaningful cost tradeoff, not merely additional commands. Both current replays leave substantial quota stalls despite nearly continuous work.

At action 59, capture a route that defers cache speedup and then optionally restores it. A useful ending explanation would show the single credited scope change and historical costs consistently. The supplied route cannot verify the optional-credit claim.

I would use the supplied ending as the bounded stop point. A possible willingness-to-stop friction point is the 60–80.7s stretch: three workstreams exist, yet no accepted action occurs for 20.7 simulated seconds while Spark is quota limited. This is a critic's stopping observation, not human retention evidence.

This judgment may correlate with another critic because of shared model, protocol and taste brief. Reverse-order agreement would corroborate these narrow observations, not yield independent population evidence. I do not know which label is newer or who authored either variant; there is no universal fun score or claim of human enjoyment.

## Additional neutral diagnostic pair

I read `/tmp/context-switch-critic-diagnostic.json` in its declared order, Amber then Cobalt, with the same blind, replay-only restrictions. Labels here refer to this diagnostic fixture; I do not assume a shared implementation mapping with the earlier fixture, or that any difference was intentional.

Under the same fast-orchestration preference, **prefer diagnostic Amber**. Its first useful action occurs immediately; diagnostic Cobalt supplies five extra simulated seconds before any useful action, with no captured decision, consequence or recovery benefit in that interval.

Both declare policy `revise`, a two-shipment stop, a 120-second/100-action budget and 0.05-second ticks. Both have seven accepted action records (three assignments, two revisions and two approvals), no errors, no quota-paused time, two shipped tickets, zero defects, trust 48, health 87, debt 1 and quota spend 59.262. Each leaves the cache restoration in progress at 34%; no ending, cache completion, optional follow-up or later discoveries are covered.

The difference is a uniform five-second offset in captured useful actions and their events. Action 1 assigns APP-101 to Couplet at 0s in Amber and 5s in Cobalt. Action 2 ships it and unlocks session two at 3s versus 8s. Actions 3–4 start APP-118 and PERF-204 in parallel at 3s versus 8s. Actions 5–6 request their revisions at 10s/11s versus 15s/16s. Action 7 ships the privacy correction at 12.7s versus 17.7s. Engine active time is identical at 12.663 seconds and occupied slot time at 22.4 seconds; no-work time is 0.037 versus 5.037 seconds. No captured event explains the initial idle interval.

The revision consequence is understandable and identical in both: action 5's event specifies the narrower verification pass, 2.66 work-seconds, zero upfront quota, ongoing drain and context recovery; its clean review arrives 2.66 seconds later. Action 6 names restoration of invalidation with ledger, five seconds of work and three upfront quota while retaining speedup scope. These are useful consequences, but Cobalt's initial delay neither changes them nor adds an observed choice. The texts match, so there is no compensating explanatory-copy gain in this pair.

This diagnostic reverses the label preference for this pair only: Amber wins on immediate action, whereas the main pair had identical timing and a narrow Cobalt copy preference. I would not combine the fixtures into an overall variant winner without a disclosed relationship and wider matched coverage. The main gameplay tie remains intact. Removing or explaining the initial five-second idle interval would be the specific diagnostic recommendation; improvement would be an earlier first useful action with the same subsequent decisions and outcomes, or a concrete valuable decision captured during that interval. I cannot tell from this evidence whether the interval comes from rules, the replay policy or another mechanism.

I would stop at the declared two-shipment boundary, since the fixture ends there. The five-second silent opening is a stopping-friction observation under the brief, not evidence of human frustration or retention. Correlated-model and replay limitations still apply.
