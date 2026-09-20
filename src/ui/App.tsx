import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  Download,
  FastForward,
  FileCode2,
  GitPullRequest,
  HeartPulse,
  Layers3,
  Plus,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { content, modelById, providerById, ticketById } from "../content";
import { availableModels, availableTickets, ticketProgressLabel } from "../game/selectors";
import type { GameState, SessionState } from "../game/types";
import { useGameStore } from "../app/store";
import { commandSuggestions, evaluateCommand, type CliEffect, type CliMessage, type PaneMode, type PermissionMode, type ReasoningMode } from "./cli";

const percent = (value: number) => `${Math.round(value)}%`;
const clock = (seconds: number) => {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60) + 9;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

function Meter({ value, max = 100, color, label }: { value: number; max?: number; color?: string; label: string }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter" aria-label={`${label}: ${Math.round(value)} of ${Math.round(max)}`}>
      <span style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

function StatCard({ icon, label, value, detail, tone = "purple" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <span className="eyebrow">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function ResourceBar({ game }: { game: GameState }) {
  return (
    <section className="resource-grid" aria-label="Run resources">
      <StatCard icon={<BrainCircuit />} label="Attention" value={percent(game.attention)} detail="Your actual bottleneck" />
      <StatCard icon={<ShieldCheck />} label="Trust" value={Math.round(game.trust).toString()} detail={`Peak ${Math.round(game.peakTrust)}`} tone="green" />
      <StatCard icon={<HeartPulse />} label="Repo health" value={percent(game.repoHealth)} detail={`${Math.round(game.debt)} debt`} tone="cyan" />
      {content.providers.map((provider) => {
        const unlocked = game.completedTicketIds.length >= provider.unlockAfter;
        return (
          <article className={`quota-card ${unlocked ? "" : "locked"}`} key={provider.id}>
            <div className="quota-head">
              <span className="provider-dot" style={{ background: provider.color }} />
              <span>{provider.name}</span>
              <strong>{unlocked ? Math.round(game.providerQuota[provider.id] ?? 0) : "LOCKED"}</strong>
            </div>
            <Meter value={unlocked ? game.providerQuota[provider.id] ?? 0 : 0} max={provider.maxQuota + (game.purchasedUpgradeIds.includes("quota-plan") ? 35 : 0)} color={provider.color} label={`${provider.name} quota`} />
          </article>
        );
      })}
    </section>
  );
}

function SessionCard({ session, game }: { session: SessionState; game: GameState }) {
  const assign = useGameStore((store) => store.assign);
  const compact = useGameStore((store) => store.compact);
  const tickets = availableTickets(game);
  const models = availableModels(game);
  const [ticketId, setTicketId] = useState(tickets[0]?.id ?? "");
  const [modelId, setModelId] = useState(models.find((model) => model.tier === "balanced")?.id ?? models[0]?.id ?? "");
  const [improveBrief, setImproveBrief] = useState(false);
  const locked = session.id >= game.unlockedSessions;

  useEffect(() => {
    if (!tickets.some((ticket) => ticket.id === ticketId)) setTicketId(tickets[0]?.id ?? "");
  }, [ticketId, tickets]);
  useEffect(() => {
    if (!models.some((model) => model.id === modelId)) setModelId(models[0]?.id ?? "");
  }, [modelId, models]);

  if (locked) {
    const requirement = session.id === 1 ? "Ship 2 tickets" : "Ship 5 tickets";
    return (
      <article className="session-card session-locked">
        <div className="session-title"><Layers3 /><span>Session {session.id + 1}</span><span className="pill">LOCKED</span></div>
        <p>{requirement} to justify another concurrent workspace.</p>
      </article>
    );
  }

  if (session.status !== "idle") {
    const ticket = ticketById.get(session.ticketId ?? "");
    const model = modelById.get(session.modelId ?? "");
    const provider = providerById.get(model?.providerId ?? "");
    return (
      <article className={`session-card status-${session.status}`}>
        <div className="session-title">
          <Bot />
          <span>Session {session.id + 1}</span>
          <span className="pill">{session.status.replace("-", " ")}</span>
        </div>
        <div className="session-model"><span className="provider-dot" style={{ background: provider?.color }} />{provider?.name} / <strong>{model?.name}</strong></div>
        <h3>{ticket?.key} · {ticket?.title}</h3>
        <Meter value={session.progress * 100} color={provider?.color} label="Implementation progress" />
        <div className="session-metrics">
          <span>{Math.round(session.progress * 100)}% complete</span>
          <span>{Math.round(session.context)}% context</span>
        </div>
        {session.status === "awaiting-review" ? (
          <p className="hint"><GitPullRequest /> The implementation is waiting in the review queue.</p>
        ) : (
          <button className="ghost-button" onClick={() => compact(session.id)} disabled={game.attention < 5}>Compact context · 5 attention</button>
        )}
      </article>
    );
  }

  return (
    <article className="session-card">
      <div className="session-title"><Bot /><span>Session {session.id + 1}</span><span className="online-dot">IDLE</span></div>
      {tickets.length ? (
        <div className="assignment-form">
          <label>
            Ticket
            <select aria-label={`Ticket for Session ${session.id + 1}`} value={ticketId} onChange={(event) => setTicketId(event.target.value)}>
              {tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.key} · {ticket.title}</option>)}
            </select>
          </label>
          <label>
            Model
            <select aria-label={`Model for Session ${session.id + 1}`} value={modelId} onChange={(event) => setModelId(event.target.value)}>
              {models.map((model) => <option key={model.id} value={model.id}>{providerById.get(model.providerId)?.shortName} / {model.name} · {model.tier}</option>)}
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={improveBrief} onChange={(event) => setImproveBrief(event.target.checked)} />
            Clarify acceptance criteria <span>−8 attention</span>
          </label>
          <button className="primary-button" onClick={() => assign(session.id, ticketId, modelId, improveBrief)} disabled={!ticketId || !modelId}>
            <Play /> Start agent
          </button>
        </div>
      ) : <p className="empty-state">No ready tickets. Clear the current reviews to unblock the queue.</p>}
    </article>
  );
}

function Backlog({ game }: { game: GameState }) {
  return (
    <section className="panel backlog-panel">
      <div className="panel-heading"><div><span className="eyebrow">Work queue</span><h2>Backlog</h2></div><span className="count-badge">{content.tickets.length - game.completedTicketIds.length}</span></div>
      <div className="ticket-list">
        {content.tickets.map((ticket) => {
          const status = ticketProgressLabel(game, ticket.id);
          const blocked = !ticket.prerequisites.every((id) => game.completedTicketIds.includes(id));
          return (
            <article className={`ticket-row ${status === "Shipped" ? "ticket-done" : ""} ${blocked ? "ticket-blocked" : ""}`} key={ticket.id}>
              <div className={`ticket-kind kind-${ticket.kind}`}><FileCode2 /></div>
              <div className="ticket-copy"><div><span>{ticket.key}</span><span className="pill">{ticket.kind}</span></div><strong>{ticket.title}</strong><small>{blocked ? "Waiting on dependencies" : ticket.summary}</small></div>
              <span className="ticket-status">{status === "Shipped" ? <Check /> : status}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReviewQueue({ game }: { game: GameState }) {
  const review = useGameStore((store) => store.review);
  return (
    <section className="panel review-panel">
      <div className="panel-heading"><div><span className="eyebrow">Human bottleneck</span><h2>Review queue</h2></div><span className={`count-badge ${game.reviews.length > 1 ? "hot" : ""}`}>{game.reviews.length}</span></div>
      {!game.reviews.length ? <div className="empty-state roomy"><GitPullRequest /><p>No diffs waiting. Enjoy this suspiciously temporary calm.</p></div> : (
        <div className="review-list">
          {game.reviews.map((item) => {
            const ticket = ticketById.get(item.ticketId)!;
            const riskLabel = item.risk < 0.2 ? "Low risk" : item.risk < 0.42 ? "Needs attention" : "High risk";
            return (
              <article className="review-card" key={item.id}>
                <div className="review-top"><div><span className="eyebrow">{ticket.key}</span><h3>{ticket.title}</h3></div><span className={`risk risk-${riskLabel.toLowerCase().replaceAll(" ", "-")}`}>{riskLabel} · {Math.round(item.risk * 100)}%</span></div>
                <p>{ticket.evidence.summary}</p>
                <ul className="evidence-list"><li><Check />{ticket.evidence.tests}</li><li><AlertTriangle />{ticket.evidence.signal}</li><li><FileCode2 />{ticket.files.join(" · ")}</li></ul>
                <div className="review-actions">
                  <button onClick={() => review(item.id, "approve")}><Check />Approve <span>7</span></button>
                  <button onClick={() => review(item.id, "revise")}><RefreshCcw />Revise <span>12</span></button>
                  <button onClick={() => review(item.id, "escalate")}><Sparkles />Escalate <span>18</span></button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Upgrades({ game }: { game: GameState }) {
  const purchase = useGameStore((store) => store.purchase);
  return (
    <section className="panel upgrades-panel">
      <div className="panel-heading"><div><span className="eyebrow">Structural leverage</span><h2>Upgrades</h2></div><Zap /></div>
      <div className="upgrade-list">
        {content.upgrades.map((upgrade) => {
          const purchased = game.purchasedUpgradeIds.includes(upgrade.id);
          const unlocked = game.completedTicketIds.length >= upgrade.unlockAfter;
          return (
            <button className={`upgrade-row ${purchased ? "purchased" : ""}`} key={upgrade.id} disabled={purchased || !unlocked || game.trust < upgrade.cost} onClick={() => purchase(upgrade.id)}>
              <span className="upgrade-icon">{purchased ? <Check /> : <ChevronRight />}</span>
              <span><strong>{upgrade.name}</strong><small>{unlocked ? upgrade.description : `Unlocks after ${upgrade.unlockAfter} shipped`}</small></span>
              <b>{purchased ? "ACTIVE" : upgrade.cost}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ActivityFeed({ game }: { game: GameState }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-heading"><div><span className="eyebrow">Everything is fine</span><h2>Activity</h2></div><Activity /></div>
      <div className="activity-list">
        {game.events.map((event) => (
          <article className={`activity-row event-${event.tone}`} key={event.id}>
            <time>{clock(event.at)}</time><span className="activity-line" /><div><strong>{event.title}</strong><p>{event.message}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SaveControls() {
  const exportSave = useGameStore((store) => store.exportSave);
  const importSave = useGameStore((store) => store.importSave);
  const restart = useGameStore((store) => store.restart);
  const input = useRef<HTMLInputElement>(null);
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportSave()], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "context-switch-save.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const onImport = async (file?: File) => {
    if (file) await importSave(await file.text());
    if (input.current) input.current.value = "";
  };
  return (
    <div className="save-controls">
      <button title="Export save" onClick={download}><Download /></button>
      <button title="Import save" onClick={() => input.current?.click()}><Upload /></button>
      <button title="Restart run" onClick={() => { if (window.confirm("Restart this run and clear its local save?")) void restart(); }}><RefreshCcw /></button>
      <input ref={input} type="file" accept="application/json" hidden onChange={(event) => void onImport(event.target.files?.[0])} />
    </div>
  );
}

function Ending() {
  const ending = useGameStore((store) => store.game.ending);
  const restart = useGameStore((store) => store.restart);
  if (!ending) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ending-title">
      <section className="ending-card">
        <span className="eyebrow">Vertical slice complete</span>
        <h2 id="ending-title">{ending.title}</h2>
        <p>{ending.message}</p>
        <div className="score-grid">
          {Object.entries(ending.scores).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong><Meter value={label === "debt" ? 100 - value : value} label={label} /></div>)}
        </div>
        <button className="primary-button" onClick={() => void restart()}><RefreshCcw />Start another shift</button>
      </section>
    </div>
  );
}

type TerminalLineKind = CliMessage["kind"] | "command" | "system" | "event";

interface TerminalLine {
  id: number;
  kind: TerminalLineKind;
  text: string;
}

interface TerminalTabState {
  id: string;
  name: string;
  kind: "provider" | "monitor";
  providerId?: string;
  modelId?: string;
  permissionMode?: PermissionMode;
  reasoning?: ReasoningMode;
  view?: PaneMode;
  input: string;
  history: TerminalLine[];
  commands: string[];
  commandCursor: number;
}

let terminalLineId = 0;
let terminalTabId = 1;
const terminalLine = (kind: TerminalLineKind, text: string): TerminalLine => ({ id: terminalLineId += 1, kind, text });

function providerBanner(providerId: string, modelId: string) {
  const provider = providerById.get(providerId)!;
  const model = modelById.get(modelId)!;
  if (providerId === "openmind") {
    return [
      "╭──────────────────────────────────────────────────╮",
      `│ >_ ${provider.name.padEnd(44)}│`,
      `│ model:     ${(model.name + " " + model.tier).padEnd(37)}│`,
      "│ directory: ~/delivery                            │",
      "╰──────────────────────────────────────────────────╯",
      "Describe a task, mention a ticket key, or run /help.",
    ].join("\n");
  }
  return [
    "╭──────────────────────────────────────────────────╮",
    `│ ◆ ${provider.name.padEnd(46)}│`,
    `│ ${model.name.padEnd(48)}│`,
    "│ ~/delivery                                       │",
    "╰──────────────────────────────────────────────────╯",
    "Try “work on APP-101”, or run /help for commands.",
  ].join("\n");
}

function defaultModel(providerId: string) {
  return providerId === "openmind" ? "spark" : "ballad";
}

function createProviderTab(providerId: string, name?: string): TerminalTabState {
  const id = `term-${terminalTabId}`;
  terminalTabId += 1;
  const modelId = defaultModel(providerId);
  const provider = providerById.get(providerId)!;
  return {
    id,
    name: name || provider.name,
    kind: "provider",
    providerId,
    modelId,
    permissionMode: providerId === "openmind" ? "workspace-write" : "ask",
    reasoning: "medium",
    input: "",
    commands: [],
    commandCursor: 0,
    history: [
      terminalLine("system", providerBanner(providerId, modelId)),
    ],
  };
}

function createMonitorTab(view: PaneMode): TerminalTabState {
  const id = `term-${terminalTabId}`;
  terminalTabId += 1;
  return { id, name: view === "dashboard" ? "dashboard.live" : `watch.${view}`, kind: "monitor", view, input: "", history: [], commands: [], commandCursor: 0 };
}

function defaultTerminalTabs() {
  return [createProviderTab("anthill"), createProviderTab("openmind")];
}

function loadTerminalTabs() {
  try {
    const parsed = JSON.parse(localStorage.getItem("context-switch-terminal-tabs-v2") ?? "null") as TerminalTabState[] | null;
    if (parsed?.length && parsed.every((tab) => tab.id && tab.name && tab.kind && Array.isArray(tab.history))) {
      const highest = Math.max(...parsed.map((tab) => Number(tab.id.split("-")[1]) || 0));
      terminalTabId = highest + 1;
      terminalLineId = Math.max(terminalLineId, ...parsed.flatMap((tab) => tab.history.map((line) => line.id || 0)));
      return parsed.slice(0, 8);
    }
  } catch {
    // A broken terminal layout should never block the game save.
  }
  return defaultTerminalTabs();
}

function MonitorPane({ mode, game }: { mode: PaneMode; game: GameState }) {
  if (mode === "dashboard") {
    return (
      <aside className="mux-monitor dashboard-monitor full-window-tool" aria-label="Live dashboard">
        <div className="mux-pane-title"><span>dashboard.live</span><span>UPGRADE</span></div>
        <ResourceBar game={game} />
        <div className="dashboard-summary">
          <div><span>shipped</span><strong>{game.completedTicketIds.length}/{content.tickets.length}</strong></div>
          <div><span>reviews</span><strong>{game.reviews.length}</strong></div>
          <div><span>debt</span><strong>{Math.round(game.debt)}</strong></div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="mux-monitor full-window-tool" aria-label={`${mode} monitor`}>
      <div className="mux-pane-title"><span>watch.{mode}</span><span>LIVE</span></div>
      {mode === "agents" && <div className="watch-list">{game.sessions.slice(0, game.unlockedSessions).map((session) => <div className="watch-row" key={session.id}><span>#{session.id + 1}</span><strong>{session.status}</strong><small>{session.ticketId ? `${ticketById.get(session.ticketId)?.key} · ${Math.round(session.progress * 100)}%` : "idle"}</small><Meter value={session.progress * 100} label={`Session ${session.id + 1}`} /></div>)}</div>}
      {mode === "reviews" && <div className="watch-list">{game.reviews.length ? game.reviews.map((review) => <div className="watch-row" key={review.id}><span>{ticketById.get(review.ticketId)?.key}</span><strong>{Math.round(review.risk * 100)}% risk</strong><small>session {review.sessionId + 1} · awaiting human</small></div>) : <p className="terminal-empty">review queue empty</p>}</div>}
      {mode === "quota" && <div className="watch-list">{content.providers.map((provider) => <div className="watch-row" key={provider.id}><span>{provider.shortName}</span><strong>{Math.round(game.providerQuota[provider.id] ?? 0)} remaining</strong><Meter value={game.providerQuota[provider.id] ?? 0} max={provider.maxQuota} color={provider.color} label={provider.name} /></div>)}<div className="watch-row"><span>ATTN</span><strong>{Math.round(game.attention)}%</strong><Meter value={game.attention} label="Attention" /></div></div>}
      {mode === "events" && <div className="watch-events">{game.events.slice(0, 12).map((event) => <article key={event.id} className={`watch-event event-${event.tone}`}><time>{clock(event.at)}</time><div><strong>{event.title}</strong><p>{event.message}</p></div></article>)}</div>}
    </aside>
  );
}

export function App() {
  const game = useGameStore((store) => store.game);
  const hydrated = useGameStore((store) => store.hydrated);
  const hydrate = useGameStore((store) => store.hydrate);
  const pulse = useGameStore((store) => store.pulse);
  const reconcile = useGameStore((store) => store.reconcile);
  const persist = useGameStore((store) => store.persist);
  const speed = useGameStore((store) => store.speed);
  const offlineSeconds = useGameStore((store) => store.offlineSeconds);
  const notice = useGameStore((store) => store.notice);
  const dismissNotice = useGameStore((store) => store.dismissNotice);
  const [tabs, setTabs] = useState<TerminalTabState[]>(loadTerminalTabs);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const outputRef = useRef<HTMLDivElement>(null);
  const lastEventId = useRef<string | null>(null);
  const currentTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const activeAgents = useMemo(() => game.sessions.filter((session) => session.status === "working" || session.status === "quota-paused").length, [game.sessions]);
  const multiTabUnlocked = game.completedTicketIds.length >= 1;
  const operationsUnlocked = game.completedTicketIds.length >= 3;

  const updateTab = (id: string, update: (tab: TerminalTabState) => TerminalTabState) => {
    setTabs((current) => current.map((tab) => tab.id === id ? update(tab) : tab));
  };
  const appendLines = (id: string, lines: TerminalLine[]) => {
    updateTab(id, (tab) => ({ ...tab, history: [...tab.history, ...lines].slice(-240) }));
  };
  const addTab = (providerId = currentTab.providerId ?? "anthill", name?: string) => {
    if (!multiTabUnlocked) {
      const target = currentTab.kind === "provider" ? activeTabId : tabs.find((tab) => tab.kind === "provider")?.id;
      if (target) appendLines(target, [terminalLine("error", "error: extra provider sessions unlock after the first shipped ticket")]);
      return;
    }
    const next = createProviderTab(providerId, name);
    setTabs((current) => [...current, next].slice(-8));
    setActiveTabId(next.id);
  };
  const openView = (view: PaneMode) => {
    const existing = tabs.find((tab) => tab.kind === "monitor" && tab.view === view);
    if (existing) { setActiveTabId(existing.id); return; }
    const next = createMonitorTab(view);
    setTabs((current) => [...current, next].slice(-8));
    setActiveTabId(next.id);
  };
  const closeTab = (id: string) => {
    if (tabs.length === 1) {
      appendLines(id, [terminalLine("error", "error: cannot close the final attached shell")]);
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    if (activeTabId === id) setActiveTabId(remaining[Math.max(0, index - 1)]?.id ?? remaining[0].id);
  };
  const cycleTabs = (direction: 1 | -1) => {
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    setActiveTabId(tabs[(index + direction + tabs.length) % tabs.length].id);
  };

  const applyEffect = async (effect: CliEffect, tabId: string) => {
    const store = useGameStore.getState();
    let failure: string | null = null;
    if (effect.type === "assign") failure = store.assign(effect.sessionId, effect.ticketId, effect.modelId, effect.improveBrief);
    if (effect.type === "review") failure = store.review(effect.reviewId, effect.decision);
    if (effect.type === "compact") failure = store.compact(effect.sessionId);
    if (effect.type === "purchase") failure = store.purchase(effect.upgradeId);
    if (effect.type === "speed") store.setSpeed(effect.speed);
    if (effect.type === "clear") updateTab(tabId, (tab) => ({ ...tab, history: [] }));
    if (effect.type === "new-session") updateTab(tabId, (tab) => tab.providerId && tab.modelId ? { ...tab, history: [terminalLine("system", providerBanner(tab.providerId, tab.modelId))], input: "", commands: [], commandCursor: 0 } : tab);
    if (effect.type === "model") updateTab(tabId, (tab) => ({ ...tab, modelId: effect.modelId }));
    if (effect.type === "permissions") updateTab(tabId, (tab) => ({ ...tab, permissionMode: effect.mode }));
    if (effect.type === "reasoning") updateTab(tabId, (tab) => ({ ...tab, reasoning: effect.mode }));
    if (effect.type === "tab-new") addTab(effect.providerId, effect.name);
    if (effect.type === "tab-close") closeTab(tabId);
    if (effect.type === "tab-rename") updateTab(tabId, (tab) => ({ ...tab, name: effect.name }));
    if (effect.type === "open-view") openView(effect.mode);
    if (effect.type === "export") {
      const url = URL.createObjectURL(new Blob([store.exportSave()], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "context-switch-save.json";
      anchor.click();
      URL.revokeObjectURL(url);
    }
    if (effect.type === "restart") {
      await store.restart();
      const defaults = defaultTerminalTabs();
      setTabs(defaults);
      setActiveTabId(defaults[0].id);
    }
    if (failure) appendLines(tabId, [terminalLine("error", `error: ${failure}`)]);
    else if (["assign", "review", "compact", "purchase"].includes(effect.type)) appendLines(tabId, [terminalLine("success", "ok")]);
  };

  const execute = async (raw: string, tabId = activeTabId) => {
    const command = raw.trim();
    if (!command) return;
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab || tab.kind !== "provider" || !tab.providerId) return;
    updateTab(tabId, (tab) => ({ ...tab, input: "", commands: [...tab.commands, command].slice(-60), commandCursor: tab.commands.length + 1 }));
    appendLines(tabId, [terminalLine("command", command)]);
    const result = evaluateCommand(command, useGameStore.getState().game, { providerId: tab.providerId, modelId: tab.modelId, permissionMode: tab.permissionMode, reasoning: tab.reasoning });
    if (result.messages.length) appendLines(tabId, result.messages.map((message) => terminalLine(message.kind, message.text)));
    if (result.effect) await applyEffect(result.effect, tabId);
  };

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    const interval = window.setInterval(() => pulse(Date.now()), 250);
    const autosave = window.setInterval(() => void persist(), 5_000);
    const onVisibility = () => { if (document.hidden) void persist(); else reconcile(Date.now()); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(interval); window.clearInterval(autosave); document.removeEventListener("visibilitychange", onVisibility); };
  }, [hydrate, hydrated, persist, pulse, reconcile]);
  useEffect(() => { localStorage.setItem("context-switch-terminal-tabs-v2", JSON.stringify(tabs)); }, [tabs]);
  useEffect(() => {
    const event = game.events[0];
    if (!event) return;
    if (lastEventId.current === null) { lastEventId.current = event.id; return; }
    if (lastEventId.current !== event.id) {
      lastEventId.current = event.id;
      const target = currentTab.kind === "provider" ? activeTabId : tabs.find((tab) => tab.kind === "provider")?.id;
      if (target) appendLines(target, [terminalLine("event", `[${event.tone}] ${event.title}\n${event.message}`)]);
    }
  }, [game.events[0]?.id]);
  useEffect(() => { outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" }); }, [activeTabId, currentTab?.history.length]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Tab") {
        event.preventDefault();
        cycleTabs(event.shiftKey ? -1 : 1);
      }
      if (event.altKey && /^[1-8]$/.test(event.key)) {
        const tab = tabs[Number(event.key) - 1];
        if (tab) { event.preventDefault(); setActiveTabId(tab.id); }
      }
      if (event.altKey && event.key.toLowerCase() === "t") { event.preventDefault(); addTab(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTabId, multiTabUnlocked, tabs]);

  if (!hydrated) return <main className="loading-screen"><CircleGauge /><p>Attaching operator console…</p></main>;

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void execute(currentTab.input);
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(0, currentTab.commandCursor - 1);
      updateTab(activeTabId, (tab) => ({ ...tab, commandCursor: next, input: tab.commands[next] ?? tab.input }));
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(currentTab.commands.length, currentTab.commandCursor + 1);
      updateTab(activeTabId, (tab) => ({ ...tab, commandCursor: next, input: tab.commands[next] ?? "" }));
    }
  };

  const currentProvider = currentTab.providerId ? providerById.get(currentTab.providerId) : undefined;
  const currentModel = currentTab.modelId ? modelById.get(currentTab.modelId) : undefined;
  const currentSession = currentTab.providerId ? game.sessions.find((session) => modelById.get(session.modelId ?? "")?.providerId === currentTab.providerId && session.status !== "idle") : undefined;
  const contextRemaining = Math.round(currentSession?.context ?? 100);
  const quotaRemaining = currentTab.providerId ? Math.round(game.providerQuota[currentTab.providerId] ?? 0) : 0;
  const shellCommand = currentTab.kind === "monitor" ? `watch ${currentTab.view}` : currentTab.providerId === "openmind" ? "forge" : "anthill";

  return (
    <div className="terminal-desktop">
      <section className="terminal-window" aria-label="Context Switch operator terminal">
        <header className="terminal-titlebar">
          <div className="window-lights" aria-hidden="true"><span /><span /><span /></div>
          <div className="terminal-window-title"><Terminal />{currentProvider?.name ?? currentTab.name} · ~/delivery</div>
          <div className="terminal-window-meta"><span className="online-dot">LIVE</span><span>{clock(game.gameTime)}</span><span>{speed}×</span></div>
        </header>

        <nav className="terminal-tabs" aria-label="Terminal tabs" role="tablist">
          <div className="terminal-tabs-scroll">
            {tabs.map((tab, index) => (
              <div className={`terminal-tab terminal-tab-${tab.providerId ?? tab.kind} ${tab.id === activeTabId ? "active" : ""}`} key={tab.id}>
                <button role="tab" aria-selected={tab.id === activeTabId} onClick={() => setActiveTabId(tab.id)}><span>{index + 1}</span>{tab.providerId && <i className="tab-provider-dot" style={{ background: providerById.get(tab.providerId)?.color }} />}{tab.name}</button>
                {(tabs.length > 2 || multiTabUnlocked) && <button className="terminal-tab-close" aria-label={`Close ${tab.name}`} onClick={() => closeTab(tab.id)}><X /></button>}
              </div>
            ))}
          </div>
          <button className="terminal-tab-add" aria-label={multiTabUnlocked ? "New provider session" : "Extra sessions locked"} onClick={() => addTab()} title={multiTabUnlocked ? "New provider session · Alt+T" : "Ship one ticket to unlock extra sessions"}><Plus /></button>
        </nav>

        <div className="terminal-contextbar">
          <span><b>$</b> {shellCommand}</span>
          <span>{activeAgents} agents</span><span>{game.reviews.length} reviews</span><span>{Math.round(game.attention)}% attention</span><span>{game.completedTicketIds.length}/{content.tickets.length} shipped</span>
        </div>

        <div className={`terminal-workspace ${currentTab.kind === "monitor" ? "tool-view" : `provider-${currentTab.providerId}`}`}>
          {currentTab.kind === "provider" ? (
            <section className="terminal-shell" aria-label={`${currentProvider?.name} session`}>
              <div className="terminal-output" ref={outputRef} role="log" aria-live="polite">
                {currentTab.history.map((line) => <div className={`terminal-line line-${line.kind}`} key={line.id}>{line.kind === "command" && <span className="line-prompt">{currentTab.providerId === "openmind" ? "›" : ">"}</span>}<pre>{line.text}</pre></div>)}
                {currentTab.history.length <= 1 && <div className="command-launchers" aria-label={`${currentProvider?.name} suggested commands`}>{commandSuggestions(currentTab.providerId ?? "anthill").map((command) => <button key={command} onClick={() => void execute(command)}>{command}</button>)}</div>}
              </div>
              <div className={`terminal-prompt prompt-${currentTab.providerId}`}>
                <span className="provider-chevron">{currentTab.providerId === "openmind" ? "›" : ">"}</span>
                <input autoFocus aria-label={`${currentProvider?.name} command`} placeholder={currentTab.providerId === "openmind" ? "Describe a task or /command" : "Message Anthill Code…"} autoComplete="off" spellCheck={false} value={currentTab.input} onChange={(event) => updateTab(activeTabId, (tab) => ({ ...tab, input: event.target.value }))} onKeyDown={onInputKey} />
              </div>
            </section>
          ) : currentTab.view ? <MonitorPane mode={currentTab.view} game={game} /> : null}
        </div>

        <footer className={`mux-statusbar status-${currentTab.providerId ?? currentTab.kind}`}>
          <div className="mux-session-list">{tabs.map((tab, index) => <button className={tab.id === activeTabId ? "active" : ""} onClick={() => setActiveTabId(tab.id)} key={tab.id}>{index + 1}:{tab.name}{tab.id === activeTabId ? "*" : ""}</button>)}</div>
          <div>{currentTab.kind === "provider" ? <><span>{currentModel?.name} {currentTab.providerId === "openmind" ? currentTab.reasoning : currentTab.permissionMode}</span><span>{quotaRemaining} quota</span><span>{contextRemaining}% context</span></> : <span>{operationsUnlocked ? `full-window:${currentTab.view}` : "operations locked"}</span>}<span>ctrl-tab next</span></div>
        </footer>
      </section>

      {(notice || offlineSeconds > 0) && <div className="toast" role="status"><Sparkles /><span>{notice ?? `Caught up ${Math.round(offlineSeconds)} seconds of agent work.`}</span><button onClick={dismissNotice}>×</button></div>}
      <Ending />
    </div>
  );
}
