# Context Switch

A local-first narrative idle-management game about supervising fictional coding agents under quota, context, review, and reliability pressure.

Everything in the game is simulated. It does not call an AI service, connect to developer accounts, or access a real repository.

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
- `src/ui`: React command-centre interface.
- `tests`: rule, scenario, and persistence tests.

The simulation never reads the wall clock. The application passes explicit elapsed time, allowing normal play, background catch-up, and tests to use the same rules.
