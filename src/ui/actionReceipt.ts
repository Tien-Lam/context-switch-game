import { content, modelById, providerById, ticketById, upgradeById } from "../content";
import { RECEIPTS } from "../content/receipts";
import { availableTickets, incidentIsOpen } from "../game/selectors";
import type { GameState } from "../game/types";
import type { CliEffect } from "./cli";

const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value * 10) / 10)}`;

/** Only called after a successful store mutation. It never emits or replays game events. */
export function actionReceipt(effect: CliEffect, before: GameState, after: GameState): string | null {
  if (effect.type === "purchase") {
    const upgrade = upgradeById.get(effect.upgradeId);
    if (!upgrade || before.purchasedUpgradeIds.includes(upgrade.id) || !after.purchasedUpgradeIds.includes(upgrade.id)) return null;
    return `${RECEIPTS.receipt}: ${upgrade.name} purchased for ${upgrade.cost} trust · balance ${Math.round(after.trust)} trust.${upgrade.effect === "dashboard" ? ` ${RECEIPTS.dashboard}` : ""}`;
  }
  const review = effect.type === "review" ? before.reviews.find((item) => item.id === effect.reviewId) : undefined;
  const sessionId = review?.sessionId ?? (effect.type === "assign" || effect.type === "compact" ? effect.sessionId : undefined);
  const session = sessionId === undefined ? undefined : before.sessions[sessionId];
  const model = modelById.get(effect.type === "assign" ? effect.modelId : session?.modelId ?? "");
  const owner = model && sessionId !== undefined ? `${providerById.get(model.providerId)?.name} · session ${sessionId + 1}` : "";
  if (effect.type === "assign") {
    const assigned = after.sessions[effect.sessionId];
    if (assigned?.ticketId !== effect.ticketId || !model) return null;
    return `${RECEIPTS.receipt}: ${ticketById.get(effect.ticketId)?.key} started · ${owner} · ${model.name} · ${effect.reasoning} effort${effect.improveBrief ? " · planned brief" : ""}.`;
  }
  if (effect.type === "review" && review && !after.reviews.some((item) => item.id === review.id)) {
    const ticket = ticketById.get(review.ticketId);
    if (!ticket) return null;
    const priorEvents = new Set(before.events.map((event) => event.id));
    const fresh = after.events.filter((event) => !priorEvents.has(event.id) && event.sessionId === review.sessionId);
    const result = fresh.find((event) => event.title === `${ticket.key} repair failed`)
      ?? fresh.find((event) => event.title === `${ticket.key} shipped`)
      ?? fresh.find((event) => event.title.startsWith(ticket.key));
    if (!result) return null;
    const trust = after.trust - before.trust;
    const reward = effect.decision !== "revise" ? ` Trust ${signed(trust)} · balance ${Math.round(after.trust)}.` : "";
    const recoveries = content.tickets.filter((item) => item.incidentFor && incidentIsOpen(after, item.incidentFor)
      && (item.incidentFor === ticket.riskFlag || item.id === ticket.id));
    const ready = new Set(availableTickets(after).map((item) => item.id));
    const recovery = recoveries.length ? ` Recovery: ${recoveries.map((item) => `${item.key}${ready.has(item.id) ? " ready" : " pending incident/dependencies"}`).join(", ")}.` : "";
    return `${RECEIPTS.receipt}: ${result.title} · ${owner}. ${result.message}${reward}${recovery}`;
  }
  if (effect.type === "compact" && session && after.stats.quotaSpent > before.stats.quotaSpent) {
    return `${RECEIPTS.receipt}: ${owner} compacted · context ${Math.round(after.sessions[session.id].context)}% · ${Math.round(after.stats.quotaSpent - before.stats.quotaSpent)} quota charged · progress ${Math.round(after.sessions[session.id].progress * 100)}%.`;
  }
  if (effect.type === "mitigate" && before.incidentResponse !== after.incidentResponse) {
    return `${RECEIPTS.receipt}: incident ${after.incidentResponse} · trust ${signed(after.trust - before.trust)} · ${after.incidentResponse === "scaled" ? "load remains uncontained" : "check incident status for the repair"}.`;
  }
  return null;
}
