# Context Switch — Evidence Based Fun Iteration

<!-- linear-source:d06b71dc-a034-4333-a0a1-8e352dd5d75b -->

Migrated from Linear on 8 October 2026. This preserves the original specification and dated history; historical workflow instructions and earlier pending statuses describe their original context. Current work is tracked in [GitHub Issues](https://github.com/Tien-Lam/context-switch-game/issues) and [Projects](https://github.com/users/Tien-Lam/projects/2).

## Shipped release — 5 October 2026 (Sydney)

[Play Context Switch](https://tien-lam.github.io/context-switch-game/). [Tien-Lam/context-switch-game#1](https://github.com/Tien-Lam/context-switch-game/pull/1) merged, and [GitHub Pages run 37224053996](https://github.com/Tien-Lam/context-switch-game/actions/runs/37224053996) succeeded.

Published main commit: `275a4bc2aa7ec845de369fd38e0b1b74232947f2`. Tested local commit: `349a92ce582ba1a077619b96f4d7c213f76b1922`. Both have the identical source tree `7ad0b867ec3cf7924bb6d56f865f34e88e841a52`; publication used the GitHub Git Data API through gh. Public HTML returned HTTP 200, the game rendered in the in-app browser, and deployed asset `index-Cp42xZ77.js` matched the local build byte-for-byte (SHA256 `a357a0cbfa4066870b72a442f78a7a2b4c5d198e825ec2c9d1772b28454835e3`).

Final gates: 233 tests across 16 files, typecheck and production build; 68 browser tests (34 scenarios across desktop/mobile); independent final rules re-review with 109 focused tests. Actual fresh browser play completed five shipments in 22 commands. Root sidebar verification additionally checked natural task constraints and compact viewport reachability. Browser session time is not a human usability or enjoyment metric.

[TIE-353](https://github.com/Tien-Lam/context-switch-game/issues/48), 354, 355, 357–363 and 368 are implemented, reviewed and shipped. [TIE-364](https://github.com/Tien-Lam/context-switch-game/issues/58) is Done as a completed rejected experiment; no compaction queue was shipped. The experiment added time, an action and quota without demonstrated decision benefit.

[TIE-365](https://github.com/Tien-Lam/context-switch-game/issues/59) remains In Review: the replay tooling shipped, but a second independent reverse-order blind critic has not run because additional agent sessions were unavailable. One blind critic found a gameplay tie on the matched release route and a narrow copy preference for the candidate. This is not proof of improved human enjoyment or completed comparative acceptance. The project and initiative remain active until that gate is satisfied.

Detailed evidence, repros and limitations are committed under `.agents/playtesters/reports/2026-10-05-release-qa.md` and companion reports. Historical baseline findings below remain historical evidence, not current unresolved bugs.

---

## Shipping authorized

The user requested shipping on 5 October 2026 Sydney time. The queued implementation phase is now active in three parallel streams. The funded compaction item remains an experiment with a rejection gate. Prior evaluation and preparation records below remain historical; candidate testing and publication will be recorded separately.

## Current execution boundary

Evaluation and ticket preparation are complete. The user's latest instruction is to prepare improvements for agents, so gameplay fixes, prototypes and candidate comparisons remain queued and must not be described as shipped. Two evidence/preparation tickets can close; the twelve implementation/experiment/tooling tickets remain Todo with explicit dependencies. The published e1c55d8 baseline is unchanged.

User-approved follow-up to the online research on AI evaluation of fun and taste. Upgrade reusable clean-context playtester charters; capture independent observed browser experience and multi-policy systems evidence; identify and fix gameplay weaknesses; compare baseline and candidate builds with blinded variant labels and reversed presentation; run correctness review and repeat playtesting. Keep bugs, structural findings and taste judgments separate. Agent preferences are not human retention or validated population enjoyment. No AI APIs, telemetry services or network dependencies enter the game.

Original summary: Gameplay improvements shipped and verified on GitHub Pages. Implementation and QA tickets closed; TIE-365 remains open for an independent reverse-order blind comparison.

## Linked resources

- [Baseline gameplay findings and agent ready improvement backlog](https://github.com/Tien-Lam/context-switch-game/blob/main/docs/linear-migration/documents/e0a5b634-fcfe-4217-b732-32f4eb8c8196.md)
- [Evidence based gameplay evaluation and agent pickup protocol](https://github.com/Tien-Lam/context-switch-game/blob/main/docs/linear-migration/documents/0869e667-617c-4ae4-a09b-2d06abbea007.md)

<details>
<summary>Original metadata and resource index</summary>

```json
{
  "id": "P-TIE-20",
  "uuid": "d06b71dc-a034-4333-a0a1-8e352dd5d75b",
  "icon": null,
  "color": "#bec2c8",
  "name": "Context Switch — Evidence Based Fun Iteration",
  "summary": "Gameplay improvements shipped and verified on GitHub Pages. Implementation and QA tickets closed; TIE-365 remains open for an independent reverse-order blind comparison.",
  "url": "https://linear.app/tienlam/project/context-switch-evidence-based-fun-iteration-dec697f4b6c4",
  "resourceCount": 2,
  "createdAt": "2026-10-04T17:39:11.352Z",
  "updatedAt": "2026-10-04T18:25:43.205Z",
  "startedAt": "2026-10-04T17:39:11.432Z",
  "completedAt": null,
  "canceledAt": null,
  "startDate": "2026-10-04",
  "startDateResolution": null,
  "targetDate": null,
  "targetDateResolution": null,
  "priority": {
    "value": 0,
    "name": "No priority"
  },
  "labels": [],
  "initiatives": [
    {
      "id": "9df0b451-a9c9-4204-b6a9-37d39f3a65d2",
      "name": "Context Switch"
    }
  ],
  "lead": {},
  "leadTeam": {
    "id": "7a88d71d-eac6-404e-a83d-f3b37d5c6efa",
    "name": "Tien's Team",
    "key": "TIE"
  },
  "status": {
    "id": "01fba55f-4f73-49d5-98ad-fb7eae790683",
    "name": "In Progress",
    "type": "started"
  },
  "teams": [
    {
      "id": "7a88d71d-eac6-404e-a83d-f3b37d5c6efa",
      "name": "Tien's Team",
      "key": "TIE"
    }
  ],
  "members": [],
  "milestones": [],
  "resources": [
    {
      "type": "document",
      "id": "e0a5b634-fcfe-4217-b732-32f4eb8c8196",
      "title": "Baseline gameplay findings and agent ready improvement backlog",
      "icon": null,
      "color": null,
      "url": "https://linear.app/tienlam/document/baseline-gameplay-findings-and-agent-ready-improvement-backlog-7e40be713357",
      "createdAt": "2026-10-04T17:54:08.456Z",
      "updatedAt": "2026-10-04T18:25:43.080Z"
    },
    {
      "type": "document",
      "id": "0869e667-617c-4ae4-a09b-2d06abbea007",
      "title": "Evidence based gameplay evaluation and agent pickup protocol",
      "icon": null,
      "color": null,
      "url": "https://linear.app/tienlam/document/evidence-based-gameplay-evaluation-and-agent-pickup-protocol-db67dacf26ea",
      "createdAt": "2026-10-04T17:45:07.373Z",
      "updatedAt": "2026-10-04T17:54:41.498Z"
    }
  ]
}
```

</details>

## Original discussion

<!-- linear-source:a41da812-a5bc-4d80-82d5-71bf5e03d211 -->

**Imported Linear comment** · Tien Long Lam · 2026-10-04T17:56:24.270Z

Evaluation protocol, all five charters, four baseline reports and the pickup index are committed locally as73afce2 (documentation only; clean worktree). Production game files remain e1c55d8 and no push/deployment occurred. `mise exec -- bun run check` passed153 tests/typecheck/build. TIE-351/352 Done;12 reviewed follow-ups Todo with six dependency edges; three owner streams documented. Candidate comparisons and second fresh browser policy remain open in TIE-365. Pickup index: `.agents/playtesters/reports/2026-10-05-pickup.md`; full evidence: https://linear.app/tienlam/document/baseline-gameplay-findings-and-agent-ready-improvement-backlog-7e40be713357.

<details>
<summary>Comment provenance</summary>

```json
{
  "id": "a41da812-a5bc-4d80-82d5-71bf5e03d211",
  "author": {
    "id": "9eae46f7-c527-49bc-8d6a-465118651013",
    "name": "Tien Long Lam"
  },
  "onBehalfOf": null,
  "createdAt": "2026-10-04T17:56:24.270Z",
  "updatedAt": "2026-10-04T17:56:24.218Z",
  "parentId": null,
  "resolvedAt": null,
  "quotedText": null,
  "attachments": []
}
```

</details>

---

<!-- linear-source:14a6ad15-386b-4de9-be3d-3f5fecd64085 -->

**Imported Linear comment** · Tien Long Lam · 2026-10-04T18:20:24.042Z

Functional release reviewed and merged through [PR #1](https://github.com/Tien-Lam/context-switch-game/pull/1). 233 tests/typecheck/build and 68 rendered Chromium runs pass locally. Independent adversarial review completed with follow-up fixes; fresh in-app fast-shipper and expert sidebar play recorded. Publication commit84a8b550fdb5e1178681f71ea8f51c2a454146fc has exact tested source tree7ad0b867ec3cf7924bb6d56f865f34e88e841a52 (local tested commit349a92c). GitHub Pages deployment verification is next. TIE-365 remains open for missing second clean reverse-order critic and completed main opening comparison; no project-complete or universal-fun claim.

<details>
<summary>Comment provenance</summary>

```json
{
  "id": "14a6ad15-386b-4de9-be3d-3f5fecd64085",
  "author": {
    "id": "9eae46f7-c527-49bc-8d6a-465118651013",
    "name": "Tien Long Lam"
  },
  "onBehalfOf": null,
  "createdAt": "2026-10-04T18:20:24.042Z",
  "updatedAt": "2026-10-04T18:20:23.998Z",
  "parentId": null,
  "resolvedAt": null,
  "quotedText": null,
  "attachments": []
}
```

</details>

---

<!-- linear-source:e110bd11-977a-4b32-b5d0-b513352441b1 -->

**Imported Linear comment** · Tien Long Lam · 2026-10-04T18:25:46.086Z

## Shipped release — 5 October 2026 (Sydney)

[Play Context Switch](https://tien-lam.github.io/context-switch-game/). [PR #1](https://github.com/Tien-Lam/context-switch-game/pull/1) merged, and [GitHub Pages run 37224053996](https://github.com/Tien-Lam/context-switch-game/actions/runs/37224053996) succeeded.

Published main commit: `275a4bc2aa7ec845de369fd38e0b1b74232947f2`. Tested local commit: `349a92ce582ba1a077619b96f4d7c213f76b1922`. Both have the identical source tree `7ad0b867ec3cf7924bb6d56f865f34e88e841a52`; publication used the GitHub Git Data API through gh. Public HTML returned HTTP 200, the game rendered in the in-app browser, and deployed asset `index-Cp42xZ77.js` matched the local build byte-for-byte (SHA256 `a357a0cbfa4066870b72a442f78a7a2b4c5d198e825ec2c9d1772b28454835e3`).

Final gates: 233 tests across 16 files, typecheck and production build; 68 browser tests (34 scenarios across desktop/mobile); independent final rules re-review with 109 focused tests. Actual fresh browser play completed five shipments in 22 commands. Root sidebar verification additionally checked natural task constraints and compact viewport reachability. Browser session time is not a human usability or enjoyment metric.

TIE-353, 354, 355, 357–363 and 368 are implemented, reviewed and shipped. TIE-364 is Done as a completed rejected experiment; no compaction queue was shipped. The experiment added time, an action and quota without demonstrated decision benefit.

TIE-365 remains In Review: the replay tooling shipped, but a second independent reverse-order blind critic has not run because additional agent sessions were unavailable. One blind critic found a gameplay tie on the matched release route and a narrow copy preference for the candidate. This is not proof of improved human enjoyment or completed comparative acceptance. The project and initiative remain active until that gate is satisfied.

Detailed evidence, repros and limitations are committed under `.agents/playtesters/reports/2026-10-05-release-qa.md` and companion reports. Historical baseline findings below remain historical evidence, not current unresolved bugs.

<details>
<summary>Comment provenance</summary>

```json
{
  "id": "e110bd11-977a-4b32-b5d0-b513352441b1",
  "author": {
    "id": "9eae46f7-c527-49bc-8d6a-465118651013",
    "name": "Tien Long Lam"
  },
  "onBehalfOf": null,
  "createdAt": "2026-10-04T18:25:46.086Z",
  "updatedAt": "2026-10-04T18:25:46.029Z",
  "parentId": null,
  "resolvedAt": null,
  "quotedText": null,
  "attachments": []
}
```

</details>
