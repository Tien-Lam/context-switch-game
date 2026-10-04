import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSave, loadGame, newestSave, parseSave, SAVE_VERSION, saveGame, serialiseSave, type SaveEnvelope } from "../src/app/persistence";
import { content } from "../src/content";
import { advanceGame, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";

const databaseStorage = vi.hoisted(() => ({ record: null as SaveEnvelope | null, failWrites: false }));

vi.mock("dexie", () => ({ default: class {
  saves = {
    get: async () => databaseStorage.record,
    put: async (record: SaveEnvelope) => {
      if (databaseStorage.failWrites) throw new Error("Database unavailable");
      databaseStorage.record = structuredClone(record);
    },
    delete: async () => { databaseStorage.record = null; },
  };
  version() { return { stores: () => this }; }
} }));

afterEach(() => {
  vi.unstubAllGlobals();
  databaseStorage.record = null;
  databaseStorage.failWrites = false;
});

function emergencyStorage() {
  let value: string | null = null;
  let failWrites = false;
  vi.stubGlobal("localStorage", {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      if (failWrites) throw new DOMException("Storage full", "QuotaExceededError");
      value = next;
    },
    removeItem: () => { value = null; },
  });
  return {
    failWrites: () => { failWrites = true; },
    read: () => value === null ? null : parseSave(value),
    seed: (next: string) => { value = next; },
  };
}

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

  it("prefers the emergency snapshot when a newer command shares the database timestamp", () => {
    const databaseSave = parseSave(serialiseSave(createInitialState(), 1_000));
    const assigned = startTicket(createInitialState(), 0, "deployment-banner", "ballad");
    const emergency = parseSave(serialiseSave(assigned, 1_000));

    expect(newestSave(databaseSave, emergency)).toBe(emergency);
  });

  it("loads the newer database command when an equal-clock emergency write fails", async () => {
    const storage = emergencyStorage();
    const initial = createInitialState();
    await saveGame(initial, 1_000);
    storage.failWrites();
    const assigned = startTicket(initial, 0, "deployment-banner", "ballad");
    await saveGame(assigned, 1_000);

    expect(storage.read()?.game.sessions[0].status).toBe("idle");
    expect((await loadGame())?.game).toEqual(assigned);
  });

  it("loads the newer emergency command when an equal-clock database write fails", async () => {
    emergencyStorage();
    const initial = createInitialState();
    await saveGame(initial, 1_000);
    databaseStorage.failWrites = true;
    const assigned = startTicket(initial, 0, "deployment-banner", "ballad");
    await expect(saveGame(assigned, 1_000)).rejects.toThrow("Database unavailable");

    expect(databaseStorage.record?.game.sessions[0].status).toBe("idle");
    expect((await loadGame())?.game).toEqual(assigned);
  });

  it("seeds command ordering from both valid storage records after loading", async () => {
    const storage = emergencyStorage();
    const game = createInitialState();
    databaseStorage.record = parseSave(serialiseSave(game, 2_000, 50_000));
    storage.seed(serialiseSave(game, 1_000, 60_000));

    expect((await loadGame())?.savedAt).toBe(2_000);
    await saveGame(game, 2_000);
    expect(storage.read()?.snapshotSequence).toBeGreaterThan(60_000);
    expect(databaseStorage.record?.snapshotSequence).toBe(storage.read()?.snapshotSequence);
  });

  it("preserves and validates optional snapshot metadata while keeping simulation time first", () => {
    const game = createInitialState();
    const earlier = parseSave(serialiseSave(game, 1_000, 20));
    const later = parseSave(serialiseSave(game, 2_000, 10));
    expect(earlier.snapshotSequence).toBe(20);
    expect(newestSave(earlier, later)).toBe(later);
    for (const snapshotSequence of [-1, 0.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 1_000, snapshotSequence, game }))).toThrow(/invalid/i);
    }
  });

  it("can load and clear when browser storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new DOMException("Access denied", "SecurityError"); },
      removeItem: () => { throw new DOMException("Access denied", "SecurityError"); },
    });

    await expect(loadGame()).resolves.toBeNull();
    await expect(clearSave()).resolves.toBeUndefined();
  });

  it("rejects duplicate active tickets and active tickets that were already shipped", () => {
    const duplicated = createInitialState();
    duplicated.unlockedSessions = 2;
    for (const session of duplicated.sessions.slice(0, 2)) {
      session.status = "working";
      session.ticketId = "deployment-banner";
      session.modelId = "ballad";
    }
    expect(() => parseSave(serialiseSave(duplicated, 1_000))).toThrow(/invalid/i);

    const alreadyShipped = structuredClone(startTicket(createInitialState(), 0, "deployment-banner", "ballad"));
    alreadyShipped.completedTicketIds.push("deployment-banner");
    expect(() => parseSave(serialiseSave(alreadyShipped, 1_000))).toThrow(/invalid/i);
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

  it("reopens completed demo saves for the next chapter", () => {
    const prior = createInitialState();
    prior.completedTicketIds = ["deployment-banner", "investor-demo"];
    prior.ending = { title: "Demo complete", message: "Old ending", scores: { throughput: 80, reliability: 80, trust: 80, debt: 5 } };
    const legacy = { ...prior, incidentResponse: undefined };
    const parsed = parseSave(JSON.stringify({ version: 6, savedAt: 123456, game: legacy }));

    expect(parsed.game.ending).toBeNull();
    expect(parsed.game.incidentResponse).toBe("none");
    expect(parsed.game.events[0].title).toBe("The demo became a product");
  });

  it("refreshes completed version-seven ending copy and score explanations", () => {
    const prior = createInitialState();
    prior.completedTicketIds = content.tickets.filter((ticket) => !ticket.incidentFor && ticket.kind !== "finale").map((ticket) => ticket.id);
    prior.ending = { title: "Old ending", message: "repaired after resolved", scores: { throughput: 0, reliability: 60, trust: 50, debt: 10 } };
    const { incidentMitigation, ...versionSeven } = prior;
    void incidentMitigation;

    const parsed = parseSave(JSON.stringify({ version: 7, savedAt: 123456, game: versionSeven }));

    expect(parsed.game.ending?.message).not.toContain("repaired after resolved");
    expect(parsed.game.ending?.scoreDetails?.throughput).toContain("includes idle time and quota restocks");
    expect(parsed.game.ending?.scores.throughput).toBeGreaterThan(0);
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
