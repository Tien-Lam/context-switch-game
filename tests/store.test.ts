import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../src/app/store";
import { createInitialState } from "../src/game/initialState";

afterEach(() => vi.unstubAllGlobals());

describe("foreground clock", () => {
  it("keeps elapsed time after a delayed browser pulse", () => {
    vi.stubGlobal("document", { hidden: false });
    useGameStore.setState({ game: createInitialState(), hydrated: true, lastWallClock: 1_000, speed: 1 });

    useGameStore.getState().pulse(6_000);

    expect(useGameStore.getState().game.gameTime).toBe(5);
  });
});
