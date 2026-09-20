import Dexie, { type EntityTable } from "dexie";
import type { GameState } from "../game/types";

export const SAVE_VERSION = 1;
const SAVE_ID = "active";
const EMERGENCY_KEY = "context-switch-emergency-save";

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  game: GameState;
}

interface SaveRecord extends SaveEnvelope {
  id: string;
}

let database: (Dexie & { saves: EntityTable<SaveRecord, "id"> }) | null = null;

function getDatabase() {
  if (!database) {
    database = new Dexie("context-switch") as Dexie & { saves: EntityTable<SaveRecord, "id"> };
    database.version(1).stores({ saves: "id,savedAt" });
  }
  return database;
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  return candidate.schemaVersion === 1
    && typeof candidate.gameTime === "number"
    && Array.isArray(candidate.sessions)
    && Array.isArray(candidate.completedTicketIds)
    && Array.isArray(candidate.reviews)
    && Boolean(candidate.providerQuota);
}

function normaliseGameState(game: GameState): GameState {
  const legacy = game as GameState & {
    attention?: number;
    stats: GameState["stats"] & { reviewAttentionSpent?: number };
  };
  const { attention, ...withoutAttention } = legacy;
  const { reviewAttentionSpent, ...stats } = withoutAttention.stats;
  void attention;
  void reviewAttentionSpent;
  return { ...withoutAttention, stats };
}

export function parseSave(serialised: string): SaveEnvelope {
  const parsed = JSON.parse(serialised) as Partial<SaveEnvelope>;
  if (parsed.version !== SAVE_VERSION || typeof parsed.savedAt !== "number" || !isGameState(parsed.game)) {
    throw new Error("Unsupported or invalid Context Switch save.");
  }
  return { ...parsed, game: normaliseGameState(parsed.game) } as SaveEnvelope;
}

export function serialiseSave(game: GameState, savedAt: number): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt, game } satisfies SaveEnvelope, null, 2);
}

export async function saveGame(game: GameState, savedAt = Date.now()) {
  const envelope: SaveRecord = { id: SAVE_ID, version: SAVE_VERSION, savedAt, game };
  try {
    await getDatabase().saves.put(envelope);
  } finally {
    localStorage.setItem(EMERGENCY_KEY, serialiseSave(game, savedAt));
  }
}

export async function loadGame(): Promise<SaveEnvelope | null> {
  try {
    const record = await getDatabase().saves.get(SAVE_ID);
    if (record && isGameState(record.game)) return { ...record, game: normaliseGameState(record.game) };
  } catch {
    // The local-storage snapshot is intentionally the recovery path.
  }
  const emergency = localStorage.getItem(EMERGENCY_KEY);
  if (!emergency) return null;
  try {
    return parseSave(emergency);
  } catch {
    return null;
  }
}

export async function clearSave() {
  try {
    await getDatabase().saves.delete(SAVE_ID);
  } finally {
    localStorage.removeItem(EMERGENCY_KEY);
  }
}
