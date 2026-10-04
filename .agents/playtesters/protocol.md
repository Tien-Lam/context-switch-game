# Evidence based game evaluation

Use this protocol with the matching specialist charter. The goal is to improve Context Switch through observed play and comparative design judgments, not to certify human enjoyment. Testers are developer tools; the game never calls an AI service.

## Shared taste brief

The user wants fast, CLI-first orchestration of fictional coding agents. Waiting is not the challenge. Terminal commands have syntax; conversations inside agents accept natural language. Providers should have recognizable, mechanically relevant habits. Reviews need understandable evidence. Mistakes should create interesting, quick recovery. Progression should unlock new capabilities, including tabs, panes and an optional dashboard. The player is the human: do not propose attention, stamina or human bandwidth meters. Do not reward complexity, realism or extra text for their own sake.

These preferences are grounded in the user's feedback, not a validated model of all players. Disagreement is useful; do not pretend the brief determines every preference.

## Independent play

Start with the knowledge a new player would have. Browser players must not inspect source code, tests or solution routes before their first run. Use a separate browser tab and fresh local state for each run; never clear another player's save. Prefer the in-app browser tools when available. If unavailable, report the limitation and use an actual rendered-browser alternative if possible. Never label a unit-test or source-code walkthrough as a browser playtest.

Use one declared policy per run. Fast shippers prioritize throughput and accept recoverable risks. Careful reviewers prioritize evidence and reliability. Explorers prioritize unfamiliar capabilities and optional work. Systems optimizers can inspect rules in a separate stage to search for dominant choices. These are different decision objectives, not demographic personas or independent samples of human players.

Play for a bounded route or action budget, not a requirement to praise or complete the game. Record where you would stop and why. An agent's choice to continue is not a human retention measurement. Report actual simulated wait separately from browser-tool latency.

## Evidence and discovery

Record commands and visible responses at important moments: first useful action, first shipment, provider switch, unlock, surprising review, mistake, recovery and repeated workflow. Before a consequential choice, state the expected result using only visible information; after it, record what changed. Check whether the discovered rule helps in a later situation.

Findings must distinguish confirmed defects, observed behaviour, structural analysis and taste judgments. Cite the exact action sequence and visible evidence; cite files and lines only after the independent run. Report missing evidence as missing, not an invented measurement.

Use these questions:

- Did a decision change the next useful action or later outcome?
- Does changing slot occupancy, quota or context change the preferred strategy?
- Is there one obvious best choice everywhere?
- Does an upgrade unlock a useful action before the ending?
- Did the second or third repetition add a new decision or just repeated input?
- Can the player explain a review and its consequences before acting?
- Did failure create a new problem worth solving, or only undo progress?
- Does additional interaction deliver enough agency or clarity to justify its cost?

Do not optimize these questions into a universal fun score. Extra options, novelty, difficulty, clicks and longer transcripts are not inherently better.

## Comparative evaluation

The coordinator keeps the mapping from neutral variant labels to baseline and candidate. Critics do not receive authorship, release order, implementation rationale or expected winner. Use matched starting states, content, routes and action budgets. A browser critic may play the variants directly; a replay critic may compare captured transcripts, but must say which they used.

Run both presentation orders with separate clean-context critics when practical. Permit a tie or insufficient evidence. Ask which experience better fits a named preference and why. Do not ask whether the improved version improved anything. An evaluator must not judge its own implementation. Shared models and prompts create correlated judgments; agreement is corroboration, not independent statistical evidence.

When a feature is suspect, compare a version without it or a controlled rules scenario. State the lost or gained decision, not just the presence of the feature. Deliberately degraded controls, such as unnecessary waiting or identical provider mechanics, can expose a judge that rewards polish rather than the intended experience. These are diagnostic controls, not changes to the shipping game.

## Reports and iteration

Reports may be saved only to the coordinator-assigned report path. Do not edit game code during evaluation. Each recommendation needs a specific moment, its impact, a proposed change and the result that would demonstrate improvement. Include the build identity, policy, route coverage, tool used, command counts when measured, errors, repetition, discoveries, unresolved questions and willingness-to-stop observation. Do not infer human emotions from successful task completion.

The coordinator selects a small hypothesis, implements it with deterministic tests, then repeats affected browser routes and independent review. Reject a candidate that improves prose while breaking rules, accessibility, pacing or save compatibility. Keep disagreements and regressions in the release record. Label results as correctness, structural depth or preference under this taste brief; human population enjoyment remains unvalidated.

## Research basis

Procedural personas support objective-driven play styles: https://www.antoniosliapis.com/papers/automated_playtesting_with_procedural_personas_through_mcts_with_evolved_heuristics.pdf

LLM judging research documents position, verbosity and self-enhancement biases in conversational evaluation, not validated game-fun accuracy: https://arxiv.org/abs/2306.05685

Moderate variation aligned with fun in a Mario user study; applying this to our game is a design hypothesis: https://scholars.ln.edu.hk/en/publications/fun-as-moderate-divergence-evaluating-experience-driven-pcg-via-r/

AI-player difficulty and engagement predictions require calibration to human data: https://arxiv.org/abs/2107.12061

Grounded profiles and caution about human surrogates: https://arxiv.org/abs/2411.10109 and https://arxiv.org/abs/2410.19599
