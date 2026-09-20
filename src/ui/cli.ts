import { content, modelById, providerById, ticketById, upgradeById } from "../content";
import { availableModels, availableTickets, ticketProgressLabel } from "../game/selectors";
import type { GameState, ReviewDecision } from "../game/types";

export type PaneMode = "agents" | "reviews" | "quota" | "events" | "dashboard";
export type PermissionMode = "ask" | "plan" | "accept-edits" | "workspace-write";
export type ReasoningMode = "low" | "medium" | "high";

export interface CliContext {
  providerId: string;
  modelId?: string;
  permissionMode?: PermissionMode;
  reasoning?: ReasoningMode;
}

export type CliEffect =
  | { type: "assign"; sessionId: number; ticketId: string; modelId: string; improveBrief: boolean }
  | { type: "review"; reviewId: string; decision: ReviewDecision }
  | { type: "compact"; sessionId: number }
  | { type: "purchase"; upgradeId: string }
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
  | { type: "export" }
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

function activeProviderSession(state: GameState, providerId: string) {
  return state.sessions.find((session) => {
    const provider = modelById.get(session.modelId ?? "")?.providerId;
    return provider === providerId && (session.status === "working" || session.status === "quota-paused");
  });
}

function providerHelp(state: GameState, context: CliContext) {
  const isAnthill = context.providerId === "anthill";
  const dashboard = state.purchasedUpgradeIds.includes("terminal-dashboard");
  const shared = [
    "  /help                      show commands",
    "  /status                    session, model, permissions, and work",
    "  /model [ID]                list or switch this provider's model",
    "  /usage                     quota and attention limits",
    "  /permissions [MODE]        ask | plan | accept-edits | workspace-write",
    "  /review [KEY]              inspect the review queue or a diff",
    "  /new                       start a fresh conversation",
    "  work on <KEY>              assign a ticket using this session's model",
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
        "  /reasoning [LEVEL]        low | medium | high",
        "  /compact [SESSION]        condense the active work context",
        "  /review <KEY>             inspect a local change",
        "  /init                     inspect repository guidance",
      ];
  return [
    `${isAnthill ? "ANTHILL CODE" : "OPENMIND FORGE"} COMMANDS`,
    ...shared,
    ...specific,
    "  upgrades list|buy <ID>      manage structural upgrades",
    "  events [N]                  tail the activity stream",
    "  speed <1|4|12>              set simulation speed",
    state.completedTicketIds.length >= 1 ? "  tab new [PROVIDER] [NAME]   attach another provider session" : "  [locked] extra sessions · ship 1 ticket",
    state.completedTicketIds.length >= 3 ? "  watch <TYPE>                open a full-window operations tab" : "  [locked] operations views · ship 3 tickets",
    dashboard ? "  dashboard                  open the full-window live dashboard" : "  [upgrade] dashboard · buy terminal-dashboard",
    "  mux | save export | restart --confirm | clear",
  ].join("\n");
}

function status(state: GameState, context: CliContext) {
  const provider = providerById.get(context.providerId);
  const model = modelById.get(context.modelId ?? "");
  const active = activeProviderSession(state, context.providerId);
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
      `  review queue       ${state.reviews.length}`,
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
  ].join("\n");
}

function listTickets(state: GameState) {
  const header = `${pad("KEY", 10)} ${pad("STATE", 12)} ${pad("RISK", 8)} TITLE`;
  const rows = content.tickets.map((ticket) => {
    const progress = ticketProgressLabel(state, ticket.id).toUpperCase();
    const risk = ticket.baseRisk < 0.2 ? "low" : ticket.baseRisk < 0.4 ? "medium" : "high";
    return `${pad(ticket.key, 10)} ${pad(progress, 12)} ${pad(risk, 8)} ${ticket.title}`;
  });
  return [header, ...rows].join("\n");
}

function readTicket(state: GameState, reference?: string) {
  const ticket = findTicket(reference);
  if (!ticket) return error("ticket not found; use `tickets list`");
  const dependencies = ticket.prerequisites.length
    ? ticket.prerequisites.map((id) => `${ticketById.get(id)?.key ?? id}:${state.completedTicketIds.includes(id) ? "done" : "open"}`).join(", ")
    : "none";
  return {
    messages: [output([
      `${ticket.key} · ${ticket.title}`,
      `state       ${ticketProgressLabel(state, ticket.id)}`,
      `type        ${ticket.kind}`,
      `brief       ${ticket.brief}`,
      `depends     ${dependencies}`,
      `files       ${ticket.files.join(", ")}`,
      `risk        ${Math.round(ticket.baseRisk * 100)}% base · ${ticket.recommendedTier} model recommended`,
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
    `${pad("MODEL", 14)} ${pad("TIER", 10)} STATE`,
    ...content.models.filter((model) => model.providerId === context.providerId).map((model) => `${pad(model.id, 14)} ${pad(model.tier, 10)} ${model.id === context.modelId ? "active" : unlocked.has(model.id) ? "available" : `locked @ trust ${model.unlockTrust}`}`),
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
    `${pad("KEY", 10)} ${pad("RISK", 10)} ${pad("SESSION", 10)} TITLE`,
    ...state.reviews.map((review) => {
      const ticket = ticketById.get(review.ticketId)!;
      return `${pad(ticket.key, 10)} ${pad(`${Math.round(review.risk * 100)}%`, 10)} ${pad(review.sessionId + 1, 10)} ${ticket.title}`;
    }),
  ].join("\n");
}

function readReview(state: GameState, reference?: string) {
  const ticket = findTicket(reference);
  const review = ticket ? state.reviews.find((candidate) => candidate.ticketId === ticket.id) : undefined;
  if (!ticket || !review) return error("no pending review for that ticket");
  return {
    messages: [output([
      `REVIEW ${ticket.key} · risk ${Math.round(review.risk * 100)}%`,
      `summary     ${ticket.evidence.summary}`,
      `tests       ${ticket.evidence.tests}`,
      `signal      ${ticket.evidence.signal}`,
      `files       ${ticket.files.join(", ")}`,
      "",
      `actions     reviews approve ${ticket.key}`,
      `            reviews revise ${ticket.key}`,
      `            reviews escalate ${ticket.key}`,
    ].join("\n"))],
  };
}

function quota(state: GameState, context?: CliContext) {
  const providers = context ? content.providers.filter((provider) => provider.id === context.providerId) : content.providers;
  return [
    `${pad("PROVIDER", 20)} ${pad("REMAINING", 12)} RESET RATE`,
    ...providers.map((provider) => `${pad(provider.name, 20)} ${pad(Math.round(state.providerQuota[provider.id] ?? 0), 12)} ${(provider.regenPerSecond * 60).toFixed(1)}/min`),
    "",
    `attention           ${Math.round(state.attention)}%`,
  ].join("\n");
}

function upgrades(state: GameState) {
  return [
    `${pad("ID", 24)} ${pad("COST", 8)} ${pad("STATE", 12)} UPGRADE`,
    ...content.upgrades.map((upgrade) => {
      const bought = state.purchasedUpgradeIds.includes(upgrade.id);
      const unlocked = state.completedTicketIds.length >= upgrade.unlockAfter;
      return `${pad(upgrade.id, 24)} ${pad(upgrade.cost, 8)} ${pad(bought ? "active" : unlocked ? "ready" : `ship ${upgrade.unlockAfter}`, 12)} ${upgrade.name}`;
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
    `  ${shipped >= 1 ? "[ready]" : "[locked]"} extra provider sessions     ${shipped >= 1 ? "tab new anthill|openmind" : "ship 1 ticket"}`,
    `  ${shipped >= 2 ? "[ready]" : "[locked]"} named workspaces            ${shipped >= 2 ? "tab rename" : "ship 2 tickets"}`,
    `  ${shipped >= 3 ? "[ready]" : "[locked]"} full-window operations      ${shipped >= 3 ? "watch agents|reviews|quota|events" : "ship 3 tickets"}`,
    `  ${dashboard ? "[ready]" : "[upgrade]"} live graphical dashboard   ${dashboard ? "dashboard" : "upgrades buy terminal-dashboard"}`,
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
  const improveBrief = tokens.includes("--brief") || /\b(plan|clarify|careful|brief)\b/i.test(naturalPrompt);
  const provider = providerById.get(context.providerId);
  return {
    messages: [output(`${provider?.shortName ?? "CLI"} · ${ticket.key} → session ${session.id + 1} / ${model.name}${improveBrief ? " / plan first" : ""}`, "muted")],
    effect: { type: "assign", sessionId: session.id, ticketId: ticket.id, modelId: model.id, improveBrief },
  } satisfies CliResult;
}

function naturalLanguagePrompt(raw: string, state: GameState, context: CliContext) {
  const reference = raw.match(/\b[A-Z]{2,10}-\d+\b/i)?.[0];
  if (!reference) {
    const provider = providerById.get(context.providerId);
    return { messages: [output(`${provider?.name ?? "Agent"}: describe the work with a ticket key, for example “work on APP-101”.`, "muted")] };
  }
  if (/\b(review|inspect|diff)\b/i.test(raw)) {
    const result = readReview(state, reference);
    if (!result.messages[0]?.text.startsWith("error:")) return result;
  }
  return runTicket(state, context, reference, [], raw);
}

export function evaluateCommand(raw: string, state: GameState, suppliedContext: CliContext = defaultContext): CliResult {
  const context = { ...defaultContext, ...suppliedContext };
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const first = tokens[0]?.toLowerCase();
  const slashCommand = first?.startsWith("/") ? first.slice(1) : undefined;
  const command = slashCommand ?? first;
  const subcommand = tokens[1]?.toLowerCase();
  if (!command) return { messages: [] };

  if (command === "help" || command === "?") return { messages: [output(providerHelp(state, context))] };
  if (command === "status") return { messages: [output(status(state, context))] };
  if (command === "clear") return { messages: [], effect: { type: "clear" } };
  if (command === "new") return { messages: [], effect: { type: "new-session" } };
  if (command === "mux") return { messages: [output(muxStatus(state))] };
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
    return { messages: [output(`SESSION CONSUMPTION\n  provider      ${provider?.name}\n  remaining     ${Math.round(remaining)}\n  run total     ${Math.round(state.stats.quotaSpent)} simulated units\n  attention     ${Math.round(state.attention)}%`)] };
  }
  if (command === "context") {
    const session = activeProviderSession(state, context.providerId);
    const used = 100 - (session?.context ?? 100);
    return { messages: [output(`CONTEXT WINDOW\n  system + tools    ${Math.round(used * 0.35)}%\n  conversation      ${Math.round(used * 0.65)}%\n  free              ${Math.round(session?.context ?? 100)}%\n\n${session ? "Run /compact to summarize and recover context." : "Fresh session. No task context loaded."}`)] };
  }
  if (command === "permissions") {
    if (!subcommand) return { messages: [output(`permission mode: ${context.permissionMode}\nchoices: ask, plan, accept-edits, workspace-write`)] };
    if (!["ask", "plan", "accept-edits", "workspace-write"].includes(subcommand)) return error("permission mode must be ask, plan, accept-edits, or workspace-write");
    return { messages: [output(`permission mode → ${subcommand}`, "success")], effect: { type: "permissions", mode: subcommand as PermissionMode } };
  }
  if (command === "reasoning") {
    if (context.providerId !== "openmind") return error("reasoning controls are available in OpenMind Forge");
    if (!subcommand) return { messages: [output(`reasoning effort: ${context.reasoning ?? "medium"}\nchoices: low, medium, high`)] };
    if (!["low", "medium", "high"].includes(subcommand)) return error("reasoning must be low, medium, or high");
    return { messages: [output(`reasoning effort → ${subcommand}`, "success")], effect: { type: "reasoning", mode: subcommand as ReasoningMode } };
  }
  if (command === "init") {
    return { messages: [output("Repository guidance loaded\n\n  • use fictional providers and models\n  • preserve deterministic game rules\n  • run checks before shipping\n  • keep changes scoped to the active ticket", "success")] };
  }

  if (command === "tickets") {
    if (!subcommand || subcommand === "list") return { messages: [output(listTickets(state))] };
    if (subcommand === "read" || subcommand === "show") return readTicket(state, tokens[2]);
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
    const session = Number.isInteger(explicit) && explicit > 0 ? state.sessions[explicit - 1] : activeProviderSession(state, context.providerId);
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
    return { messages: [output(state.events.slice(0, count).map((event) => `${String(Math.floor(event.at / 60) + 9).padStart(2, "0")}:${String(Math.floor(event.at) % 60).padStart(2, "0")}  ${pad(event.tone, 8)} ${event.title}\n       ${event.message}`).join("\n"))] };
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

  if (command === "watch" || (command === "pane" && subcommand === "split")) {
    if (state.completedTicketIds.length < 3) return error("full-window operations tools unlock after three shipped tickets");
    const requested = command === "watch" ? tokens[1] : tokens[2];
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
  if (command === "restart") {
    if (!tokens.includes("--confirm")) return error("restart is destructive; run `restart --confirm`");
    return { messages: [output("starting a clean shift…", "muted")], effect: { type: "restart" } };
  }

  if (!slashCommand) return naturalLanguagePrompt(raw, state, context);
  return error(`command not found: /${command}; run \`/help\``);
}

export function commandSuggestions(providerId: string) {
  return providerId === "openmind"
    ? ["/help", "/status", "/model", "/reasoning high", "implement APP-101"]
    : ["/help", "/status", "/model", "/context", "work on APP-101"];
}
