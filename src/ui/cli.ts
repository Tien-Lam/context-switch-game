import { content, modelById, providerById, ticketById, upgradeById } from "../content";
import { CACHE_DECISIONS, CACHE_EVIDENCE, CACHE_PROVIDER_HABITS } from "../content/cacheDecisions";
import { BALANCE } from "../game/balance";
import { getCacheRevisionQuote, getQuotaThrottleCue, getReviewEvidence, getRevisionQuote } from "../game/decisionDepth";
import { availableModels, availableTickets, incidentIsOpen, isReviewBlocked, projectedTicketRisk, reviewRiskFactors, ticketProgressLabel, visibleTickets } from "../game/selectors";
import type { CacheRevisionOptions, GameState, IncidentMitigation, ReviewDecision } from "../game/types";

export type PaneMode = "agents" | "reviews" | "quota" | "events" | "dashboard";
export type PermissionMode = "ask" | "plan" | "accept-edits" | "workspace-write";
export type ReasoningMode = "low" | "medium" | "high";

export interface CliContext {
  providerId: string;
  modelId?: string;
  permissionMode?: PermissionMode;
  reasoning?: ReasoningMode;
  sessionId?: number | null;
  cwd?: string;
}

export type CliEffect =
  | { type: "assign"; sessionId: number; ticketId: string; modelId: string; improveBrief: boolean; reasoning: ReasoningMode }
  | { type: "review"; reviewId: string; decision: ReviewDecision; options?: CacheRevisionOptions }
  | { type: "compact"; sessionId: number }
  | { type: "purchase"; upgradeId: string }
  | { type: "mitigate"; action: IncidentMitigation }
  | { type: "speed"; speed: 1 | 4 | 12 }
  | { type: "clear" }
  | { type: "new-session" }
  | { type: "model"; modelId: string }
  | { type: "permissions"; mode: PermissionMode }
  | { type: "reasoning"; mode: ReasoningMode }
  | { type: "tab-new"; name?: string }
  | { type: "tab-close" }
  | { type: "tab-rename"; name: string }
  | { type: "open-view"; mode: PaneMode }
  | { type: "pane-split"; target: string }
  | { type: "pane-close" }
  | { type: "pane-swap" }
  | { type: "sound"; enabled: boolean }
  | { type: "motion"; reduced: boolean }
  | { type: "export" }
  | { type: "import" }
  | { type: "restart" };

export interface CliMessage {
  kind: "output" | "error" | "muted" | "success";
  text: string;
}

export interface CliResult {
  messages: CliMessage[];
  effect?: CliEffect;
}

const output = (text: string, kind: CliMessage["kind"] = "output"): CliMessage => ({ kind, text });
const error = (text: string): CliResult => ({ messages: [output(`error: ${text}`, "error")] });
const pad = (value: string | number, width: number) => String(value).padEnd(width, " ");
const workSeconds = (value: number) => Number(value.toFixed(2));
const defaultContext: CliContext = { providerId: "anthill", modelId: "ballad", permissionMode: "ask", reasoning: "medium" };

function findTicket(reference?: string) {
  if (!reference) return undefined;
  const normalised = reference.toLowerCase();
  return content.tickets.find((ticket) => ticket.id.toLowerCase() === normalised || ticket.key.toLowerCase() === normalised);
}

function option(tokens: string[], name: string) {
  const inline = tokens.find((token) => token.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = tokens.indexOf(`--${name}`);
  return index >= 0 ? tokens[index + 1] : undefined;
}

function providerModels(state: GameState, providerId: string) {
  return availableModels(state).filter((model) => model.providerId === providerId);
}

function activeProviderSession(state: GameState, providerId: string, sessionId?: number | null) {
  if (sessionId !== undefined) {
    const session = sessionId === null ? undefined : state.sessions[sessionId];
    return session && modelById.get(session.modelId ?? "")?.providerId === providerId
      && (session.status === "working" || session.status === "quota-paused") ? session : undefined;
  }
  return state.sessions.find((session) => {
    const provider = modelById.get(session.modelId ?? "")?.providerId;
    return provider === providerId && (session.status === "working" || session.status === "quota-paused");
  });
}

function visibleProviderSession(state: GameState, providerId: string, sessionId?: number | null) {
  if (sessionId !== undefined) {
    const session = sessionId === null ? undefined : state.sessions[sessionId];
    return session && modelById.get(session.modelId ?? "")?.providerId === providerId && session.status !== "idle" ? session : undefined;
  }
  return state.sessions.find((session) => {
    const provider = modelById.get(session.modelId ?? "")?.providerId;
    return provider === providerId && session.status !== "idle";
  });
}

function eventClock(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60) + 9;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function providerHelp(state: GameState, context: CliContext) {
  const isAnthill = context.providerId === "anthill";
  const dashboard = state.purchasedUpgradeIds.includes("terminal-dashboard");
  const shared = [
    "  Agent chat accepts ordinary requests; the Terminal surface runs exact tools.",
    "  For example: ‘Please handle the deployment banner’ or ‘Is this review safe?’",
    "",
    "  /help                      show commands",
    "  /status                    session, model, permissions, and work",
    "  /model [ID]                list or switch this provider's model",
    "  /usage                     provider quota and reset rates",
    "  /permissions [MODE]        ask | plan | accept-edits | workspace-write",
    "                             plan spends 5 quota to clarify the next assignment",
    "  /review [KEY]              inspect the review queue or a diff",
    "  /new                       start a fresh conversation",
    "  /exit                      return to shell; work continues in background",
    "  agents run <KEY>          assign work from Terminal",
    "  agents list|compact       inspect or compact orchestration slots",
    "  tickets list|read <KEY>    inspect the authored backlog",
    "  reviews revise PERF-204 --remedy restore|bypass [--workflow ledger|probes]",
  ];
  const specific = isAnthill
    ? [
        "  /compact [SESSION]        summarize context and keep working",
        "  /context                  visualize loaded session context",
        "  /cost                     show simulated session consumption",
        "  /diff <KEY>               inspect a pending change",
      ]
    : [
        "  /reasoning [LEVEL]        medium | high −9 risk, 4 extra upfront quota",
        "  /compact [SESSION]        condense the active work context",
        "  /review <KEY>             inspect a local change",
        "  /init                     inspect repository guidance",
      ];
  return [
    `${isAnthill ? "ANTHILL CODE" : "OPENMIND FORGE"} COMMANDS`,
    ...shared,
    ...specific,
    "  upgrades list|buy <ID>      manage structural upgrades",
    "  incident status            inspect a live gateway incident",
    "  incident mitigate <ACTION> scale | rate-limit | rollback",
    "  events [N]                  tail the activity stream",
    "  speed <1|4|12>              set simulation speed",
    state.completedTicketIds.length >= 1 ? "  tab new [NAME]              open a shell; type anthill or forge to launch" : "  [locked] extra terminal tabs · ship 1 ticket",
    state.completedTicketIds.length >= 3 ? "  watch <TYPE>                open a full-window operations tab" : "  [locked] operations views · ship 3 tickets",
    state.completedTicketIds.length >= 3 ? "  pane split <VIEW|TAB#>     show a second live terminal pane" : "  [locked] split panes · ship 3 tickets",
    state.completedTicketIds.length >= 3 ? "  pane swap|close             manage the split layout" : "",
    dashboard ? "  dashboard                  open the full-window live dashboard" : "  [upgrade] dashboard · buy terminal-dashboard",
    "  mux | trace | sound on|off | motion reduce|auto",
    "  save export|import | restart --confirm | clear",
  ].join("\n");
}

function agentHelp(state: GameState, context: CliContext) {
  const next = availableTickets(state)[0];
  return [
    `${providerById.get(context.providerId)?.name ?? "AGENT"} · CONVERSATION`,
    "Tell me what you need in ordinary language. You do not need a ticket key or command syntax.",
    next ? `Try: “Could you take the next ticket?” or “What is ${next.key} about?”` : "Ask about pending reviews or the current work.",
    "Ask what changed or whether a review is safe before you approve it.",
    "For a cache review, ask to restore invalidation, bypass the cache for now, or use a contract ledger or isolated probes.",
    "Ask to switch to a named model, or say ‘Please plan the next ticket’ (5 quota per assignment).",
    "Use /status, /model, /permissions, or /new for session controls.",
    "Switch to Terminal for exact backlog, review, incident, and multiplexer tools.",
  ].join("\n");
}

function status(state: GameState, context: CliContext) {
  const provider = providerById.get(context.providerId);
  const model = modelById.get(context.modelId ?? "");
  const active = visibleProviderSession(state, context.providerId, context.sessionId);
  const ticket = active?.ticketId ? ticketById.get(active.ticketId) : undefined;
  if (context.providerId === "openmind") {
    return [
      "SESSION CONFIGURATION",
      `  model              ${model?.name ?? "unselected"}`,
      `  reasoning          ${context.reasoning ?? "medium"}`,
      ...(active && active.reasoning !== (context.reasoning ?? "medium") ? [`  active job effort  ${active.reasoning} · selected effort applies to future assignments`] : []),
      `  directory          ${context.cwd ?? "~/delivery"}`,
      `  permissions        ${context.permissionMode ?? "workspace-write"}`,
      `  quota              ${Math.round(state.providerQuota[context.providerId] ?? 0)}/${provider?.maxQuota ?? 0}`,
      `  task               ${ticket ? `${ticket.key} · ${Math.round((active?.progress ?? 0) * 100)}%` : "idle"}`,
      `  task state         ${active?.status ?? "idle"}`,
      `  review queue       ${state.reviews.length}`,
      `  trust / health     ${Math.round(state.trust)} / ${Math.round(state.repoHealth)}`,
      `  repository debt    ${Math.round(state.debt)}`,
    ].join("\n");
  }
  return [
    "ANTHILL SESSION STATUS",
    `  model              ${model?.name ?? "unselected"}`,
    `  permission mode    ${context.permissionMode ?? "ask"}`,
    `  project            ${context.cwd ?? "~/delivery"}`,
    `  plan usage         ${Math.round(state.providerQuota[context.providerId] ?? 0)}/${provider?.maxQuota ?? 0} remaining`,
    `  context            ${active ? `${Math.round(active.context)}% left` : "fresh"}`,
    `  current task       ${ticket ? `${ticket.key} · ${Math.round((active?.progress ?? 0) * 100)}%` : "none"}`,
    ...(active && active.reasoning !== (context.reasoning ?? "medium") ? [`  active job effort  ${active.reasoning} · future assignments use ${context.reasoning ?? "medium"}`] : []),
    `  task state         ${active?.status ?? "idle"}`,
    `  trust / health     ${Math.round(state.trust)} / ${Math.round(state.repoHealth)}`,
    `  repository debt    ${Math.round(state.debt)}`,
  ].join("\n");
}

function listTickets(state: GameState, context: CliContext) {
  const header = `${pad("KEY", 10)} ${pad("STATE", 12)} ${pad("BASE/EST", 14)} TITLE`;
  const rows = visibleTickets(state).map((ticket) => {
    const progress = ticketProgressLabel(state, ticket.id).toUpperCase();
    const estimate = projectedTicketRisk(state, ticket.id, context.permissionMode === "plan", availableModels(state).some((model) => model.id === context.modelId) ? context.reasoning : "medium", context.modelId);
    const risk = `${Math.round(ticket.baseRisk * 100)}%/${estimate.min}-${estimate.max}%${ticket.riskFlag === "none" ? "" : " !"}`;
    return `${pad(ticket.key, 10)} ${pad(progress, 12)} ${pad(risk, 14)} ${ticket.title}${ticket.optional ? " [optional]" : ""}`;
  });
  return [header, ...rows, "", `Risk is ticket baseline / estimate ${estimateAssumptions(state, context)} with current repo, session, and upgrades, including expected work context decay. Future parallel work or repo changes can alter the result. Plan mode lowers the estimate; ! marks a known review finding.`].join("\n");
}

function estimateAssumptions(state: GameState, context?: CliContext) {
  const model = availableModels(state).find((candidate) => candidate.id === context?.modelId);
  return model
    ? `for the selected model ${model.name} and ${context?.reasoning ?? "medium"} reasoning`
    : "across available models (recommended tier when available; provisional, no model selected, medium reasoning)";
}

function readTicket(state: GameState, reference?: string, context?: CliContext) {
  const ticket = findTicket(reference);
  if (!ticket) return error("ticket not found; use `tickets list`");
  const dependencies = ticket.prerequisites.length
    ? ticket.prerequisites.map((id) => `${ticketById.get(id)?.key ?? id}:${state.completedTicketIds.includes(id) ? "done" : "open"}`).join(", ")
    : "none";
  const incidentDependency = ticket.blockedByIncident && incidentIsOpen(state, ticket.blockedByIncident)
    ? `, ${content.tickets.find((candidate) => candidate.incidentFor === ticket.blockedByIncident)?.key ?? "repair"}:open`
    : ticket.id === "retry-repair" && ["active", "scaled"].includes(state.incidentResponse)
      ? ", incident mitigation:open"
      : "";
  const estimate = projectedTicketRisk(state, ticket.id, context?.permissionMode === "plan", availableModels(state).some((model) => model.id === context?.modelId) ? context?.reasoning : "medium", context?.modelId);
  const knownFinding = ticket.riskFlag === "none" ? "" : " · ! known review finding";
  return {
    messages: [output([
      `${ticket.key} · ${ticket.title}`,
      `state       ${ticketProgressLabel(state, ticket.id)}`,
      `type        ${ticket.kind}`,
      ...(ticket.optional ? ["release     optional follow-up; not required to finish the release"] : []),
      `brief       ${ticket.brief}`,
      `depends     ${dependencies}${incidentDependency}`,
      `files       ${ticket.files.join(", ")}`,
      `risk        ${Math.round(ticket.baseRisk * 100)}% base · ${estimate.min}-${estimate.max}% estimated ${estimateAssumptions(state, context)} · ${ticket.recommendedTier} model recommended${knownFinding}`,
      `reward      +${ticket.rewardTrust} trust`,
      "",
      ticket.summary,
    ].join("\n"))],
  };
}

function listModels(state: GameState, context: CliContext) {
  const unlocked = new Set(providerModels(state, context.providerId).map((model) => model.id));
  const provider = providerById.get(context.providerId);
  return [
    `${provider?.name ?? "Provider"} models`,
    `${pad("MODEL", 14)} ${pad("TIER", 10)} ${pad("SPEED", 8)} ${pad("QUOTA/S", 9)} ${pad("RISK", 8)} STATE`,
    ...content.models.filter((model) => model.providerId === context.providerId).map((model) => {
      const risk = `${model.riskModifier >= 0 ? "+" : ""}${Math.round(model.riskModifier * 100)}%`;
      const stateLabel = model.id === context.modelId ? "active" : unlocked.has(model.id) ? "available" : `locked @ trust ${model.unlockTrust}`;
      return `${pad(model.id, 14)} ${pad(model.tier, 10)} ${pad(`${model.speed.toFixed(2)}x`, 8)} ${pad(model.quotaRate.toFixed(1), 9)} ${pad(risk, 8)} ${stateLabel}\n  ${model.description}`;
    }),
  ].join("\n");
}

function listAgents(state: GameState) {
  return [
    `${pad("SESSION", 10)} ${pad("STATE", 18)} ${pad("MODEL", 14)} ${pad("CONTEXT", 10)} WORK`,
    ...state.sessions.map((session) => {
      const locked = session.id >= state.unlockedSessions;
      const ticket = session.ticketId ? ticketById.get(session.ticketId) : undefined;
      const work = session.status === "supporting" ? `isolated probes for session ${(session.supportForSessionId ?? 0) + 1} · ${Math.round((state.sessions[session.supportForSessionId ?? -1]?.progress ?? 0) * 100)}%` : ticket ? `${ticket.key} ${Math.round(session.progress * 100)}%` : "-";
      return `${pad(session.id + 1, 10)} ${pad(locked ? "locked" : session.status, 18)} ${pad(session.modelId ?? "-", 14)} ${pad(locked ? "-" : `${Math.round(session.context)}%`, 10)} ${work}`;
    }),
  ].join("\n");
}

function listReviews(state: GameState) {
  if (!state.reviews.length) return "review queue empty";
  return [
    `${pad("KEY", 10)} ${pad("GATE", 12)} ${pad("SCORE", 8)} ${pad("SESSION", 10)} TITLE`,
    ...state.reviews.map((review) => {
      const ticket = ticketById.get(review.ticketId)!;
      const blocked = isReviewBlocked(state, review);
      return `${pad(ticket.key, 10)} ${pad(blocked ? "blocked" : "passed", 12)} ${pad(Math.round(review.risk * 100), 8)} ${pad(review.sessionId + 1, 10)} ${ticket.title}`;
    }),
  ].join("\n");
}

function readReview(state: GameState, reference?: string) {
  const ticket = findTicket(reference);
  const review = ticket ? state.reviews.find((candidate) => candidate.ticketId === ticket.id) : undefined;
  if (!ticket || !review) return error("no pending review for that ticket");
  const session = state.sessions[review.sessionId];
  const unresolvedFinding = isReviewBlocked(state, review);
  const evidence = getReviewEvidence(state, review) ?? { ...ticket.evidence, scope: undefined };
  const revisionQuote = getRevisionQuote(state, review.id);
  const revisionCue = revisionQuote ? getQuotaThrottleCue(state, { sessionId: review.sessionId, modelId: session.modelId ?? "", seconds: revisionQuote.seconds, setupQuota: revisionQuote.setupQuota, helperNeeded: revisionQuote.cache?.helperNeeded }) : null;
  const cacheQuote = getCacheRevisionQuote(state, review.id);
  const habit = CACHE_PROVIDER_HABITS[modelById.get(session.modelId ?? "")?.providerId as keyof typeof CACHE_PROVIDER_HABITS];
  const cacheChoices = cacheQuote ? [
    `scope choices restore invalidation: ${CACHE_EVIDENCE.ledger.scope}`,
    `              bypass cache: ${CACHE_EVIDENCE.bypass.scope}`,
    `approach      ${habit?.introduction ?? "Choose a write-boundary ledger or isolated probes."}`,
    `workflows     ledger: ${CACHE_DECISIONS.ledger.seconds}s work, ${CACHE_DECISIONS.ledger.setupQuota} upfront provider quota, one slot, +${CACHE_DECISIONS.ledger.contextGain} context`,
    `              probes: ${CACHE_DECISIONS.probes.seconds}s work, ${CACHE_DECISIONS.probes.setupQuota} upfront quota, one extra supporting slot at ${CACHE_DECISIONS.helperQuotaMultiplier * 100}% model quota rate, +${CACHE_DECISIONS.probes.contextGain} context`,
    `default       ${cacheQuote.workflow ?? cacheQuote.remedy} · ${cacheQuote.seconds}s work · ${cacheQuote.setupQuota} upfront quota${cacheQuote.helperNeeded ? ` · helper ${cacheQuote.helperSessionId === null ? "unavailable" : `session ${cacheQuote.helperSessionId + 1}`}` : " · no helper slot"}${cacheQuote.fallbackReason ? ` · ${cacheQuote.fallbackReason}` : ""}`,
    "choose        reviews revise PERF-204 --remedy restore --workflow ledger|probes",
    "              reviews revise PERF-204 --remedy bypass",
  ] : [];
  const recommendation = unresolvedFinding
    ? review.risk >= 0.6
      ? "BLOCKED: high aggregate risk; revise or escalate before approving"
      : "BLOCKED: approve will ship the warning as a known defect"
    : "PASS: approve is supported by the current evidence";
  const history = ticket.kind === "finale" || ticket.id === "investor-demo"
    ? [
        `history     privacy ${incidentIsOpen(state, "privacy-default") ? "open" : state.flags.privacyDefaultedOn ? "repaired" : "clean"} · cache ${incidentIsOpen(state, "cache-shortcut") ? "stale" : state.flags.cacheShortcut ? "repaired" : "clean"}`,
        `            runtime ${incidentIsOpen(state, "runtime-drift") ? "drifted" : state.flags.runtimeDriftAccepted ? "repaired" : "clean"} · exports ${incidentIsOpen(state, "merge-race") ? "racy" : state.flags.raceAccepted ? "repaired" : "isolated"}`,
        `            health ${Math.round(state.repoHealth)} · debt ${Math.round(state.debt)} · trust ${Math.round(state.trust)}`,
        ...(ticket.id === "release-two" ? [
          `            tests ${incidentIsOpen(state, "test-integrity") ? "assertion missing" : state.flags.testIntegrityAccepted ? "repaired" : "intact"} · contract ${incidentIsOpen(state, "contract-mismatch") ? "incompatible" : state.flags.contractMismatchAccepted ? "repaired" : "compatible"}`,
          `            gateway ${state.incidentResponse === "none" ? "healthy" : state.incidentResponse}`,
        ] : []),
      ]
    : [];
  return {
    messages: [output([
      `REVIEW ${ticket.key} · review risk score ${Math.round(review.risk * 100)}/100`,
      `gate        ${unresolvedFinding ? "unresolved finding" : "passed"}`,
      `risk source ${reviewRiskFactors(state, review)}`,
      `change      ${evidence.summary}`,
      `tests       ${evidence.tests}`,
      `warning     ${evidence.signal}`,
      ...history,
      `scope       ${evidence.scope ?? `${ticket.files.length} files · ${ticket.files.join(", ")}`}`,
      `guidance    ${recommendation}`,
      ...(revisionQuote ? [
        `revision    ${revisionQuote.finding} · ${workSeconds(revisionQuote.seconds)}s work · ${revisionQuote.setupQuota} upfront provider quota`,
        `quota       owner ${revisionQuote.quotaRate.toFixed(1)} quota/work-second${revisionQuote.helperQuotaRate ? ` · helper ${revisionQuote.helperQuotaRate.toFixed(1)} quota/work-second` : ""} ongoing; separate from upfront setup`,
        `context     ${Math.round(revisionQuote.contextAfterSetup)}% after setup (+${revisionQuote.contextGain}) · ~${Math.round(revisionQuote.contextAfterWork)}% after work`,
      ] : []),
      ...(revisionCue ? [`timing      ${revisionCue.message}`] : []),
      ...cacheChoices,
      "",
      `approve     reviews approve ${ticket.key}    ship now; ${unresolvedFinding ? "known defect escapes" : "gate passed"}`,
      `revise      reviews revise ${ticket.key}     resolve finding; another agent pass`,
      `escalate    reviews escalate ${ticket.key}   ${state.trust >= BALANCE.escalationTrustCost ? `independent check; +4 health, -${BALANCE.escalationTrustCost} trust, no delivery reward` : `unavailable; requires ${BALANCE.escalationTrustCost} trust`}`,
    ].join("\n"))],
  };
}

function quota(state: GameState, context?: CliContext) {
  const providers = context ? content.providers.filter((provider) => provider.id === context.providerId) : content.providers;
  return [
    `${pad("PROVIDER", 20)} ${pad("REMAINING", 12)} RESET RATE`,
    ...providers.map((provider) => `${pad(provider.name, 20)} ${pad(Math.round(state.providerQuota[provider.id] ?? 0), 12)} ${(provider.regenPerSecond * 60).toFixed(1)}/min`),
  ].join("\n");
}

function upgrades(state: GameState) {
  return [
    `Trust balance: ${Math.round(state.trust)} · purchases spend trust`,
    `${pad("ID", 24)} ${pad("TRUST", 8)} ${pad("STATE", 12)} UPGRADE`,
    ...content.upgrades.map((upgrade) => {
      const bought = state.purchasedUpgradeIds.includes(upgrade.id);
      const ticketReady = !upgrade.requiresTicketId || state.completedTicketIds.includes(upgrade.requiresTicketId);
      const incidentReady = !upgrade.requiresResolvedIncident || !incidentIsOpen(state, upgrade.requiresResolvedIncident);
      const unlocked = state.completedTicketIds.length >= upgrade.unlockAfter && ticketReady && incidentReady;
      const requirement = !ticketReady
        ? ticketById.get(upgrade.requiresTicketId!)?.key ?? upgrade.requiresTicketId!
        : !incidentReady
          ? `repair ${content.tickets.find((ticket) => ticket.incidentFor === upgrade.requiresResolvedIncident)?.key ?? "incident"}`
          : `${upgrade.unlockAfter}`;
      return `${pad(upgrade.id, 24)} ${pad(upgrade.cost, 8)} ${pad(bought ? "active" : unlocked ? "ready" : `ship ${requirement}`, 12)} ${upgrade.name}\n  ${upgrade.description}`;
    }),
  ].join("\n");
}

function muxStatus(state: GameState) {
  const shipped = state.completedTicketIds.length;
  const dashboard = state.purchasedUpgradeIds.includes("terminal-dashboard");
  return [
    "TERMINAL CAPABILITIES",
    "  [ready]  Anthill Code session       launch anthill in any terminal · full window",
    "  [ready]  OpenMind Forge session     launch forge in any terminal · full window",
    `  ${shipped >= 1 ? "[ready]" : "[locked]"} parallel execution          ${shipped >= 1 ? "2 agent slots" : "ship 1 ticket"}`,
    `  ${shipped >= 3 ? "[ready]" : "[locked]"} third execution slot        ${shipped >= 3 ? "3 agent slots" : "ship 3 tickets"}`,
    `  ${shipped >= 1 ? "[ready]" : "[locked]"} extra terminal tabs         ${shipped >= 1 ? "tab new, then anthill|forge" : "ship 1 ticket"}`,
    `  ${shipped >= 2 ? "[ready]" : "[locked]"} named workspaces            ${shipped >= 2 ? "tab rename" : "ship 2 tickets"}`,
    `  ${shipped >= 3 ? "[ready]" : "[locked]"} full-window operations      ${shipped >= 3 ? "watch agents|reviews|quota|events" : "ship 3 tickets"}`,
    `  ${shipped >= 3 ? "[ready]" : "[locked]"} split panes                 ${shipped >= 3 ? "pane split <VIEW|TAB#> · pane swap|close" : "ship 3 tickets"}`,
    `  ${dashboard ? "[ready]" : "[upgrade]"} live graphical dashboard   ${dashboard ? "dashboard" : "upgrades buy terminal-dashboard"}`,
  ].join("\n");
}

function incidentStatus(state: GameState) {
  if (state.incidentResponse === "none") {
    return incidentIsOpen(state, "request-loop")
      ? "GATEWAY WATCH\n  state         latent request-loop risk\n  evidence      UI-502 changed the request effect; API-503 has not completed the overlap yet\n  action        run FIX-502 before the gateway rollout to prevent the incident"
      : "GATEWAY WATCH\n  state         healthy\n  account requests remain bounded";
  }
  if (state.incidentResponse === "resolved") {
    return "GATEWAY INCIDENT\n  state         resolved\n  evidence      FIX-502 passed repeated-render and recovery-load checks";
  }
  return [
    "GATEWAY INCIDENT · SEV-1",
    `  state         ${state.incidentResponse}`,
    "  symptom       account requests spike during gateway rollout",
    "  client trace  each render creates a fresh request-options object",
    "  gateway      canary passed alone; extra capacity does not stop new requests",
    `  repair       ${["active", "scaled"].includes(state.incidentResponse) ? "blocked until load is contained" : "FIX-502 is ready"}`,
    "",
    "  incident mitigate rollback     stop the bad client; feature temporarily unavailable; −4 trust",
    ...(state.incidentResponse === "rate-limited" ? [] : ["  incident mitigate rate-limit   keep feature live with delayed requests; −2 trust, +3 debt"]),
    ...(state.incidentResponse === "active" ? ["  incident mitigate scale        stabilize service; +8 health, −6 trust, +4 debt; loop persists"] : []),
  ].join("\n");
}

function runTicket(state: GameState, context: CliContext, reference?: string, tokens: string[] = [], naturalPrompt = "") {
  const ticket = findTicket(reference);
  if (!ticket) return error("ticket not found; use `tickets list`");
  if (!availableTickets(state).some((candidate) => candidate.id === ticket.id)) return error(`${ticket.key} is not ready or is already assigned`);
  const sessionOption = Number(option(tokens, "session") ?? 0);
  const session = sessionOption
    ? state.sessions[sessionOption - 1]
    : state.sessions.find((candidate) => candidate.id < state.unlockedSessions && candidate.status === "idle");
  if (!session) return error("no idle orchestration slot; ship work to unlock parallel execution");
  if (session.id >= state.unlockedSessions || session.status !== "idle") return error(session.status === "supporting" ? "that session is supporting isolated probes; wait for the owner to finish" : "that orchestration slot is locked or occupied");
  const requestedModel = option(tokens, "model") ?? context.modelId;
  const models = providerModels(state, context.providerId);
  const model = requestedModel
    ? modelById.get(requestedModel.toLowerCase())
    : models.find((candidate) => candidate.tier === ticket.recommendedTier) ?? models[0];
  if (!model || model.providerId !== context.providerId) return error("that model belongs to the other provider CLI");
  if (!models.some((candidate) => candidate.id === model.id)) return error("model is locked or unknown; use `/model`");
  const constraints = tokens.length ? {} : taskConstraints(naturalPrompt, ticket.key, ticket.id);
  if (constraints.clarification) return { messages: [output(`No work started. ${constraints.clarification}`, "muted")] };
  const improveBrief = context.permissionMode === "plan" || tokens.includes("--brief") || constraints.improveBrief === true || /\b(plan|clarify|careful|brief)\b/i.test(naturalPrompt);
  const reasoning = context.providerId === "openmind" && context.reasoning === "high" ? "high" : "medium";
  const setupQuota = (improveBrief ? BALANCE.improvedBriefQuotaCost : 0) + (reasoning === "high" ? 4 : 0);
  if ((state.providerQuota[context.providerId] ?? 0) < 2 + setupQuota) return error(`${ticket.key} needs ${setupQuota} upfront provider quota${improveBrief ? " (5 for planning)" : ""} plus 2 usable quota to start; no work started or quota spent`);
  const provider = providerById.get(context.providerId);
  const eta = Math.max(1, Math.ceil(ticket.duration / model.speed));
  const throttleCue = getQuotaThrottleCue(state, { sessionId: session.id, modelId: model.id, seconds: ticket.duration / model.speed, setupQuota });
  return {
    messages: [output(`${provider?.shortName ?? "CLI"} · ${ticket.key} → session ${session.id + 1} / ${model.name}${improveBrief ? " / plan first (5 upfront quota)" : ""}${reasoning === "high" ? " / high reasoning (4 extra upfront quota)" : ""} · ~${eta}s work at full speed${state.sessions.some((candidate) => candidate.status === "working" || candidate.status === "quota-paused") && !state.purchasedUpgradeIds.includes("worktree-isolation") ? " · overlapping work shares the branch; contention adds review risk" : ""}${constraints.improveBrief ? "\nAccepted: telemetry off by default. The clarified brief includes disabled-default and migration-fixture checks; evidence arrives after completed work and still must pass review." : ""}${throttleCue ? `\n${throttleCue.message}` : ""}`, "muted")],
    effect: { type: "assign", sessionId: session.id, ticketId: ticket.id, modelId: model.id, improveBrief, reasoning },
  } satisfies CliResult;
}

function taskConstraints(raw: string, key: string, ticketId: string): { improveBrief?: boolean; clarification?: string } {
  if (/\b(?:or|either|maybe|perhaps)\b/i.test(raw)) return { clarification: `Choose one definite instruction for ${key} before I start.` };
  const defaultMention = /\b(?:default|telemetry\s+(?:off|on|disabled|enabled))\b/i.test(raw);
  const fixture = /\b(?:migration(?:[-\s]+(?:fixture|test|check))?|fixtures?)\b/i.test(raw);
  const off = /\b(?:(?:off|disabled)[-\s]+(?:by\s+)?default|default(?:s|ed)?\s+(?:to\s+|is\s+|must\s+be\s+)?(?:off|disabled))\b/i.test(raw);
  const on = /\b(?:telemetry\s+(?:on|enabled)|(?:on|enabled)\s+(?:by\s+)?default|default(?:s|ed)?\s+(?:to\s+|is\s+|must\s+be\s+)?(?:on|enabled))\b/i.test(raw);
  const ambiguous = /\b(?:not|never|don['’]t|do\s+not)\s+(?:off|disabled|on|enabled)|\b(?:or|either|maybe|perhaps)\b/i.test(raw);
  if ((defaultMention || fixture) && ticketId !== "telemetry-toggle") return { clarification: `I can apply the authored brief for ${key}; that extra acceptance constraint is not supported. Describe the intended scope before I start.` };
  if (defaultMention || fixture) {
    if (ambiguous || on || (defaultMention && !off)) return { clarification: "Choose a telemetry default explicitly. I can apply telemetry off by default with migration checks; conflicting or enabled defaults need clarification." };
    if (fixture && !off) return { clarification: "The migration fixture needs a default choice. Should telemetry be off by default? No planning quota is charged until you choose." };
  }
  const suffix = raw.match(new RegExp(`\\b${key}\\b(.*)$`, "i"))?.[1]
    ?? raw.split(/\b(?:with|without|but|while|using|ensure|ensuring|make\s+sure|so\s+that|and)\b/i).slice(1).join(" ");
  if (suffix) {
    const remaining = suffix.toLowerCase()
      .replace(/\btelemetry\b|\b(?:off|disabled)[-\s]+(?:by\s+)?default\b|\bdefault(?:s|ed)?\s+(?:to\s+|is\s+|must\s+be\s+)?(?:off|disabled)\b|\bmigration(?:[-\s]+(?:fixture|test|check)s?)?\b|\bfixtures?\b/g, " ")
      .replace(/\b(?:the|a|an|to|be|is|by|off|disabled|include|including|add|adding|checks?|tests?|please|also|with|and|plan|first|careful|carefully|brief)\b/g, " ")
      .replace(/[\s,.!?]+/g, "").trim();
    if (remaining) return { clarification: `I cannot apply every extra clause in that request. ${ticketId === "telemetry-toggle" ? "I can use telemetry off by default with migration checks. " : ""}Confirm the supported scope before I start.` };
  }
  return off ? { improveBrief: true } : {};
}

function reviseReview(state: GameState, reviewId: string, options?: CacheRevisionOptions): CliResult {
  const review = state.reviews.find((candidate) => candidate.id === reviewId);
  if (!review) return error("no pending review for that ticket");
  const ticket = ticketById.get(review.ticketId)!;
  if (options && ticket.id !== "cache-summary") return error("cache remedy and workflow choices apply only to PERF-204");
  if (options?.remedy === "bypass" && options.workflow) return error("bypass has no restoration workflow; omit --workflow");
  const revisionQuote = getRevisionQuote(state, review.id, options);
  const quote = revisionQuote?.cache;
  if (quote?.helperNeeded && quote.helperSessionId === null) return error("isolated probes need a free unlocked supporting slot; use ledger or free a slot");
  const providerId = modelById.get(state.sessions[review.sessionId]?.modelId ?? "")?.providerId ?? "";
  if (quote && (state.providerQuota[providerId] ?? 0) < quote.setupQuota) return error(`ledger needs ${quote.setupQuota} provider quota upfront; use probes or wait for quota`);
  const habit = CACHE_PROVIDER_HABITS[providerId as keyof typeof CACHE_PROVIDER_HABITS];
  const throttleCue = revisionQuote ? getQuotaThrottleCue(state, { sessionId: review.sessionId, modelId: state.sessions[review.sessionId]?.modelId ?? "", seconds: revisionQuote.seconds, setupQuota: revisionQuote.setupQuota, helperNeeded: quote?.helperNeeded }) : null;
  const details = quote ? ` · ${quote.remedy}${quote.workflow ? ` / ${quote.workflow}` : ""} · ${quote.seconds}s work · ${quote.setupQuota} upfront quota${quote.helperNeeded ? ` · supporting session ${quote.helperSessionId! + 1} at ${CACHE_DECISIONS.helperQuotaMultiplier * 100}% model quota rate` : " · no helper slot"}${quote.remedy === "bypass" ? ` · dashboard speed deferred; ${quote.rewardTrust}-trust reward, optional ${CACHE_DECISIONS.followup.key} follow-up` : " · dashboard speed retained"}${quote.fallbackReason ? ` · ${quote.fallbackReason}` : ""}${habit ? `\n${habit[quote.workflow ?? quote.remedy]}` : ""}` : revisionQuote ? ` · ${revisionQuote.finding} · ${workSeconds(revisionQuote.seconds)}s work · ${revisionQuote.setupQuota} upfront provider quota · +${revisionQuote.contextGain} context` : "";
  return {
    messages: [output(`review.revise · ${ticket.key} · revision runs in session ${review.sessionId + 1}; use agents list to track it${details}${revisionQuote ? `\nOngoing quota: owner ${revisionQuote.quotaRate.toFixed(1)} quota/work-second${revisionQuote.helperQuotaRate ? `; helper ${revisionQuote.helperQuotaRate.toFixed(1)} quota/work-second` : ""}; separate from upfront setup.` : ""}${throttleCue ? `\n${throttleCue.message}` : ""}`, "muted")],
    effect: { type: "review", reviewId, decision: "revise", ...(options ? { options } : {}) },
  };
}

function revisionOptions(tokens: string[]): { options?: CacheRevisionOptions; error?: string } {
  if (!tokens.length) return {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (/^--(?:remedy|workflow)=/.test(token)) {
      if (!token.split("=")[1]) return { error: "remedy and workflow flags need a value" };
    } else if (token === "--remedy" || token === "--workflow") {
      if (!tokens[index + 1] || tokens[index + 1].startsWith("--")) return { error: `${token} needs a value` };
      index += 1;
    } else return { error: "usage: reviews revise PERF-204 --remedy restore|bypass [--workflow ledger|probes]" };
  }
  if (tokens.filter((token) => /^--remedy(?:=|$)/.test(token)).length > 1 || tokens.filter((token) => /^--workflow(?:=|$)/.test(token)).length > 1) return { error: "choose each remedy or workflow only once" };
  const remedy = option(tokens, "remedy") ?? "restore";
  const workflow = option(tokens, "workflow");
  if (remedy !== "restore" && remedy !== "bypass") return { error: "remedy must be restore or bypass" };
  if (workflow !== undefined && workflow !== "ledger" && workflow !== "probes") return { error: "workflow must be ledger or probes" };
  if (remedy === "bypass" && workflow) return { error: "bypass has no restoration workflow; omit --workflow" };
  return { options: { remedy, ...(workflow ? { workflow } : {}) } };
}

function naturalCacheChoice(raw: string): { options: CacheRevisionOptions; ambiguous: boolean } {
  // Alternatives explicitly rejected by the player are context, not instructions.
  const chosen = raw.split(/\b(?:rather\s+than|instead\s+of|but\s+not|without|never|avoid|no)\b|[,;:]?\s*\bnot\b/i)[0];
  const bypass = /\b(?:bypass|remove)\b/i.test(chosen);
  const restore = /\brestore\b/i.test(chosen);
  const probes = /\bprobes\b/i.test(chosen);
  const ledger = /\bledger\b/i.test(chosen);
  const rejected = raw.slice(chosen.length);
  const rejectsProbes = /\bprobes\b/i.test(rejected);
  const rejectsLedger = /\bledger\b/i.test(rejected);
  const rejectsBypass = /\b(?:bypass|remove)\b/i.test(rejected);
  const rejectsRestore = /\brestore\b/i.test(rejected);
  const workflow = probes ? "probes" : ledger ? "ledger" : rejectsProbes ? "ledger" : rejectsLedger ? "probes" : undefined;
  return {
    options: { remedy: bypass ? "bypass" : "restore", ...(!bypass && workflow ? { workflow } : {}) },
    ambiguous: (bypass && restore) || (probes && ledger) || (probes && rejectsProbes) || (ledger && rejectsLedger)
      || (rejectsProbes && rejectsLedger) || (bypass && rejectsBypass) || (!bypass && (restore || Boolean(workflow)) && rejectsRestore),
  };
}

function naturalSessionControl(raw: string, state: GameState, context: CliContext): CliResult | undefined {
  if (/^\s*(?:please\s+)?use\s+(?:(?:a|an|the)\s+)?(?:contract\s+ledger|isolated\s+probes|ledger|probes)\b/i.test(raw)) return undefined;
  const prefix = "^\\s*(?:(?:please|let'?s)\\s+|(?:can|could|would)\\s+you\\s+(?:please\\s+)?)?";
  const modelRequest = new RegExp(`${prefix}(?:switch|change|select|use)\\s+(?:(?:the|my|active)\\s+)?(?:model\\s+)?(?:to\\s+)?([a-z][a-z0-9-]*)\\b`, "i").exec(raw);
  const planRequest = new RegExp(`${prefix}(?:plan\\s+(?:the\\s+)?(?:next|future)\\s+(?:ticket|assignment)|(?:enable|turn\\s+on|use)\\s+plan(?:ning)?(?:\\s+(?:mode|permissions?))?)\\b`, "i").exec(raw);
  const reasoningRequest = new RegExp(`${prefix}(?:use|select|set|switch\\s+to)\\s+(low|medium|high)\\s+reasoning\\b`, "i").exec(raw);
  if (modelRequest && /^(?:ledger|probes|isolated|contract|cache|invalidation)$/i.test(modelRequest[1]) && !planRequest && !reasoningRequest) return undefined;
  if (!modelRequest && !planRequest && !reasoningRequest) return undefined;
  const match = reasoningRequest ?? planRequest ?? modelRequest!;
  const remainder = raw.slice(match[0].length).replace(/[\s.!?]+/g, "");
  if (remainder) return { messages: [output(`No configuration or work changed: this compound request needs separate instructions. ${modelRequest ? `Use /model ${modelRequest[1].toLowerCase()} for this provider's model. ` : ""}${planRequest || /\bplan\b/i.test(raw) ? "Use /permissions plan to clarify future assignments for 5 quota each. " : ""}Then ask me to take the named ticket; unsupported clauses need clarification.`, "muted")] };
  if (reasoningRequest) return evaluateCommand(`/reasoning ${reasoningRequest[1]}`, state, context);
  if (planRequest) return evaluateCommand("/permissions plan", state, context);
  return evaluateCommand(`/model ${modelRequest![1]}`, state, context);
}

function naturalLanguagePrompt(raw: string, state: GameState, context: CliContext): CliResult {
  const explicit = raw.match(/\b[A-Z]{2,10}-\d+\b/i)?.[0];
  const namedTargets = [...new Set((raw.match(/\b[A-Z]{2,10}-\d+\b/gi) ?? []).map((key) => key.toUpperCase()))];
  if (namedTargets.length > 1) return { messages: [output("No review decision made or work started. Choose one ticket so I do not silently act on only part of the request.", "muted")] };
  if (explicit && !findTicket(explicit)) return { messages: [output(`No review decision made or work started. ${explicit.toUpperCase()} is not a known ticket; inspect the backlog and name the intended ticket.`, "muted")] };
  const candidateTickets = visibleTickets(state);
  const words = new Set((raw.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => !["this", "that", "next", "first", "ticket", "work", "with", "from", "please", "could", "would", "should", "about", "change", "review"].includes(word)));
  const titleMatches = candidateTickets.map((ticket) => ({
    ticket,
    score: (ticket.title.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => words.has(word)).length,
  })).filter((match) => match.score > 0).sort((a, b) => b.score - a.score);
  const titleMatch = titleMatches[0] && titleMatches[0].score > (titleMatches[1]?.score ?? 0) ? titleMatches[0].ticket : undefined;
  const ticket = findTicket(explicit) ?? titleMatch;
  const reference = ticket?.key ?? explicit;
  const ready = availableTickets(state);
  const pending = explicit ? state.reviews.find((review) => review.ticketId === findTicket(explicit)?.id)
    : ticket ? state.reviews.find((review) => review.ticketId === ticket.id) : state.reviews.length === 1 ? state.reviews[0] : undefined;
  const pendingKey = pending ? ticketById.get(pending.ticketId)?.key : undefined;
  const inquiry = /^\s*(?:what|which|how|why|when|where|should\b|is\b|are\b|do\s+(?:I|we)\b|can\s+(?:I|we)\b|could\s+(?:I|we)\b|would\s+(?:I|we)\b|tell\s+me\b|show\s+me\b|explain\b)/i.test(raw);
  if (inquiry && /\bupgrades?\b/i.test(raw)) return { messages: [output(`${upgrades(state)}\n\nSwitch to Terminal and use upgrades buy <ID> to purchase.`)] };
  if (inquiry && /\b(?:telemetry|migration|default)\b/i.test(raw) && (!ticket || ticket.id === "telemetry-toggle") && !pending) return { messages: [output("For APP-118, I can clarify telemetry off by default with disabled-default and migration-fixture checks for 5 upfront provider quota on assignment. A fixture-only request still needs your default choice. No work or configuration changed; completed evidence must pass review.")] };
  if (inquiry && /\b(?:plan|planning|permissions?)\b/i.test(raw) && !reference) return { messages: [output(`Current permission mode: ${context.permissionMode ?? "ask"}. /permissions plan clarifies each future assignment for 5 upfront provider quota; selecting it costs nothing now. Use /permissions ask to return to ordinary briefs.`)] };
  if (inquiry && (/\b(?:models?|reasoning|switch)\b/i.test(raw) || content.models.some((model) => new RegExp(`\\b${model.id}\\b`, "i").test(raw))) && !reference) return { messages: [output(`${listModels(state, context)}${context.providerId === "openmind" ? "\nReasoning choices: medium (baseline) or high (4 extra upfront quota, −9 review risk)." : ""}`)] };
  const negatedWork = /\b(?:do\s+not|don['’]t|dont|never|avoid|should\s+not|shouldn['’]t|will\s+not|won['’]t)\s+(?:(?:want|need|plan|intend)\s+(?:(?:you|me|us)\s+)?(?:to\s+)?)?(?:please\s+)?(?:(?:you|me|us)\s+)?(?:work(?:ing)?|implement|start|begin|assign|touch|change|fix|ship|run|do(?:\s+(?:any\s+)?work)?)\b|\b(?:would\s+rather\s+not|rather\s+not)\s+(?:work(?:ing)?|implement|start|assign|touch|change|fix|ship|run)\b|\b(?:hold\s+off\s+on|refrain\s+from)\s+(?:work(?:ing)?|implement|starting|assigning|touching|changing|fixing|shipping|running)\b|\bdelay\s+(?:the\s+)?(?:work|working|implementation|start(?:ing)?|assignment|change|fix|ship(?:ping)?|run(?:ning)?)\b|\bpostpone\s+(?:the\s+)?(?:work|working|implementation|start(?:ing)?|assignment|change|fix|ship(?:ping)?|run(?:ning)?)\b|\bwait\s+(?:to\s+)?(?:work|start|begin|assign|implement|run)\b|\b(?:cannot|can\s+not|can['’]t|unable\s+to)\s+(?:work|start|begin|assign|implement|run)\b|\bnot\s+ready\s+to\s+(?:work|start|begin|assign|implement|run)\b|\bnot\s+yet\b/i;
  if (negatedWork.test(raw) || /\b(?:hold\s+off|refrain|delay|postpone|wait|not\s+ready|cannot|can['’]t)\b/i.test(raw)) {
    return { messages: [output(`No work started${reference ? ` for ${reference}` : ""}. Tell me when you're ready to pick it up.`, "muted")] };
  }
  if (/\b(?:do\s+not|don['’]t|never|avoid)\b.*\b(?:switch|select|change|plan|reasoning|model)\b/i.test(raw)) return { messages: [output("No configuration or work changed. Ask when you want to select a model or enable planning.", "muted")] };
  const control = !inquiry ? naturalSessionControl(raw, state, context) : undefined;
  if (control) return control;
  const cacheIntent = /\b(?:invalidation|cache|ledger|probes)\b/i.test(raw);
  if (cacheIntent && /^\s*(?:please\s+)?(?:do\s+not|don['’]t|never|avoid)\b|\b(?:do\s+not|don['’]t)\s+want\b/i.test(raw)) return { messages: [output("No cache revision started. Ask when you want to choose a remedy or workflow.", "muted")] };
  const cacheReview = explicit ? state.reviews.find((review) => review.ticketId === findTicket(explicit)?.id) : state.reviews.find((review) => review.ticketId === "cache-summary");
  const cacheAction = /^\s*(?:(?:please|let'?s)\s+|(?:can|could|would)\s+you\s+(?:please\s+)?|(?:I|we)\s+(?:want|need|would\s+like)\s+you\s+to\s+)?(?:restore\b|bypass\b|remove\s+(?:the\s+)?cache\b|use\s+(?:(?:the|a|an)\s+)?(?:isolated\s+probes|probes|contract\s+ledger|ledger)\b)/i.test(raw);
  const cacheInquiry = inquiry || /\b(?:only|just)\s+(?:ask(?:ing)?|explain(?:ing)?)\b|\bexplain\b/i.test(raw)
    || (raw.includes("?") && !/^\s*(?:can|could|would)\s+you\b/i.test(raw));
  if (cacheReview && cacheInquiry && (cacheIntent || /\b(?:what would|what will|what does|how much).*\b(?:take|cost)\b/i.test(raw))) return readReview(state, ticketById.get(cacheReview.ticketId)?.key);
  if (cacheIntent && cacheInquiry) return ticket ? readTicket(state, ticket.key, context) : { messages: [output("No cache revision started. I can explain restore versus bypass or ledger versus isolated probes when PERF-204 reaches review.", "muted")] };
  const cacheClause = raw.replace(/\b[A-Z]{2,10}-\d+\b/gi, " ")
    .replace(/\b(?:please|let'?s|can|could|would|you|i|we|want|need|like|to|restore|restoring|invalidation|bypass|bypassing|remove|cache|for|now|the|a|an|use|using|contract|ledger|isolated|probes|with|rather|than|instead|of|not|do|request|changes|revise|approve|merge|accept|ship|escalate|this|that|it|change|patch|review|ticket|on|without|again|another|pass|no|but|never|avoid|same|scope)\b/gi, " ")
    .replace(/[\s,.!?;]+/g, "");
  const cacheChoice = naturalCacheChoice(raw);
  if (cacheIntent && (cacheChoice.ambiguous || /\b(?:or|either)\b/i.test(raw)) && !cacheInquiry) return { messages: [output("No cache revision started. Choose restore or bypass, and choose ledger or probes when restoring; I can explain either option.", "muted")] };
  if (cacheReview && cacheIntent && !cacheInquiry && cacheClause) {
    return { messages: [output("No review decision made. I won't ignore a condition or extra clause; inspect the evidence below and confirm the cache decision you intend.", "muted"), ...readReview(state, "PERF-204").messages] };
  }
  if (cacheIntent && cacheAction && !cacheInquiry) {
    if (!cacheReview) return error("no pending cache review; inspect PERF-204 before choosing a remedy");
    const result = reviseReview(state, cacheReview.id, cacheChoice.options);
    return { ...result, messages: result.messages.map((message) => ({ ...message, text: message.text.replace("revision runs", "Revision runs") })) };
  }
  const reviewQuestion = /\b(reviews?|inspect|diff|changes?|changed|tests?|warning|approve|merge|ship|safe)\b/i.test(raw);
  if (pendingKey && inquiry && /\b(?:what would|what will|what does|how much).*\b(?:take|cost)\b/i.test(raw)) return readReview(state, pendingKey);
  const working = ticket ? state.sessions.find((session) => session.ticketId === ticket.id && (session.status === "working" || session.status === "quota-paused")) : visibleProviderSession(state, context.providerId, context.sessionId);
  if (inquiry && working && working.status !== "awaiting-review" && (reviewQuestion || /\b(?:work|working|progress|doing|task|ticket)\b/i.test(raw))) {
    const currentTicket = ticketById.get(working.ticketId ?? "");
    return { messages: [output(`${currentTicket?.key ?? "Work"} · session ${working.id + 1} · ${working.status} · ${Math.round(working.progress * 100)}% complete. ${working.status === "quota-paused" ? "Work continues at the provider's quota regeneration rate. " : ""}No completed change or verification evidence is ready yet. Ask what changed once it reaches review; /status shows current progress.`)] };
  }
  const reviewDecision = !(cacheIntent ? cacheInquiry : inquiry) && /^\s*(?:(?:please|let'?s)\s+)?(?:approve|merge|accept|ship|revise|request changes|escalate)\b/i.exec(raw)?.[0].toLowerCase();
  if (reviewDecision && (pending || reference)) {
    if (pending) {
      const reviewClause = raw.slice(reviewDecision.length)
        .replace(/\b[A-Z]{2,10}-\d+\b/gi, " ")
        .replace(/\b(?:this|that|it|the|change|patch|review|ticket|now|please|for|on)\b/gi, " ")
        .replace(/[\s,.!]+/g, "");
      if (reviewClause && !(pending.ticketId === "cache-summary" && cacheIntent && !cacheClause)) {
        return { messages: [output("No review decision made. I won't ignore a condition or extra clause; inspect the evidence below and confirm the decision you intend.", "muted"), ...readReview(state, pendingKey).messages] };
      }
      const decision: ReviewDecision = /revise|request changes/.test(reviewDecision) ? "revise" : /escalate/.test(reviewDecision) ? "escalate" : "approve";
      if (decision === "revise") {
        const options: CacheRevisionOptions | undefined = pending.ticketId === "cache-summary" && cacheIntent && /\b(?:restore|bypass|remove|ledger|probes)\b/i.test(raw)
          ? cacheChoice.options
          : undefined;
        const result = reviseReview(state, pending.id, options);
        return { ...result, messages: result.messages.map((message) => ({ ...message, text: message.text.replace("revision runs", "Revision runs") })) };
      }
      return { messages: [output(`${decision === "approve" ? "Approving" : "Escalating"} ${pendingKey}.`, "muted")], effect: { type: "review", reviewId: pending.id, decision } };
    }
    if (!/ship/.test(reviewDecision)) return { messages: [output(`There is no pending review for ${reference}.`, "muted")] };
  }
  if (reviewQuestion && (pending || reference)) {
    if (pendingKey) return readReview(state, pendingKey);
    if (/\b(review|inspect|diff|approve|merge)\b/i.test(raw)) return readReview(state, reference);
  }
  if (reviewQuestion && !reference && state.reviews.length > 1) return { messages: [output(listReviews(state))] };
  const containment = /^\s*(?:(?:please|let'?s)\s+)?(?:roll\s*back|rate[-\s]?limit|scale)\b/i.exec(raw)?.[0];
  if (containment) {
    const action: IncidentMitigation = /roll\s*back/i.test(containment) ? "rollback" : /rate[-\s]?limit/i.test(containment) ? "rate-limit" : "scale";
    const result = evaluateCommand(`incident mitigate ${action}`, state, context, true);
    return result.effect ? { ...result, messages: [output(`${action === "rollback" ? "Rolling back the retry feature" : action === "rate-limit" ? "Rate limiting the gateway" : "Scaling gateway capacity"}.`, "muted")] } : result;
  }
  const titleVerb = ticket?.title.split(" ")[0];
  const titleAction = titleVerb && new RegExp(`^\\s*(?:(?:please|let's)\\s+|(?:can|could|would)\\s+you\\s+)?${titleVerb}\\b`, "i").test(raw);
  const affirmativeWork = !inquiry && (titleAction || /^\s*(?:please\s+)?(?:plan|work\s+on|implement|start|begin|assign|take(?:\s+care\s+of)?|tackle|pick\s+up|handle|build|fix|ship|run|do)\b/i.test(raw)
    || /^\s*(?:can|could|would)\s+you\s+(?:please\s+)?(?:work\s+on|implement|start|begin|assign|take(?:\s+care\s+of)?|tackle|pick\s+up|handle|build|fix|ship|run|do)\b/i.test(raw)
    || /\b(?:I|we)\s+(?:want|need|would\s+like)\s+you\s+to\s+(?:work\s+on|implement|start|begin|assign|take(?:\s+care\s+of)?|tackle|pick\s+up|handle|build|fix|ship|run|do)\b/i.test(raw)
    || /^\s*let'?s\s+(?:work\s+on|implement|start|begin|take|tackle|pick\s+up|handle|build|fix|ship|do)\b/i.test(raw));
  if (affirmativeWork) {
    const selected = ticket ?? (/\b(next|first|ready|another|one)\b/i.test(raw) || ready.length === 1 ? ready[0] : undefined);
    if (selected) return runTicket(state, context, selected.key, [], raw);
    return { messages: [output(`I can take a ticket. The ready options are ${ready.map((item) => `${item.key} (${item.title})`).join(", ") || "currently blocked"}. Which one should I pick up?`, "muted")] };
  }
  const describedTicket = ticket ?? (ready.length === 1 && /\b(?:ticket|task|brief|first one|next one|this one|that one)\b/i.test(raw) ? ready[0] : undefined);
  if (describedTicket && /\b(ticket|brief|details?|requirement|explain|describe|tell|about|risk|risky|unsafe|summary|read|look|show)\b/i.test(raw)) return readTicket(state, describedTicket.key, context);
  if (/\b(backlog|tickets|what(?:'s| is)? next|what should (?:I|we) (?:do|work on)|ready to work)\b/i.test(raw)) return { messages: [output(listTickets(state, context))] };
  if (/\b(gateway|incident|request loop|contain)\b/i.test(raw)) return { messages: [output(incidentStatus(state))] };
  if (/\b(quota|usage|limit|reset)\b/i.test(raw)) return { messages: [output(quota(state, context))] };
  if (/\b(models?|reasoning)\b/i.test(raw)) return { messages: [output(listModels(state, context))] };
  if (/\b(status|progress|working|doing)\b/i.test(raw)) return { messages: [output(status(state, context))] };
  if (/^\s*(?:pwd|ls|cd|cat|less|more|grep|rg|find|tree|head|tail|wc|mkdir|touch|cp|mv|rm|echo|printf)\b/i.test(raw)
    || /\b(?:read|show|open|inspect)\b.*\b[^\s]+\.(?:txt|md|json|ts|tsx|js|css)\b/i.test(raw)) {
    return { messages: [output("Virtual-file tools live in Terminal: switch surfaces to read or edit sandbox files. Here I can explain tickets, take work, and inspect review evidence in your own words. Try ‘What should I work on next?’ or ‘Is this review safe?’", "muted")] };
  }
  const next = ready.find((item) => !item.incidentFor && item.kind !== "finale") ?? ready[0];
  return { messages: [output(`${providerById.get(context.providerId)?.name ?? "Agent"}: ${reference ? `I can look into ${reference} or take it on when you ask. ` : "Tell me what you want to work on in your own words. "}${next ? `The next ready ticket is ${next.key} (${next.title}).` : "There is no ready ticket right now; check the review queue."}`, "muted")] };
}

const terminalCommands = new Set(["help", "?", "status", "clear", "new", "mux", "trace", "sound", "motion", "models", "model", "quota", "usage", "cost", "context", "permissions", "reasoning", "init", "incident", "tickets", "agents", "compact", "review", "diff", "reviews", "upgrades", "events", "speed", "tab", "pane", "watch", "dashboard", "save", "restart"]);

export function evaluateAgentMessage(raw: string, state: GameState, context: CliContext = defaultContext): CliResult {
  const trimmed = raw.trim();
  const first = trimmed.split(/\s+/)[0]?.toLowerCase();
  if (trimmed.startsWith("/") || (terminalCommands.has(first) && !/[?]|\b(?:please|me|you|the|this|that|what|which|how|why|should|can|could|would|about)\b/i.test(trimmed))) {
    return evaluateCommand(trimmed, state, context);
  }
  return naturalLanguagePrompt(trimmed, state, { ...defaultContext, ...context, modelId: context.modelId });
}

export function evaluateCommand(raw: string, state: GameState, suppliedContext: CliContext = defaultContext, strict = false): CliResult {
  const context = { ...defaultContext, ...suppliedContext, modelId: suppliedContext.modelId };
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const first = tokens[0]?.toLowerCase();
  const slashCommand = first?.startsWith("/") ? first.slice(1) : undefined;
  const command = slashCommand ?? first;
  const subcommand = tokens[1]?.toLowerCase();
  if (!command) return { messages: [] };

  if (command === "help" || command === "?") return { messages: [output(strict ? providerHelp(state, context) : agentHelp(state, context))] };
  if (command === "status") return { messages: [output(status(state, context))] };
  if (command === "clear") return { messages: [], effect: { type: "clear" } };
  if (command === "new") return { messages: [], effect: { type: "new-session" } };
  if (command === "mux") return { messages: [output(muxStatus(state))] };
  if (command === "trace") return { messages: [output(`LOCAL RUN TRACE\n  elapsed        ${Math.round(state.gameTime)}s\n  active work    ${Math.round(state.stats.activeSeconds)}s\n  shipped        ${state.stats.shipped}\n  revisions      ${state.stats.revisions}\n  escalations    ${state.stats.escalations}\n  defects        ${state.stats.defects}\n  quota spent    ${Math.round(state.stats.quotaSpent)}\n\n${state.events.slice(0, 12).map((event) => `${eventClock(event.at)} ${event.title}`).join("\n")}`)] };
  if (command === "sound") {
    if (subcommand !== "on" && subcommand !== "off") return error("usage: sound on|off");
    return { messages: [output(`sound ${subcommand}`, "success")], effect: { type: "sound", enabled: subcommand === "on" } };
  }
  if (command === "motion") {
    if (subcommand !== "reduce" && subcommand !== "auto") return error("usage: motion reduce|auto");
    return { messages: [output(`motion ${subcommand}`, "success")], effect: { type: "motion", reduced: subcommand === "reduce" } };
  }
  if (command === "models") return { messages: [output(listModels(state, context))] };
  if (command === "model") {
    if (!subcommand) return { messages: [output(listModels(state, context))] };
    const model = modelById.get(subcommand);
    if (!model || model.providerId !== context.providerId) return error("that model is not available in this provider CLI");
    if (!providerModels(state, context.providerId).some((candidate) => candidate.id === model.id)) return error("that model is still locked");
    return { messages: [output(`Switched active model to ${model.name}.`, "success")], effect: { type: "model", modelId: model.id } };
  }
  if (command === "quota" || command === "usage") return { messages: [output(quota(state, context))] };
  if (command === "cost") {
    const provider = providerById.get(context.providerId);
    const remaining = state.providerQuota[context.providerId] ?? 0;
    return { messages: [output(`SESSION CONSUMPTION\n  provider      ${provider?.name}\n  remaining     ${Math.round(remaining)}\n  run total     ${Math.round(state.stats.quotaSpent)} simulated units\n  plan first    ${BALANCE.improvedBriefQuotaCost} quota\n  compact       ${BALANCE.compactQuotaCost} quota`)] };
  }
  if (command === "context") {
    const session = visibleProviderSession(state, context.providerId, context.sessionId);
    const used = 100 - (session?.context ?? 100);
    const guidance = session?.status === "awaiting-review"
      ? "Context is retained while the change awaits review."
      : session
        ? "Run /compact to summarize and recover context."
        : "Fresh session. No task context loaded.";
    return { messages: [output(`CONTEXT WINDOW\n  system + tools    ${Math.round(used * 0.35)}%\n  conversation      ${Math.round(used * 0.65)}%\n  free              ${Math.round(session?.context ?? 100)}%\n\n${guidance}`)] };
  }
  if (command === "permissions") {
    if (!subcommand) return { messages: [output(`permission mode: ${context.permissionMode}\nchoices: ask, plan, accept-edits, workspace-write\nplan automatically clarifies the next ticket for 5 quota`)] };
    if (!["ask", "plan", "accept-edits", "workspace-write"].includes(subcommand)) return error("permission mode must be ask, plan, accept-edits, or workspace-write");
    return { messages: [output(`permission mode → ${subcommand}${subcommand === "plan" ? "; the next assignment spends 5 upfront provider quota to clarify acceptance criteria" : ""}`, "success")], effect: { type: "permissions", mode: subcommand as PermissionMode } };
  }
  if (command === "reasoning") {
    if (context.providerId !== "openmind") return error("reasoning controls are available in OpenMind Forge");
    if (!subcommand) return { messages: [output(`reasoning effort: ${context.reasoning ?? "medium"}\nmedium: baseline · high: −9 review risk and 4 extra upfront quota${context.reasoning === "low" ? "\nLegacy low work keeps its original effort and results; choose medium or high for future assignments." : ""}`)] };
    if (!["medium", "high"].includes(subcommand)) return error("reasoning choices are medium or high; low is a legacy effort only. No selection changed");
    return { messages: [output(`reasoning effort → ${subcommand}${subcommand === "high" ? "; the next assignment spends 4 extra upfront quota for −9 review risk" : "; baseline review risk, no extra setup quota"}`, "success")], effect: { type: "reasoning", mode: subcommand as ReasoningMode } };
  }
  if (command === "init") {
    return { messages: [output("Repository guidance loaded\n\n  • use fictional providers and models\n  • preserve deterministic game rules\n  • run checks before shipping\n  • keep changes scoped to the active ticket", "success")] };
  }

  if (command === "incident") {
    if (!subcommand || subcommand === "status") return { messages: [output(incidentStatus(state))] };
    if (subcommand !== "mitigate") return error("usage: incident status|mitigate <scale|rate-limit|rollback>");
    const action = tokens[2]?.toLowerCase();
    if (!action || !["scale", "rate-limit", "rollback"].includes(action)) return error("usage: incident mitigate <scale|rate-limit|rollback>");
    if (!["active", "scaled", "rate-limited"].includes(state.incidentResponse)) return error("no live gateway incident needs mitigation");
    if (action === "scale" && state.incidentResponse !== "active") return error("capacity was already tried; contain the request loop instead");
    if (action === "rate-limit" && state.incidentResponse === "rate-limited") return error("the gateway is already rate-limited; start FIX-502 or roll back the retry feature");
    return { messages: [output(`incident.${action} · applying containment`, "muted")], effect: { type: "mitigate", action: action as IncidentMitigation } };
  }

  if (command === "tickets") {
    if (!subcommand || subcommand === "list") return { messages: [output(listTickets(state, context))] };
    if (subcommand === "read" || subcommand === "show") return readTicket(state, tokens[2], context);
    return error("usage: tickets <list|read KEY>");
  }

  if (command === "agents") {
    if (!subcommand || subcommand === "list") return { messages: [output(listAgents(state))] };
    if (subcommand === "compact") {
      const sessionId = Number(tokens[2]) - 1;
      if (!Number.isInteger(sessionId)) return error("usage: agents compact <SESSION>");
      if (state.sessions[sessionId]?.status === "supporting") return error("a supporting probe session cannot be compacted; inspect its owning session");
      return { messages: [output(`compacting session ${sessionId + 1}…`, "muted")], effect: { type: "compact", sessionId } };
    }
    if (subcommand === "run") return runTicket(state, context, tokens[2], tokens, raw);
    return error("usage: agents <list|run|compact>");
  }

  if (command === "compact") {
    const explicit = Number(tokens[1]);
    const session = Number.isInteger(explicit) && explicit > 0 ? state.sessions[explicit - 1] : activeProviderSession(state, context.providerId, context.sessionId);
    if (!session) return error("this provider has no active session to compact");
    if (session.status === "supporting") return error("a supporting probe session cannot be compacted; inspect its owning session");
    const provider = modelById.get(session.modelId ?? "")?.providerId;
    if (provider !== context.providerId) return error("that session belongs to the other provider CLI");
    return { messages: [output("Compacting conversation…", "muted")], effect: { type: "compact", sessionId: session.id } };
  }

  if (command === "review" || command === "diff") {
    if (!subcommand) return { messages: [output(listReviews(state))] };
    return readReview(state, tokens[1]);
  }

  if (command === "reviews") {
    if (!subcommand || subcommand === "list") return { messages: [output(listReviews(state))] };
    if (subcommand === "read" || subcommand === "inspect") return readReview(state, tokens[2]);
    if (["approve", "revise", "escalate"].includes(subcommand)) {
      const ticket = findTicket(tokens[2]);
      const review = ticket ? state.reviews.find((candidate) => candidate.ticketId === ticket.id) : undefined;
      if (!ticket || !review) return error("no pending review for that ticket");
      if (subcommand === "revise") {
        const parsed = revisionOptions(tokens.slice(3));
        if (parsed.error) return error(parsed.error);
        return reviseReview(state, review.id, parsed.options);
      }
      if (tokens.length > 3) return error("remedy and workflow flags apply only to reviews revise PERF-204");
      return {
        messages: [output(`review.${subcommand} · ${ticket.key}${subcommand === "revise" ? ` · revision runs in session ${review.sessionId + 1}; use agents list to track it` : ""}`, "muted")],
        effect: { type: "review", reviewId: review.id, decision: subcommand as ReviewDecision },
      };
    }
    return error("usage: reviews <list|read|approve|revise|escalate>");
  }

  if (command === "upgrades") {
    if (!subcommand || subcommand === "list") return { messages: [output(upgrades(state))] };
    if (subcommand === "buy") {
      const upgrade = upgradeById.get(tokens[2] ?? "");
      if (!upgrade) return error("upgrade not found; use `upgrades list`");
      return { messages: [output(`Purchase request: ${upgrade.name} costs ${upgrade.cost} trust · current balance ${Math.round(state.trust)} trust · balance after successful purchase ${Math.round(state.trust - upgrade.cost)} trust${upgrade.id === "terminal-dashboard" ? "; open it with dashboard after purchase" : ""}.`, "muted")], effect: { type: "purchase", upgradeId: upgrade.id } };
    }
    return error("usage: upgrades <list|buy ID>");
  }

  if (command === "events") {
    const count = Math.max(1, Math.min(30, Number(tokens[1]) || 10));
    return { messages: [output(state.events.slice(0, count).map((event) => `${eventClock(event.at)}  ${pad(event.tone, 8)} ${event.title}\n       ${event.message}`).join("\n"))] };
  }

  if (command === "speed") {
    const nextSpeed = Number(tokens[1]);
    if (![1, 4, 12].includes(nextSpeed)) return error("speed must be 1, 4, or 12");
    return { messages: [output(`simulation speed set to ${nextSpeed}×`, "success")], effect: { type: "speed", speed: nextSpeed as 1 | 4 | 12 } };
  }

  if (command === "tab") {
    if (subcommand === "new") {
      if (state.completedTicketIds.length < 1) return error("extra terminal tabs unlock after the first shipped ticket");
      return { messages: [], effect: { type: "tab-new", name: tokens.slice(2).join(" ") || undefined } };
    }
    if (subcommand === "close") return { messages: [], effect: { type: "tab-close" } };
    if (subcommand === "rename") {
      if (state.completedTicketIds.length < 2) return error("tab naming unlocks after two shipped tickets");
      const name = tokens.slice(2).join(" ").trim();
      if (!name) return error("usage: tab rename <NAME>");
      return { messages: [], effect: { type: "tab-rename", name: name.slice(0, 24) } };
    }
    return error("usage: tab <new|close|rename>");
  }

  if (command === "pane" && subcommand !== "split") {
    if (state.completedTicketIds.length < 3) return error("split panes unlock after three shipped tickets");
    if (subcommand === "close") return { messages: [], effect: { type: "pane-close" } };
    if (subcommand === "swap") return { messages: [], effect: { type: "pane-swap" } };
    return error("usage: pane split <agents|reviews|quota|events|dashboard|TAB#> | pane swap|close");
  }

  if (command === "pane" && subcommand === "split") {
    if (state.completedTicketIds.length < 3) return error("split panes unlock after three shipped tickets");
    const target = tokens[2]?.toLowerCase() ?? "agents";
    if (!["agents", "reviews", "quota", "events", "dashboard"].includes(target) && !/^[1-8]$/.test(target)) return error("pane target must be a monitor name or tab number");
    if (target === "dashboard" && !state.purchasedUpgradeIds.includes("terminal-dashboard")) return error("dashboard requires the terminal-dashboard upgrade");
    return { messages: [], effect: { type: "pane-split", target } };
  }

  if (command === "watch") {
    if (state.completedTicketIds.length < 3) return error("full-window operations tools unlock after three shipped tickets");
    const requested = tokens[1];
    const mode = (requested ?? "agents") as PaneMode;
    if (!["agents", "reviews", "quota", "events", "dashboard"].includes(mode)) return error("unknown view; use agents, reviews, quota, events, or dashboard");
    if (mode === "dashboard" && !state.purchasedUpgradeIds.includes("terminal-dashboard")) return error("dashboard requires the terminal-dashboard upgrade");
    return { messages: [], effect: { type: "open-view", mode } };
  }

  if (command === "dashboard") {
    if (!state.purchasedUpgradeIds.includes("terminal-dashboard")) return error("dashboard requires `upgrades buy terminal-dashboard`");
    return { messages: [], effect: { type: "open-view", mode: "dashboard" } };
  }

  if (command === "save" && subcommand === "export") return { messages: [output("exporting versioned local save…", "muted")], effect: { type: "export" } };
  if (command === "save" && subcommand === "import") return { messages: [output("choose a Context Switch save to import…", "muted")], effect: { type: "import" } };
  if (command === "restart") {
    if (!tokens.includes("--confirm")) return error("restart is destructive; run `restart --confirm`");
    return { messages: [output("starting a clean shift…", "muted")], effect: { type: "restart" } };
  }

  if (!slashCommand && !strict) return naturalLanguagePrompt(raw, state, context);
  return error(`command not found: ${slashCommand ? `/${command}` : command}; run \`help\``);
}

export function commandSuggestions(providerId: string, state?: GameState) {
  if (!state) {
    return providerId === "openmind"
      ? ["/help", "/status", "/model", "/reasoning high", "agents run APP-101"]
      : ["/help", "/status", "/model", "/context", "agents run APP-101"];
  }

  if (["active", "scaled"].includes(state.incidentResponse)) return ["incident status", "incident mitigate rollback", "incident mitigate rate-limit", "tickets list", "events 5"];

  const review = state.reviews.find((candidate) => modelById.get(state.sessions[candidate.sessionId]?.modelId ?? "")?.providerId === providerId) ?? state.reviews[0];
  const reviewTicket = review ? ticketById.get(review.ticketId) : undefined;
  const session = visibleProviderSession(state, providerId);
  const nextTicket = availableTickets(state)[0];
  if (reviewTicket?.id === "cache-summary") return isReviewBlocked(state, review!)
    ? [`reviews read ${reviewTicket.key}`, "reviews revise PERF-204 --remedy restore", "reviews revise PERF-204 --remedy bypass", "agents list", "/usage"]
    : [`reviews read ${reviewTicket.key}`, "reviews approve PERF-204", "agents list", "/usage"];
  if (reviewTicket) return ["/status", `reviews read ${reviewTicket.key}`, "reviews list", "events 5", "/usage"];
  if (session) return ["/status", "/context", ...(session.status === "awaiting-review" ? ["reviews list"] : ["/compact"]), "events 5", "/usage"];
  if (nextTicket) return ["/status", "tickets list", `tickets read ${nextTicket.key}`, `agents run ${nextTicket.key}`, state.purchasedUpgradeIds.includes("terminal-dashboard") ? "dashboard" : state.completedTicketIds.length >= 3 ? "pane split quota" : "/model"];
  return ["/status", "tickets list", "upgrades list", "events 5", "mux"];
}

export function agentSuggestions(providerId: string, state: GameState) {
  if (["active", "scaled", "rate-limited"].includes(state.incidentResponse)) {
    return ["What's happening with the gateway?", "How can we contain the incident?", "What tickets are ready?"];
  }
  const review = state.reviews.find((candidate) => modelById.get(state.sessions[candidate.sessionId]?.modelId ?? "")?.providerId === providerId) ?? state.reviews[0];
  const reviewKey = review ? ticketById.get(review.ticketId)?.key : undefined;
  if (review?.ticketId === "cache-summary") return isReviewBlocked(state, review)
    ? ["What changed in PERF-204?", "Restore invalidation for PERF-204", "Bypass the cache for now", "What would this take?"]
    : ["What changed in PERF-204?", "Approve PERF-204", "What would this take?", "How much quota is left?"];
  if (reviewKey) return [`What changed in ${reviewKey}?`, `Is ${reviewKey} safe to approve?`, `Please revise ${reviewKey}`, "How much quota is left?"];
  const next = availableTickets(state)[0];
  if (next) return ["What should I work on next?", "Please take the next ticket", `Tell me about ${next.key}`, "How much quota is left?"];
  return ["What are you working on?", "What reviews need a decision?", "How much quota is left?"];
}
