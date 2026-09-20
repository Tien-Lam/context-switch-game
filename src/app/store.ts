import { create } from "zustand";
import { BALANCE } from "../game/balance";
import { advanceGame, buyUpgrade, compactSession, GameRuleError, reviewTicket, startTicket } from "../game/engine";
import { createInitialState } from "../game/initialState";
import type { GameState, ReviewDecision } from "../game/types";
import { clearSave, loadGame, parseSave, saveGame, serialiseSave } from "./persistence";

type Speed = 1 | 4 | 12;

interface GameStore {
  game: GameState;
  hydrated: boolean;
  speed: Speed;
  lastWallClock: number;
  offlineSeconds: number;
  notice: string | null;
  hydrate: () => Promise<void>;
  pulse: (now: number) => void;
  reconcile: (now: number) => void;
  persist: () => Promise<void>;
  setSpeed: (speed: Speed) => void;
  assign: (sessionId: number, ticketId: string, modelId: string, improveBrief: boolean) => void;
  review: (reviewId: string, decision: ReviewDecision) => void;
  compact: (sessionId: number) => void;
  purchase: (upgradeId: string) => void;
  dismissNotice: () => void;
  exportSave: () => string;
  importSave: (serialised: string) => Promise<void>;
  restart: () => Promise<void>;
}

function messageFrom(error: unknown) {
  if (error instanceof GameRuleError || error instanceof Error) return error.message;
  return "The command could not be completed.";
}

export const useGameStore = create<GameStore>((set, get) => {
  const commit = (command: (state: GameState) => GameState) => {
    try {
      const next = command(get().game);
      set({ game: next, notice: null });
      void saveGame(next);
    } catch (error) {
      set({ notice: messageFrom(error) });
    }
  };

  return {
    game: createInitialState(),
    hydrated: false,
    speed: 1,
    lastWallClock: Date.now(),
    offlineSeconds: 0,
    notice: null,
    hydrate: async () => {
      const now = Date.now();
      const saved = await loadGame();
      if (!saved) {
        set({ hydrated: true, lastWallClock: now });
        return;
      }
      const elapsed = Math.min(BALANCE.offlineCapSeconds, Math.max(0, (now - saved.savedAt) / 1000));
      set({
        game: advanceGame(saved.game, elapsed),
        hydrated: true,
        lastWallClock: now,
        offlineSeconds: elapsed >= 5 ? elapsed : 0,
      });
    },
    pulse: (now) => {
      const store = get();
      if (!store.hydrated || document.hidden) return;
      const elapsed = Math.min(1, Math.max(0, (now - store.lastWallClock) / 1000));
      set({ game: advanceGame(store.game, elapsed * store.speed), lastWallClock: now });
    },
    reconcile: (now) => {
      const store = get();
      const elapsed = Math.min(BALANCE.offlineCapSeconds, Math.max(0, (now - store.lastWallClock) / 1000));
      const next = advanceGame(store.game, elapsed);
      set({ game: next, lastWallClock: now, offlineSeconds: elapsed >= 5 ? elapsed : 0 });
      void saveGame(next, now);
    },
    persist: async () => saveGame(get().game),
    setSpeed: (speed) => set({ speed }),
    assign: (sessionId, ticketId, modelId, improveBrief) => commit((state) => startTicket(state, sessionId, ticketId, modelId, improveBrief)),
    review: (reviewId, decision) => commit((state) => reviewTicket(state, reviewId, decision)),
    compact: (sessionId) => commit((state) => compactSession(state, sessionId)),
    purchase: (upgradeId) => commit((state) => buyUpgrade(state, upgradeId)),
    dismissNotice: () => set({ notice: null, offlineSeconds: 0 }),
    exportSave: () => serialiseSave(get().game, Date.now()),
    importSave: async (serialised) => {
      try {
        const envelope = parseSave(serialised);
        set({ game: envelope.game, lastWallClock: Date.now(), notice: "Save imported." });
        await saveGame(envelope.game);
      } catch (error) {
        set({ notice: messageFrom(error) });
      }
    },
    restart: async () => {
      await clearSave();
      const game = createInitialState();
      set({ game, lastWallClock: Date.now(), offlineSeconds: 0, notice: null, speed: 1 });
      await saveGame(game);
    },
  };
});
