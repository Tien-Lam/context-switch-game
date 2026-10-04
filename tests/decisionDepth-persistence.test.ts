import { describe, expect, it } from "vitest";
import { parseSave, serialiseSave } from "../src/app/persistence";
import { advanceGame, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";

function probes() {
  const initial = createInitialState();
  initial.completedTicketIds = ["deployment-banner", "telemetry-toggle"];
  initial.unlockedSessions = 2;
  initial.trust = 60;
  const review = advanceGame(startTicket(initial, 0, "cache-summary", "ballad"), 20);
  return reviewTicket(review, review.reviews[0].id, "revise", { remedy: "restore", workflow: "probes" });
}

describe("decision-depth saves", () => {
  it("round-trips supporting work and releases it after reload", () => {
    const state = probes();
    const restored = parseSave(serialiseSave(state, 1)).game;
    expect(restored).toEqual(state);
    expect(restored.sessions[1].status).toBe("supporting");
    const finished = advanceGame(restored, 10);
    expect(finished.sessions[1].status).toBe("idle");
    expect(parseSave(serialiseSave(finished, 2)).game).toEqual(finished);
  });

  it("sequentially migrates v8 without synthesizing a bypass", () => {
    const state = createInitialState();
    state.completedTicketIds = ["cache-summary"];
    const legacy = JSON.parse(serialiseSave(state, 1));
    legacy.version = 8;
    delete legacy.game.cacheOutcome;
    for (const session of legacy.game.sessions) {
      for (const key of ["cacheRemedy", "cacheWorkflow", "workDuration", "supportForSessionId"]) delete session[key];
    }
    expect(parseSave(JSON.stringify(legacy)).game.cacheOutcome).toBe("restored");
    legacy.game.flags.cacheShortcut = true;
    expect(parseSave(JSON.stringify(legacy)).game.cacheOutcome).toBe("none");
  });

  it.each(["dangling", "locked", "missing", "duplicate", "self", "wrong-model"])("rejects %s supporting references", (kind) => {
    const state = structuredClone(probes());
    if (kind === "dangling") state.sessions[1].supportForSessionId = 99;
    if (kind === "locked") state.unlockedSessions = 1;
    if (kind === "missing") state.sessions[1] = createInitialState().sessions[1];
    if (kind === "duplicate") { state.unlockedSessions = 3; state.sessions[2] = { ...state.sessions[1], id: 2 }; }
    if (kind === "self") state.sessions[1].supportForSessionId = 1;
    if (kind === "wrong-model") state.sessions[1].modelId = "forge";
    expect(() => parseSave(serialiseSave(state, 1))).toThrow();
  });

  it("rejects missing current-version fields instead of silently migrating corruption", () => {
    const current = JSON.parse(serialiseSave(createInitialState(), 1));
    delete current.game.cacheOutcome;
    expect(() => parseSave(JSON.stringify(current))).toThrow();
  });
});
