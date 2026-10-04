/** Modeled verification and recovery copy; no external tests run in the game. */
export const RELEASE_EVIDENCE = {
  aggregateFinding: "Recheck release readiness, known-risk inventory and rollback against accumulated repository health",
  genericFinding: "Recheck this change's visible evidence and aggregate review risk",
  revisionReceipt: "The agent is addressing the visible finding with a narrower verification pass.",
  checks: {
    "privacy-default": { clean: "Privacy default and migration checks pass.", repaired: "Privacy migration checks pass after FIX-118 restored the disabled default.", open: "OPEN: privacy still defaults to enabled; FIX-118 is outstanding." },
    "runtime-drift": { clean: "Supported-runtime worker startup checks pass.", repaired: "Worker startup checks pass after FIX-77 removed the legacy shim.", open: "OPEN: the legacy worker remains; FIX-77 is outstanding." },
    "merge-race": { clean: "Isolated concurrent-export checks pass.", repaired: "Concurrent-export and recovery checks pass after FIX-312 repaired the race.", open: "OPEN: concurrent exports can overwrite reports; FIX-312 is outstanding." },
    "test-integrity": { clean: "Checkout checks pass with the original assertion intact.", repaired: "Checkout regression checks pass after FIX-401 restored the assertion and fixed rounding.", open: "OPEN: checkout rounding is unresolved and the original assertion is missing; FIX-401 is outstanding." },
    "contract-mismatch": { clean: "Contract checks pass in both rollout orders.", repaired: "Both rollout orders pass after FIX-420 reconciled the contract.", open: "OPEN: the account contract remains incompatible; FIX-420 is outstanding." },
    "request-loop": { clean: "Bounded-retry and gateway checks pass.", repaired: "Retry and gateway recovery checks pass after FIX-502 stopped the request loop.", open: "OPEN: the request loop remains unresolved; containment is not a repair and FIX-502 is outstanding." },
  },
  cache: {
    stale: "Stale customer summaries remain an unresolved release risk.",
    bypassed: "Customer data is fresh through direct reads. The dashboard speedup is deferred; PERF-205 is optional.",
    restored: "Customer data is fresh and the dashboard speedup is retained.",
  },
  readiness: "These checks describe completed verification; aggregate approval readiness does not clear outstanding release risks.",
  recovery: {
    open: "Known defects still require follow-up; completed repairs do not erase the remaining risks.",
    repaired: "The escaped defects were repaired. The release record keeps their historical costs and credits the recovery.",
    prevented: "Review prevented the known incident routes, and the release kept that evidence intact.",
    repairedTitle: "The release works. The repairs held.",
    openTitle: "The release works. Known risks remain.",
  },
  throttle: {
    solo: "This pool will throttle before the quoted work finishes at full speed.",
    shared: "Owner and concurrent sessions draw from the same pool; current commitments will throttle before full-speed completion.",
    helper: "Owner and helper share the same pool; their combined drain will throttle before full-speed completion.",
    conditional: "Work-seconds stay fixed; elapsed time can be longer. This assumes current commitments and may change with later dispatches.",
    independent: "An independent usable pool is available",
    unavailable: "No independent usable pool is currently available.",
  },
} as const;
