import { z } from "zod";

const WorkflowSchema = z.enum(["ledger", "probes"]);
const WorkCostSchema = z.object({
  seconds: z.number().positive(),
  setupQuota: z.number().nonnegative(),
  contextGain: z.number().nonnegative(),
});

export const CACHE_DECISIONS = z.object({
  scopeCredit: z.object({ freshness: z.number().positive(), speedup: z.number().positive() }),
  ledger: WorkCostSchema,
  probes: WorkCostSchema,
  bypass: WorkCostSchema.extend({ rewardTrust: z.number().positive() }),
  followup: z.object({
    id: z.literal("cache-followup"),
    key: z.literal("PERF-205"),
    duration: z.number().positive(),
    rewardTrust: z.number().positive(),
  }),
  restoreRewardTrust: z.number().positive(),
  helperQuotaMultiplier: z.number().positive().max(1),
}).parse({
  scopeCredit: { freshness: 4, speedup: 1 },
  ledger: { seconds: 5, setupQuota: 3, contextGain: 12 },
  probes: { seconds: 3, setupQuota: 0, contextGain: 3 },
  bypass: { seconds: 1.5, setupQuota: 0, contextGain: 2, rewardTrust: 7 },
  followup: { id: "cache-followup", key: "PERF-205", duration: 6, rewardTrust: 5 },
  restoreRewardTrust: 12,
  helperQuotaMultiplier: 0.5,
});

const ProviderHabitSchema = z.object({
  preferredWorkflow: WorkflowSchema,
  introduction: z.string().min(1),
  restore: z.string().min(1),
  bypass: z.string().min(1),
  ledger: z.string().min(1),
  probes: z.string().min(1),
});

export const CACHE_PROVIDER_HABITS = z.record(z.enum(["anthill", "openmind"]), ProviderHabitSchema).parse({
  anthill: {
    preferredWorkflow: "ledger",
    introduction: "I prefer a write-boundary ledger: name every committed mutation and connect it to invalidation. That takes more time and setup quota, but leaves more context for review. I can use isolated probes instead if you have a free slot.",
    restore: "I will restore invalidation and keep the dashboard speedup. The ledger is my default; you can choose isolated probes instead.",
    bypass: "I can remove cached reads for the quickest fresh-data fix. That gives up the promised speedup and leaves optional PERF-205 to restore it later.",
    ledger: "I will trace create, edit and delete writes, add invalidation at each commit boundary, and record the checks in a mutation ledger. This spends 3 setup quota and recovers 12 context points.",
    probes: "I will restore invalidation while a helper runs isolated create, edit and delete probes. This is faster, but uses a second execution slot and recovers only 3 context points; the helper also spends quota.",
  },
  openmind: {
    preferredWorkflow: "probes",
    introduction: "I prefer isolated probes: repair invalidation while a helper checks create, edit and delete independently. That is faster when a slot is free, but spends helper quota and leaves less context. I can use a write-boundary ledger instead.",
    restore: "I will restore invalidation and keep the dashboard speedup. Isolated probes are my default; you can choose a ledger instead.",
    bypass: "I can switch to direct reads so customer changes stay fresh quickly. The dashboard will be slower; optional PERF-205 can recover the speedup later.",
    ledger: "I will map each committed customer write, restore its invalidation call, and preserve the write-boundary ledger and checks. It takes longer and spends 3 setup quota, but recovers 12 context points without a helper slot.",
    probes: "I will restore invalidation while a helper runs isolated create, edit and delete checks. The helper uses a second execution slot and quota; the short pass recovers 3 context points for the next review.",
  },
});

const EvidenceSchema = z.object({
  summary: z.string().min(1),
  tests: z.string().min(1),
  signal: z.string().min(1),
  scope: z.string().min(1),
});

export const CACHE_EVIDENCE = z.record(z.enum(["ledger", "probes", "bypass", "followup"]), EvidenceSchema).parse({
  ledger: {
    summary: "Restored summary-key invalidation at every committed customer create, edit and delete boundary.",
    tests: "The write-boundary ledger accounts for every mutation; read-after-create, edit and delete freshness checks pass.",
    signal: "Each committed customer write invalidates its summary key. Cached reads retain the dashboard speedup.",
    scope: "The original promise is preserved: fresh customer data and faster cached dashboard reads. +12 trust. Release scope credit: 4 freshness + 1 speedup = 5/5.",
  },
  probes: {
    summary: "Restored invalidation at committed customer writes while a separate helper checked each mutation path.",
    tests: "The helper's isolated create, edit and delete probes pass, including a cached read before and a fresh read after each mutation.",
    signal: "The implementation now invalidates changed summaries; independent probes confirm freshness while repeated reads still use the cache.",
    scope: "The original promise is preserved: fresh customer data and faster cached dashboard reads. +12 trust; a second slot and helper quota paid for the shorter pass. Release scope credit: 4 freshness + 1 speedup = 5/5.",
  },
  bypass: {
    summary: "Removed cached summary reads and read committed customer records directly.",
    tests: "Direct-read create, edit and delete freshness checks pass. The dashboard latency check confirms that the cache speedup is absent.",
    signal: "Customer data is fresh, but every dashboard read reaches the repository and is slower.",
    scope: "Freshness is delivered; the dashboard performance promise is deferred. +7 trust now; optional PERF-205 can restore the speedup for +5 trust. Release scope credit: 4/5 freshness; 1 speedup point deferred independently of capped trust.",
  },
  followup: {
    summary: "Reintroduced cached summary reads with invalidation at every committed customer write.",
    tests: "Create, edit and delete freshness checks pass alongside cache-hit and dashboard latency checks.",
    signal: "The dashboard speedup is restored without reopening the stale-customer-data route.",
    scope: "The performance promise deferred by the bypass is now delivered. +5 trust; this follow-up is optional for the release. The deferred 1 speedup point completes the same 5/5 cache contribution once.",
  },
});
