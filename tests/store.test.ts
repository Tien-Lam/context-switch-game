import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../src/app/store";
import { createInitialState } from "../src/game/initialState";
import { advanceGame, startTicket } from "../src/game/engine";
import { clearSave, loadGame, parseSave, SAVE_VERSION, saveGame, serialiseSave } from "../src/app/persistence";

vi.mock("../src/app/persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app/persistence")>();
  return { ...actual, clearSave: vi.fn(async () => {}), loadGame: vi.fn(async () => null), saveGame: vi.fn(async () => {}) };
});

describe("unavailable storage", () => {
  it("ignores an older failed save after a newer snapshot request", async () => {
    let rejectOlder!: (reason?: unknown) => void;
    let resolveLatest!: () => void;
    vi.mocked(saveGame)
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectOlder = reject; }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveLatest = resolve; }));
    useGameStore.setState({ game: createInitialState(), hydrated: true, lastWallClock: 1_000, notice: null });

    expect(useGameStore.getState().assign(0, "deployment-banner", "ballad", false)).toBeNull();
    const latest = useGameStore.getState().persist();
    rejectOlder(new Error("Older snapshot could not save"));
    await Promise.resolve();
    expect(useGameStore.getState().notice).toBeNull();
    resolveLatest();
    await latest;
    expect(useGameStore.getState().notice).toBeNull();
  });

  it("keeps command, reconciliation and autosave failures handled while play continues", async () => {
    vi.mocked(saveGame).mockRejectedValue(new Error("Neither browser storage backend could save this run."));
    useGameStore.setState({ game: createInitialState(), hydrated: true, lastWallClock: 1_000, notice: null });

    expect(useGameStore.getState().assign(0, "deployment-banner", "ballad", false)).toBeNull();
    await Promise.resolve();
    expect(useGameStore.getState().game.sessions[0].status).toBe("working");
    expect(useGameStore.getState().notice).toContain("only in memory");

    useGameStore.getState().dismissNotice();
    useGameStore.getState().reconcile(2_000);
    await Promise.resolve();
    expect(useGameStore.getState().game.gameTime).toBe(1);
    expect(useGameStore.getState().notice).toContain("only in memory");

    useGameStore.getState().dismissNotice();
    await expect(useGameStore.getState().persist()).resolves.toBeUndefined();
    expect(useGameStore.getState().notice).toContain("only in memory");

    vi.mocked(saveGame).mockResolvedValue(undefined);
    await useGameStore.getState().persist();
    expect(useGameStore.getState().notice).toBeNull();
  });

  it("accepts a valid import in memory when persistence fails", async () => {
    vi.mocked(saveGame).mockRejectedValue(new Error("Storage denied"));
    const imported = startTicket(createInitialState(), 0, "deployment-banner", "ballad");
    useGameStore.setState({ game: createInitialState(), notice: null });

    await expect(useGameStore.getState().importSave(serialiseSave(imported, 1_000))).resolves.toBe(true);
    expect(useGameStore.getState().game).toEqual(imported);
    expect(useGameStore.getState().notice).toContain("only in memory");
    expect(useGameStore.getState().notice).not.toBe("Save imported.");
  });

  it("completes a restart when clearing and saving are denied", async () => {
    vi.mocked(clearSave).mockRejectedValue(new Error("Storage denied"));
    vi.mocked(saveGame).mockRejectedValue(new Error("Storage denied"));
    useGameStore.setState({ game: startTicket(createInitialState(), 0, "deployment-banner", "ballad"), speed: 12, offlineSeconds: 30, notice: null });

    await expect(useGameStore.getState().restart()).resolves.toBeUndefined();
    expect(useGameStore.getState().game).toEqual(createInitialState());
    expect(useGameStore.getState().speed).toBe(1);
    expect(useGameStore.getState().offlineSeconds).toBe(0);
    expect(useGameStore.getState().notice).toContain("only in memory");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
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
