import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/initialState";
import { evaluateCommand } from "../src/ui/cli";

describe("operator CLI", () => {
  it("reads authored tickets through a terminal tool", () => {
    const result = evaluateCommand("tickets read APP-101", createInitialState());
    expect(result.messages[0].text).toContain("Rename the deployment banner");
    expect(result.messages[0].text).toContain("ui/Banner.tsx");
  });

  it("turns an agent command into a deterministic game action", () => {
    const result = evaluateCommand("agents run APP-101 --model couplet --brief", createInitialState());
    expect(result.effect).toEqual({
      type: "assign",
      sessionId: 0,
      ticketId: "deployment-banner",
      modelId: "couplet",
      improveBrief: true,
    });
  });

  it("keeps models bound to their provider CLI", () => {
    const state = createInitialState();
    const forge = { providerId: "openmind", modelId: "spark", permissionMode: "workspace-write" as const, reasoning: "medium" as const };
    expect(evaluateCommand("/model spark", state, forge).effect).toEqual({ type: "model", modelId: "spark" });
    expect(evaluateCommand("/model ballad", state, forge).messages[0].kind).toBe("error");
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
    });
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
