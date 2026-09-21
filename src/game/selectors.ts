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
    !complete.has(ticket.id)
    && !occupied.has(ticket.id)
    && !inReview.has(ticket.id)
    && ticket.prerequisites.every((prerequisite) => complete.has(prerequisite)),
  );
}

export function isReviewBlocked(state: GameState, review: ReviewState) {
  const ticket = ticketById.get(review.ticketId);
  const session = state.sessions[review.sessionId];
  if (!ticket || !session || ticket.riskFlag === "none" || session.reviewRound > 0) return false;
  return !(session.briefImproved && Boolean(ticket.evidence.resolution) && review.risk < 0.2);
}

export function ticketProgressLabel(state: GameState, ticketId: string) {
  const ticket = ticketById.get(ticketId);
  if (!ticket) return "Unknown";
  if (state.completedTicketIds.includes(ticketId)) return "Shipped";
  if (state.reviews.some((review) => review.ticketId === ticketId)) return "Review";
  const session = state.sessions.find((candidate) => candidate.ticketId === ticketId);
  if (session) return `${Math.round(session.progress * 100)}%`;
  return ticket.prerequisites.every((id) => state.completedTicketIds.includes(id)) ? "Ready" : "Blocked";
}
