# Release fast-shipper browser playtest

Build: `2be58f6bf13d8e175d089472bd5d6e0cb1f92e44`. Policy: maximize throughput, accept recoverable risks, use visible tools. Read only protocol and onboarding charter before play; fast-shipper assignment overrides the charter's explorer default. No source, tests, prior reports, or solution routes inspected. Actual hidden in-app browser play via `mcp__cua_repl`.

## Coverage and measurements

Opening `http://127.0.0.1:4173` restored another save (3 shipped and an existing transcript). Submitted no commands there and did not clear it. Navigated the same hidden tab to fresh `http://localhost:4173`; initial state 09:00, zero shipped. Coordinator was informed to reserve this origin.

Stopped at assigned five-shipment boundary: APP-101, APP-118 with a known defect, PERF-204 bypass, FIX-118 recovery, PERF-205. 22 submitted commands, zero invalid-command responses, zero help commands, two provider-tab changes, two surface toggles. First useful command was `tickets list` immediately on the fresh screen; exact reading-to-command time was not measured. First shipment: 12.458 seconds from first command submission setup, command 5. Final shipment: 102.364 seconds from that same point. Game clock ended 09:01. No deliberate idle wait, time acceleration, or simulated `wait` command. Jobs advertised 3 + 5 + 8 + 1.5 + 4 + 4 = 25.5 work-seconds, partially overlapping. Browser interaction calls were generally 0.25–0.50 seconds; elapsed session time also includes reading and deciding and must not be called game waiting.

## Exact route and consequential predictions

1. `tickets list`: only APP-101 initially ready. Useful goal discovery without external help.
2. `forge`: launched Spark, described parallel work and shared-branch isolation.
3. `Please take the next ticket`: APP-101, 3 work-seconds.
4. `What changed in APP-101?`: risk 23, gate passed, label/snapshot, 12 UI checks. Confidence before review was moderate: small first ticket and quick model; after evidence, approval had clear support.
5. `Approve APP-101`: clean +8 trust, balance 38; Session 2 and parallel provider seat unlocked. Expected useful throughput increase; immediately used it.
6. `Please take the next ticket`: APP-118 on Spark, 5 work-seconds.
7. Switched to second tab; `anthill`: Ballad launched with separate quota.
8. `Take PERF-204`: Ballad, 8 work-seconds, using the newly free slot while APP-118 waited for review. Expected parallel progress; visible ready review followed.
9. `What changed in APP-118?`: risk 45, unresolved finding; enabled default and no migration fixture. All review choices were explainable before acting: approve ships warning, revise checks it, escalate trades trust for health without delivery.
10. `Approve APP-118`: deliberately expected known defect and follow-up, not a clean delivery. Received +4 trust, `Recovery: FIX-118 ready`, visible defect event. Anthill policy event removed 14 quota and explained switching to independent OpenMind pool.
11. `What would this take?`: PERF-204 unresolved invalidation, risk 38. Ledger 5s/3 upfront quota/one slot/+12 context; probes 3s/extra supporting slot/no upfront quota/+3 context. Bypass promises fresh data, reduced reward and deferred speed point. Confidence before review: Ballad should lower aggregate risk, but known invalidation finding would remain; confirmed.
12. `Bypass the cache for now`: expected fastest safe delivery and optional later speed repair. 1.5s, zero upfront quota, no helper. Clearly stated reduced +7 trust and PERF-205 follow-up.
13. Switched to Forge; `Take FIX-118`: 4s recovery while Ballad bypass completed. Expected existing-workspace migration rather than retrying the same failure; confirmed later.
14. `What changed in PERF-204?`: risk 20, passed, fresh direct-read mutation checks, latency explicitly slower, 4/5 scope credit. Expected passed freshness and deferred performance; both confirmed.
15. `Approve PERF-204`: +7 trust, balance 49; Session 3 and split panes unlocked. Instruction offered `pane split quota` and explained branch protection.
16. `What changed in FIX-118?`: risk 39, passed, migrated legacy workspaces to disabled default and fixtures passed. Confidence before reading was moderate despite 77% context; migration evidence made approval explainable.
17. `Approve FIX-118`: +5 trust, balance 54; incident closed, health restored, debt reduced.
18. Switched Forge to Terminal; `pane split quota`: expected a quota view beside work. Created `3 watch.quota`, but no split or watcher appeared. Clicking this new tab produced no state change. See confirmed UI defect below.
19. `agents run PERF-205`: used visible `agents run` syntax and the named optional follow-up, Spark, 4s.
20. `/context`: 69% free, work ready; text said context retained during review. Expected accumulating context cost from repetitions; visible decline from 94% after APP-101 to 69% now confirmed.
21. `reviews read PERF-205`: risk 36, passed, mutation freshness plus cache-hit/latency checks, restored final speed point. Confidence before review: moderate because Spark/context risk, but ticket looked narrower than PERF-204; pass supported by evidence.
22. `reviews approve PERF-205`: clean +5 trust, balance 59, five shipped, zero reviews/debt, three available slots. Ended bounded run.

## Findings

### Observed dev-build UI failure: advertised quota split cannot be reached

At command 18, after Session 3 unlock, `pane split quota` added watch.quota but the rendered screenshot still showed one full-width Forge terminal and no quota content. Accessibility state reported both `1 OpenMind Forge` and `3 watch.quota` selected and both with ID `terminal-tab-term-1`. Clicking watch.quota caused no change. Subsequent commands continued executing in Forge. This prevents the first advertised new tool from serving its stated purpose and makes the unlock feel inert. Cause is uninspected by this tester. After the independent run, coordinator disclosed concurrent local edits/hot reload and a hypothesis that module ID allocation had reset while preserving existing tabs. Therefore this is a confirmed observed dev-build failure, not yet a proven defect in a static release build. Proposed change: ensure newly created watcher has distinct identity and renders/focuses its pane. Demonstration of improvement: this same route shows live pool values beside an operable agent, and selecting either tab activates the intended surface.

### Confirmed presentation defect: raw fractional work durations

APP-101 review printed `1.0133333333333332s work`; APP-118 printed `1.7733333333333334s work`. Other costs were readable (1.5s, 5s). Impact: numeric noise in evidence that players scan to choose a quick repair. Proposed change: round displayed duration consistently without changing deterministic rules. Improvement: reviews show compact durations while actual work and quota remain unchanged.

### Observed strengths and preference judgments

The first useful action and shipment were quick. The second slot changed my next action immediately: start Ballad work while reviewing Spark. Provider characteristics were mechanically visible in risks (Spark +15, Ballad −4), durations, workflow preference, and independent quota. The policy event gave a clear switch suggestion, although this short route did not exhaust quota or force waiting.

The APP-118 mistake had an explicit recovery ticket with meaningfully different migration evidence. It took a familiar start/read/approve sequence rather than undoing earlier progress. Under fast-shipping preference that is a workable consequence; whether approval-then-fix dominates revision is unresolved because I did not compare both routes.

PERF-204 introduced a real scope decision at the third repetition: speed now versus cache performance later, with numbers and review evidence that matched the result. Optional PERF-205 later validated the discovered deferral rule and completed the same scope contribution. Slot occupancy also made probes a meaningful alternative, but I chose bypass, so no direct probe or ledger comparison is claimed.

Review evidence was understandable before approval. Some generic `warning` rows describe benign outcomes (FIX-118: support can verify a stored choice; PERF-205: speed restored safely), while guidance and gate distinguish actual defects. Taste recommendation: label benign observations separately if players misread these as unresolved findings; I did not make that mistake here and have no evidence it blocked play.

The terminal-only history after switching surfaces included earlier launch text and a stray earlier agent line, while the active agent history had the detailed later reviews. This was noticeable but did not prevent any command; no correctness claim beyond observed presentation.

## Stop point and limits

Willingness-to-stop observation: I would pause to resolve the watcher issue before attempting more simultaneous orchestration; the intended monitoring capability was unavailable. I could continue shipping with existing tabs, but the assigned five-ship boundary ended play. This is an agent policy choice, not a human retention measure.

Not covered: PLAT-77/runtime compatibility, API-88, later release gates, dashboard, upgrades, exhaustion, compaction, plan mode, explicit invalid parser recovery, independent-review escalation, or final release. No causal analysis or source verification performed. Existing default-origin save preserved. Only this report file was written; no fixes.

## Follow-up QA after coordinator changes

Outside the original 22-command discovery budget, coordinator requested one reload and targeted pane verification. Reloading this localhost save preserved five shipments, zero reviews/debt, provider sessions and transcript. The three tab IDs became distinct (`terminal-tab-term-1`, `-2`, `-3`) with only Forge selected. Selecting watch.quota displayed the quota monitor with ANT 60/60 and OMF 55/55 and switched selection to that tab alone. Returned to Forge and submitted one additional `pane split quota`. Screenshot and accessibility state now showed the operable Forge terminal on the left and live quota monitor on the right, `split: watch.quota` status, and only Forge selected. The observed dev-build pane failure was resolved for this save in this follow-up. This does not retroactively change the discovery experience or prove the original static build had the failure. Rounded-duration changes were not specifically retested because there was no active review after the bounded route.

## Separate post-run UI QA appendix

Read bug_ui.md and protocol after completing the independent run. Coordinator asked to reuse my save, which overrides the charter's general fresh-state instruction. Original gameplay metrics above are unchanged. This stage is source/scripted QA, not fresh discovery or a new rendered-browser playtest: the browser backend had become unavailable. Own tab reported browser 2 unavailable; attempting a new hidden iab tab also failed; inventory returned `apps: []`, `browsers: []`. Read browser troubleshooting guidance and retried after resetting the control session; iab remained unavailable. No saves were cleared. Therefore sidebar, 390×844, 320×568, narrow landscape, keyboard-only tab navigation, and reduced-motion rendering remain **unverified in this stage**. The earlier full desktop screenshot/pane recheck is still the only rendered layout coverage.

### P1 scripted correctness finding: cache words bypass conditional review guard

Reproduction in a pure in-memory state: create initial state; mark deployment-banner and telemetry-toggle completed; unlock two sessions; start `cache-summary` on Ballad/session 0; advance 20 seconds to an unresolved PERF-204 review. Evaluate these agent messages without applying their effects:

- `Approve PERF-204 if the tests pass`: correctly returns no effect and says `No review decision made. I won't ignore a condition or extra clause...`.
- `Approve PERF-204 if the cache tests pass`: unexpectedly returns `{type: "review", decision: "approve"}` and `Approving PERF-204.`.
- `Ship PERF-204 if invalidation is safe`: unexpectedly returns the same approve effect.
- `Approve PERF-204 or bypass the cache`: unexpectedly chooses approve rather than resolving ambiguity.

Expected: conditions and alternatives produce clarification/evidence without deciding the pending review. Actual in the version at reproduction: introducing cache vocabulary skipped the residual-clause safeguard at then-current `src/ui/cli.ts:615` (`reviewClause && !cacheIntent`); the following approval dispatch ignored the unresolved finding. This is a confirmed parser defect from a scripted reproduction, not a claimed browser observation. Impact: a player asking to approve only if safe can ship a known defect. Proposed change: validate leftover conditions for cache review decisions too, allowing only explicit, parsed remedy/workflow clauses. Improvement demonstration: these three phrases return no effect while unambiguous restore/bypass revisions still work. No game save was changed and no fix was implemented by this tester. Coordinator subsequently changed this parser; follow-up result appears below.

### P2 source/captured-state finding: mux hints assume fixed provider tab numbers

`muxStatus` at then-current `src/ui/cli.ts:393` hardcoded Anthill Code as tab 1 and OpenMind Forge as tab 2. My independent run visibly had Forge in tab 1 and Anthill in tab 2, so these advertised positions disagreed with a supported launch order. This is source analysis combined with captured browser layout; I could not render the mux output in the unavailable browser. Proposed change: derive positions from actual UI tabs or describe provider sessions without fixed tab numbers. Improvement demonstration: running mux after provider-swapped tab launches gives an accurate hint. The underlying tab ownership in actual play was correct. Coordinator subsequently changed this hint; follow-up result appears below.

### Scripted checks and source observations that passed

Ran `mise exec -- bun x vitest run tests/cliConversation.test.ts tests/reviewIntent.test.ts tests/cli.test.ts`: three files, 92 tests passed. These existing checks do not cover the conditional cache bypass above and are not browser checks.

Additional pure in-memory probes on a working APP-101 showed `What are you working on?` and `What changed in APP-101?` both state working/0% and explicitly say no completed verification evidence exists yet. `What is my current status?` showed model, reasoning, quota, task/state, queue, trust/health and debt without effects. `What upgrades are available?` showed trust balance, costs, unlock gates, descriptions, and a Terminal purchase instruction. Locked `dashboard` returned `dashboard requires upgrades buy terminal-dashboard`. None dispatched work or purchases.

Source review found roving tab semantics and ArrowRight/ArrowLeft/Home/End focus handlers (`src/ui/App.tsx:619`, `:973`), Ctrl/Meta-Tab and Alt-number shortcuts (`:856`), reduced-motion duration overrides (`src/styles.css:217`) and immediate autoscroll when reduced motion is requested (`src/ui/App.tsx:851`). Responsive CSS stacks panes at <=820px (`src/styles.css:385`) and places panes side by side at <=640px/<=500px height (`:422`). These are implementation observations only; focus behavior, contrast, clipping, touch targets, and actual mobile layout cannot be certified without the rendered viewport checks. No additional browser check runner was available in the listed tests, and no new tooling was installed.

### Coordinator-fix follow-up: parser and mux pass scripted recheck

Reran the same conditional-cache reproductions after coordinator's changes. `Approve PERF-204 if the cache tests pass` and `Ship PERF-204 if invalidation is safe` now return no effect and explain the condition needs confirmation. `Approve PERF-204 or bypass the cache` now returns no effect and requests a remedy/workflow choice. The control `Approve PERF-204 if the tests pass` still refuses safely. `Restore invalidation for PERF-204`, `Bypass the cache for now`, and `Revise PERF-204 bypass cache` still return the intended explicit revision effects. The alternate phrase `Revise PERF-204 with bypass` declines the unsupported extra wording rather than acting; this is a coverage observation, not treated as a new defect.

`mux` now says `launch anthill in any terminal` and `launch forge in any terminal`, eliminating invented provider positions. Same three focused test files now pass 103 tests. These resolved findings are scripted/source follow-up results. The backend remained unavailable to this agent; coordinator is performing rendered narrow-viewport checks separately, and this report does not adopt those checks as this tester's coverage.
