import { content, modelById, providerById, ticketById, upgradeById } from "../content";
import { BALANCE } from "../game/balance";
import { availableModels, availableTickets, incidentIsOpen, isReviewBlocked, projectedTicketRisk, reviewRiskFactors, ticketProgressLabel, visibleTickets } from "../game/selectors";
import type { GameState, IncidentMitigation, ReviewDecision } from "../game/types";

export type PaneMode = "agents" | "reviews" | "quota" | "events" | "dashboard";
export type PermissionMode = "ask" | "plan" | "accept-edits" | "workspace-write";
export type ReasoningMode = "low" | "medium" | "high";

export interface CliContext {
  providerId: string;
  modelId?: string;
  permissionMode?: PermissionMode;
  reasoning?: ReasoningMode;
  sessionId?: number | null;
}

export type CliEffect =
  | { type: "assign"; sessionId: number; ticketId: string; modelId: string; improveBrief: boolean; reasoning: ReasoningMode }
  | { type: "review"; reviewId: string; decision: ReviewDecision }
  | { type: "compact"; sessionId: number }
  | { type: "purchase"; upgradeId: string }
  | { type: "mitigate"; action: IncidentMitigation }
  | { type: "speed"; speed: 1 | 4 | 12 }
  | { type: "clear" }
  | { type: "new-session" }
  | { type: "model"; modelId: string }
  | { type: "permissions"; mode: PermissionMode }
  | { type: "reasoning"; mode: ReasoningMode }
  | { type: "tab-new"; providerId?: string; name?: string }
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
    "  agents run <KEY>          assign work from Terminal",
    "  agents list|compact       inspect or compact orchestration slots",
    "  tickets list|read <KEY>    inspect the authored backlog",
  ];
  const specific = isAnthill
    ? [
        "  /compact [SESSION]        summarize context and keep working",
        "  /context                  visualize loaded session context",
        "  /cost                     show simulated session consumption",
        "  /diff <KEY>               inspect a pending change",
      ]
    : [
        "  /reasoning [LEVEL]        low +7 risk | medium | high −9 risk, −4 quota",
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
    state.completedTicketIds.length >= 1 ? "  tab new [PROVIDER] [NAME]   attach another provider session" : "  [locked] extra sessions · ship 1 ticket",
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
      "  directory          ~/delivery",
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
    "  project            ~/delivery",
    `  plan usage         ${Math.round(state.providerQuota[context.providerId] ?? 0)}/${provider?.maxQuota ?? 0} remaining`,
    `  context            ${active ? `${Math.round(active.context)}% left` : "fresh"}`,
    `  current task       ${ticket ? `${ticket.key} · ${Math.round((active?.progress ?? 0) * 100)}%` : "none"}`,
    `  task state         ${active?.status ?? "idle"}`,
    `  trust / health     ${Math.round(state.trust)} / ${Math.round(state.repoHealth)}`,
    `  repository debt    ${Math.round(state.debt)}`,
  ].join("\n");
}

function listTickets(state: GameState, context: CliContext) {
  const header = `${pad("KEY", 10)} ${pad("STATE", 12)} ${pad("BASE/EST", 14)} TITLE`;
  const rows = visibleTickets(state).map((ticket) => {
    const progress = ticketProgressLabel(state, ticket.id).toUpperCase();
    const estimate = projectedTicketRisk(state, ticket.id, context.permissionMode === "plan", context.reasoning, context.modelId);
    const risk = `${Math.round(ticket.baseRisk * 100)}%/${estimate.min}-${estimate.max}%${ticket.riskFlag === "none" ? "" : " !"}`;
    return `${pad(ticket.key, 10)} ${pad(progress, 12)} ${pad(risk, 14)} ${ticket.title}`;
  });
  return [header, ...rows, "", `Risk is ticket baseline / estimate for the selected model and ${context.reasoning} reasoning with current repo, session, and upgrades. Plan mode lowers the estimate; ! marks a known review finding.`].join("\n");
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
  const estimate = projectedTicketRisk(state, ticket.id, context?.permissionMode === "plan", context?.reasoning, context?.modelId);
  const knownFinding = ticket.riskFlag === "none" ? "" : " · ! known review finding";
  return {
    messages: [output([
      `${ticket.key} · ${ticket.title}`,
      `state       ${ticketProgressLabel(state, ticket.id)}`,
      `type        ${ticket.kind}`,
      `brief       ${ticket.brief}`,
      `depends     ${dependencies}${incidentDependency}`,
      `files       ${ticket.files.join(", ")}`,
      `risk        ${Math.round(ticket.baseRisk * 100)}% base · ${estimate.min}-${estimate.max}% estimated with selected ${content.models.find((model) => model.id === context?.modelId)?.name ?? "model"} and ${context?.reasoning ?? "medium"} reasoning · ${ticket.recommendedTier} model recommended${knownFinding}`,
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
      return `${pad(session.id + 1, 10)} ${pad(locked ? "locked" : session.status, 18)} ${pad(session.modelId ?? "-", 14)} ${pad(locked ? "-" : `${Math.round(session.context)}%`, 10)} ${ticket ? `${ticket.key} ${Math.round(session.progress * 100)}%` : "-"}`;
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
  const resolution = ticket.riskFlag !== "none" && (session.reviewRound > 0 || (session.briefImproved && review.risk < 0.2)) ? ticket.evidence.resolution : undefined;
  const warning = resolution?.signal ?? ticket.evidence.signal;
  const tests = resolution?.tests ?? ticket.evidence.tests;
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
      `change      ${resolution?.summary ?? (session.reviewRound > 0 ? `Revised: ${ticket.evidence.summary}` : ticket.evidence.summary)}`,
      `tests       ${tests}`,
      `warning     ${warning}`,
      ...history,
      `scope       ${ticket.files.length} files · ${ticket.files.join(", ")}`,
      `guidance    ${recommendation}`,
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
    `${pad("ID", 24)} ${pad("COST", 8)} ${pad("STATE", 12)} UPGRADE`,
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
    "  [ready]  Anthill Code session       tab 1 · full window",
    "  [ready]  OpenMind Forge session     tab 2 · full window",
    `  ${shipped >= 1 ? "[ready]" : "[locked]"} parallel execution          ${shipped >= 1 ? "2 agent slots" : "ship 1 ticket"}`,
    `  ${shipped >= 3 ? "[ready]" : "[locked]"} third execution slot        ${shipped >= 3 ? "3 agent slots" : "ship 3 tickets"}`,
    `  ${shipped >= 1 ? "[ready]" : "[locked]"} extra provider sessions     ${shipped >= 1 ? "tab new anthill|openmind" : "ship 1 ticket"}`,
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
  const requestedModel = option(tokens, "model") ?? context.modelId;
  const models = providerModels(state, context.providerId);
  const model = requestedModel
    ? modelById.get(requestedModel.toLowerCase())
    : models.find((candidate) => candidate.tier === ticket.recommendedTier) ?? models[0];
  if (!model || model.providerId !== context.providerId) return error("that model belongs to the other provider CLI");
  if (!models.some((candidate) => candidate.id === model.id)) return error("model is locked or unknown; use `/model`");
  const improveBrief = context.permissionMode === "plan" || tokens.includes("--brief") || /\b(plan|clarify|careful|brief)\b/i.test(naturalPrompt);
  const reasoning = context.providerId === "openmind" ? context.reasoning ?? "medium" : "medium";
  const provider = providerById.get(context.providerId);
  const eta = Math.max(1, Math.ceil(ticket.duration / model.speed));
  return {
    messages: [output(`${provider?.shortName ?? "CLI"} · ${ticket.key} → session ${session.id + 1} / ${model.name}${improveBrief ? " / plan first" : ""}${reasoning !== "medium" ? ` / ${reasoning} reasoning` : ""} · review ~${eta}s`, "muted")],
    effect: { type: "assign", sessionId: session.id, ticketId: ticket.id, modelId: model.id, improveBrief, reasoning },
  } satisfies CliResult;
}

function naturalLanguagePrompt(raw: string, state: GameState, context: CliContext): CliResult {
  const explicit = raw.match(/\b[A-Z]{2,10}-\d+\b/i)?.[0];
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
  const pending = ticket ? state.reviews.find((review) => review.ticketId === ticket.id) : state.reviews.length === 1 ? state.reviews[0] : undefined;
  const pendingKey = pending ? ticketById.get(pending.ticketId)?.key : undefined;
  const inquiry = /^\s*(?:what|which|how|why|when|where|should\b|is\b|are\b|do\s+(?:I|we)\b|tell\s+me\b|show\s+me\b)/i.test(raw);
  const negatedWork = /\b(?:do\s+not|don['’]t|dont|never|avoid|should\s+not|shouldn['’]t|will\s+not|won['’]t)\s+(?:(?:want|need|plan|intend)\s+(?:(?:you|me|us)\s+)?(?:to\s+)?)?(?:please\s+)?(?:(?:you|me|us)\s+)?(?:work(?:ing)?|implement|start|begin|assign|touch|change|fix|ship|run|do(?:\s+(?:any\s+)?work)?)\b|\b(?:would\s+rather\s+not|rather\s+not)\s+(?:work(?:ing)?|implement|start|assign|touch|change|fix|ship|run)\b|\b(?:hold\s+off\s+on|refrain\s+from)\s+(?:work(?:ing)?|implement|starting|assigning|touching|changing|fixing|shipping|running)\b|\bdelay\s+(?:the\s+)?(?:work|working|implementation|start(?:ing)?|assignment|change|fix|ship(?:ping)?|run(?:ning)?)\b|\bpostpone\s+(?:the\s+)?(?:work|working|implementation|start(?:ing)?|assignment|change|fix|ship(?:ping)?|run(?:ning)?)\b|\bwait\s+(?:to\s+)?(?:work|start|begin|assign|implement|run)\b|\b(?:cannot|can\s+not|can['’]t|unable\s+to)\s+(?:work|start|begin|assign|implement|run)\b|\bnot\s+ready\s+to\s+(?:work|start|begin|assign|implement|run)\b|\bnot\s+yet\b/i;
  if (negatedWork.test(raw) || /\b(?:hold\s+off|refrain|delay|postpone|wait|not\s+ready|cannot|can['’]t)\b/i.test(raw)) {
    return { messages: [output(`No work started${reference ? ` for ${reference}` : ""}. Tell me when you're ready to pick it up.`, "muted")] };
  }
  const reviewQuestion = /\b(reviews?|inspect|diff|changes?|tests?|warning|approve|merge|ship|safe)\b/i.test(raw);
  const reviewDecision = !inquiry && /^\s*(?:(?:please|let'?s)\s+)?(?:approve|merge|accept|ship|revise|request changes|escalate)\b/i.exec(raw)?.[0].toLowerCase();
  if (reviewDecision && (pending || reference)) {
    if (pending) {
      const decision: ReviewDecision = /revise|request changes/.test(reviewDecision) ? "revise" : /escalate/.test(reviewDecision) ? "escalate" : "approve";
      return { messages: [output(`${decision === "approve" ? "Approving" : decision === "revise" ? "Requesting changes for" : "Escalating"} ${pendingKey}.`, "muted")], effect: { type: "review", reviewId: pending.id, decision } };
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
  const affirmativeWork = !inquiry && (titleAction || /^\s*(?:please\s+)?(?:work\s+on|implement|start|begin|assign|take(?:\s+care\s+of)?|tackle|pick\s+up|handle|build|fix|ship|run|do)\b/i.test(raw)
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
  return naturalLanguagePrompt(trimmed, state, { ...defaultContext, ...context });
}

export function evaluateCommand(raw: string, state: GameState, suppliedContext: CliContext = defaultContext, strict = false): CliResult {
  const context = { ...defaultContext, ...suppliedContext };
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
    return { messages: [output(`permission mode → ${subcommand}`, "success")], effect: { type: "permissions", mode: subcommand as PermissionMode } };
  }
  if (command === "reasoning") {
    if (context.providerId !== "openmind") return error("reasoning controls are available in OpenMind Forge");
    if (!subcommand) return { messages: [output(`reasoning effort: ${context.reasoning ?? "medium"}\nlow: +7 review risk · medium: baseline · high: -9 review risk and -4 setup quota`)] };
    if (!["low", "medium", "high"].includes(subcommand)) return error("reasoning must be low, medium, or high");
    return { messages: [output(`reasoning effort → ${subcommand}`, "success")], effect: { type: "reasoning", mode: subcommand as ReasoningMode } };
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
      return { messages: [output(`compacting session ${sessionId + 1}…`, "muted")], effect: { type: "compact", sessionId } };
    }
    if (subcommand === "run") return runTicket(state, context, tokens[2], tokens, raw);
    return error("usage: agents <list|run|compact>");
  }

  if (command === "compact") {
    const explicit = Number(tokens[1]);
    const session = Number.isInteger(explicit) && explicit > 0 ? state.sessions[explicit - 1] : activeProviderSession(state, context.providerId, context.sessionId);
    if (!session) return error("this provider has no active session to compact");
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
      return {
        messages: [output(`review.${subcommand} · ${ticket.key}`, "muted")],
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
      return { messages: [output(`requesting approval for ${upgrade.name}…`, "muted")], effect: { type: "purchase", upgradeId: upgrade.id } };
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
      if (state.completedTicketIds.length < 1) return error("extra provider sessions unlock after the first shipped ticket");
      const requestedProvider = tokens[2]?.toLowerCase();
      const providerId = requestedProvider === "anthill" || requestedProvider === "openmind" ? requestedProvider : context.providerId;
      const nameStart = requestedProvider === providerId ? 3 : 2;
      return { messages: [], effect: { type: "tab-new", providerId, name: tokens.slice(nameStart).join(" ") || undefined } };
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
  if (reviewTicket) return ["/status", `reviews read ${reviewTicket.key}`, "reviews list", "events 5", "/usage"];
  if (session) return ["/status", "/context", ...(session.status === "awaiting-review" ? ["reviews list"] : ["/compact"]), "events 5", "/usage"];
  if (nextTicket) return ["/status", "tickets list", `tickets read ${nextTicket.key}`, `agents run ${nextTicket.key}`, "/model"];
  return ["/status", "tickets list", "upgrades list", "events 5", "mux"];
}

export function agentSuggestions(providerId: string, state: GameState) {
  if (["active", "scaled", "rate-limited"].includes(state.incidentResponse)) {
    return ["What's happening with the gateway?", "How can we contain the incident?", "What tickets are ready?"];
  }
  const review = state.reviews.find((candidate) => modelById.get(state.sessions[candidate.sessionId]?.modelId ?? "")?.providerId === providerId) ?? state.reviews[0];
  const reviewKey = review ? ticketById.get(review.ticketId)?.key : undefined;
  if (reviewKey) return [`What changed in ${reviewKey}?`, `Is ${reviewKey} safe to approve?`, `Please revise ${reviewKey}`, "How much quota is left?"];
  const next = availableTickets(state)[0];
  if (next) return ["What should I work on next?", "Please take the next ticket", `Tell me about ${next.key}`, "How much quota is left?"];
  return ["What are you working on?", "What reviews need a decision?", "How much quota is left?"];
}
