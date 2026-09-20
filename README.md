# Context Switch

A local-first narrative idle-management game about supervising fictional coding agents under quota, context, review, and reliability pressure. The game is operated through a fictional developer terminal: read tickets, start agent sessions, inspect reviews, switch models, and buy structural upgrades with typed commands.

Everything in the game is simulated. It does not call an AI service, connect to developer accounts, or access a real repository.

## Terminal progression

- Start with one shell and the core `tickets`, `agents`, `reviews`, `models`, `quota`, and `upgrades` tools.
- Ship one ticket to unlock independent terminal tabs.
- Ship two tickets to unlock workspace naming.
- Ship three tickets to unlock multiplexer-style monitoring panes.
- Buy the `terminal-dashboard` upgrade to add the graphical live dashboard as an optional pane.

Run `help` in the game for the complete command reference and `mux` to inspect terminal unlocks.

## Development

```sh
mise install
mise exec -- bun install
mise exec -- bun run dev
```

Quality gate:

```sh
mise exec -- bun run check
```

Browser smoke tests, after Playwright's project-local browser is available:

```sh
mise exec -- bunx playwright install chromium
mise exec -- bun run test:e2e --project=desktop
```

## Architecture

- `src/content`: validated providers, models, tickets, upgrades, and story copy.
- `src/game`: serialisable state and deterministic simulation commands.
- `src/app`: browser persistence and state orchestration.
- `src/ui`: React terminal multiplexer and deterministic command parser.
- `tests`: rule, scenario, and persistence tests.

The simulation never reads the wall clock. The application passes explicit elapsed time, allowing normal play, background catch-up, and tests to use the same rules.
