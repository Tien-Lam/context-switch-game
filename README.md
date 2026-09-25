# Context Switch

A local-first narrative idle-management game about supervising fictional coding agents under quota, context, review, and reliability pressure. The game is operated through two fictional coding-agent CLIs: read tickets, start provider-bound sessions, inspect reviews, switch models, and buy structural upgrades with typed or natural-language commands.

Everything in the game is simulated. It does not call an AI service, connect to developer accounts, or access a real repository.

## Terminal progression

- Start with full-window **Anthill Code** and **OpenMind Forge** sessions, each with its own prompt, models, slash commands, and quota pool.
- Ship one ticket to unlock additional provider sessions.
- Ship two tickets to unlock workspace naming.
- Ship three tickets to unlock full-window operations tabs and a true second pane. Use `pane split agents`, `pane split reviews`, or `pane split 2` to monitor work or operate another provider CLI alongside the current one. Use `pane swap` and `pane close` to manage the layout.
- Buy the `terminal-dashboard` upgrade to add the graphical live dashboard as a dedicated tab.

Run `/help` in either provider session for its command reference and `mux` to inspect terminal unlocks.

Risky approvals can open short `FIX-*` incident tickets. They appear only after the related defect escapes review. Completing the repair before the later audit prevents that consequence; an unresolved incident changes the final ledger and ending.

The investor demo is now a chapter break. Its follow-up pack starts with QA-401's suspicious green build, then opens API-420 and UI-421 for parallel provider work. Their combined contract check can reveal an incompatibility even when each branch passed its own tests. The last arc pairs a retrying client with a gateway rollout. If the client creates a request loop, `incident status` shows the evidence and `incident mitigate rollback|rate-limit|scale` offers immediate containment choices before FIX-502 can start. Repairing the retry before the gateway ships prevents the incident entirely. SHIP-2 closes the run.

The second shipment triggers a fictional Anthill plan change. Its quota reduction makes the independent OpenMind pool useful early in the shift. `trace` shows the current run's local events and counters. `sound on|off` and `motion reduce|auto` control optional review chimes and animation; the title bar exposes both settings. No usage data leaves the browser.

## Pacing principle

Waiting is not the challenge. Normal-speed agent runs reach review in roughly 3–16 seconds, with the tutorial completing in about 3 seconds. Parallel execution unlocks after that first shipment. The pressure comes from switching providers before quota becomes a bottleneck, reviewing multiple changes, accepting risky shortcuts, and fixing the consequences quickly.

The player is the human judgment in the loop, so there is no artificial attention or energy meter. Planning and compaction consume provider quota, revisions consume another agent pass, and escalation trades organizational trust and the ticket reward for an independent check that strengthens repository health. Approval is immediate: the decision comes from the displayed change summary, test result, warning signal, diff scope, review score, and explicit pass/blocked gate.

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

## Alpha build

`mise exec -- bun run build` creates a static site in `dist/`. The build uses relative asset paths so it can be served from a domain root or a subdirectory. Serve the directory over HTTPS with any static host; the game uses browser-local IndexedDB and localStorage for saves. Export a save before clearing site data or switching browsers. The game has no server or external AI dependency.

The `main` branch publishes the game to GitHub Pages through [the Pages workflow](.github/workflows/pages.yml). The workflow installs the tools from `mise.toml`, runs the quality gate, and deploys `dist/`. GitHub Pages must use **GitHub Actions** as its publishing source. The browser stores saves per site origin, so a save from a local preview does not appear on the hosted site unless it is exported and imported.

This is a scripted local alpha with 16 main-route tickets and seven conditional repair tickets across two chapters. Real-player timing and overall pacing remain to be validated before a wider release.

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
