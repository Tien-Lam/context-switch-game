import { produce } from "immer";
import { content, modelById, providerById, ticketById, upgradeById } from "../content";
import { BALANCE } from "./balance";
import { availableTickets, incidentIsOpen, isModelUnlocked, isReviewBlocked, reviewRiskFactorList } from "./selectors";
import type { EndingState, GameEvent, GameState, IncidentMitigation, ReviewDecision, SessionState } from "./types";

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
    id: `${Math.round((state.gameTime + 1e-9) * 1000)}-${state.events.length}-${event.title}`,
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
  session.reasoning = "medium";
  session.context = clamp(session.context + 2, 0, 100);
}

function calculateReviewRisk(state: GameState, session: SessionState) {
  const ticket = ticketById.get(session.ticketId ?? "");
  const model = modelById.get(session.modelId ?? "");
  if (!ticket || !model) return 0.5;
  const contextPenalty = Math.max(0, 80 - session.context) / 200;
  const reasoningModifier = session.reasoning === "high" ? -0.09 : session.reasoning === "low" ? 0.07 : 0;
  const parallelPenalty = session.workedInParallel && !hasUpgrade(state, "worktree-isolation") ? 0.09 : 0;
  const briefingBonus = session.briefImproved ? 0.13 : 0;
  const playbookBonus = hasUpgrade(state, "repo-playbook") ? 0.07 : 0;
  const testBonus = hasUpgrade(state, "fast-checks") ? 0.08 : 0;
  const integrityBonus = hasUpgrade(state, "ci-integrity-guard") ? 0.05 : 0;
  const revisionBonus = session.reviewRound * 0.18;
  const healthPenalty = Math.max(0, 70 - state.repoHealth) / 220;

  return clamp(
    ticket.baseRisk + model.riskModifier + reasoningModifier + contextPenalty + parallelPenalty + healthPenalty
      - briefingBonus - playbookBonus - testBonus - integrityBonus - revisionBonus,
    0.02,
    0.92,
  );
}

export function computeEnding(state: GameState): EndingState {
  const reliability = clamp(Math.round(state.repoHealth - state.stats.defects * 7), 0, 100);
  const mainTicketsShipped = state.completedTicketIds.filter((id) => !ticketById.get(id)?.incidentFor).length;
  const elapsedTimePenalty = Math.max(0, (state.gameTime - 180) / 60);
  const throughput = clamp(Math.round(
    mainTicketsShipped * 5 - state.stats.revisions * 1.5 - state.stats.escalations * 2.5
      - state.stats.defects * 5 - elapsedTimePenalty,
  ), 0, 100);
  const trust = clamp(Math.round(state.trust), 0, 100);
  const debt = clamp(Math.round(state.debt), 0, 100);
  const disciplined = reliability >= 78 && debt <= 20 && state.stats.defects <= 1;
  const title = disciplined
    ? "The release works. Suspiciously well."
    : state.stats.defects >= 3
      ? "The release works. Legal has follow-up questions."
      : "The release works, provided nobody refreshes twice.";
  const consequences = [
    incidentIsOpen(state, "cache-shortcut") ? "the dashboard cache still served stale data" : state.flags.cacheShortcut ? "the cache shortcut was repaired" : "the cache audit stayed clean",
    incidentIsOpen(state, "privacy-default") ? "telemetry still had the wrong default" : state.flags.privacyDefaultedOn ? "the privacy default was repaired" : "the privacy default held",
    incidentIsOpen(state, "runtime-drift") ? "the legacy worker survived the audit" : state.flags.runtimeDriftAccepted ? "the legacy worker was removed" : "the runtime started cleanly",
    incidentIsOpen(state, "merge-race") ? "the report race reached production" : state.flags.raceAccepted ? "the export race was repaired" : "parallel exports remained isolated",
    incidentIsOpen(state, "test-integrity") ? "the green build hid a checkout defect" : state.flags.testIntegrityAccepted ? "checkout coverage was restored" : "the green build kept its assertions",
    incidentIsOpen(state, "contract-mismatch") ? "the two agents shipped incompatible branches" : state.flags.contractMismatchAccepted ? "the contract was repaired" : "both rollout orders passed",
    incidentIsOpen(state, "request-loop") ? "the request loop remains live" : state.flags.requestLoopAccepted
      ? `the retry loop was repaired ${state.incidentMitigation === "rollback" ? "after rolling back the feature" : state.incidentMitigation === "rate-limit" ? "after rate-limiting traffic" : state.incidentMitigation === "scale" ? "after scaling the gateway" : "before the gateway rollout"}`
      : "the gateway stayed healthy",
  ];
  const message = `Your review history followed the release into production: ${consequences.join(", ")}.`;
  const scoreDetails = {
    throughput: `${mainTicketsShipped} main tickets × 5 − ${state.stats.revisions} revisions × 1.5 − ${state.stats.escalations} escalations × 2.5 − ${state.stats.defects} escaped defects × 5 − ${Math.round(elapsedTimePenalty * 10) / 10} elapsed-time points (after a 180-second grace period; includes idle time and quota restocks).`,
    reliability: `${Math.round(state.repoHealth)} repository health − ${state.stats.defects} escaped defects × 7.`,
    trust: "Current team trust after delivery, review, and incident decisions.",
    debt: "Current unresolved engineering debt after repairs.",
  };
  return { title, message, scores: { throughput, reliability, trust, debt }, scoreDetails };
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
      message: "Both provider terminals can now run work at the same time. Their quota pools remain separate; switch tabs when one runs low.",
    });
  }
  if (complete === 2) {
    state.providerQuota.anthill = Math.max(0, state.providerQuota.anthill - 14);
    addEvent(state, {
      providerId: "anthill",
      tone: "warning",
      title: "Anthill changed the team plan",
      message: "A fictional provider policy update removed 14 Anthill quota. OpenMind's pool is independent; use its tab for the next ticket or wait for regeneration.",
    });
  }
  if (state.completedTicketIds.includes("investor-demo") && !state.completedTicketIds.includes("green-build")
    && state.completedTicketIds.at(-1) === "investor-demo") {
    addEvent(state, {
      tone: "info",
      title: "The demo became a product",
      message: "Chapter two is open. QA-401 is already waiting; run `tickets read QA-401` from either provider terminal.",
    });
  }
}

function announceIncidentIfReady(state: GameState) {
  if (state.flags.incidentAnnounced) return;
  const prerequisitesDone = ["parallel-reports", "quota-display"].every((id) => state.completedTicketIds.includes(id));
  if (!prerequisitesDone) return;
  state.flags.incidentAnnounced = true;
  if (!incidentIsOpen(state, "cache-shortcut")) {
    state.trust = clamp(state.trust + 2, 0, 100);
    state.peakTrust = Math.max(state.peakTrust, state.trust);
    addEvent(state, {
      tone: "good",
      title: "Pre-demo freshness audit passed",
      message: state.flags.cacheShortcut
        ? "Support could not reproduce stale summaries after FIX-204 repaired the shortcut. +2 trust."
        : "Support tried to reproduce stale customer summaries and failed. The PERF-204 review prevented an incident. +2 trust.",
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

function announceConsequences(state: GameState) {
  if (incidentIsOpen(state, "test-integrity") && ["account-api", "account-panel"].every((id) => state.completedTicketIds.includes(id)) && !state.flags.testConsequenceApplied) {
    state.flags.testConsequenceApplied = true;
    state.trust = clamp(state.trust - 8, 0, 100);
    state.debt = clamp(state.debt + 3, 0, 100);
    addEvent(state, {
      tone: "warning",
      title: "Invoice totals drifted by one cent",
      message: "The deleted checkout assertion from QA-401 hid a rounding defect. Customer invoices are affected; FIX-401 is still open.",
    });
  }
  if (incidentIsOpen(state, "privacy-default") && state.completedTicketIds.includes("quota-display") && !state.flags.privacyConsequenceApplied) {
    state.flags.privacyConsequenceApplied = true;
    state.trust = clamp(state.trust - 12, 0, 100);
    state.debt = clamp(state.debt + 4, 0, 100);
    addEvent(state, {
      tone: "warning",
      title: "Enterprise disabled telemetry",
      message: "The implicit opt-in from APP-118 reached a customer workspace. Support opened a migration task. −12 trust, +4 debt.",
    });
  }
  if (incidentIsOpen(state, "runtime-drift") && state.completedTicketIds.includes("parallel-reports") && !state.flags.runtimeConsequenceApplied) {
    state.flags.runtimeConsequenceApplied = true;
    state.trust = clamp(state.trust - 8, 0, 100);
    state.repoHealth = clamp(state.repoHealth - 5, 0, 100);
    state.debt = clamp(state.debt + 5, 0, 100);
    addEvent(state, {
      tone: "warning",
      title: "Audit found the legacy worker",
      message: "The compatibility shim from PLAT-77 kept one report worker on the unsupported runtime. −8 trust, −5 health, +5 debt.",
    });
  }
  if (incidentIsOpen(state, "merge-race") && state.completedTicketIds.includes("stale-customer-data") && !state.flags.raceConsequenceApplied) {
    state.flags.raceConsequenceApplied = true;
    state.trust = clamp(state.trust - 12, 0, 100);
    state.repoHealth = clamp(state.repoHealth - 4, 0, 100);
    addEvent(state, {
      tone: "bad",
      title: "Two reports became one",
      message: "The shared export path from DATA-312 overwrote a customer's report during the demo rehearsal. −12 trust, −4 health.",
    });
  }
  if (["account-api", "account-panel"].every((id) => state.completedTicketIds.includes(id)) && !state.flags.contractAuditAnnounced) {
    state.flags.contractAuditAnnounced = true;
    if (incidentIsOpen(state, "contract-mismatch")) {
      state.trust = clamp(state.trust - 6, 0, 100);
      state.debt = clamp(state.debt + 4, 0, 100);
      addEvent(state, {
        tone: "warning",
        title: "Cross-branch contract failed",
        message: "Each agent's own tests passed, but an old server/new panel combination failed. FIX-420 must reconcile the branches before INT-422 can ship.",
      });
    } else {
      addEvent(state, { tone: "good", title: "Cross-branch contract passed", message: "Both deployment orders work. INT-422 is ready to join the branches." });
    }
  }
  if (["helpful-retry", "gateway-rollout"].every((id) => state.completedTicketIds.includes(id)) && !state.flags.retryAuditAnnounced) {
    state.flags.retryAuditAnnounced = true;
    if (incidentIsOpen(state, "request-loop")) {
      state.incidentResponse = "active";
      state.trust = clamp(state.trust - 10, 0, 100);
      state.repoHealth = clamp(state.repoHealth - 5, 0, 100);
      addEvent(state, {
        tone: "bad",
        title: "SEV-1 · The helpful retry",
        message: "The shell is sending repeated account requests while the gateway rolls. Run `incident status`, then contain the load before FIX-502 can start.",
      });
    } else {
      addEvent(state, { tone: "good", title: "Gateway canary stayed healthy", message: "The shell kept request volume bounded through the gateway rollout. SHIP-2 is ready." });
    }
  }
}

function completeTicket(state: GameState, session: SessionState, defect: boolean, rewardTrust = true) {
  const ticket = ticketById.get(session.ticketId ?? "");
  const providerId = modelById.get(session.modelId ?? "")?.providerId;
  if (!ticket) throw new GameRuleError("Ticket no longer exists.");
  if (ticket.incidentFor && defect) {
    state.stats.defects += 1;
    state.trust = clamp(state.trust - 6, 0, 100);
    state.repoHealth = clamp(state.repoHealth - 7, 0, 100);
    state.debt = clamp(state.debt + 9, 0, 100);
    addEvent(state, {
      providerId,
      sessionId: session.id,
      tone: "bad",
      title: `${ticket.key} repair failed`,
      message: "The blocked review left the incident unresolved. The repair ticket is back in the queue for another attempt.",
    });
    resetSession(session);
    return;
  }
  const repairingIncident = ticket.incidentFor && incidentIsOpen(state, ticket.incidentFor);
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
    if (ticket.riskFlag === "test-integrity") state.flags.testIntegrityAccepted = true;
    if (ticket.riskFlag === "contract-mismatch") state.flags.contractMismatchAccepted = true;
    if (ticket.riskFlag === "request-loop") state.flags.requestLoopAccepted = true;
  }

  addEvent(state, {
    providerId,
    sessionId: session.id,
    tone: defect ? "warning" : "good",
    title: `${ticket.key} shipped`,
    message: defect
      ? "The patch is live, but the review left a visible risk unresolved. Future work may inherit it."
      : rewardTrust
        ? `Clean delivery. +${ticket.rewardTrust} trust and a slightly healthier repository.`
        : "Senior review secured the delivery, but the interruption earned no delivery trust.",
  });
  if (repairingIncident) {
    if (ticket.incidentFor === "request-loop" && state.incidentResponse !== "none") state.incidentResponse = "resolved";
    state.repoHealth = clamp(state.repoHealth + 6, 0, 100);
    state.debt = clamp(state.debt - 7, 0, 100);
    addEvent(state, {
      providerId,
      sessionId: session.id,
      tone: "good",
      title: `${ticket.key} resolved the incident`,
      message: "The follow-up fix closed the known defect, restored repository health, and reduced debt.",
    });
  }
  if (defect && ticket.riskFlag !== "none") {
    const repair = content.tickets.find((candidate) => candidate.incidentFor === ticket.riskFlag);
    const missingPrerequisites = repair?.prerequisites.filter((id) => !state.completedTicketIds.includes(id)) ?? [];
    const blockedIncident = repair?.blockedByIncident && incidentIsOpen(state, repair.blockedByIncident);
    const repairMessage = !repair
      ? "The review warning needs follow-up investigation."
      : missingPrerequisites.length
        ? `${repair.key} unlocks after ${missingPrerequisites.map((id) => ticketById.get(id)?.key ?? id).join(" and ")} ship.`
        : blockedIncident
          ? `${repair.key} unlocks after the active incident is contained.`
          : availableTickets(state).some((candidate) => candidate.id === repair.id)
            ? `${repair.key} is ready in the backlog.`
            : `${repair.key} unlocks after its remaining prerequisite is complete.`;
    addEvent(state, {
      providerId,
      sessionId: session.id,
      tone: "bad",
      title: `${ticket.key} opened follow-up work`,
      message: `A review warning escaped and needs follow-up. ${repairMessage}`,
    });
  }
  resetSession(session);
  unlockProgression(state);
  announceConsequences(state);
  announceIncidentIfReady(state);
  if (ticket.kind === "finale") state.ending = computeEnding(state);
}

export function mitigateIncident(source: GameState, action: IncidentMitigation) {
  if (!["active", "scaled", "rate-limited"].includes(source.incidentResponse)) {
    throw new GameRuleError("No live gateway incident needs mitigation.");
  }
  if (action === "scale" && source.incidentResponse !== "active") {
    throw new GameRuleError("Capacity was already tried; contain the request loop instead.");
  }
  if (action === "rate-limit" && source.incidentResponse === "rate-limited") {
    throw new GameRuleError("The gateway is already rate-limited; start FIX-502 or roll back the retry feature.");
  }
  return produce(source, (state) => {
    if (action === "scale") {
      state.incidentResponse = "scaled";
      state.incidentMitigation = action;
      state.trust = clamp(state.trust - 6, 0, 100);
      state.debt = clamp(state.debt + 4, 0, 100);
      state.repoHealth = clamp(state.repoHealth + 8, 0, 100);
      addEvent(state, { tone: "warning", title: "Gateway scaled; loop persists", message: "Extra capacity stabilized service and protected repository health, but the shell still creates requests. Choose `incident mitigate rate-limit` or `incident mitigate rollback`." });
    } else if (action === "rate-limit") {
      state.incidentResponse = "rate-limited";
      state.incidentMitigation = action;
      state.trust = clamp(state.trust - 2, 0, 100);
      state.debt = clamp(state.debt + 3, 0, 100);
      addEvent(state, { tone: "warning", title: "Gateway rate-limited", message: "Load is contained, but some account requests are delayed. FIX-502 can now repair the shell." });
    } else {
      state.incidentResponse = "rolled-back";
      state.incidentMitigation = action;
      state.trust = clamp(state.trust - 4, 0, 100);
      state.debt = clamp(state.debt + 1, 0, 100);
      addEvent(state, { tone: "good", title: "Retry feature rolled back", message: "Request volume returned to normal. The new retry feature is unavailable until FIX-502 repairs it." });
    }
  });
}

export function startTicket(
  source: GameState,
  sessionId: number,
  ticketId: string,
  modelId: string,
  improveBrief = false,
  reasoning: SessionState["reasoning"] = "medium",
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
  const setupQuota = (improveBrief ? BALANCE.improvedBriefQuotaCost : 0) + (reasoning === "high" ? 4 : 0);
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
    target.reasoning = reasoning;
    if (setupQuota) {
      state.providerQuota[model.providerId] -= setupQuota;
      state.stats.quotaSpent += setupQuota;
    }
    addEvent(state, {
      providerId: model.providerId,
      sessionId,
      tone: "info",
      title: `${ticket.key} → ${model.name}`,
      message: `${improveBrief ? "The agent clarified acceptance criteria before coding." : "The session started with the ticket exactly as written."} ${reasoning === "high" ? "High reasoning spent 4 extra quota for a lower review risk." : reasoning === "low" ? "Low reasoning saved setup quota but increased review risk." : ""} Estimated review in ${Math.max(1, Math.ceil(ticket.duration / model.speed))}s.`,
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
            riskFactors: reviewRiskFactorList(state, ticket.id, session.id),
            createdAt: state.gameTime,
          });
          addEvent(state, {
            providerId: model.providerId,
            sessionId: session.id,
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
          riskFactors: reviewRiskFactorList(state, ticket.id, session.id),
          createdAt: state.gameTime,
        });
        addEvent(state, {
          providerId: model.providerId,
          sessionId: session.id,
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
      addEvent(state, { providerId: modelById.get(session.modelId ?? "")?.providerId, sessionId: session.id, tone: "info", title: `${ticket.key} changes requested`, message: "The agent is addressing the visible risk with a narrower second pass." });
      return;
    }

    if (decision === "escalate") {
      state.stats.escalations += 1;
      state.trust = clamp(state.trust - BALANCE.escalationTrustCost, 0, 100);
      state.repoHealth = clamp(state.repoHealth + 4, 0, 100);
      state.debt = clamp(state.debt - 2, 0, 100);
      addEvent(state, { providerId: modelById.get(session.modelId ?? "")?.providerId, sessionId: session.id, tone: "good", title: `${ticket.key} escalated`, message: `A senior review added an independent check and strengthened repository health. It cost ${BALANCE.escalationTrustCost} trust and forfeited the delivery reward.` });
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
    addEvent(state, { providerId: model.providerId, sessionId, tone: "info", title: `Session ${sessionId + 1} compacted`, message: `The summary used ${BALANCE.compactQuotaCost} provider quota, recovered context, and lost a little implementation momentum.` });
  });
}

export function buyUpgrade(source: GameState, upgradeId: string) {
  const upgrade = upgradeById.get(upgradeId);
  if (!upgrade) throw new GameRuleError("Unknown upgrade.");
  if (source.purchasedUpgradeIds.includes(upgradeId)) throw new GameRuleError("Upgrade already purchased.");
  if (source.completedTicketIds.length < upgrade.unlockAfter) throw new GameRuleError("Upgrade is not unlocked.");
  if (upgrade.requiresTicketId && !source.completedTicketIds.includes(upgrade.requiresTicketId)) throw new GameRuleError(`Ship ${ticketById.get(upgrade.requiresTicketId)?.key ?? upgrade.requiresTicketId} to unlock this upgrade.`);
  if (upgrade.requiresResolvedIncident && incidentIsOpen(source, upgrade.requiresResolvedIncident)) {
    throw new GameRuleError(`Resolve ${content.tickets.find((ticket) => ticket.incidentFor === upgrade.requiresResolvedIncident)?.key ?? "the incident"} before buying this upgrade.`);
  }
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
