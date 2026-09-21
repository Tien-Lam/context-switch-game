import { produce } from "immer";
import { content, modelById, providerById, ticketById, upgradeById } from "../content";
import { BALANCE } from "./balance";
import { availableTickets, isModelUnlocked, isReviewBlocked } from "./selectors";
import type { EndingState, GameEvent, GameState, ReviewDecision, SessionState } from "./types";

export class GameRuleError extends Error {}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const SIMULATION_EPSILON = 1e-9;

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
  session.workedInParallel = false;
  session.context = clamp(session.context + 2, 0, 100);
}

function calculateReviewRisk(state: GameState, session: SessionState) {
  const ticket = ticketById.get(session.ticketId ?? "");
  const model = modelById.get(session.modelId ?? "");
  if (!ticket || !model) return 0.5;
  const contextPenalty = Math.max(0, 80 - session.context) / 200;
  const parallelPenalty = session.workedInParallel && !hasUpgrade(state, "worktree-isolation") ? 0.09 : 0;
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
  const activeTimePenalty = Math.max(0, (state.stats.activeSeconds - 75) / 5);
  const throughput = clamp(Math.round(50 + state.stats.shipped * 6 - state.stats.revisions * 4 - state.stats.escalations * 5 - activeTimePenalty), 0, 100);
  const trust = clamp(Math.round(state.trust), 0, 100);
  const debt = clamp(Math.round(state.debt), 0, 100);
  const disciplined = reliability >= 78 && debt <= 20 && state.stats.defects <= 1;
  const title = disciplined
    ? "The demo works. Suspiciously well."
    : state.stats.defects >= 3
      ? "The demo works. Legal has follow-up questions."
      : "The demo works, provided nobody refreshes twice.";
  const consequences = [
    state.flags.cacheShortcut ? "the dashboard cache served stale customer data" : "the cache audit stayed clean",
    state.flags.privacyDefaultedOn ? "telemetry shipped with the wrong default" : "the privacy default held",
    state.flags.runtimeDriftAccepted ? "the legacy runtime shim survived the audit" : "the runtime started cleanly",
    state.flags.raceAccepted ? "the report race reached production" : "parallel exports remained isolated",
  ];
  const message = `Your review history followed you into the room: ${consequences.join(", ")}.`;
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
      message: state.unlockedSessions === 3
        ? "Three ready workstreams can now run together. Try `watch agents` or buy Workspace Isolation before they share a branch."
        : "Your throughput ceiling increased. Quota, context, and review quality now matter more.",
    });
  }
  if (complete === BALANCE.secondSessionAfter) {
    addEvent(state, {
      tone: "info",
      title: "Parallel operator seat enabled",
      message: "Both provider terminals can now run work at the same time. Their quota pools remain separate.",
    });
  }
}

function announceIncidentIfReady(state: GameState) {
  if (state.flags.incidentAnnounced) return;
  const prerequisitesDone = ["parallel-reports", "quota-display"].every((id) => state.completedTicketIds.includes(id));
  if (!prerequisitesDone) return;
  state.flags.incidentAnnounced = true;
  if (!state.flags.cacheShortcut) {
    state.trust = clamp(state.trust + 2, 0, 100);
    state.peakTrust = Math.max(state.peakTrust, state.trust);
    addEvent(state, {
      tone: "good",
      title: "Pre-demo freshness audit passed",
      message: "Support tried to reproduce stale customer summaries and failed. The PERF-204 review prevented an incident. +2 trust.",
    });
    return;
  }
  const mitigated = hasUpgrade(state, "observability");
  state.trust = clamp(state.trust - (mitigated ? 5 : 15), 0, 100);
  state.repoHealth = clamp(state.repoHealth - (mitigated ? 3 : 8), 0, 100);
  addEvent(state, {
    tone: "bad",
    title: "SEV-2 · The dashboard is lying",
    message: mitigated
      ? "Observability caught stale customer summaries before the executive call. PERF-204 is the likely source."
      : "Support found stale customer names in the executive dashboard. The missing invalidation in PERF-204 has returned.",
  });
}

function hasEvent(state: GameState, title: string) {
  return state.events.some((event) => event.title === title);
}

function announceConsequences(state: GameState) {
  if (state.flags.privacyDefaultedOn && state.completedTicketIds.includes("quota-display") && !hasEvent(state, "Enterprise disabled telemetry")) {
    state.trust = clamp(state.trust - 12, 0, 100);
    state.debt = clamp(state.debt + 4, 0, 100);
    addEvent(state, {
      tone: "warning",
      title: "Enterprise disabled telemetry",
      message: "The implicit opt-in from APP-118 reached a customer workspace. Support opened a migration task. −12 trust, +4 debt.",
    });
  }
  if (state.flags.runtimeDriftAccepted && state.completedTicketIds.includes("parallel-reports") && !hasEvent(state, "Audit found the legacy worker")) {
    state.trust = clamp(state.trust - 8, 0, 100);
    state.repoHealth = clamp(state.repoHealth - 5, 0, 100);
    state.debt = clamp(state.debt + 5, 0, 100);
    addEvent(state, {
      tone: "warning",
      title: "Audit found the legacy worker",
      message: "The compatibility shim from PLAT-77 kept one report worker on the unsupported runtime. −8 trust, −5 health, +5 debt.",
    });
  }
  if (state.flags.raceAccepted && state.completedTicketIds.includes("stale-customer-data") && !hasEvent(state, "Two reports became one")) {
    state.trust = clamp(state.trust - 12, 0, 100);
    state.repoHealth = clamp(state.repoHealth - 4, 0, 100);
    addEvent(state, {
      tone: "bad",
      title: "Two reports became one",
      message: "The shared export path from DATA-312 overwrote a customer's report during the demo rehearsal. −12 trust, −4 health.",
    });
  }
}

function completeTicket(state: GameState, session: SessionState, defect: boolean, rewardTrust = true) {
  const ticket = ticketById.get(session.ticketId ?? "");
  const providerId = modelById.get(session.modelId ?? "")?.providerId;
  if (!ticket) throw new GameRuleError("Ticket no longer exists.");
  if (!state.completedTicketIds.includes(ticket.id)) state.completedTicketIds.push(ticket.id);
  state.stats.shipped += 1;
  const earnedTrust = rewardTrust ? ticket.rewardTrust : 0;
  state.trust = clamp(state.trust + earnedTrust - (defect ? 6 : 0), 0, 100);
  state.peakTrust = Math.max(state.peakTrust, state.trust);
  state.repoHealth = clamp(state.repoHealth + (defect ? -7 : 2.5), 0, 100);
  state.debt = clamp(state.debt + (defect ? 9 : -1.5), 0, 100);

  if (defect) {
    state.stats.defects += 1;
    if (ticket.riskFlag === "cache-shortcut") state.flags.cacheShortcut = true;
    if (ticket.riskFlag === "privacy-default") state.flags.privacyDefaultedOn = true;
    if (ticket.riskFlag === "runtime-drift") state.flags.runtimeDriftAccepted = true;
    if (ticket.riskFlag === "merge-race") state.flags.raceAccepted = true;
  }

  addEvent(state, {
    providerId,
    tone: defect ? "warning" : "good",
    title: `${ticket.key} shipped`,
    message: defect
      ? "The patch is live, but the review left a visible risk unresolved. Future work may inherit it."
      : rewardTrust
        ? `Clean delivery. +${ticket.rewardTrust} trust and a slightly healthier repository.`
        : "Senior review secured the delivery, but the interruption earned no delivery trust.",
  });
  resetSession(session);
  unlockProgression(state);
  announceConsequences(state);
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
  const setupQuota = improveBrief ? BALANCE.improvedBriefQuotaCost : 0;
  if ((source.providerQuota[model.providerId] ?? 0) < 2 + setupQuota) {
    throw new GameRuleError(improveBrief ? "That provider lacks the quota to plan before coding." : "That provider has no usable quota.");
  }

  return produce(source, (state) => {
    const target = state.sessions[sessionId];
    target.status = "working";
    target.ticketId = ticketId;
    target.modelId = modelId;
    target.progress = 0;
    target.reviewRound = 0;
    target.briefImproved = improveBrief;
    target.workedInParallel = false;
    if (improveBrief) {
      state.providerQuota[model.providerId] -= BALANCE.improvedBriefQuotaCost;
      state.stats.quotaSpent += BALANCE.improvedBriefQuotaCost;
    }
    addEvent(state, {
      providerId: model.providerId,
      tone: "info",
      title: `${ticket.key} → ${model.name}`,
      message: `${improveBrief ? `The agent spent ${BALANCE.improvedBriefQuotaCost} quota clarifying acceptance criteria before coding.` : "The session started with the ticket exactly as written."} Estimated review in ${Math.max(1, Math.ceil(ticket.duration / model.speed))}s.`,
    });
  });
}

export function advanceGame(source: GameState, elapsedSeconds: number) {
  const seconds = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  if (seconds === 0 || source.ending) return source;

  return produce(source, (state) => {
    let remainingSeconds = seconds;

    while (remainingSeconds > 0) {
      const active = state.sessions.slice(0, state.unlockedSessions).flatMap((session) => {
        if (session.status !== "working" && session.status !== "quota-paused") return [];
        const ticket = ticketById.get(session.ticketId ?? "");
        const model = modelById.get(session.modelId ?? "");
        if (!ticket || !model) return [];
        return [{ session, ticket, model }];
      });

      const alreadyComplete = active.filter(({ session, ticket, model }) =>
        ((1 - session.progress) * ticket.duration) / model.speed <= SIMULATION_EPSILON,
      );
      if (alreadyComplete.length) {
        for (const { session, ticket, model } of alreadyComplete) {
          session.progress = 1;
          session.status = "awaiting-review";
          state.reviews.push({
            id: `${ticket.id}-${session.reviewRound}-${Math.round(state.gameTime)}`,
            ticketId: ticket.id,
            sessionId: session.id,
            risk: calculateReviewRisk(state, session),
            createdAt: state.gameTime,
          });
          addEvent(state, {
            providerId: model.providerId,
            tone: "info",
            title: `${ticket.key} is ready for review`,
            message: `${model.name} is ${Math.round(session.context)}% context-coherent and ${Math.round((1 - state.reviews.at(-1)!.risk) * 100)}% confident.`,
          });
        }
        continue;
      }

      const providerWork = new Map<string, typeof active>();
      for (const work of active) {
        const group = providerWork.get(work.model.providerId) ?? [];
        group.push(work);
        providerWork.set(work.model.providerId, group);
      }

      const workFraction = new Map<string, number>();
      let stepSeconds = remainingSeconds;
      for (const provider of content.providers) {
        const group = providerWork.get(provider.id) ?? [];
        const demand = group.reduce((total, { model }) => total + model.quotaRate, 0);
        let quota = clamp(state.providerQuota[provider.id] ?? 0, 0, quotaMax(state, provider.id));
        if (quota <= SIMULATION_EPSILON && demand > provider.regenPerSecond) quota = 0;
        state.providerQuota[provider.id] = quota;

        const fraction = demand === 0 || demand <= provider.regenPerSecond || quota > 0
          ? 1
          : provider.regenPerSecond / demand;
        workFraction.set(provider.id, fraction);

        if (demand > provider.regenPerSecond && quota > 0) {
          stepSeconds = Math.min(stepSeconds, quota / (demand - provider.regenPerSecond));
        }
        if (fraction > 0) {
          for (const { session, ticket, model } of group) {
            const workNeeded = ((1 - session.progress) * ticket.duration) / model.speed;
            stepSeconds = Math.min(stepSeconds, workNeeded / fraction);
          }
        }
      }

      if (stepSeconds <= SIMULATION_EPSILON) {
        // A quota boundary can land within floating-point noise of the current time.
        // Snap depleted pools to zero, then recalculate their constrained work rate.
        for (const provider of content.providers) {
          const group = providerWork.get(provider.id) ?? [];
          const demand = group.reduce((total, { model }) => total + model.quotaRate, 0);
          if (demand > provider.regenPerSecond && (state.providerQuota[provider.id] ?? 0) <= SIMULATION_EPSILON) {
            state.providerQuota[provider.id] = 0;
          }
        }
        stepSeconds = Math.min(remainingSeconds, SIMULATION_EPSILON);
      }

      const workingNow = active.filter(({ model }) => (workFraction.get(model.providerId) ?? 0) > 0);
      if (workingNow.length > 1) {
        for (const { session } of workingNow) session.workedInParallel = true;
      }

      for (const provider of content.providers) {
        const group = providerWork.get(provider.id) ?? [];
        const fraction = workFraction.get(provider.id) ?? 1;
        const demand = group.reduce((total, { model }) => total + model.quotaRate, 0);
        const spent = demand * fraction * stepSeconds;
        state.providerQuota[provider.id] = clamp(
          (state.providerQuota[provider.id] ?? 0) + provider.regenPerSecond * stepSeconds - spent,
          0,
          quotaMax(state, provider.id),
        );
        state.stats.quotaSpent += spent;

        for (const { session, ticket, model } of group) {
          const constrained = fraction < 1 - SIMULATION_EPSILON;
          if (constrained && session.status !== "quota-paused") {
            addEvent(state, {
              providerId: model.providerId,
              tone: "warning",
              title: `${model.name} hit its limit`,
              message: "Work is continuing at the provider's regeneration rate. Reduce contention or improve the quota plan.",
            });
          }
          session.status = constrained ? "quota-paused" : "working";
          const workSeconds = stepSeconds * fraction;
          session.progress = clamp(session.progress + (workSeconds * model.speed) / ticket.duration, 0, 1);
          const decayMultiplier = hasUpgrade(state, "context-notes") ? 0.55 : 1;
          session.context = clamp(session.context - workSeconds * model.contextDecay * BALANCE.contextDecayPerWorkSecond * decayMultiplier, 0, 100);
        }
      }

      state.gameTime += stepSeconds;
      if (active.length > 0) state.stats.activeSeconds += stepSeconds;
      remainingSeconds = Math.max(0, remainingSeconds - stepSeconds);

      const completed = active.filter(({ session }) => session.progress >= 1 - SIMULATION_EPSILON);
      for (const { session, ticket, model } of completed) {
        session.progress = 1;
        session.status = "awaiting-review";
        state.reviews.push({
          id: `${ticket.id}-${session.reviewRound}-${Math.round(state.gameTime)}`,
          ticketId: ticket.id,
          sessionId: session.id,
          risk: calculateReviewRisk(state, session),
          createdAt: state.gameTime,
        });
        addEvent(state, {
          providerId: model.providerId,
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
  if (decision === "escalate" && source.trust < BALANCE.escalationTrustCost) {
    throw new GameRuleError(`Escalation requires ${BALANCE.escalationTrustCost} trust.`);
  }

  return produce(source, (state) => {
    const index = state.reviews.findIndex((candidate) => candidate.id === reviewId);
    const current = state.reviews[index];
    const session = state.sessions[current.sessionId];
    const ticket = ticketById.get(current.ticketId)!;
    state.reviews.splice(index, 1);

    if (decision === "revise") {
      state.stats.revisions += 1;
      session.status = "working";
      session.progress = 0.62;
      session.reviewRound += 1;
      session.context = clamp(session.context + 6, 0, 100);
      addEvent(state, { providerId: modelById.get(session.modelId ?? "")?.providerId, tone: "info", title: `${ticket.key} changes requested`, message: "The agent is addressing the visible risk with a narrower second pass." });
      return;
    }

    if (decision === "escalate") {
      state.stats.escalations += 1;
      state.trust = clamp(state.trust - BALANCE.escalationTrustCost, 0, 100);
      state.debt = clamp(state.debt - 2, 0, 100);
      addEvent(state, { providerId: modelById.get(session.modelId ?? "")?.providerId, tone: "good", title: `${ticket.key} escalated`, message: `A senior review corrected the risky path before shipping. The interruption cost ${BALANCE.escalationTrustCost} trust.` });
      completeTicket(state, session, false, false);
      return;
    }

    const defect = isReviewBlocked(state, current);
    completeTicket(state, session, defect);
  });
}

export function compactSession(source: GameState, sessionId: number) {
  const session = source.sessions[sessionId];
  if (!session || (session.status !== "working" && session.status !== "quota-paused")) throw new GameRuleError("Only an active session can be compacted.");
  const model = modelById.get(session.modelId ?? "");
  if (!model) throw new GameRuleError("That session has no active model.");
  if ((source.providerQuota[model.providerId] ?? 0) < BALANCE.compactQuotaCost) throw new GameRuleError("That provider lacks the quota to compact this session.");
  return produce(source, (state) => {
    const target = state.sessions[sessionId];
    state.providerQuota[model.providerId] -= BALANCE.compactQuotaCost;
    state.stats.quotaSpent += BALANCE.compactQuotaCost;
    target.context = 88;
    target.progress = Math.max(0, target.progress - 0.08);
    addEvent(state, { providerId: model.providerId, tone: "info", title: `Session ${sessionId + 1} compacted`, message: `The summary used ${BALANCE.compactQuotaCost} provider quota, recovered context, and lost a little implementation momentum.` });
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
