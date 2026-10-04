# Context Switch

[Play the alpha on GitHub Pages](https://tien-lam.github.io/context-switch-game/).

A local-first narrative idle-management game about supervising fictional coding agents under quota, context, review, and reliability pressure. Start at a terminal prompt and type `anthill` or `forge` to launch a fictional agent in that tab. Ask the agent to take work, inspect reviews, or explain a ticket in your own words; switch back to Terminal for exact tools such as `tickets list` or `reviews read APP-101`.

Everything in the game is simulated. It does not call an AI service, connect to developer accounts, or access a real repository.

## Terminal progression

- Start with two full-window terminal tabs. Type `anthill` or `forge` in either tab to launch **Anthill Code** or **OpenMind Forge**, each with its own prompt, models, slash commands, and quota pool.
- After launch, switch between **Agent** and **Terminal** inside the tab. Each surface keeps its own input and history; terminal tools are available even before an agent launches.
- The terminal includes a persistent, shared virtual workspace: `pwd`, `ls`, `cd`, `cat`, `find`, `grep`, `head`, `tail`, `wc`, `tree`, `mkdir`, `touch`, `cp`, `mv`, `rm`, `echo`, pipes, and output redirection. `git status|log|diff` reflects scripted work. Run `help` for the complete supported command list. This is a sandbox; it never accesses your computer's files, and edits do not complete tickets.
- Shell syntax includes `&&`, `;`, `<`, `>`/`>>`, quoted arguments, `~`, `$HOME`/`$PWD`/`$OLDPWD`, segment globs (`*` and `?`), and `cd -`. Read-only game tools can feed pipes, such as `tickets list | grep APP`. Game mutations must run directly, not inside chains or pipelines. Variables do not perform word splitting; unmatched globs remain literal, and quoted/escaped globs do not expand. This is not a complete POSIX shell: no arbitrary variables, scripts, substitution, background processes, or real commands.
- Tab completes shell commands/paths; Shift+Tab still navigates controls. Ctrl+C clears unselected input without cancelling scripted work; Ctrl+L clears the current transcript. `/exit`, `exit`, or Ctrl+D on empty input returns to the shell; type the same provider command to resume the preserved conversation. Background work keeps running. Launch the other provider in another tab while this tab owns unfinished work.
- Reload restores the selected tab, cwd and conversation. Run `/help` for the full provider/game workflow reference. Revision responses name their actual execution slot; unlock events appear in the owning tab's currently viewed surface.
- Ship one ticket to unlock additional terminal tabs. New tabs also start at a shell prompt.
- Ship two tickets to unlock workspace naming.
- Ship three tickets to unlock full-window operations tabs and a true second pane. Use `pane split agents`, `pane split reviews`, or `pane split 2` to monitor work or operate another provider CLI alongside the current one. Use `pane swap` and `pane close` to manage the layout.
- Buy the `terminal-dashboard` upgrade to add the graphical live dashboard as a dedicated tab.

Run `/help` in either provider session for its command reference and `mux` to inspect terminal unlocks.

Risky approvals can open short `FIX-*` incident tickets. They appear only after the related defect escapes review. Completing the repair before the later audit prevents that consequence; an unresolved incident changes the final ledger and ending.

The investor demo is now a chapter break. Its follow-up pack starts with QA-401's suspicious green build, then opens API-420 and UI-421 for parallel provider work. Their combined contract check can reveal an incompatibility even when each branch passed its own tests. The last arc pairs a retrying client with a gateway rollout. If the client creates a request loop, `incident status` shows the evidence and `incident mitigate rollback|rate-limit|scale` offers immediate containment choices before FIX-502 can start. Repairing the retry before the gateway ships prevents the incident entirely. SHIP-2 closes the run.

The second shipment triggers a fictional Anthill plan change. Its quota reduction makes the independent OpenMind pool useful early in the shift. `trace` shows the current run's local events and counters. `sound on|off` and `motion reduce|auto` control optional review chimes and animation; the title bar exposes both settings. No usage data leaves the browser.

PERF-204 now has two deliberate scope outcomes. Ask to **restore invalidation** to keep fresh, fast dashboard reads and the full 12-trust reward, or **bypass the cache for now** to deliver fresh-but-slower reads in a shorter pass for 7 trust. The bypass unlocks optional PERF-205 to restore performance for another 5 trust; the finale never requires it. Later audits and the ending remember the delivered scope.

For restoration, Anthill prefers a **contract ledger** (5 seconds of work, 3 upfront provider quota, one slot, +12 context), while Forge prefers **isolated probes** (3 seconds of work, a supporting slot consuming half the model's quota rate, +3 context). Both accept either workflow. Forge explains its ledger fallback when no helper slot is available; explicitly requested probes require a free unlocked slot. Supporting work releases its slot at review and survives reload. Agent requests stay natural-language; Terminal supports `reviews revise PERF-204 --remedy restore|bypass [--workflow ledger|probes]`. Questions and ambiguous choices do not start a revision, and a generic additional pass preserves the chosen scope.

The current terminal is a deterministic game shell rendered by the existing React interface. [Xterm.js](https://github.com/xtermjs/xterm.js) is a strong candidate if the game later needs ANSI escape sequences or full-screen terminal programs, but it is a terminal frontend, not a shell or command implementation. A full browser runtime such as [WebContainers](https://webcontainers.io/guides/quickstart) would add process execution and cross-origin-isolation requirements that this scripted, static-hosted alpha does not need.

## Pacing principle

Agent conversations accept bounded authored constraints: for example, `Please take APP-118 with telemetry off by default` uses the planned brief for 5 upfront quota and reports the completed default/migration evidence at review. A fixture-only request asks you to choose the default first; unsupported compound or conditional decisions ask for clarification without changing work. Models can be selected conversationally, while exact shell syntax remains in Terminal.

Reviews quote actual work-seconds, upfront charges and ongoing model/helper drain separately. Quota guidance explains shared-pool throttling when consequential; it is not a promise of elapsed time. Results appear in the invoking tab and background events remain with the owning session. Upgrade prices spend trust, and purchasing the dashboard shows its opening command without switching your view.

Forge offers medium or high effort for new work. Legacy low-effort jobs retain their original results; restored terminal defaults move future assignments to medium. Final reviews retain outstanding incident evidence even after a release recheck. Endings distinguish prevention, successful repairs and remaining risks; the cache commitment's existing five throughput points split into four for freshness and one for speed, with optional PERF-205 restoring only the deferred speed point.

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

Either save backend can preserve progress if the other is unavailable. If both are denied, play, restart and valid imports still work in memory; a warning explicitly says the run is not saved. Export the game save before closing or reloading. Export does not include terminal history or sandbox files.

The `main` branch publishes the game to GitHub Pages through [the Pages workflow](.github/workflows/pages.yml). The workflow installs the tools from `mise.toml`, runs the quality gate, and deploys `dist/`. GitHub Pages must use **GitHub Actions** as its publishing source. The browser stores saves per site origin, so a save from a local preview does not appear on the hosted site unless it is exported and imported.

This is a scripted local alpha with 16 main-route tickets, seven conditional repair tickets and one optional performance follow-up across two chapters. Save envelopes are version 9 with sequential migration of earlier saves. Real-player timing and overall pacing remain to be validated before a wider release; agent review and browser playtesting do not establish human fun.

Browser smoke tests, after Playwright's project-local browser is available:

```sh
mise exec -- bunx playwright install chromium
mise exec -- bun run test:e2e --project=desktop
```

## Architecture

Developer-only policy replay tooling is documented in [scripts/evaluation/README.md](scripts/evaluation/README.md). `mise exec -- bun run evaluate suite --build <commit> --out /tmp/replays.json` records deterministic policies and outcomes locally. These metrics and agent judgments are evidence for specific hypotheses, not a human-fun score. The funded-compaction reservation experiment was rejected for its demonstrated recovery route; no reservation queue or new saved state ships.

- `src/content`: validated providers, models, tickets, upgrades, and story copy.
- `src/game`: serialisable state and deterministic simulation commands.
- `src/app`: browser persistence and state orchestration.
- `src/ui`: React terminal multiplexer and deterministic command parser.
- `tests`: rule, scenario, and persistence tests.

The simulation never reads the wall clock. The application passes explicit elapsed time, allowing normal play, background catch-up, and tests to use the same rules.
