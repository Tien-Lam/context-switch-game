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
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { content, modelById, providerById, ticketById } from "../content";
import { availableModels, availableTickets, ticketProgressLabel } from "../game/selectors";
import type { GameState, SessionState } from "../game/types";
import { useGameStore } from "../app/store";

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

export function App() {
  const game = useGameStore((store) => store.game);
  const hydrated = useGameStore((store) => store.hydrated);
  const hydrate = useGameStore((store) => store.hydrate);
  const pulse = useGameStore((store) => store.pulse);
  const reconcile = useGameStore((store) => store.reconcile);
  const persist = useGameStore((store) => store.persist);
  const speed = useGameStore((store) => store.speed);
  const setSpeed = useGameStore((store) => store.setSpeed);
  const offlineSeconds = useGameStore((store) => store.offlineSeconds);
  const notice = useGameStore((store) => store.notice);
  const dismissNotice = useGameStore((store) => store.dismissNotice);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    const interval = window.setInterval(() => pulse(Date.now()), 250);
    const autosave = window.setInterval(() => void persist(), 5_000);
    const onVisibility = () => {
      if (document.hidden) void persist();
      else reconcile(Date.now());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(interval); window.clearInterval(autosave); document.removeEventListener("visibilitychange", onVisibility); };
  }, [hydrate, hydrated, persist, pulse, reconcile]);

  const active = useMemo(() => game.sessions.filter((session) => session.status === "working" || session.status === "quota-paused").length, [game.sessions]);
  if (!hydrated) return <main className="loading-screen"><CircleGauge /><p>Restoring workspace…</p></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><div className="brand-icon"><BrainCircuit /></div><div><span>CONTEXT</span><strong>SWITCH</strong></div><span className="build-tag">VERTICAL SLICE</span></div>
        <div className="shift-status"><span className="online-dot">ONLINE</span><Clock3 />SHIFT {clock(game.gameTime)}<span>{active} AGENT{active === 1 ? "" : "S"} ACTIVE</span></div>
        <div className="top-actions">
          <div className="speed-control" aria-label="Simulation speed"><FastForward />{([1, 4, 12] as const).map((value) => <button className={speed === value ? "active" : ""} key={value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
          <SaveControls />
        </div>
      </header>

      <main>
        <ResourceBar game={game} />
        <section className="briefing-strip"><div><CircleGauge /><span><strong>Objective:</strong> Ship the investor demo without converting the repository into a probabilistic suggestion.</span></div><span>{game.completedTicketIds.length} / {content.tickets.length} shipped</span></section>
        <div className="workspace-grid">
          <Backlog game={game} />
          <div className="centre-column">
            <section className="panel sessions-panel"><div className="panel-heading"><div><span className="eyebrow">Agent command centre</span><h2>Sessions</h2></div><span className="count-badge">{active} / {game.unlockedSessions}</span></div><div className="session-grid">{game.sessions.map((session) => <SessionCard key={session.id} session={session} game={game} />)}</div></section>
            <ReviewQueue game={game} />
          </div>
          <aside className="right-column"><Upgrades game={game} /><ActivityFeed game={game} /></aside>
        </div>
      </main>

      {(notice || offlineSeconds > 0) && <div className="toast" role="status"><Sparkles /><span>{notice ?? `Caught up ${Math.round(offlineSeconds)} seconds of agent work.`}</span><button onClick={dismissNotice}>×</button></div>}
      <Ending />
    </div>
  );
}
