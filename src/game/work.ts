import { modelById, ticketById } from "../content";
import { CACHE_DECISIONS } from "../content/cacheDecisions";
import { BALANCE } from "./balance";
import type { GameState, SessionState } from "./types";

export function sessionWorkDuration(session: SessionState, duration: number, speed: number) {
  return session.workDuration ?? duration / speed;
}

export function sessionRemainingWorkSeconds(session: SessionState) {
  const ticket = ticketById.get(session.ticketId ?? "");
  const model = modelById.get(session.modelId ?? "");
  return ticket && model ? (1 - session.progress) * sessionWorkDuration(session, ticket.duration, model.speed) : 0;
}

export function sessionQuotaDemand(state: GameState, session: SessionState) {
  const rate = modelById.get(session.modelId ?? "")?.quotaRate ?? 0;
  return rate * (state.sessions.some((helper) => helper.status === "supporting" && helper.supportForSessionId === session.id)
    ? 1 + CACHE_DECISIONS.helperQuotaMultiplier : 1);
}

export function contextAfterWork(state: GameState, session: SessionState, seconds: number, gain = 0) {
  const start = Math.min(100, session.context + gain);
  const decay = (modelById.get(session.modelId ?? "")?.contextDecay ?? 0) * BALANCE.contextDecayPerWorkSecond
    * (state.purchasedUpgradeIds.includes("context-notes") ? 0.55 : 1);
  return Math.max(0, start - seconds * decay);
}
