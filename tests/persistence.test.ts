import { describe, expect, it } from "vitest";
import { newestSave, parseSave, SAVE_VERSION, serialiseSave } from "../src/app/persistence";
import { content } from "../src/content";
import { advanceGame, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";

describe("save envelope", () => {
  it("round-trips a complete game state", () => {
    const state = advanceGame(createInitialState(), 125);
    const parsed = parseSave(serialiseSave(state, 123456));

    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.savedAt).toBe(123456);
    expect(parsed.game).toEqual(state);
  });

  it("recovers the newest valid snapshot when persistent storage lags", () => {
    const oldSave = parseSave(serialiseSave(createInitialState(), 1_000));
    const latest = createInitialState();
    latest.completedTicketIds.push("deployment-banner");
    const emergency = parseSave(serialiseSave(latest, 2_000));

    expect(newestSave(oldSave, emergency)).toBe(emergency);
    expect(newestSave(emergency, oldSave)).toBe(emergency);
  });

  it("makes offline catch-up equivalent to normal elapsed simulation", () => {
    const initial = startTicket(createInitialState(), 0, "deployment-banner", "ballad");
    let pulsed = initial;
    for (let second = 0; second < 300; second += 1) {
      for (const jitteredPulse of [0.07, 0.18, 0.11, 0.39, 0.25]) {
        pulsed = advanceGame(pulsed, jitteredPulse);
      }
    }
    const caughtUp = advanceGame(initial, 300);

    expect(caughtUp.gameTime).toBeCloseTo(pulsed.gameTime, 10);
    expect(caughtUp.providerQuota.anthill).toBeCloseTo(pulsed.providerQuota.anthill, 10);
    expect(caughtUp.stats.quotaSpent).toBeCloseTo(pulsed.stats.quotaSpent, 10);
    expect(caughtUp.sessions[0].status).toBe(pulsed.sessions[0].status);
    expect(caughtUp.sessions[0].progress).toBe(pulsed.sessions[0].progress);
    expect(caughtUp.sessions[0].context).toBeCloseTo(pulsed.sessions[0].context, 10);
    expect(caughtUp.reviews[0].createdAt).toBeCloseTo(pulsed.reviews[0].createdAt, 10);
    expect(caughtUp.providerQuota.anthill).toBe(content.providers.find((provider) => provider.id === "anthill")!.maxQuota);
  });

  it("loads saves from before the player-energy mechanic was removed", () => {
    const legacy = createInitialState() as ReturnType<typeof createInitialState> & {
      attention?: number;
      stats: ReturnType<typeof createInitialState>["stats"] & { reviewAttentionSpent?: number };
    };
    legacy.attention = 12;
    legacy.stats.reviewAttentionSpent = 34;

    for (const session of legacy.sessions) delete (session as Partial<typeof session>).workedInParallel;

    const parsed = parseSave(JSON.stringify({ version: 1, savedAt: 123456, game: legacy }));

    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.game).not.toHaveProperty("attention");
    expect(parsed.game.stats).not.toHaveProperty("reviewAttentionSpent");
    expect(parsed.game.sessions.every((session) => session.workedInParallel === false)).toBe(true);
    expect(parsed.game.flags.runtimeDriftAccepted).toBe(false);
  });

  it("migrates version two saves with the new consequence flag", () => {
    const current = createInitialState();
    const { runtimeDriftAccepted, ...legacyFlags } = current.flags;
    void runtimeDriftAccepted;
    const previous = { ...current, flags: legacyFlags };

    const parsed = parseSave(JSON.stringify({ version: 2, savedAt: 123456, game: previous }));

    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.game.flags.runtimeDriftAccepted).toBe(false);
  });

  it("infers already-applied consequences from version four saves", () => {
    const prior = createInitialState();
    prior.flags.privacyDefaultedOn = true;
    prior.completedTicketIds = ["deployment-banner", "telemetry-toggle", "quota-display"];
    const parsed = parseSave(JSON.stringify({ version: 4, savedAt: 123456, game: prior }));

    expect(parsed.game.flags.privacyConsequenceApplied).toBe(true);
    expect(parsed.game.flags.runtimeConsequenceApplied).toBe(false);
    expect(parsed.game.flags.raceConsequenceApplied).toBe(false);
  });

  it("defaults earlier active sessions to medium reasoning", () => {
    const prior = createInitialState();
    const legacy = { ...prior, sessions: prior.sessions.map(({ reasoning, ...session }) => { void reasoning; return session; }) };
    const parsed = parseSave(JSON.stringify({ version: 5, savedAt: 123456, game: legacy }));

    expect(parsed.game.sessions.every((session) => session.reasoning === "medium")).toBe(true);
  });

  it("rejects unsupported data", () => {
    expect(() => parseSave('{"version":99}')).toThrow(/invalid/i);
  });

  it("rejects malformed nested state before it can reach the UI", () => {
    const invalidEnding = { ...createInitialState(), ending: {} };
    expect(() => parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 123456, game: invalidEnding }))).toThrow(/invalid/i);

    const invalidReview = createInitialState();
    invalidReview.reviews.push({ id: "bad", ticketId: "missing", sessionId: 99, risk: 0.2, createdAt: 1 });
    expect(() => parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 123456, game: invalidReview }))).toThrow(/invalid/i);

    const orphanedReview = createInitialState();
    orphanedReview.reviews.push({ id: "orphan", ticketId: "deployment-banner", sessionId: 1, risk: 0.2, createdAt: 1 });
    expect(() => parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 123456, game: orphanedReview }))).toThrow(/invalid/i);
  });
});
