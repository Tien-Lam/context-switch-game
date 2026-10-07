# Context Switch — Vertical Slice

<!-- linear-source:5f9849a3-09c1-4f74-80fe-d355331d8bfe -->

Migrated from Linear on 8 October 2026. This preserves the original specification and dated history; historical workflow instructions and earlier pending statuses describe their original context. Current work is tracked in [GitHub Issues](https://github.com/Tien-Lam/context-switch-game/issues) and [Projects](https://github.com/users/Tien-Lam/projects/2).

# Delivered vertical slice

Headless deterministic rules in src/game and authored data in src/content; quota regeneration, context, execution slots, trust, repository health/debt, evidence-driven approve/revise/escalate, causal defects/repairs, ending, local persistence and capped offline catch-up. Primary interface is terminal-first; dashboard is an optional upgrade. Save envelope version 8 remains compatible with optional snapshotSequence ordering metadata. No AI APIs or real repository integrations.

## Release verification — 2026-10-05

Published release 740c4b5: 107 unit/scenario tests and 50 desktop/mobile browser runs passed, with typecheck/build. Two review rounds cover all five specialist charters, plus actual UI play and targeted hosted retesting. [QA record](https://github.com/Tien-Lam/context-switch-game/blob/main/docs/linear-migration/documents/fb98360a-fb99-4de8-82bc-126a81544525.md) · [Play alpha](https://tien-lam.github.io/context-switch-game/). Agent observations do not establish human enjoyment or a fixed session duration.

Final completion audit fixes [TIE-344](https://github.com/Tien-Lam/context-switch-game/issues/39) (both save backends denied: in-memory play/import/restart and honest warning) and [TIE-345](https://github.com/Tien-Lam/context-switch-game/issues/40) (restored event replay) are published and independently reviewed. Five new unit regressions and dual-denial/reload browser coverage extend verification without changing gameplay scope.

Original summary: Delivered headless deterministic simulation, review/incident loop, local saves and playable browser slice.

## Linked resources

- [Technical Specification — Vertical Slice](https://github.com/Tien-Lam/context-switch-game/blob/main/docs/linear-migration/documents/924346bb-ac6b-42e6-ab6b-8f7b7ed3bc36.md)

<details>
<summary>Original metadata and resource index</summary>

```json
{
  "id": "P-TIE-10",
  "uuid": "5f9849a3-09c1-4f74-80fe-d355331d8bfe",
  "icon": null,
  "color": "#7C3AED",
  "name": "Context Switch — Vertical Slice",
  "summary": "Delivered headless deterministic simulation, review/incident loop, local saves and playable browser slice.",
  "url": "https://linear.app/tienlam/project/context-switch-vertical-slice-7db6d360c1fa",
  "resourceCount": 1,
  "createdAt": "2026-09-20T08:09:37.471Z",
  "updatedAt": "2026-10-04T13:32:33.382Z",
  "startedAt": "2026-09-20T08:09:37.498Z",
  "completedAt": "2026-09-20T08:28:59.136Z",
  "canceledAt": null,
  "startDate": "2026-09-20",
  "startDateResolution": null,
  "targetDate": null,
  "targetDateResolution": null,
  "priority": {
    "value": 1,
    "name": "Urgent"
  },
  "labels": [],
  "initiatives": [
    {
      "id": "9df0b451-a9c9-4204-b6a9-37d39f3a65d2",
      "name": "Context Switch"
    }
  ],
  "lead": {
    "id": "9eae46f7-c527-49bc-8d6a-465118651013",
    "name": "Tien Long Lam"
  },
  "leadTeam": {
    "id": "7a88d71d-eac6-404e-a83d-f3b37d5c6efa",
    "name": "Tien's Team",
    "key": "TIE"
  },
  "status": {
    "id": "61cb7c98-0b4a-4f7f-87f7-5b5e1a318774",
    "name": "Completed",
    "type": "completed"
  },
  "teams": [
    {
      "id": "7a88d71d-eac6-404e-a83d-f3b37d5c6efa",
      "name": "Tien's Team",
      "key": "TIE"
    }
  ],
  "members": [
    {
      "id": "9eae46f7-c527-49bc-8d6a-465118651013",
      "name": "Tien Long Lam",
      "email": "lamtienlong9@gmail.com"
    }
  ],
  "milestones": [],
  "resources": [
    {
      "type": "document",
      "id": "924346bb-ac6b-42e6-ab6b-8f7b7ed3bc36",
      "title": "Technical Specification — Vertical Slice",
      "icon": null,
      "color": null,
      "url": "https://linear.app/tienlam/document/technical-specification-vertical-slice-e83def60ecc7",
      "createdAt": "2026-09-20T08:10:28.771Z",
      "updatedAt": "2026-10-04T17:27:02.126Z"
    }
  ]
}
```

</details>

## Dated status updates

### 2026-09-20T08:28:46.085Z — Tien Long Lam

<!-- linear-source:ccb8192b-2232-4a94-a799-2d2de48f507c -->

The playable vertical slice is complete in `/Users/tien/Developer/context-switch` at commit `48c84f8`.

Delivered deterministic agent simulation, eight connected tickets, six fictional models, quota/context/attention management, concurrent sessions, review decisions, causal incidents, upgrades, local persistence, offline catch-up, finale, scorecard, and responsive UI.

Changes recorded with this update:

**Status**: In Progress
**Priority**: Urgent
**Lead**: Tien Long Lam assigned
**Start date** set to Sep 20th

_Progress since Sep 20_: 0% → 100%

<details>
<summary>Update provenance</summary>

```json
{
  "id": "ccb8192b-2232-4a94-a799-2d2de48f507c",
  "health": "onTrack",
  "url": "https://linear.app/tienlam/project/context-switch-vertical-slice-7db6d360c1fa/activity#project-update-ccb8192b",
  "createdAt": "2026-09-20T08:28:46.085Z",
  "updatedAt": "2026-09-20T08:28:46.085Z",
  "editedAt": null,
  "archivedAt": null,
  "isDiffHidden": false,
  "user": {
    "id": "9eae46f7-c527-49bc-8d6a-465118651013",
    "name": "Tien Long Lam"
  },
  "type": "project",
  "project": {
    "id": "5f9849a3-09c1-4f74-80fe-d355331d8bfe",
    "name": "Context Switch — Vertical Slice"
  }
}
```

</details>
