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

## Work tracking

Use GitHub Issues and GitHub Projects for scope, ownership, status and acceptance evidence. Follow docs/GITHUB_WORKFLOW.md. Historical Linear records and source aliases are preserved in docs/linear-migration/README.md.

## GitHub products and documentation

Use GitHub Issues for scope and acceptance, GitHub Projects for status and priority, GitHub Pull Requests for review, GitHub Actions for automated verification and authorized publishing, and GitHub Releases for versioned releases. Keep README.md, AGENTS.md and repository Markdown docs canonical; an existing GitHub Wiki is a navigation index. Follow [the product map and documentation policy](docs/GITHUB_WORKFLOW.md).
