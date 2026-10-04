import type { GameState, ReviewDecision, SessionState } from "../../src/game/types";
import { currentApi, type EvaluationApi } from "./api";

export type Policy = "fastest" | "planned" | "revise" | "escalate";
export interface ReplayConfig {
  id: string;
  policy: Policy;
  provider?: string;
  reasoning?: SessionState["reasoning"];
  upgrades?: string[];
  cache?: "restore" | "bypass";
  optional?: boolean;
  tickSeconds?: number;
  maxSeconds?: number;
  maxActions?: number;
  stopAfterShipments?: number;
  initialDelaySeconds?: number;
}

export const upgradeOrder = ["repo-playbook", "fast-checks", "context-notes", "worktree-isolation", "quota-plan", "ci-integrity-guard"];
export const baselineConfigs: ReplayConfig[] = [
  ...(["fastest", "planned", "revise", "escalate"] as Policy[]).map(policy => ({ id: policy, policy })),
  ...["anthill", "openmind"].map(provider => ({ id: `planned/${provider}`, policy: "planned" as const, provider })),
  ...(["revise", "planned"] as Policy[]).map(policy => ({ id: `${policy}/upgrades`, policy, upgrades: upgradeOrder })),
  { id: "planned/high", policy: "planned", reasoning: "high" },
  { id: "revise/bypass", policy: "revise", cache: "bypass" },
  { id: "revise/bypass/followup", policy: "revise", cache: "bypass", optional: true },
  ...upgradeOrder.map(upgrade => ({ id: `planned/only-${upgrade}`, policy: "planned" as const, upgrades: [upgrade] })),
];

export function snapshot(state: GameState) {
  const { events: _events, ...rest } = state;
  return JSON.parse(JSON.stringify(rest, (_key, value) => typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value)) as Omit<GameState, "events">;
}

export interface ActionRecord {
  sequence: number;
  at: number;
  kind: string;
  arguments: Record<string, unknown>;
  accepted: boolean;
  error?: string;
  state: ReturnType<typeof snapshot>;
}
export interface ReplayResult {
  formatVersion: 1;
  evidence: "omniscient deterministic replay";
  buildId: string;
  contentSignature: string;
  config: ReplayConfig;
  initialState: ReturnType<typeof snapshot>;
  actions: ActionRecord[];
  events: GameState["events"];
  finalState: ReturnType<typeof snapshot>;
  metrics: {
    stopReason: "ending" | "time-budget" | "action-budget" | "shipment-budget";
    elapsedSeconds: number;
    engineActiveSeconds: number;
    noWorkSeconds: number;
    ownerWorkSeconds: number;
    occupiedSlotSeconds: number;
    capacitySlotSeconds: number;
    utilization: number;
    quotaPausedSeconds: number;
    quotaPausedSlotSeconds: number;
    quotaTroughs: Record<string, number>;
    contextTrough: number;
    successfulActions: Record<string, number>;
    rejectedActions: number;
    quotaSpent: number;
    completedScope: { cacheFreshness: boolean; cacheSpeedup: boolean; optionalFollowup: boolean };
  };
}

const rounded = (value: number) => Math.round(value * 1e9) / 1e9;
function validate(config: ReplayConfig, api: EvaluationApi) {
  if (!["fastest", "planned", "revise", "escalate"].includes(config.policy)) throw new Error("Unknown policy.");
  for (const key of ["tickSeconds", "maxSeconds", "maxActions", "stopAfterShipments"] as const) {
    if (config[key] !== undefined && (!Number.isFinite(config[key]) || config[key]! <= 0)) throw new Error(`${key} must be finite and positive.`);
  }
  if (config.initialDelaySeconds !== undefined && (!Number.isFinite(config.initialDelaySeconds) || config.initialDelaySeconds < 0)) throw new Error("initialDelaySeconds must be finite and nonnegative.");
  if (config.provider && !api.content.providers.some(provider => provider.id === config.provider)) throw new Error("Unknown provider.");
  if (config.reasoning && !["low", "medium", "high"].includes(config.reasoning)) throw new Error("Unknown reasoning.");
  if (config.cache && !["restore", "bypass"].includes(config.cache)) throw new Error("Unknown cache remedy.");
  if (config.upgrades?.some(id => !api.content.upgrades.some(upgrade => upgrade.id === id))) throw new Error("Unknown upgrade.");
}

export function runReplay(config: ReplayConfig, options: { initialState?: GameState; buildId?: string; api?: EvaluationApi } = {}): ReplayResult {
  const api = options.api ?? currentApi;
  validate(config, api);
  const tick = config.tickSeconds ?? 0.05, budget = config.maxSeconds ?? 1200, actionBudget = config.maxActions ?? 2000;
  let state = structuredClone(options.initialState ?? api.createInitialState());
  const initialState = snapshot(state), startedAt = state.gameTime, initialStats = { ...state.stats };
  const actions: ActionRecord[] = [], events = [...state.events].reverse();
  const successfulActions: Record<string, number> = {};
  const quotaTroughs = { ...state.providerQuota };
  let contextTrough = 100, occupiedSlotSeconds = 0, capacitySlotSeconds = 0, ownerWorkSeconds = 0, quotaPausedSeconds = 0, quotaPausedSlotSeconds = 0;
  const sample = () => {
    for (const [id, quota] of Object.entries(state.providerQuota)) quotaTroughs[id] = Math.min(quotaTroughs[id] ?? quota, quota);
    for (const session of state.sessions) if (session.status !== "idle") contextTrough = Math.min(contextTrough, session.context);
  };
  const replace = (next: GameState) => {
    events.push(...next.events.filter(event => !state.events.includes(event)).reverse());
    state = next;
    sample();
  };
  const action = (kind: string, args: Record<string, unknown>, perform: () => GameState) => {
    if (actions.length >= actionBudget) return false;
    let accepted = true, error: string | undefined;
    try { replace(perform()); successfulActions[kind] = (successfulActions[kind] ?? 0) + 1; }
    catch (caught) { accepted = false; error = caught instanceof Error ? caught.message : String(caught); }
    actions.push({ sequence: actions.length + 1, at: rounded(state.gameTime), kind, arguments: args, accepted, ...(error ? { error } : {}), state: snapshot(state) });
    return accepted;
  };
  // Repeated identical rejected attempts are retained once until the relevant state changes.
  const rejectedSignatures = new Set<string>();
  const attempt = (kind: string, args: Record<string, unknown>, perform: () => GameState, relevant: unknown) => {
    const signature = JSON.stringify([kind, args, relevant]);
    if (rejectedSignatures.has(signature)) return;
    if (!action(kind, args, perform)) rejectedSignatures.add(signature);
  };
  sample();
  while (!state.ending && state.gameTime - startedAt < budget - 1e-9 && actions.length < actionBudget) {
    if (config.stopAfterShipments && state.stats.shipped - initialStats.shipped >= config.stopAfterShipments) break;
    if (state.gameTime - startedAt >= (config.initialDelaySeconds ?? 0) - 1e-9) {
      if (["active", "scaled"].includes(state.incidentResponse)) action("mitigate", { mitigation: "rollback" }, () => api.mitigateIncident(state, "rollback"));
      for (const review of [...state.reviews]) {
        if (state.ending) break;
        const blocked = api.isReviewBlocked(state, review);
        const decision: ReviewDecision = config.policy === "fastest" ? "approve" : blocked ? config.policy === "escalate" && state.trust >= api.BALANCE.escalationTrustCost ? "escalate" : "revise" : "approve";
        const cacheOptions = review.ticketId === "cache-summary" && decision === "revise" && config.cache ? { remedy: config.cache } : undefined;
        attempt(decision, { reviewId: review.id, ticketId: review.ticketId, blocked, ...(cacheOptions ? { options: cacheOptions } : {}) }, () => api.reviewTicket(state, review.id, decision, cacheOptions), [state.providerQuota, state.sessions.map(session => session.status), state.trust]);
      }
      if (state.ending || (config.stopAfterShipments && state.stats.shipped - initialStats.shipped >= config.stopAfterShipments)) break;
      for (const id of config.upgrades ?? []) {
        if (!state.purchasedUpgradeIds.includes(id)) attempt("purchase", { upgradeId: id }, () => api.buyUpgrade(state, id), [state.trust, state.completedTicketIds, state.flags]);
      }
      for (const session of [...state.sessions]) {
        if (["working", "quota-paused"].includes(session.status) && session.context < 40) {
          const providerId = api.modelById.get(session.modelId ?? "")?.providerId;
          // A failed compaction cannot accumulate while this same depleted pool works; try once per available balance.
          attempt("compact", { sessionId: session.id }, () => api.compactSession(state, session.id), [providerId, rounded(state.providerQuota[providerId ?? ""] ?? 0)]);
        }
      }
      for (const slot of state.sessions.filter(session => session.id < state.unlockedSessions && session.status === "idle")) {
        const ready = api.availableTickets(state).filter(ticket => !ticket.optional || config.optional);
        ready.sort((a, b) => Number(Boolean(b.incidentFor)) - Number(Boolean(a.incidentFor)) || Number(a.kind === "finale") - Number(b.kind === "finale"));
        const ticket = ready[0];
        if (!ticket) break;
        let models = api.availableModels(state).filter(model => !config.provider || model.providerId === config.provider);
        const recommended = models.filter(model => model.tier === ticket.recommendedTier);
        if (config.policy !== "fastest" && recommended.length) models = recommended;
        const planned = config.policy === "planned";
        const choices = models.map(model => ({ model, reasoning: model.providerId === "openmind" ? config.reasoning ?? "medium" : "medium" as SessionState["reasoning"], quota: state.providerQuota[model.providerId] ?? 0 }))
          .filter(choice => choice.quota >= 2 + (planned ? api.BALANCE.improvedBriefQuotaCost : 0) + (choice.reasoning === "high" ? 4 : 0));
        choices.sort((a, b) => config.policy === "fastest" ? b.model.speed - a.model.speed : b.quota - a.quota || b.model.speed - a.model.speed);
        const choice = choices[0];
        if (choice) attempt("assign", { sessionId: slot.id, ticketId: ticket.id, modelId: choice.model.id, planned, reasoning: choice.reasoning }, () => api.startTicket(state, slot.id, ticket.id, choice.model.id, planned, choice.reasoning), [state.completedTicketIds, state.sessions.map(session => session.status), state.providerQuota]);
      }
    }
    if (actions.length >= actionBudget) break;
    const dt = Math.min(tick, budget - (state.gameTime - startedAt));
    const before = state;
    const occupied = state.sessions.slice(0, state.unlockedSessions).filter(session => ["working", "quota-paused", "supporting"].includes(session.status));
    occupiedSlotSeconds += occupied.length * dt;
    capacitySlotSeconds += state.unlockedSessions * dt;
    const paused = occupied.filter(session => session.status === "quota-paused").length;
    quotaPausedSlotSeconds += paused * dt;
    if (paused) quotaPausedSeconds += dt;
    replace(api.advanceGame(state, dt));
    for (const session of before.sessions) {
      if (!["working", "quota-paused"].includes(session.status)) continue;
      const ticket = api.ticketById.get(session.ticketId ?? ""), model = api.modelById.get(session.modelId ?? "");
      if (ticket && model) ownerWorkSeconds += Math.max(0, state.sessions[session.id].progress - session.progress) * (session.workDuration ?? ticket.duration / model.speed);
    }
  }
  const elapsedSeconds = state.gameTime - startedAt;
  const engineActiveSeconds = state.stats.activeSeconds - initialStats.activeSeconds;
  const repairedCache = state.completedTicketIds.includes("cache-repair");
  return {
    formatVersion: 1, evidence: "omniscient deterministic replay", buildId: options.buildId ?? "working-tree (unversioned)",
    contentSignature: JSON.stringify({ tickets: api.content.tickets.map(ticket => ({ id: ticket.id, prerequisites: ticket.prerequisites, duration: ticket.duration })), models: api.content.models.map(model => model.id) }), config: { ...config }, initialState, actions, events,
    finalState: snapshot(state), metrics: {
      stopReason: state.ending ? "ending" : actions.length >= actionBudget ? "action-budget" : config.stopAfterShipments && state.stats.shipped - initialStats.shipped >= config.stopAfterShipments ? "shipment-budget" : "time-budget",
      elapsedSeconds: rounded(elapsedSeconds), engineActiveSeconds: rounded(engineActiveSeconds), noWorkSeconds: rounded(Math.max(0, elapsedSeconds - engineActiveSeconds)),
      ownerWorkSeconds: rounded(ownerWorkSeconds), occupiedSlotSeconds: rounded(occupiedSlotSeconds), capacitySlotSeconds: rounded(capacitySlotSeconds), utilization: capacitySlotSeconds ? rounded(occupiedSlotSeconds / capacitySlotSeconds) : 0,
      quotaPausedSeconds: rounded(quotaPausedSeconds), quotaPausedSlotSeconds: rounded(quotaPausedSlotSeconds),
      quotaTroughs: Object.fromEntries(Object.entries(quotaTroughs).map(([id, quota]) => [id, rounded(quota)])), contextTrough: rounded(contextTrough), successfulActions,
      rejectedActions: actions.filter(record => !record.accepted).length, quotaSpent: rounded(state.stats.quotaSpent - initialStats.quotaSpent),
      completedScope: { cacheFreshness: state.cacheOutcome !== "none" || repairedCache, cacheSpeedup: state.cacheOutcome === "restored" || state.completedTicketIds.includes("cache-followup") || repairedCache, optionalFollowup: state.completedTicketIds.includes("cache-followup") },
    },
  };
}
