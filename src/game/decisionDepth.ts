import { content, modelById, providerById, ticketById } from "../content";
import { CACHE_DECISIONS, CACHE_EVIDENCE, CACHE_PROVIDER_HABITS } from "../content/cacheDecisions";
import { RELEASE_EVIDENCE } from "../content/releaseEvidence";
import { incidentIsOpen, isModelUnlocked } from "./selectors";
import { contextAfterWork, sessionQuotaDemand, sessionRemainingWorkSeconds, sessionWorkDuration } from "./work";
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
  const scope = getCacheScopeEvidence(state);
  // Compatibility wrapper: release callbacks must preserve completed verification.
  const evidence = getReviewEvidence(state, review);
  return { ...(evidence ?? ticket.evidence), scope };
}

export interface ReviewEvidence {
  summary: string;
  tests: string;
  signal: string;
  scope?: string;
}

export function getCacheScopeEvidence(state: GameState) {
  return incidentIsOpen(state, "cache-shortcut") ? RELEASE_EVIDENCE.cache.stale
    : state.cacheOutcome === "bypassed" ? RELEASE_EVIDENCE.cache.bypassed : RELEASE_EVIDENCE.cache.restored;
}

/** One composer for original-ticket findings, completed rechecks and release history. */
export function getReviewEvidence(state: GameState, review: ReviewState): ReviewEvidence | null {
  const ticket = ticketById.get(review.ticketId);
  const session = state.sessions[review.sessionId];
  if (!ticket || !session) return null;
  const completed = session.status === "awaiting-review" && session.progress >= 1 && session.ticketId === review.ticketId;
  if (completed && ["cache-summary", CACHE_DECISIONS.followup.id].includes(ticket.id)) {
    const cache = getCacheReviewEvidence(state, review);
    if (cache) return cache;
  }
  const resolved = completed && (session.reviewRound > 0 || (ticket.riskFlag !== "none" && session.briefImproved && review.risk < 0.2));
  const resolution = resolved ? ticket.evidence.resolution : undefined;
  const evidence: ReviewEvidence = {
    summary: resolution?.summary ?? ticket.evidence.summary,
    tests: resolution?.tests ?? ticket.evidence.tests,
    signal: resolution?.signal ?? ticket.evidence.signal,
  };
  if (["investor-demo", "release-two"].includes(ticket.id)) {
    const flags = ticket.id === "release-two" ? Object.keys(RELEASE_EVIDENCE.checks)
      : ["privacy-default", "runtime-drift", "merge-race"];
    const checks = flags.map((flag) => {
      const key = flag as keyof typeof RELEASE_EVIDENCE.checks;
      const repaired = content.tickets.some((candidate) => candidate.incidentFor === key && state.completedTicketIds.includes(candidate.id));
      return RELEASE_EVIDENCE.checks[key][incidentIsOpen(state, key) ? "open" : repaired ? "repaired" : "clean"];
    });
    evidence.tests = `${evidence.tests} ${checks.join(" ")}`;
    evidence.signal = `${evidence.signal} ${RELEASE_EVIDENCE.readiness}`;
  }
  if (["stale-customer-data", "investor-demo", "release-two"].includes(ticket.id)) {
    evidence.scope = getCacheScopeEvidence(state);
    evidence.signal = `${evidence.signal} ${evidence.scope}`;
  }
  return evidence;
}

export interface RevisionQuote {
  finding: string;
  seconds: number;
  setupQuota: number;
  providerId: string;
  quotaRate: number;
  helperQuotaRate: number;
  contextGain: number;
  contextAfterSetup: number;
  contextAfterWork: number;
  cache?: CacheRevisionQuote;
}

/** Uses the same progress setback, duration and demand as reviewTicket/advanceGame. */
export function getRevisionQuote(state: GameState, reviewId: string, options?: CacheRevisionOptions): RevisionQuote | null {
  const review = state.reviews.find((candidate) => candidate.id === reviewId);
  const session = review && state.sessions[review.sessionId];
  const ticket = review && ticketById.get(review.ticketId);
  const model = modelById.get(session?.modelId ?? "");
  if (!review || !session || !ticket || !model) return null;
  const cache = getCacheRevisionQuote(state, reviewId, options) ?? undefined;
  const seconds = cache?.seconds ?? 0.38 * sessionWorkDuration(session, ticket.duration, model.speed);
  const contextGain = cache?.contextGain ?? 6;
  const evidence = getReviewEvidence(state, review);
  return {
    finding: ["investor-demo", "release-two"].includes(ticket.id) ? RELEASE_EVIDENCE.aggregateFinding
      : ticket.riskFlag !== "none" ? evidence?.signal ?? ticket.evidence.signal : RELEASE_EVIDENCE.genericFinding,
    seconds, setupQuota: cache?.setupQuota ?? 0, providerId: model.providerId, quotaRate: model.quotaRate,
    helperQuotaRate: cache?.helperNeeded ? model.quotaRate * CACHE_DECISIONS.helperQuotaMultiplier : 0,
    contextGain, contextAfterSetup: Math.min(100, session.context + contextGain),
    contextAfterWork: contextAfterWork(state, session, seconds, contextGain), ...(cache ? { cache } : {}),
  };
}

export interface QuotaCueInput {
  sessionId: number;
  modelId: string;
  seconds: number;
  setupQuota?: number;
  helperNeeded?: boolean;
}

export interface QuotaThrottleCue {
  message: string;
  providerId: string;
  sharedSessions: number[];
  helperDemand: number;
  independentProviderIds: string[];
}

/** Tests funding along known full-speed completion boundaries, without predicting elapsed ETA. */
export function getQuotaThrottleCue(state: GameState, input: QuotaCueInput): QuotaThrottleCue | null {
  const model = modelById.get(input.modelId);
  const provider = providerById.get(model?.providerId ?? "");
  if (!model || !provider || input.seconds <= 0) return null;
  const other = state.sessions.slice(0, state.unlockedSessions).filter((session) => session.id !== input.sessionId
    && ["working", "quota-paused"].includes(session.status)
    && modelById.get(session.modelId ?? "")?.providerId === provider.id);
  const helperDemand = input.helperNeeded ? model.quotaRate * CACHE_DECISIONS.helperQuotaMultiplier : 0;
  const commitments = [
    { seconds: input.seconds, demand: model.quotaRate + helperDemand },
    ...other.map((session) => ({ seconds: sessionRemainingWorkSeconds(session), demand: sessionQuotaDemand(state, session) })),
  ];
  const boundaries = [...new Set(commitments.map((work) => Math.min(input.seconds, work.seconds)))].filter((time) => time > 0).sort((a, b) => a - b);
  let quota = Math.max(0, (state.providerQuota[provider.id] ?? 0) - (input.setupQuota ?? 0));
  let previous = 0;
  let shortfall = 0;
  for (const boundary of boundaries) {
    const demand = commitments.filter((work) => work.seconds > previous + 1e-9).reduce((sum, work) => sum + work.demand, 0);
    quota += (provider.regenPerSecond - demand) * (boundary - previous);
    shortfall = Math.max(shortfall, -quota);
    previous = boundary;
  }
  // Suppress frame-boundary noise and negligible depletion at the end of a pass.
  if (shortfall <= model.quotaRate * 0.25 + 1e-9) return null;
  const independentProviderIds = content.providers.filter((candidate) => candidate.id !== provider.id
    && content.models.some((choice) => choice.providerId === candidate.id && isModelUnlocked(state, choice.id))
    && (state.providerQuota[candidate.id] ?? 0) >= 2).map((candidate) => candidate.id);
  const cause = helperDemand > 0 ? RELEASE_EVIDENCE.throttle.helper : other.length ? RELEASE_EVIDENCE.throttle.shared : RELEASE_EVIDENCE.throttle.solo;
  const independent = independentProviderIds.length
    ? `${RELEASE_EVIDENCE.throttle.independent}: ${independentProviderIds.map((id) => providerById.get(id)!.name).join(", ")}.`
    : RELEASE_EVIDENCE.throttle.unavailable;
  return { message: `${cause} ${RELEASE_EVIDENCE.throttle.conditional} ${independent}`, providerId: provider.id,
    sharedSessions: other.map((session) => session.id), helperDemand, independentProviderIds };
}

export function getCacheScopeCredit(state: GameState) {
  const weights = CACHE_DECISIONS.scopeCredit;
  const shipped = state.completedTicketIds.includes("cache-summary");
  const freshness = shipped && !incidentIsOpen(state, "cache-shortcut") ? weights.freshness : 0;
  const speedup = shipped && state.cacheOutcome !== "bypassed" ? weights.speedup : 0;
  const total = weights.freshness + weights.speedup;
  const delivered = freshness + speedup;
  return { freshness, speedup, delivered, deferred: shipped ? total - delivered : 0, total };
}
