import { describe, expect, it } from "vitest";
import { parseSave, serialiseSave } from "../src/app/persistence";
import { advanceGame } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";

describe("save envelope", () => {
  it("round-trips a complete game state", () => {
    const state = advanceGame(createInitialState(), 125);
    const parsed = parseSave(serialiseSave(state, 123456));

    expect(parsed.version).toBe(1);
    expect(parsed.savedAt).toBe(123456);
    expect(parsed.game).toEqual(state);
  });

  it("makes offline catch-up equivalent to normal elapsed simulation", () => {
    const initial = createInitialState();
    expect(advanceGame(initial, 300)).toEqual(advanceGame(advanceGame(initial, 120), 180));
  });

  it("loads saves from before the player-energy mechanic was removed", () => {
    const legacy = createInitialState() as ReturnType<typeof createInitialState> & {
      attention?: number;
      stats: ReturnType<typeof createInitialState>["stats"] & { reviewAttentionSpent?: number };
    };
    legacy.attention = 12;
    legacy.stats.reviewAttentionSpent = 34;

    const parsed = parseSave(JSON.stringify({ version: 1, savedAt: 123456, game: legacy }));

    expect(parsed.game).not.toHaveProperty("attention");
    expect(parsed.game.stats).not.toHaveProperty("reviewAttentionSpent");
  });

  it("rejects unsupported data", () => {
    expect(() => parseSave('{"version":99}')).toThrow(/invalid/i);
  });
});
