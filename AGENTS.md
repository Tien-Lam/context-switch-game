# Context Switch repository instructions

- Use `mise` for runtimes and `bun` for package management and scripts.
- Keep game rules deterministic and independent of React and browser APIs.
- Put authored game data in `src/content`; put simulation rules in `src/game`.
- Every new rule needs a focused unit or scenario test.
- Preserve save compatibility or add a sequential migration.
- Do not add AI APIs, analytics, authentication, or network dependencies without an explicit product decision.
- Do not use real AI company, product, or model names in player-facing copy.
- Run `mise exec -- bun run check` before marking implementation complete.
- Reusable specialist playtest charters live in `.agents/playtesters/`. When a user asks to invoke one, create a clean-context sub-agent from the matching charter and keep playtests read-only unless fixes are explicitly authorized.
