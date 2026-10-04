import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../src/app/store";
import { createInitialState } from "../src/game/initialState";
import { advanceGame, startTicket } from "../src/game/engine";
import { loadGame, parseSave, SAVE_VERSION, saveGame } from "../src/app/persistence";

vi.mock("../src/app/persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app/persistence")>();
  return { ...actual, loadGame: vi.fn(async () => null), saveGame: vi.fn(async () => {}) };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("foreground clock", () => {
  it("keeps elapsed time after a delayed browser pulse", () => {
    vi.stubGlobal("document", { hidden: false });
    useGameStore.setState({ game: createInitialState(), hydrated: true, lastWallClock: 1_000, speed: 1 });

    useGameStore.getState().pulse(6_000);

    expect(useGameStore.getState().game.gameTime).toBe(5);
  });

  it("preserves hidden elapsed time when an autosave is reloaded", async () => {
    vi.stubGlobal("document", { hidden: true });
    const game = startTicket(createInitialState(), 0, "deployment-banner", "ballad");
    useGameStore.setState({ game, hydrated: true, lastWallClock: 1_000, speed: 12 });
    vi.spyOn(Date, "now").mockReturnValue(61_000);

    useGameStore.getState().pulse(61_000);
    await useGameStore.getState().persist();
    expect(saveGame).toHaveBeenLastCalledWith(game, 1_000);

    const [savedGame, savedAt] = vi.mocked(saveGame).mock.calls.at(-1)!;
    vi.mocked(loadGame).mockResolvedValueOnce({ version: SAVE_VERSION, savedAt: savedAt!, game: savedGame });
    vi.mocked(Date.now).mockReturnValue(62_000);
    await useGameStore.getState().hydrate();

    expect(useGameStore.getState().game).toEqual(advanceGame(game, 61));
    expect(useGameStore.getState().game.sessions[0].status).toBe("awaiting-review");
  });

  it("dates command snapshots and exports at their simulated wall clock", () => {
    useGameStore.setState({ game: createInitialState(), hydrated: true, lastWallClock: 1_000, speed: 1 });
    vi.spyOn(Date, "now").mockReturnValue(61_000);

    expect(useGameStore.getState().assign(0, "deployment-banner", "ballad", false)).toBeNull();
    const game = useGameStore.getState().game;
    expect(saveGame).toHaveBeenLastCalledWith(game, 1_000);

    const exported = parseSave(useGameStore.getState().exportSave());
    expect(exported.savedAt).toBe(1_000);
    expect(exported.game).toEqual(game);
  });
});
