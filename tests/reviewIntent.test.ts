import { describe, expect, it } from "vitest";
import { advanceGame, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { evaluateAgentMessage, evaluateCommand } from "../src/ui/cli";

function blockedReview() {
  const state = createInitialState();
  state.completedTicketIds = ["deployment-banner"];
  return advanceGame(startTicket(state, 0, "telemetry-toggle", "ballad"), 20);
}
const context = { providerId: "anthill", modelId: "ballad" };

describe("review intent conditions", () => {
  it("describes CLI capabilities without inventing provider tab positions", () => {
    const text = evaluateCommand("mux", createInitialState()).messages[0].text;
    expect(text).toContain("launch forge in any terminal");
    expect(text).not.toContain("tab 1");
    expect(text).not.toContain("tab 2");
  });
  it.each(["Please approve APP-118 if it is safe", "Please revise APP-118 and delete the tests", "Approve APP-118 and APP-101", "Approve APP-118 unless there is a warning", "Please approve APP-999", "Please approve APP-118 APP-999", "Please approve APP-118, APP-101"])("does not silently ignore a consequential clause: %s", (request) => {
    const state = blockedReview();
    const before = structuredClone(state);
    const result = evaluateAgentMessage(request, state, context);
    expect(result.effect).toBeUndefined();
    expect(result.messages.map((message) => message.text).join(" ")).toContain("No review decision made");
    expect(state).toEqual(before);
  });
  it.each(["Please approve the cache if it is safe", "Please bypass the cache only if the tests pass", "Please revise PERF-204 using ledger and delete the tests", "Please approve FIX-204", "Approve PERF-204 if the cache tests pass", "Ship PERF-204 if invalidation is safe", "Approve PERF-204 or bypass the cache"])("validates cache and unavailable explicit targets too: %s", (request) => {
    const initial = createInitialState();
    initial.completedTicketIds = ["deployment-banner"];
    initial.unlockedSessions = 2;
    initial.peakTrust = 100;
    const state = advanceGame(startTicket(initial, 0, "cache-summary", "forge"), 20);
    const result = evaluateAgentMessage(request, state, { providerId: "openmind", modelId: "forge" });
    expect(result.effect).toBeUndefined();
  });
  it.each(["Please approve APP-118", "Revise this change", "Request changes on APP-118", "Escalate APP-118 now"])("accepts a simple natural instruction: %s", (request) => {
    expect(evaluateAgentMessage(request, blockedReview(), context).effect).toMatchObject({ type: "review" });
  });
});
