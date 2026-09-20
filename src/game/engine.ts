import { produce } from "immer";
import { content, modelById, providerById, ticketById, upgradeById } from "../content";
import { BALANCE } from "./balance";
import { availableTickets, isModelUnlocked } from "./selectors";
import type { EndingState, GameEvent, GameState, ReviewDecision, SessionState } from "./types";

export class GameRuleError extends Error {}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function hasUpgrade(state: GameState, id: string) {
  return state.purchasedUpgradeIds.includes(id);
}

function quotaMax(state: GameState, providerId: string) {
  const provider = providerById.get(providerId);
  if (!provider) return 0;
  return provider.maxQuota + (hasUpgrade(state, "quota-plan") ? 35 : 0);
}

function addEvent(state: GameState, event: Omit<GameEvent, "id" | "at">) {
  state.events.unshift({
    ...event,
    id: `${Math.round(state.gameTime * 1000)}-${state.events.length}-${event.title}`,
    at: state.gameTime,
  });
  state.events.splice(BALANCE.maxEvents);
}

function resetSession(session: SessionState) {
  session.status = "idle";
  session.ticketId = null;
  session.modelId = null;
  session.progress = 0;
  session.briefImproved = false;
  session.reviewRound = 0;
  session.context = clamp(session.context + 12, 0, 100);
}

function calculateReviewRisk(state: GameState, session: SessionState) {
  const ticket = ticketById.get(session.ticketId ?? "");
  const model = modelById.get(session.modelId ?? "");
  if (!ticket || !model) return 0.5;
  const concurrent = state.sessions.filter((candidate) => candidate.status === "working").length;
  const contextPenalty = Math.max(0, 70 - session.context) / 180;
  const parallelPenalty = concurrent > 1 && !hasUpgrade(state, "worktree-isolation") ? 0.09 : 0;
  const briefingBonus = session.briefImproved ? 0.13 : 0;
  const playbookBonus = hasUpgrade(state, "repo-playbook") ? 0.07 : 0;
  const testBonus = hasUpgrade(state, "fast-checks") ? 0.08 : 0;
  const revisionBonus = session.reviewRound * 0.18;
  const healthPenalty = Math.max(0, 70 - state.repoHealth) / 220;

  return clamp(
    ticket.baseRisk + model.riskModifier + contextPenalty + parallelPenalty + healthPenalty
      - briefingBonus - playbookBonus - testBonus - revisionBonus,
    0.02,
    0.92,
  );
}

function computeEnding(state: GameState): EndingState {
  const reliability = clamp(Math.round(state.repoHealth - state.stats.defects * 7), 0, 100);
  const throughput = clamp(Math.round(55 + state.stats.shipped * 6 - state.stats.revisions * 2), 0, 100);
  const trust = clamp(Math.round(state.trust + state.peakTrust / 3), 0, 100);
  const debt = clamp(Math.round(state.debt), 0, 100);
  const disciplined = reliability >= 72 && debt <= 28;
  const title = disciplined ? "The demo works. Suspiciously well." : "The demo works, provided nobody refreshes twice.";
  const message = state.flags.cacheShortcut
    ? "You moved fast, found the stale-data trail, and learned that every shortcut eventually joins the review queue."
    : "You kept enough attention in reserve to make parallel agents feel like leverage instead of weather.";
  return { title, message, scores: { throughput, reliability, trust, debt } };
}

function unlockProgression(state: GameState) {
  const previous = state.unlockedSessions;
  const complete = state.completedTicketIds.length;
  state.unlockedSessions = complete >= BALANCE.thirdSessionAfter ? 3 : complete >= BALANCE.secondSessionAfter ? 2 : 1;
  if (state.unlockedSessions > previous) {
    addEvent(state, {
      tone: "good",
      title: `Session ${state.unlockedSessions} unlocked`,
      message: "Your throughput ceiling increased. Your attention did not.",
    });
  }
  if (complete === 2) {
    addEvent(state, {
      tone: "info",
      title: "Parallel operator seat enabled",
      message: "Both provider terminals can now run work at the same time. Their quota pools remain separate.",
    });
  }
}

function announceIncidentIfReady(state: GameState) {
  if (state.flags.incidentAnnounced || !state.flags.cacheShortcut) return;
  const prerequisitesDone = ["parallel-reports", "quota-display"].every((id) => state.completedTicketIds.includes(id));
  if (!prerequisitesDone) return;
  state.flags.incidentAnnounced = true;
  const mitigated = hasUpgrade(state, "observability");
  state.trust = clamp(state.trust - (mitigated ? 3 : 8), 0, 100);
  state.repoHealth = clamp(state.repoHealth - (mitigated ? 3 : 8), 0, 100);
  addEvent(state, {
    tone: "bad",
    title: "SEV-2 · The dashboard is lying",
    message: mitigated
      ? "Observability caught stale customer summaries before the executive call. PERF-204 is the likely source."
      : "Support found stale customer names in the executive dashboard. The missing invalidation in PERF-204 has returned.",
  });
}

function completeTicket(state: GameState, session: SessionState, defect: boolean) {
  const ticket = ticketById.get(session.ticketId ?? "");
  if (!ticket) throw new GameRuleError("Ticket no longer exists.");
  if (!state.completedTicketIds.includes(ticket.id)) state.completedTicketIds.push(ticket.id);
  state.stats.shipped += 1;
  state.trust = clamp(state.trust + ticket.rewardTrust - (defect ? 6 : 0), 0, 100);
  state.peakTrust = Math.max(state.peakTrust, state.trust);
  state.repoHealth = clamp(state.repoHealth + (defect ? -7 : 2.5), 0, 100);
  state.debt = clamp(state.debt + (defect ? 9 : -1.5), 0, 100);

  if (defect) {
    state.stats.defects += 1;
    if (ticket.riskFlag === "cache-shortcut") state.flags.cacheShortcut = true;
    if (ticket.riskFlag === "privacy-default") state.flags.privacyDefaultedOn = true;
    if (ticket.riskFlag === "merge-race") state.flags.raceAccepted = true;
  }

  addEvent(state, {
    tone: defect ? "warning" : "good",
    title: `${ticket.key} shipped`,
    message: defect
      ? "The patch is live, but the review left a visible risk unresolved. Future work may inherit it."
      : `Clean delivery. +${ticket.rewardTrust} trust and a slightly healthier repository.`,
  });
  resetSession(session);
  unlockProgression(state);
  announceIncidentIfReady(state);
  if (ticket.kind === "finale") state.ending = computeEnding(state);
}

export function startTicket(
  source: GameState,
  sessionId: number,
  ticketId: string,
  modelId: string,
  improveBrief = false,
) {
  if (source.ending) throw new GameRuleError("This run has ended.");
  const ticket = ticketById.get(ticketId);
  const model = modelById.get(modelId);
  const session = source.sessions[sessionId];
  if (!ticket || !model || !session) throw new GameRuleError("Unknown assignment.");
  if (sessionId >= source.unlockedSessions) throw new GameRuleError("That session is still locked.");
  if (session.status !== "idle") throw new GameRuleError("That session is already occupied.");
  if (!availableTickets(source).some((candidate) => candidate.id === ticketId)) throw new GameRuleError("That ticket is not ready.");
  if (!isModelUnlocked(source, modelId)) throw new GameRuleError("That model is not available yet.");
  if (improveBrief && source.attention < BALANCE.improvedBriefCost) throw new GameRuleError("Not enough attention to improve the brief.");
  if ((source.providerQuota[model.providerId] ?? 0) < 2) throw new GameRuleError("That provider has no usable quota.");

  return produce(source, (state) => {
    const target = state.sessions[sessionId];
    target.status = "working";
    target.ticketId = ticketId;
    target.modelId = modelId;
    target.progress = 0;
    target.reviewRound = 0;
    target.briefImproved = improveBrief;
    if (improveBrief) state.attention -= BALANCE.improvedBriefCost;
    addEvent(state, {
      tone: "info",
      title: `${ticket.key} → ${model.name}`,
      message: improveBrief ? "The session started with clarified acceptance criteria." : "The session started with the ticket exactly as written.",
    });
  });
}

export function advanceGame(source: GameState, elapsedSeconds: number) {
  const seconds = Math.max(0, elapsedSeconds);
  if (seconds === 0 || source.ending) return source;

  return produce(source, (state) => {
    state.gameTime += seconds;
    state.attention = clamp(state.attention + seconds * BALANCE.attentionRegenPerSecond, 0, BALANCE.attentionMax);

    for (const provider of content.providers) {
      state.providerQuota[provider.id] = clamp(
        (state.providerQuota[provider.id] ?? 0) + seconds * provider.regenPerSecond,
        0,
        quotaMax(state, provider.id),
      );
    }

    for (const session of state.sessions.slice(0, state.unlockedSessions)) {
      if (session.status !== "working" && session.status !== "quota-paused") continue;
      const ticket = ticketById.get(session.ticketId ?? "");
      const model = modelById.get(session.modelId ?? "");
      if (!ticket || !model) continue;
      const quota = state.providerQuota[model.providerId] ?? 0;
      const workNeededSeconds = ((1 - session.progress) * ticket.duration) / model.speed;
      const possibleWorkSeconds = Math.min(seconds, quota / model.quotaRate, workNeededSeconds);
      if (possibleWorkSeconds <= 0.01) {
        if (session.status !== "quota-paused") {
          session.status = "quota-paused";
          addEvent(state, { tone: "warning", title: `${model.name} hit its limit`, message: "Wait for quota, switch providers on the next task, or improve the quota plan." });
        }
        continue;
      }
      session.status = "working";
      const spent = possibleWorkSeconds * model.quotaRate;
      state.providerQuota[model.providerId] = Math.max(0, quota - spent);
      state.stats.quotaSpent += spent;
      session.progress = clamp(session.progress + (possibleWorkSeconds * model.speed) / ticket.duration, 0, 1);
      const decayMultiplier = hasUpgrade(state, "context-notes") ? 0.55 : 1;
      session.context = clamp(session.context - (possibleWorkSeconds / 60) * model.contextDecay * 10 * decayMultiplier, 0, 100);

      if (session.progress >= 1) {
        session.status = "awaiting-review";
        state.reviews.push({
          id: `${ticket.id}-${session.reviewRound}-${Math.round(state.gameTime)}`,
          ticketId: ticket.id,
          sessionId: session.id,
          risk: calculateReviewRisk(state, session),
          createdAt: state.gameTime,
        });
        addEvent(state, {
          tone: "info",
          title: `${ticket.key} is ready for review`,
          message: `${model.name} is ${Math.round(session.context)}% context-coherent and ${Math.round((1 - state.reviews.at(-1)!.risk) * 100)}% confident.`,
        });
      }
    }
  });
}

export function reviewTicket(source: GameState, reviewId: string, decision: ReviewDecision) {
  const review = source.reviews.find((candidate) => candidate.id === reviewId);
  if (!review) throw new GameRuleError("That review is no longer available.");
  const cost = BALANCE.reviewCosts[decision];
  if (source.attention < cost) throw new GameRuleError("Not enough attention for that review decision.");

  return produce(source, (state) => {
    const index = state.reviews.findIndex((candidate) => candidate.id === reviewId);
    const current = state.reviews[index];
    const session = state.sessions[current.sessionId];
    const ticket = ticketById.get(current.ticketId)!;
    state.attention -= cost;
    state.stats.reviewAttentionSpent += cost;
    state.reviews.splice(index, 1);

    if (decision === "revise") {
      state.stats.revisions += 1;
      session.status = "working";
      session.progress = 0.62;
      session.reviewRound += 1;
      session.context = clamp(session.context + 6, 0, 100);
      addEvent(state, { tone: "info", title: `${ticket.key} changes requested`, message: "The agent is addressing the visible risk with a narrower second pass." });
      return;
    }

    if (decision === "escalate") {
      state.stats.escalations += 1;
      state.debt = clamp(state.debt - 2, 0, 100);
      addEvent(state, { tone: "good", title: `${ticket.key} escalated`, message: "A deeper review found and corrected the risky path before shipping." });
      completeTicket(state, session, false);
      return;
    }

    const defect = current.risk >= 0.29 && ticket.riskFlag !== "none";
    completeTicket(state, session, defect);
  });
}

export function compactSession(source: GameState, sessionId: number) {
  const session = source.sessions[sessionId];
  if (!session || (session.status !== "working" && session.status !== "quota-paused")) throw new GameRuleError("Only an active session can be compacted.");
  if (source.attention < BALANCE.compactAttentionCost) throw new GameRuleError("Not enough attention to compact context.");
  return produce(source, (state) => {
    const target = state.sessions[sessionId];
    state.attention -= BALANCE.compactAttentionCost;
    target.context = 88;
    target.progress = Math.max(0, target.progress - 0.08);
    addEvent(state, { tone: "info", title: `Session ${sessionId + 1} compacted`, message: "The summary recovered context but lost a little implementation momentum." });
  });
}

export function buyUpgrade(source: GameState, upgradeId: string) {
  const upgrade = upgradeById.get(upgradeId);
  if (!upgrade) throw new GameRuleError("Unknown upgrade.");
  if (source.purchasedUpgradeIds.includes(upgradeId)) throw new GameRuleError("Upgrade already purchased.");
  if (source.completedTicketIds.length < upgrade.unlockAfter) throw new GameRuleError("Upgrade is not unlocked.");
  if (source.trust < upgrade.cost) throw new GameRuleError("Not enough trust to win approval for that upgrade.");

  return produce(source, (state) => {
    state.trust -= upgrade.cost;
    state.purchasedUpgradeIds.push(upgrade.id);
    if (upgrade.effect === "quota") {
      for (const provider of content.providers) state.providerQuota[provider.id] += 35;
    }
    addEvent(state, { tone: "good", title: `${upgrade.name} approved`, message: upgrade.description });
  });
}
