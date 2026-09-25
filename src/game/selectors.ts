import { content, modelById, providerById, ticketById } from "../content";
import type { GameState, ReviewState } from "./types";

const clampRisk = (value: number) => Math.max(0.02, Math.min(0.92, value));

export function completedCount(state: GameState) {
  return state.completedTicketIds.length;
}

export function isProviderUnlocked(state: GameState, providerId: string) {
  const provider = providerById.get(providerId);
  return Boolean(provider && completedCount(state) >= provider.unlockAfter);
}

export function isModelUnlocked(state: GameState, modelId: string) {
  const model = modelById.get(modelId);
  return Boolean(model && isProviderUnlocked(state, model.providerId) && state.peakTrust >= model.unlockTrust);
}

export function availableModels(state: GameState) {
  return content.models.filter((model) => isModelUnlocked(state, model.id));
}

export function projectedTicketRisk(state: GameState, ticketId: string, planned = false, reasoning: "low" | "medium" | "high" = "medium", selectedModelId?: string) {
  const ticket = ticketById.get(ticketId);
  if (!ticket) return { min: 0, max: 0 };
  const recommended = availableModels(state).filter((model) => model.tier === ticket.recommendedTier);
  const selected = availableModels(state).find((model) => model.id === selectedModelId);
  const choices = selected ? [selected] : recommended.length ? recommended : availableModels(state);
  if (!choices.length) return { min: Math.round(ticket.baseRisk * 100), max: Math.round(ticket.baseRisk * 100) };
  const idle = state.sessions.find((session) => session.id < state.unlockedSessions && session.status === "idle");
  const context = idle?.context ?? 100;
  const contextPenalty = Math.max(0, 80 - context) / 200;
  const active = state.sessions.some((session) => session.status === "working" || session.status === "quota-paused");
  const parallelPenalty = active && !state.purchasedUpgradeIds.includes("worktree-isolation") ? 0.09 : 0;
  const healthPenalty = Math.max(0, 70 - state.repoHealth) / 220;
  const briefingBonus = state.purchasedUpgradeIds.includes("repo-playbook") ? 0.07 : 0;
  const testsBonus = state.purchasedUpgradeIds.includes("fast-checks") ? 0.08 : 0;
  const integrityBonus = state.purchasedUpgradeIds.includes("ci-integrity-guard") ? 0.05 : 0;
  const planBonus = planned ? 0.13 : 0;
  const reasoningModifier = reasoning === "high" ? -0.09 : reasoning === "low" ? 0.07 : 0;
  const estimates = choices.map((model) => clampRisk(
    ticket.baseRisk + model.riskModifier + reasoningModifier + contextPenalty + parallelPenalty + healthPenalty
      - briefingBonus - testsBonus - integrityBonus - planBonus,
  ));
  return { min: Math.round(Math.min(...estimates) * 100), max: Math.round(Math.max(...estimates) * 100) };
}

export function availableTickets(state: GameState) {
  const occupied = new Set(
    state.sessions.map((session) => session.ticketId).filter((ticketId): ticketId is string => Boolean(ticketId)),
  );
  const inReview = new Set(state.reviews.map((review) => review.ticketId));
  const complete = new Set(state.completedTicketIds);

  return content.tickets.filter((ticket) =>
    (!ticket.incidentFor || incidentIsOpen(state, ticket.incidentFor))
    && (!ticket.blockedByIncident || !incidentIsOpen(state, ticket.blockedByIncident))
    && (ticket.id !== "retry-repair" || !["active", "scaled"].includes(state.incidentResponse))
    &&
    !complete.has(ticket.id)
    && !occupied.has(ticket.id)
    && !inReview.has(ticket.id)
    && ticket.prerequisites.every((prerequisite) => complete.has(prerequisite)),
  );
}

export function incidentIsOpen(state: GameState, flag: Exclude<(typeof content.tickets)[number]["incidentFor"], undefined>) {
  return state.flags[flagToStateKey(flag)] && !content.tickets.some((ticket) => ticket.incidentFor === flag && state.completedTicketIds.includes(ticket.id));
}

function flagToStateKey(flag: NonNullable<(typeof content.tickets)[number]["incidentFor"]>) {
  return {
    "cache-shortcut": "cacheShortcut",
    "privacy-default": "privacyDefaultedOn",
    "merge-race": "raceAccepted",
    "runtime-drift": "runtimeDriftAccepted",
    "test-integrity": "testIntegrityAccepted",
    "contract-mismatch": "contractMismatchAccepted",
    "request-loop": "requestLoopAccepted",
  }[flag] as keyof GameState["flags"];
}

export function visibleTickets(state: GameState) {
  return content.tickets.filter((ticket) => !ticket.incidentFor || state.flags[flagToStateKey(ticket.incidentFor)]);
}

export function isReviewBlocked(state: GameState, review: ReviewState) {
  const ticket = ticketById.get(review.ticketId);
  const session = state.sessions[review.sessionId];
  if (!ticket || !session) return true;
  if (review.risk >= 0.6) return true;
  if (ticket.riskFlag === "none" || session.reviewRound > 0) return false;
  return !(session.briefImproved && Boolean(ticket.evidence.resolution) && review.risk < 0.2);
}

export function reviewRiskFactorList(state: GameState, ticketId: string, sessionId: number) {
  const ticket = ticketById.get(ticketId);
  const session = state.sessions[sessionId];
  const model = modelById.get(session?.modelId ?? "");
  if (!ticket || !session || !model) return ["review context unavailable"];
  const factors = [`ticket baseline ${Math.round(ticket.baseRisk * 100)}`];
  if (model.riskModifier > 0) factors.push(`${model.name} speed tradeoff +${Math.round(model.riskModifier * 100)}`);
  if (model.riskModifier < 0) factors.push(`${model.name} quality −${Math.round(Math.abs(model.riskModifier) * 100)}`);
  if (session.context < 80) factors.push(`thin context ${Math.round(session.context)}%`);
  if (session.workedInParallel && !state.purchasedUpgradeIds.includes("worktree-isolation")) factors.push("shared branch contention");
  if (state.repoHealth < 70) factors.push(`repository health ${Math.round(state.repoHealth)}%`);
  if (session.reasoning === "low") factors.push("low reasoning +7");
  if (session.reasoning === "high") factors.push("high reasoning −9");
  if (session.briefImproved) factors.push("planned brief −13");
  if (state.purchasedUpgradeIds.includes("repo-playbook")) factors.push("repository playbook −7");
  if (state.purchasedUpgradeIds.includes("fast-checks")) factors.push("fast checks −8");
  if (state.purchasedUpgradeIds.includes("ci-integrity-guard")) factors.push("CI integrity guard −5");
  if (session.reviewRound > 0) factors.push(`revision ${session.reviewRound} lowered risk`);
  return factors;
}

export function reviewRiskFactors(state: GameState, review: ReviewState) {
  return (review.riskFactors ?? reviewRiskFactorList(state, review.ticketId, review.sessionId)).join(" · ");
}

export function ticketProgressLabel(state: GameState, ticketId: string) {
  const ticket = ticketById.get(ticketId);
  if (!ticket) return "Unknown";
  if (state.completedTicketIds.includes(ticketId)) return "Shipped";
  if (ticket.incidentFor && !state.flags[flagToStateKey(ticket.incidentFor)]) return "Dormant";
  if (ticket.blockedByIncident && incidentIsOpen(state, ticket.blockedByIncident)) return "Blocked";
  if (ticketId === "retry-repair" && ["active", "scaled"].includes(state.incidentResponse)) return "Blocked";
  if (state.reviews.some((review) => review.ticketId === ticketId)) return "Review";
  const session = state.sessions.find((candidate) => candidate.ticketId === ticketId);
  if (session) return `${Math.round(session.progress * 100)}%`;
  return ticket.prerequisites.every((id) => state.completedTicketIds.includes(id)) ? "Ready" : "Blocked";
}
