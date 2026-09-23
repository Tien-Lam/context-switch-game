import { content, modelById, providerById, ticketById } from "../content";
import type { GameState, ReviewState } from "./types";

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

export function availableTickets(state: GameState) {
  const occupied = new Set(
    state.sessions.map((session) => session.ticketId).filter((ticketId): ticketId is string => Boolean(ticketId)),
  );
  const inReview = new Set(state.reviews.map((review) => review.ticketId));
  const complete = new Set(state.completedTicketIds);

  return content.tickets.filter((ticket) =>
    (!ticket.incidentFor || incidentIsOpen(state, ticket.incidentFor))
    && (ticket.id !== "stale-customer-data" || !incidentIsOpen(state, "cache-shortcut"))
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

export function reviewRiskFactors(state: GameState, review: ReviewState) {
  const ticket = ticketById.get(review.ticketId);
  const session = state.sessions[review.sessionId];
  const model = modelById.get(session?.modelId ?? "");
  if (!ticket || !session || !model) return "review context unavailable";
  const factors = [`ticket baseline ${Math.round(ticket.baseRisk * 100)}`];
  if (model.riskModifier > 0) factors.push(`${model.name} speed tradeoff +${Math.round(model.riskModifier * 100)}`);
  if (model.riskModifier < 0) factors.push(`${model.name} quality −${Math.round(Math.abs(model.riskModifier) * 100)}`);
  if (session.context < 80) factors.push(`thin context ${Math.round(session.context)}%`);
  if (session.workedInParallel && !state.purchasedUpgradeIds.includes("worktree-isolation")) factors.push("shared branch contention");
  if (state.repoHealth < 70) factors.push(`repository health ${Math.round(state.repoHealth)}%`);
  if (session.reasoning === "low") factors.push("low reasoning +7");
  if (session.reasoning === "high") factors.push("high reasoning −9");
  if (session.briefImproved) factors.push("planned brief −13");
  if (session.reviewRound > 0) factors.push(`revision ${session.reviewRound} lowered risk`);
  return factors.join(" · ");
}

export function ticketProgressLabel(state: GameState, ticketId: string) {
  const ticket = ticketById.get(ticketId);
  if (!ticket) return "Unknown";
  if (state.completedTicketIds.includes(ticketId)) return "Shipped";
  if (ticket.incidentFor && !state.flags[flagToStateKey(ticket.incidentFor)]) return "Dormant";
  if (ticketId === "stale-customer-data" && incidentIsOpen(state, "cache-shortcut")) return "Blocked";
  if (state.reviews.some((review) => review.ticketId === ticketId)) return "Review";
  const session = state.sessions.find((candidate) => candidate.ticketId === ticketId);
  if (session) return `${Math.round(session.progress * 100)}%`;
  return ticket.prerequisites.every((id) => state.completedTicketIds.includes(id)) ? "Ready" : "Blocked";
}
