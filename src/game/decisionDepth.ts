import { modelById, ticketById } from "../content";
import { CACHE_DECISIONS, CACHE_EVIDENCE, CACHE_PROVIDER_HABITS } from "../content/cacheDecisions";
import type { CacheRemedy, CacheRevisionOptions, CacheWorkflow, GameState, ReviewState } from "./types";

export interface CacheRevisionQuote {
  remedy: CacheRemedy;
  workflow: CacheWorkflow | null;
  seconds: number;
  setupQuota: number;
  contextGain: number;
  rewardTrust: number;
  helperNeeded: boolean;
  helperSessionId: number | null;
  fallbackReason: string | null;
}

export interface CacheReviewEvidence {
  summary: string;
  tests: string;
  signal: string;
  scope: string;
}

/** A preview only: assignment and quota validation happen atomically in reviewTicket. */
export function getCacheRevisionQuote(state: GameState, reviewId: string, options?: CacheRevisionOptions): CacheRevisionQuote | null {
  const review = state.reviews.find((candidate) => candidate.id === reviewId);
  if (!review || review.ticketId !== "cache-summary") return null;
  const session = state.sessions[review.sessionId];
  const model = modelById.get(session?.modelId ?? "");
  if (!model) return null;
  // A generic additional pass keeps the player's chosen scope. Only an explicit
  // remedy request changes a fresh-but-slow bypass back into a performance fix.
  const remedy = options?.remedy ?? session.cacheRemedy ?? "restore";
  if (remedy === "bypass") {
    return { remedy, workflow: null, ...CACHE_DECISIONS.bypass, helperNeeded: false, helperSessionId: null, fallbackReason: null };
  }
  const preference = CACHE_PROVIDER_HABITS[model.providerId as keyof typeof CACHE_PROVIDER_HABITS]?.preferredWorkflow ?? "ledger";
  const helperSessionId = state.sessions.find((candidate) => candidate.id < state.unlockedSessions && candidate.id !== session.id && candidate.status === "idle")?.id ?? null;
  let workflow = options?.workflow ?? session.cacheWorkflow ?? preference;
  let fallbackReason: string | null = null;
  if (!options?.workflow && workflow === "probes" && helperSessionId === null) {
    workflow = "ledger";
    fallbackReason = "No free supporting slot; the provider's default probes fall back to a one-session ledger.";
  }
  return {
    remedy, workflow, ...CACHE_DECISIONS[workflow], rewardTrust: CACHE_DECISIONS.restoreRewardTrust,
    helperNeeded: workflow === "probes", helperSessionId: workflow === "probes" ? helperSessionId : null, fallbackReason,
  };
}

/** Evidence depends on completed work, never on a preview or a requested action alone. */
export function getCacheReviewEvidence(state: GameState, review: ReviewState): CacheReviewEvidence | null {
  const session = state.sessions[review.sessionId];
  if (!session) return null;
  if (review.ticketId === "cache-summary") {
    if (session.status !== "awaiting-review" || session.progress < 1) return null;
    if (session.cacheRemedy === "bypass") return CACHE_EVIDENCE.bypass;
    if (session.cacheRemedy === "restore" && session.cacheWorkflow) return CACHE_EVIDENCE[session.cacheWorkflow];
    return null;
  }
  if (review.ticketId === CACHE_DECISIONS.followup.id) return CACHE_EVIDENCE.followup;
  if (!["stale-customer-data", "investor-demo", "release-two"].includes(review.ticketId)) return null;
  const ticket = ticketById.get(review.ticketId);
  if (!ticket) return null;
  const stale = state.flags.cacheShortcut && !state.completedTicketIds.some((id) => ticketById.get(id)?.incidentFor === "cache-shortcut");
  const scope = stale ? "Stale customer summaries remain an unresolved release risk."
    : state.cacheOutcome === "bypassed" ? "Customer data is fresh through direct reads. The dashboard speedup is deferred; PERF-205 is optional."
    : "Customer data is fresh and the dashboard speedup is retained.";
  return { ...ticket.evidence, signal: `${ticket.evidence.signal} ${scope}`, scope };
}
