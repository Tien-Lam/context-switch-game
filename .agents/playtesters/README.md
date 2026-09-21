# Context Switch playtest panel

These charters define five reusable, clean-context playtest roles. They are repository artifacts, not permanently running agents.

To invoke one, create a clean-context sub-agent, give it the repository path and the matching charter, and ask it to evaluate either a named feature or the complete game. Playtests are read-only unless the user explicitly asks the tester to implement fixes.

## Roles

- `bug_rules.md` — simulation, persistence, progression, accounting, and exploits
- `bug_ui.md` — CLI, multiplexer, responsive behavior, accessibility, and feedback consistency
- `quality_onboarding.md` — first-session comprehension, pacing, and discoverability
- `quality_systems.md` — balance, strategy, upgrades, concurrency, and replayability
- `quality_narrative.md` — story continuity, provider personality, consequences, and endings

Run at most three roles at once. For a whole-game review, run them in two waves and synthesize duplicated findings as stronger evidence rather than separate issues.

Every report must separate confirmed defects, measured observations, and taste judgments; include reproduction steps or play routes; cite repository files and lines; and finish with prioritized recommendations.
