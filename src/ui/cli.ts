import { content, modelById, providerById, ticketById, upgradeById } from "../content";
import { availableModels, availableTickets, ticketProgressLabel } from "../game/selectors";
import type { GameState, ReviewDecision } from "../game/types";

export type PaneMode = "agents" | "reviews" | "quota" | "events" | "dashboard";

export type CliEffect =
  | { type: "assign"; sessionId: number; ticketId: string; modelId: string; improveBrief: boolean }
  | { type: "review"; reviewId: string; decision: ReviewDecision }
  | { type: "compact"; sessionId: number }
  | { type: "purchase"; upgradeId: string }
  | { type: "speed"; speed: 1 | 4 | 12 }
  | { type: "clear" }
  | { type: "tab-new"; name?: string }
  | { type: "tab-close" }
  | { type: "tab-rename"; name: string }
  | { type: "pane"; mode: PaneMode | null }
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

function help(state: GameState) {
  const mux = state.completedTicketIds.length >= 1;
  const rename = state.completedTicketIds.length >= 2;
  const panes = state.completedTicketIds.length >= 3;
  const dashboard = state.purchasedUpgradeIds.includes("terminal-dashboard");
  const lines = [
    "TOOLS",
    "  status                              current run summary",
    "  tickets list                        list the delivery queue",
    "  tickets read <KEY>                  read a ticket and its dependencies",
    "  models                              list available agent models",
    "  agents list                         inspect terminal agent sessions",
    "  agents run <KEY> [--model ID] [--session N] [--brief]",
    "  agents compact <N>                  compact an active session",
    "  reviews list                        list pending diffs",
    "  reviews read <KEY>                  inspect review evidence",
    "  reviews <approve|revise|escalate> <KEY>",
    "  quota                              inspect provider limits",
    "  upgrades list | upgrades buy <ID>  manage structural upgrades",
    "  events [N]                         tail the activity stream",
    "  speed <1|4|12>                     set simulation speed",
    "  mux                                show terminal capability unlocks",
  ];
  lines.push(mux ? "  tab new [NAME] | tab close          manage terminal windows" : "  [locked] tab management · ship 1 ticket");
  lines.push(rename ? "  tab rename <NAME>                   rename the active window" : "  [locked] tab naming · ship 2 tickets");
  lines.push(panes ? "  pane split <agents|reviews|quota|events> | pane close" : "  [locked] split panes · ship 3 tickets");
  lines.push(dashboard ? "  dashboard                           open the live dashboard pane" : "  [upgrade] dashboard · buy terminal-dashboard");
  lines.push("  save export | restart --confirm | clear");
  return lines.join("\n");
}

function status(state: GameState) {
  const active = state.sessions.filter((session) => session.status === "working" || session.status === "quota-paused").length;
  return [
    "RUN STATUS",
    `  ${pad("shift", 16)} ${Math.floor(state.gameTime / 60)}m`,
    `  ${pad("shipped", 16)} ${state.completedTicketIds.length}/${content.tickets.length}`,
    `  ${pad("agents", 16)} ${active} active · ${state.unlockedSessions} slots`,
    `  ${pad("reviews", 16)} ${state.reviews.length} waiting`,
    `  ${pad("attention", 16)} ${Math.round(state.attention)}%`,
    `  ${pad("trust", 16)} ${Math.round(state.trust)} (peak ${Math.round(state.peakTrust)})`,
    `  ${pad("repo", 16)} ${Math.round(state.repoHealth)}% health · ${Math.round(state.debt)} debt`,
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

function listModels(state: GameState) {
  const unlocked = new Set(availableModels(state).map((model) => model.id));
  return [
    `${pad("MODEL", 14)} ${pad("PROVIDER", 18)} ${pad("TIER", 10)} STATE`,
    ...content.models.map((model) => `${pad(model.id, 14)} ${pad(providerById.get(model.providerId)?.name ?? "?", 18)} ${pad(model.tier, 10)} ${unlocked.has(model.id) ? "ready" : `locked @ trust ${model.unlockTrust}`}`),
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

function quota(state: GameState) {
  return [
    `${pad("PROVIDER", 20)} ${pad("REMAINING", 12)} RESET RATE`,
    ...content.providers.map((provider) => {
      const unlocked = state.completedTicketIds.length >= provider.unlockAfter;
      return `${pad(provider.name, 20)} ${pad(unlocked ? Math.round(state.providerQuota[provider.id] ?? 0) : "locked", 12)} ${unlocked ? `${(provider.regenPerSecond * 60).toFixed(1)}/min` : `after ${provider.unlockAfter} shipped`}`;
    }),
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
    `  ${shipped >= 1 ? "[ready]" : "[locked]"} multiple terminal tabs      ${shipped >= 1 ? "tab new" : "ship 1 ticket"}`,
    `  ${shipped >= 2 ? "[ready]" : "[locked]"} named workspaces            ${shipped >= 2 ? "tab rename" : "ship 2 tickets"}`,
    `  ${shipped >= 3 ? "[ready]" : "[locked]"} split monitoring panes      ${shipped >= 3 ? "pane split" : "ship 3 tickets"}`,
    `  ${dashboard ? "[ready]" : "[upgrade]"} live graphical dashboard   ${dashboard ? "dashboard" : "upgrades buy terminal-dashboard"}`,
  ].join("\n");
}

export function evaluateCommand(raw: string, state: GameState): CliResult {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const command = tokens[0]?.toLowerCase();
  const subcommand = tokens[1]?.toLowerCase();
  if (!command) return { messages: [] };

  if (command === "help" || command === "?") return { messages: [output(help(state))] };
  if (command === "status") return { messages: [output(status(state))] };
  if (command === "clear") return { messages: [], effect: { type: "clear" } };
  if (command === "mux") return { messages: [output(muxStatus(state))] };
  if (command === "models") return { messages: [output(listModels(state))] };
  if (command === "quota") return { messages: [output(quota(state))] };

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
    if (subcommand === "run") {
      const ticket = findTicket(tokens[2]);
      if (!ticket) return error("ticket not found; use `tickets list`");
      if (!availableTickets(state).some((candidate) => candidate.id === ticket.id)) return error(`${ticket.key} is not ready or is already assigned`);
      const sessionOption = Number(option(tokens, "session") ?? 0);
      const session = sessionOption
        ? state.sessions[sessionOption - 1]
        : state.sessions.find((candidate) => candidate.id < state.unlockedSessions && candidate.status === "idle");
      if (!session) return error("no idle unlocked session");
      const modelOption = option(tokens, "model");
      const models = availableModels(state);
      const model = modelOption
        ? modelById.get(modelOption.toLowerCase())
        : models.find((candidate) => candidate.tier === ticket.recommendedTier) ?? models.find((candidate) => candidate.tier === "balanced") ?? models[0];
      if (!model || !models.some((candidate) => candidate.id === model.id)) return error("model is locked or unknown; use `models`");
      const improveBrief = tokens.includes("--brief");
      return {
        messages: [output(`tool agents.run · ${ticket.key} → session ${session.id + 1} / ${model.name}${improveBrief ? " / clarified brief" : ""}`, "muted")],
        effect: { type: "assign", sessionId: session.id, ticketId: ticket.id, modelId: model.id, improveBrief },
      };
    }
    return error("usage: agents <list|run|compact>");
  }

  if (command === "reviews") {
    if (!subcommand || subcommand === "list") return { messages: [output(listReviews(state))] };
    if (subcommand === "read" || subcommand === "inspect") return readReview(state, tokens[2]);
    if (["approve", "revise", "escalate"].includes(subcommand)) {
      const ticket = findTicket(tokens[2]);
      const review = ticket ? state.reviews.find((candidate) => candidate.ticketId === ticket.id) : undefined;
      if (!ticket || !review) return error("no pending review for that ticket");
      return {
        messages: [output(`tool reviews.${subcommand} · ${ticket.key}`, "muted")],
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
    const speed = Number(tokens[1]);
    if (![1, 4, 12].includes(speed)) return error("speed must be 1, 4, or 12");
    return { messages: [output(`simulation speed set to ${speed}×`, "success")], effect: { type: "speed", speed: speed as 1 | 4 | 12 } };
  }

  if (command === "tab") {
    if (state.completedTicketIds.length < 1) return error("tab management unlocks after the first shipped ticket");
    if (subcommand === "new") return { messages: [], effect: { type: "tab-new", name: tokens.slice(2).join(" ") || undefined } };
    if (subcommand === "close") return { messages: [], effect: { type: "tab-close" } };
    if (subcommand === "rename") {
      if (state.completedTicketIds.length < 2) return error("tab naming unlocks after two shipped tickets");
      const name = tokens.slice(2).join(" ").trim();
      if (!name) return error("usage: tab rename <NAME>");
      return { messages: [], effect: { type: "tab-rename", name: name.slice(0, 24) } };
    }
    return error("usage: tab <new|close|rename>");
  }

  if (command === "pane") {
    if (state.completedTicketIds.length < 3) return error("split panes unlock after three shipped tickets");
    if (subcommand === "close") return { messages: [], effect: { type: "pane", mode: null } };
    if (subcommand === "split") {
      const mode = (tokens[2] ?? "agents") as PaneMode;
      if (!["agents", "reviews", "quota", "events", "dashboard"].includes(mode)) return error("unknown pane; use agents, reviews, quota, events, or dashboard");
      if (mode === "dashboard" && !state.purchasedUpgradeIds.includes("terminal-dashboard")) return error("dashboard requires the terminal-dashboard upgrade");
      return { messages: [], effect: { type: "pane", mode } };
    }
    return error("usage: pane <split MODE|close>");
  }

  if (command === "dashboard") {
    if (!state.purchasedUpgradeIds.includes("terminal-dashboard")) return error("dashboard requires `upgrades buy terminal-dashboard`");
    return { messages: [], effect: { type: "pane", mode: "dashboard" } };
  }

  if (command === "save" && subcommand === "export") return { messages: [output("exporting versioned local save…", "muted")], effect: { type: "export" } };
  if (command === "restart") {
    if (!tokens.includes("--confirm")) return error("restart is destructive; run `restart --confirm`");
    return { messages: [output("starting a clean shift…", "muted")], effect: { type: "restart" } };
  }

  return error(`command not found: ${command}; run \`help\``);
}

export const COMMAND_SUGGESTIONS = [
  "help", "status", "tickets list", "tickets read APP-101", "models", "agents list",
  "agents run APP-101 --model couplet", "reviews list", "quota", "upgrades list", "events 10", "mux",
  "tab new", "pane split agents", "dashboard", "speed 12", "save export",
];
