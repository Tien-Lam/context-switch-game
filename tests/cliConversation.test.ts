import { describe, expect, it } from "vitest";
import { advanceGame, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { commandSuggestions, evaluateAgentMessage, evaluateCommand } from "../src/ui/cli";

const forge = { providerId: "openmind", modelId: "spark", permissionMode: "workspace-write" as const, reasoning: "medium" as const };
function telemetryReady() {
  const state = createInitialState();
  state.completedTicketIds.push("deployment-banner");
  state.unlockedSessions = 2;
  return state;
}

describe("bounded conversational task constraints", () => {
  it.each([
    "Please take APP-118 with telemetry off by default",
    "Please take APP-118 with telemetry disabled by default and add a migration fixture",
    "Please plan APP-118 with default off and migration checks",
    "Please implement APP-118 with a disabled default",
  ])("clarifies the explicit disabled default once: %s", (request) => {
    const state = telemetryReady();
    const result = evaluateAgentMessage(request, state, forge);
    expect(result.effect).toMatchObject({ type: "assign", ticketId: "telemetry-toggle", improveBrief: true });
    expect(result.messages[0].text).toContain("Accepted: telemetry off by default");
    expect(result.messages[0].text).toContain("migration-fixture checks");
    expect(result.messages[0].text).toContain("5 upfront quota");
    const effect = result.effect;
    if (!effect || effect.type !== "assign") throw new Error("expected assignment");
    const running = startTicket(state, effect.sessionId, effect.ticketId, effect.modelId, effect.improveBrief, effect.reasoning);
    expect(running.providerQuota.openmind).toBe(state.providerQuota.openmind - 5);
    expect(running.sessions[effect.sessionId].briefImproved).toBe(true);
    expect(running.reviews).toHaveLength(0);
    const reviewed = advanceGame(running, 20);
    expect(reviewed.reviews).toHaveLength(1);
  });

  it.each([
    "Please take APP-118 with a migration fixture",
    "Please take APP-118 with migration checks",
  ])("asks for the default before charging fixture-only requests: %s", (request) => {
    const state = telemetryReady();
    const before = structuredClone(state);
    const result = evaluateAgentMessage(request, state, forge);
    expect(result.effect).toBeUndefined();
    expect(result.messages[0].text).toContain("Should telemetry be off by default?");
    expect(state).toEqual(before);
  });

  it.each([
    "What would disabling telemetry do?",
    "do not start APP-118",
    "Please take APP-118 with telemetry not off by default",
    "Please take APP-118 with telemetry on by default",
    "Please take APP-118 with telemetry off",
    "Please take APP-118 with telemetry off by default and default on",
    "Please take APP-118 with telemetry off or on by default",
    "Please take APP-118 with telemetry off by default and a yellow button",
    "Please take APP-118 with encrypted telemetry",
    "Please take APP-118 and delete the tests",
    "Please take APP-118 or PERF-204",
    "Please take APP-118 but do not add a migration fixture",
  ])("does not dispatch unsupported, conflicting, or read-only instructions: %s", (request) => {
    const state = telemetryReady();
    const before = structuredClone(state);
    const result = evaluateAgentMessage(request, state, forge);
    expect(result.effect).toBeUndefined();
    expect(state).toEqual(before);
  });

  it("keeps ordinary authored requests unplanned and rejects unavailable planning quota", () => {
    const state = telemetryReady();
    expect(evaluateAgentMessage("Please take APP-118", state, forge).effect).toMatchObject({ improveBrief: false });
    state.providerQuota.openmind = 6.9;
    const result = evaluateAgentMessage("Please take APP-118 with telemetry off by default", state, forge);
    expect(result.effect).toBeUndefined();
    expect(result.messages[0].text).toContain("no work started or quota spent");
    expect(state.providerQuota.openmind).toBe(6.9);
    expect(evaluateCommand("agents run APP-118 --brief", state, forge, true).effect).toBeUndefined();
  });
});

describe("conversational configuration and inquiries", () => {
  it("selects an unlocked named model without launching a provider or assigning work", () => {
    const state = telemetryReady();
    state.trust = 60;
    state.peakTrust = 60;
    expect(evaluateAgentMessage("Switch to forge", state, forge).effect).toEqual({ type: "model", modelId: "forge" });
    expect(evaluateAgentMessage("Could you use forge?", state, forge).effect).toEqual({ type: "model", modelId: "forge" });
    expect(evaluateAgentMessage("Switch to forge", state, { providerId: "anthill", modelId: "ballad" }).effect).toBeUndefined();
    expect(evaluateAgentMessage("Switch to unknown", state, forge).effect).toBeUndefined();
    expect(evaluateAgentMessage("Switch to forge", createInitialState(), forge).effect).toBeUndefined();
  });

  it("enables persistent planning without charging or dispatching yet", () => {
    const state = createInitialState();
    const result = evaluateAgentMessage("Please plan the next ticket", state, forge);
    expect(result.effect).toEqual({ type: "permissions", mode: "plan" });
    expect(result.messages[0].text).toContain("next assignment spends 5 upfront provider quota");
    expect(state.providerQuota.openmind).toBe(createInitialState().providerQuota.openmind);
    const planned = evaluateAgentMessage("Please take the next ticket", state, { ...forge, permissionMode: "plan" });
    expect(planned.effect).toMatchObject({ type: "assign", improveBrief: true });
  });

  it.each([
    "What models can I use?",
    "Can I switch to forge?",
    "Should I use high reasoning?",
    "What does plan mode cost?",
    "Please do not switch to forge",
    "Don't plan the next ticket",
    "Switch to forge and plan APP-118",
    "Please plan the next ticket and deploy it",
  ])("keeps questions, negations and compound controls non-mutating: %s", (request) => {
    const state = telemetryReady();
    const before = structuredClone(state);
    expect(evaluateAgentMessage(request, state, forge).effect).toBeUndefined();
    expect(state).toEqual(before);
  });

  it("identifies unfulfilled compound clauses and exact configuration shortcuts", () => {
    const result = evaluateAgentMessage("Switch to forge and plan APP-118", telemetryReady(), forge);
    expect(result.messages[0].text).toContain("No configuration or work changed");
    expect(result.messages[0].text).toContain("/model forge");
    expect(result.messages[0].text).toContain("/permissions plan");
  });

  it("answers active work questions before any review evidence exists", () => {
    const state = startTicket(createInitialState(), 0, "deployment-banner", "spark");
    for (const request of ["What changed in APP-101?", "Is APP-101 safe to approve?", "What are you working on?"]) {
      const result = evaluateAgentMessage(request, state, forge);
      expect(result.effect).toBeUndefined();
      expect(result.messages[0].text).toContain("APP-101 · session 1 · working");
      expect(result.messages[0].text).toContain("No completed change or verification evidence");
    }
    const ready = advanceGame(state, 20);
    expect(evaluateAgentMessage("What changed in APP-101?", ready, forge).messages[0].text).toContain("REVIEW APP-101");
  });

  it("answers upgrade inquiries with trust prices, balance and a purchase path", () => {
    const result = evaluateAgentMessage("What upgrades can I buy?", telemetryReady(), forge);
    expect(result.effect).toBeUndefined();
    expect(result.messages[0].text).toContain("Trust balance:");
    expect(result.messages[0].text).toContain("TRUST");
    expect(result.messages[0].text).toContain("upgrades buy <ID>");
  });

  it("offers medium and high, rejects low, and preserves active legacy effort", () => {
    const state = startTicket(createInitialState(), 0, "deployment-banner", "spark", false, "low");
    const before = structuredClone(state);
    expect(evaluateCommand("/reasoning low", state, forge).effect).toBeUndefined();
    expect(evaluateCommand("/reasoning low", state, forge).messages[0].text).toContain("medium or high");
    expect(evaluateAgentMessage("Use high reasoning", state, forge).effect).toEqual({ type: "reasoning", mode: "high" });
    expect(evaluateCommand("/reasoning", state, forge).messages[0].text).not.toContain("low:");
    expect(evaluateCommand("/status", state, forge).messages[0].text).toContain("active job effort  low");
    expect(state).toEqual(before);
    expect(evaluateAgentMessage("Please take APP-118", telemetryReady(), { ...forge, reasoning: "low" }).effect).toMatchObject({ reasoning: "medium" });
  });
});

describe("truthful estimate and capability formatting", () => {
  it.each(["tickets list", "tickets read APP-101"])("labels fresh-shell estimates as provisional: %s", (command) => {
    const result = evaluateCommand(command, createInitialState(), { providerId: "anthill", modelId: undefined, reasoning: undefined }, true);
    expect(result.messages[0].text).toContain("no model selected");
    expect(result.messages[0].text).toContain("provisional");
    expect(result.messages[0].text).not.toMatch(/undefined|null|selected model /);
  });

  it("names the selected model and actual reasoning defaults", () => {
    const state = createInitialState();
    expect(evaluateCommand("tickets list", state, { providerId: "anthill", modelId: "ballad", reasoning: undefined }).messages[0].text).toContain("selected model Ballad and medium reasoning");
    expect(evaluateCommand("tickets read APP-101", state, { ...forge, reasoning: "high" }).messages[0].text).toContain("selected model Spark and high reasoning");
  });

  it("exposes optional panes and the purchased dashboard through hints without navigation", () => {
    const state = telemetryReady();
    state.completedTicketIds.push("telemetry-toggle", "cache-summary");
    expect(commandSuggestions("openmind", state)).toContain("pane split quota");
    const purchase = evaluateCommand("upgrades buy terminal-dashboard", state, forge, true);
    expect(purchase.effect).toEqual({ type: "purchase", upgradeId: "terminal-dashboard" });
    expect(purchase.messages[0].text).toContain("costs 14 trust");
    expect(purchase.messages[0].text).toContain(`balance after successful purchase ${Math.round(state.trust - 14)} trust`);
    expect(purchase.messages[0].text).toContain("open it with dashboard");
    state.purchasedUpgradeIds.push("terminal-dashboard");
    expect(commandSuggestions("openmind", state)).toContain("dashboard");
  });
});

describe("shared revision evidence and quota cues", () => {
  it("quotes generic revision work before selection without pretending setup is total quota", () => {
    const state = advanceGame(startTicket(createInitialState(), 0, "deployment-banner", "spark"), 20);
    for (const result of [evaluateCommand("reviews read APP-101", state, forge), evaluateAgentMessage("What would this cost?", state, forge)]) {
      expect(result.effect).toBeUndefined();
      expect(result.messages[0].text).toContain("revision");
      expect(result.messages[0].text).toContain("0 upfront provider quota");
      expect(result.messages[0].text).toContain("quota/work-second");
      expect(result.messages[0].text).toContain("separate from upfront setup");
      expect(result.messages[0].text).toContain("context");
    }
    const revision = evaluateAgentMessage("Please revise APP-101", state, forge);
    expect(revision.effect).toMatchObject({ type: "review", decision: "revise" });
    expect(revision.messages[0].text).toContain("0 upfront provider quota");
    expect(revision.messages[0].text).toContain("Ongoing quota:");
  });

  it("shows completed migration verification instead of the original failed test summary", () => {
    const state = advanceGame(startTicket(telemetryReady(), 0, "telemetry-toggle", "spark"), 20);
    const revised = reviewTicket(state, state.reviews[0].id, "revise");
    expect(evaluateAgentMessage("What changed in APP-118?", revised, forge).messages[0].text).toContain("No completed change or verification evidence");
    const complete = advanceGame(revised, 20);
    const receipt = evaluateAgentMessage("What changed in APP-118?", complete, forge).messages[0].text;
    expect(receipt).toContain("workspace migration fixture pass");
    expect(receipt).toContain("explicitly disabled");
    expect(receipt).not.toContain("no migration fixture was added");
    expect(receipt).not.toContain("enabled unless");
  });

  it("adds a conditional quota cue only for a constrained assignment", () => {
    const state = telemetryReady();
    state.providerQuota.openmind = 2;
    const constrained = evaluateAgentMessage("Please take APP-118", state, forge).messages[0].text;
    expect(constrained).toContain("work");
    expect(constrained).toContain("elapsed");
    expect(constrained).toContain("Anthill");
    const ordinary = evaluateAgentMessage("Please take APP-118", telemetryReady(), forge).messages[0].text;
    expect(ordinary).not.toContain("elapsed");
  });
});
