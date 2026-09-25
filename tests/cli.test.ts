import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/initialState";
import { advanceGame, buyUpgrade, startTicket } from "../src/game/engine";
import { agentSuggestions, commandSuggestions, evaluateAgentMessage, evaluateCommand } from "../src/ui/cli";

describe("operator CLI", () => {
  it("reads authored tickets through a terminal tool", () => {
    const result = evaluateCommand("tickets read APP-101", createInitialState());
    expect(result.messages[0].text).toContain("Rename the deployment banner");
    expect(result.messages[0].text).toContain("ui/Banner.tsx");
  });

  it("explains review decisions with evidence and concrete tradeoffs", () => {
    const state = createInitialState();
    state.reviews.push({ id: "review-1", ticketId: "telemetry-toggle", sessionId: 0, risk: 0.34, createdAt: 4 });
    const result = evaluateCommand("reviews read APP-118", state);

    expect(result.messages[0].text).toContain("review risk score 34/100");
    expect(result.messages[0].text).toContain("risk source");
    expect(result.messages[0].text).toContain("no migration fixture was added");
    expect(result.messages[0].text).toContain("approve will ship the warning as a known defect");
    expect(result.messages[0].text).toContain("resolve finding; another agent pass");
    expect(result.messages[0].text).toContain("-3 trust");
  });

  it("shows accumulated consequences before the finale decision", () => {
    const state = createInitialState();
    state.flags.privacyDefaultedOn = true;
    state.flags.raceAccepted = true;
    state.sessions[0] = { ...state.sessions[0], status: "awaiting-review", ticketId: "investor-demo", modelId: "ballad", progress: 1 };
    state.reviews.push({ id: "final-review", ticketId: "investor-demo", sessionId: 0, risk: 0.5, createdAt: 40 });

    const result = evaluateCommand("reviews read SHIP-1", state);

    expect(result.messages[0].text).toContain("privacy open · cache clean");
    expect(result.messages[0].text).toContain("runtime clean · exports racy");
    expect(result.messages[0].text).toContain("health 82 · debt 4 · trust 30");
  });

  it("shows only concrete provider limits in usage output", () => {
    const result = evaluateCommand("/usage", createInitialState());
    expect(result.messages[0].text).toContain("Anthill Code");
    expect(result.messages[0].text.toLowerCase()).not.toContain("attention");
  });

  it("turns an agent command into a deterministic game action", () => {
    const result = evaluateCommand("agents run APP-101 --model couplet --brief", createInitialState());
    expect(result.messages[0].text).toContain("review ~3s");
    expect(result.effect).toEqual({
      type: "assign",
      sessionId: 0,
      ticketId: "deployment-banner",
      modelId: "couplet",
      improveBrief: true,
      reasoning: "medium",
    });
  });

  it("keeps models bound to their provider CLI", () => {
    const state = createInitialState();
    const forge = { providerId: "openmind", modelId: "spark", permissionMode: "workspace-write" as const, reasoning: "medium" as const };
    expect(evaluateCommand("/model spark", state, forge).effect).toEqual({ type: "model", modelId: "spark" });
    expect(evaluateCommand("/model ballad", state, forge).messages[0].kind).toBe("error");
  });

  it("uses Forge reasoning and plan permission in ticket assignments", () => {
    const result = evaluateCommand("work on APP-101", createInitialState(), {
      providerId: "openmind", modelId: "spark", permissionMode: "plan", reasoning: "high",
    });
    expect(result.effect).toMatchObject({ type: "assign", improveBrief: true, reasoning: "high" });
  });

  it("accepts natural-language work prompts in each provider session", () => {
    const state = createInitialState();
    const result = evaluateCommand("please implement APP-101", state, { providerId: "openmind", modelId: "spark" });
    expect(result.effect).toEqual({
      type: "assign",
      sessionId: 0,
      ticketId: "deployment-banner",
      modelId: "spark",
      improveBrief: false,
      reasoning: "medium",
    });
  });

  it("lets an agent take work without an exact ticket key or command form", () => {
    const state = createInitialState();
    for (const prompt of ["Could you take care of the deployment banner?", "Please handle rename the deployment banner", "Please rename the deployment banner", "Let's do the next ticket", "Ship APP-101"]) {
      expect(evaluateAgentMessage(prompt, state).effect, prompt).toMatchObject({ type: "assign", ticketId: "deployment-banner" });
    }
    expect(evaluateAgentMessage("What should I work on next?", state).effect).toBeUndefined();
    expect(evaluateAgentMessage("What should I work on next?", state).messages[0].text).toContain("APP-101");
    expect(evaluateAgentMessage("Tell me about the deployment banner", state).messages[0].text).toContain("Change the staging banner copy");
    state.completedTicketIds.push("deployment-banner");
    expect(evaluateAgentMessage("Could you cache the dashboard summary?", state).effect).toMatchObject({ type: "assign", ticketId: "cache-summary" });
  });

  it("keeps exact syntax in the terminal while accepting natural requests in agent chat", () => {
    const state = createInitialState();
    expect(evaluateCommand("Could you handle the banner?", state, undefined, true).messages[0].kind).toBe("error");
    expect(evaluateCommand("agents run APP-101", state, undefined, true).effect).toMatchObject({ type: "assign", ticketId: "deployment-banner" });
    expect(evaluateAgentMessage("Could you handle the banner?", state).effect).toMatchObject({ type: "assign", ticketId: "deployment-banner" });
    expect(evaluateAgentMessage("tickets list", state).messages[0].text).toContain("APP-101");
    expect(evaluateAgentMessage("/help", state).messages[0].text).toContain("ordinary language");
    expect(evaluateCommand("help", state, undefined, true).messages[0].text).toContain("agents run <KEY>");
    expect(agentSuggestions("anthill", state)).toContain("What should I work on next?");
  });

  it("answers review questions and understands natural review decisions", () => {
    const state = createInitialState();
    state.sessions[0] = { ...state.sessions[0], status: "awaiting-review", ticketId: "deployment-banner", modelId: "ballad" };
    state.reviews.push({ id: "review-1", ticketId: "deployment-banner", sessionId: 0, risk: 0.12, createdAt: 4 });
    const inquiry = evaluateAgentMessage("Is this safe to approve?", state);
    expect(inquiry.effect).toBeUndefined();
    expect(inquiry.messages[0].text).toContain("REVIEW APP-101");
    expect(evaluateAgentMessage("Please revise this review", state).effect).toEqual({ type: "review", reviewId: "review-1", decision: "revise" });
    expect(evaluateAgentMessage("Approve it", state).effect).toEqual({ type: "review", reviewId: "review-1", decision: "approve" });
    expect(evaluateAgentMessage("Ship APP-101", state).effect).toEqual({ type: "review", reviewId: "review-1", decision: "approve" });
  });

  it("accepts a natural incident containment request", () => {
    const state = createInitialState();
    state.incidentResponse = "active";
    expect(evaluateAgentMessage("Please rate limit the gateway", state).effect).toEqual({ type: "mitigate", action: "rate-limit" });
    expect(evaluateAgentMessage("How can we contain this incident?", state).effect).toBeUndefined();
  });

  it("suggests the next ready ticket instead of a shipped opening ticket", () => {
    const state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary", "runtime-upgrade", "webhook-backoff", "parallel-reports", "quota-display", "stale-customer-data", "investor-demo"];
    const result = evaluateCommand("can you help me?", state);

    expect(result.messages[0].text).toContain("next ready ticket is QA-401");
    expect(result.messages[0].text).not.toContain("APP-101");
  });

  it("does not assign work when natural-language intent is negated", () => {
    const state = createInitialState();
    for (const prompt of ["don't work on APP-101", "don’t start APP-101", "do not implement APP-101", "never assign APP-101", "I do not want you to work on APP-101", "I do not want you working on APP-101", "Please avoid working on APP-101", "Do not do work on APP-101", "I would rather not work on APP-101", "Please hold off on APP-101", "Do not begin work on APP-101", "Please refrain from working on APP-101", "Delay work on APP-101", "Wait to start APP-101", "I cannot work on APP-101 yet", "I am not ready to start APP-101", "We should postpone work on APP-101"]) {
      const result = evaluateCommand(prompt, state);
      expect(result.effect).toBeUndefined();
      expect(result.messages[0].text, prompt).toContain("No work started");
    }
    const ambiguous = evaluateCommand("APP-101 looks risky", state);
    expect(ambiguous.effect).toBeUndefined();
    expect(ambiguous.messages[0].text).toContain("APP-101 · Rename the deployment banner");
  });

  it("shows baseline and projected risk when listing tickets", () => {
    const result = evaluateCommand("tickets list", createInitialState());
    expect(result.messages[0].text).toContain("BASE/EST");
    expect(result.messages[0].text).toContain("Risk is ticket baseline / estimate for the selected model");
    expect(evaluateCommand("tickets read APP-101", createInitialState()).messages[0].text).toContain("% base ·");
  });

  it("projects ticket risk using the selected reasoning level and names its assumptions", () => {
    const state = createInitialState();
    const low = evaluateCommand("tickets read APP-101", state, { providerId: "openmind", modelId: "spark", reasoning: "low" }).messages[0].text;
    const high = evaluateCommand("tickets read APP-101", state, { providerId: "openmind", modelId: "spark", reasoning: "high" }).messages[0].text;

    expect(low).toContain("30-30% estimated with selected Spark and low reasoning");
    expect(high).toContain("14-14% estimated with selected Spark and high reasoning");
  });

  it("includes purchased risk-reduction upgrades in review evidence", () => {
    const state = createInitialState();
    state.purchasedUpgradeIds.push("repo-playbook", "fast-checks");
    const assigned = evaluateCommand("work on APP-101", state);
    const effect = assigned.effect;
    if (!effect || effect.type !== "assign") throw new Error("expected ticket assignment");
    let running = startTicket(state, effect.sessionId, effect.ticketId, effect.modelId, effect.improveBrief, effect.reasoning);
    running = advanceGame(running, 5);
    const evidence = evaluateCommand("reviews read APP-101", running).messages[0].text;

    expect(evidence).toContain("repository playbook −7");
    expect(evidence).toContain("fast checks −8");
  });

  it("keeps review risk explanations fixed to the moment of scoring", () => {
    const state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "telemetry-toggle"];
    const assigned = evaluateCommand("work on PLAT-77", state);
    const effect = assigned.effect;
    if (!effect || effect.type !== "assign") throw new Error("expected ticket assignment");
    let running = startTicket(state, effect.sessionId, effect.ticketId, "ballad");
    running = advanceGame(running, 15);
    const riskBefore = running.reviews[0].risk;
    const before = evaluateCommand("reviews read PLAT-77", running).messages[0].text;
    running = buyUpgrade(running, "fast-checks");
    const after = evaluateCommand("reviews read PLAT-77", running).messages[0].text;

    expect(before).not.toContain("fast checks −8");
    expect(after).not.toContain("fast checks −8");
    expect(after).toContain(`review risk score ${Math.round(riskBefore * 100)}/100`);
  });

  it("never starts work from natural-language review or inspection intent", () => {
    const state = createInitialState();
    for (const prompt of ["please review APP-101", "inspect APP-101 before we start", "show me the diff for APP-101"]) {
      const result = evaluateCommand(prompt, state);
      expect(result.effect).toBeUndefined();
      expect(result.messages[0].text).toContain("no pending review");
    }
  });

  it("keeps review-ready work visible in status and context output", () => {
    const state = createInitialState();
    state.sessions[0] = {
      ...state.sessions[0],
      status: "awaiting-review",
      ticketId: "deployment-banner",
      modelId: "ballad",
      progress: 1,
      context: 73,
    };
    state.reviews.push({ id: "review-1", ticketId: "deployment-banner", sessionId: 0, risk: 0.12, createdAt: 4 });

    const status = evaluateCommand("/status", state).messages[0].text;
    expect(status).toContain("current task       APP-101 · 100%");
    expect(status).toContain("task state         awaiting-review");
    expect(status).toContain("trust / health");
    expect(status).toContain("repository debt");
    const context = evaluateCommand("/context", state).messages[0].text;
    expect(context).toContain("free              73%");
    expect(context).toContain("awaits review");
  });

  it("formats event timestamps from elapsed seconds", () => {
    const state = createInitialState();
    state.events.unshift({ id: "later", at: 125, tone: "info", title: "Two minutes in", message: "Still Monday." });
    expect(evaluateCommand("events 1", state).messages[0].text).toContain("09:02");
  });

  it("offers import and explains model and upgrade tradeoffs", () => {
    const state = createInitialState();
    expect(evaluateCommand("save import", state).effect).toEqual({ type: "import" });
    const models = evaluateCommand("/model", state).messages[0].text;
    expect(models).toContain("QUOTA/S");
    expect(models).toContain("RISK");
    expect(models).toContain("Fast and frugal");
    const upgrades = evaluateCommand("upgrades list", state).messages[0].text;
    expect(upgrades).toContain("Clear conventions reduce ambiguity in every brief.");
  });

  it("changes command suggestions with available work and reviews", () => {
    const state = createInitialState();
    expect(commandSuggestions("anthill", state)).toContain("agents run APP-101");
    state.sessions[0] = { ...state.sessions[0], status: "awaiting-review", ticketId: "deployment-banner", modelId: "ballad", progress: 1 };
    state.reviews.push({ id: "review-1", ticketId: "deployment-banner", sessionId: 0, risk: 0.12, createdAt: 4 });
    expect(commandSuggestions("anthill", state)).toContain("reviews read APP-101");
    expect(commandSuggestions("anthill", state)).not.toContain("agents run APP-101");
    expect(commandSuggestions("anthill", state)).not.toContain("reviews approve APP-101");
    state.sessions[1] = { ...state.sessions[1], status: "awaiting-review", ticketId: "cache-summary", modelId: "spark", progress: 1 };
    state.reviews.push({ id: "review-2", ticketId: "cache-summary", sessionId: 1, risk: 0.4, createdAt: 4 });
    expect(commandSuggestions("openmind", state)).toContain("reviews read PERF-204");
    expect(commandSuggestions("openmind", state)).not.toContain("reviews read APP-101");
  });

  it("unlocks multiplexer abilities through progression", () => {
    const initial = evaluateCommand("tab new", createInitialState());
    expect(initial.messages[0].kind).toBe("error");

    const progressed = createInitialState();
    progressed.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary"];
    expect(evaluateCommand("tab new ops", progressed).effect?.type).toBe("tab-new");
    expect(evaluateCommand("watch agents", progressed).effect).toEqual({ type: "open-view", mode: "agents" });
  });

  it("keeps the graphical dashboard behind its upgrade", () => {
    const state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary"];
    expect(evaluateCommand("dashboard", state).messages[0].kind).toBe("error");
    state.purchasedUpgradeIds.push("terminal-dashboard");
    expect(evaluateCommand("dashboard", state).effect).toEqual({ type: "open-view", mode: "dashboard" });
  });
});
