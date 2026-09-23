import Dexie, { type EntityTable } from "dexie";
import { z } from "zod";
import { content, modelById, ticketById, upgradeById } from "../content";
import type { GameState } from "../game/types";

export const SAVE_VERSION = 6;
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
let saveQueue: Promise<void> = Promise.resolve();

const finiteNumber = z.number().finite();
const boundedPercent = finiteNumber.min(0).max(100);
const SessionSchema = z.object({
  id: z.number().int().nonnegative(),
  status: z.enum(["idle", "working", "quota-paused", "awaiting-review"]),
  ticketId: z.string().nullable(),
  modelId: z.string().nullable(),
  progress: finiteNumber.min(0).max(1),
  context: boundedPercent,
  briefImproved: z.boolean(),
  reviewRound: z.number().int().nonnegative(),
  workedInParallel: z.boolean().default(false),
  reasoning: z.enum(["low", "medium", "high"]),
});
const ReviewSchema = z.object({
  id: z.string().min(1),
  ticketId: z.string().min(1),
  sessionId: z.number().int().nonnegative(),
  risk: finiteNumber.min(0).max(1),
  createdAt: finiteNumber.nonnegative(),
});
const EventSchema = z.object({
  id: z.string().min(1),
  at: finiteNumber.nonnegative(),
  providerId: z.string().optional(),
  sessionId: z.number().int().nonnegative().optional(),
  tone: z.enum(["info", "good", "warning", "bad"]),
  title: z.string(),
  message: z.string(),
});
const ScoresSchema = z.object({
  throughput: boundedPercent,
  reliability: boundedPercent,
  trust: boundedPercent,
  debt: boundedPercent,
});
const EndingSchema = z.object({
  title: z.string(),
  message: z.string(),
  scores: ScoresSchema,
});
const GameStateSchema = z.object({
  schemaVersion: z.literal(1),
  gameTime: finiteNumber.nonnegative(),
  trust: boundedPercent,
  peakTrust: boundedPercent,
  repoHealth: boundedPercent,
  debt: boundedPercent,
  providerQuota: z.record(z.string(), finiteNumber.nonnegative()),
  sessions: z.array(SessionSchema).length(3),
  unlockedSessions: z.number().int().min(1).max(3),
  completedTicketIds: z.array(z.string()),
  purchasedUpgradeIds: z.array(z.string()),
  reviews: z.array(ReviewSchema),
  flags: z.object({
    cacheShortcut: z.boolean(),
    privacyDefaultedOn: z.boolean(),
    runtimeDriftAccepted: z.boolean(),
    raceAccepted: z.boolean(),
    incidentAnnounced: z.boolean(),
    privacyConsequenceApplied: z.boolean(),
    runtimeConsequenceApplied: z.boolean(),
    raceConsequenceApplied: z.boolean(),
  }),
  stats: z.object({
    shipped: finiteNumber.nonnegative(),
    revisions: finiteNumber.nonnegative(),
    escalations: finiteNumber.nonnegative(),
    defects: finiteNumber.nonnegative(),
    quotaSpent: finiteNumber.nonnegative(),
    activeSeconds: finiteNumber.nonnegative(),
  }),
  events: z.array(EventSchema),
  ending: EndingSchema.nullable(),
});

function getDatabase() {
  if (!database) {
    database = new Dexie("context-switch") as Dexie & { saves: EntityTable<SaveRecord, "id"> };
    database.version(1).stores({ saves: "id,savedAt" });
  }
  return database;
}

function validateReferences(game: GameState) {
  const sessionIds = new Set(game.sessions.map((session) => session.id));
  if (sessionIds.size !== game.sessions.length || game.sessions.some((session, index) => session.id !== index)) {
    throw new Error("Invalid session layout.");
  }
  if (new Set(game.completedTicketIds).size !== game.completedTicketIds.length
    || game.completedTicketIds.some((id) => !ticketById.has(id))) {
    throw new Error("Invalid completed ticket list.");
  }
  if (new Set(game.purchasedUpgradeIds).size !== game.purchasedUpgradeIds.length
    || game.purchasedUpgradeIds.some((id) => !upgradeById.has(id))) {
    throw new Error("Invalid purchased upgrade list.");
  }
  for (const provider of content.providers) {
    if (!Object.hasOwn(game.providerQuota, provider.id)) throw new Error("Missing provider quota.");
  }
  for (const session of game.sessions) {
    if (session.ticketId !== null && !ticketById.has(session.ticketId)) throw new Error("Unknown active ticket.");
    if (session.modelId !== null && !modelById.has(session.modelId)) throw new Error("Unknown active model.");
    if (session.status === "idle" && (session.ticketId !== null || session.modelId !== null)) {
      throw new Error("Invalid idle session.");
    }
    if (session.status !== "idle" && (session.ticketId === null || session.modelId === null)) {
      throw new Error("Invalid active session.");
    }
  }
  const reviewIds = new Set<string>();
  const reviewSessions = new Set<number>();
  for (const review of game.reviews) {
    const session = game.sessions[review.sessionId];
    if (reviewIds.has(review.id) || reviewSessions.has(review.sessionId) || !ticketById.has(review.ticketId)
      || !session || session.status !== "awaiting-review" || session.ticketId !== review.ticketId) {
      throw new Error("Invalid review queue.");
    }
    reviewIds.add(review.id);
    reviewSessions.add(review.sessionId);
  }
  if (game.sessions.some((session) => session.status === "awaiting-review" && !reviewSessions.has(session.id))) {
    throw new Error("Missing review for awaiting session.");
  }
}

function migrateEnvelope(value: unknown): SaveEnvelope {
  if (!value || typeof value !== "object") throw new Error("Invalid save envelope.");
  const candidate = value as { version?: unknown; savedAt?: unknown; game?: unknown };
  let version = candidate.version;
  let game = candidate.game;

  // Version 1 used the same game schema but still carried the retired player-energy
  // fields and predates per-session parallel-work tracking. Preserve known overlap for
  // active legacy sessions; schema parsing below strips the retired fields.
  if (version === 1) {
    if (game && typeof game === "object") {
      const legacy = game as Record<string, unknown>;
      if (Array.isArray(legacy.sessions)) {
        const activeCount = legacy.sessions.filter((value) => {
          if (!value || typeof value !== "object") return false;
          const status = (value as Record<string, unknown>).status;
          return status === "working" || status === "quota-paused";
        }).length;
        game = {
          ...legacy,
          sessions: legacy.sessions.map((value) => value && typeof value === "object"
            ? {
              ...(value as Record<string, unknown>),
              workedInParallel: typeof (value as Record<string, unknown>).workedInParallel === "boolean"
                ? (value as Record<string, unknown>).workedInParallel
                : activeCount > 1,
            }
            : value),
        };
      }
    }
    version = 2;
  }

  if (version === 2) {
    if (game && typeof game === "object") {
      const previous = game as Record<string, unknown>;
      const flags = previous.flags && typeof previous.flags === "object"
        ? previous.flags as Record<string, unknown>
        : {};
      game = {
        ...previous,
        flags: {
          ...flags,
          runtimeDriftAccepted: typeof flags.runtimeDriftAccepted === "boolean" ? flags.runtimeDriftAccepted : false,
        },
      };
    }
    version = 3;
  }

  if (version === 3) {
    if (game && typeof game === "object") {
      const previous = game as Record<string, unknown>;
      const stats = previous.stats && typeof previous.stats === "object"
        ? previous.stats as Record<string, unknown>
        : {};
      game = {
        ...previous,
        stats: {
          ...stats,
          activeSeconds: typeof stats.activeSeconds === "number" ? stats.activeSeconds : 0,
        },
      };
    }
    version = 4;
  }
  if (version === 4) {
    if (game && typeof game === "object") {
      const previous = game as Record<string, unknown>;
      const flags = previous.flags && typeof previous.flags === "object"
        ? previous.flags as Record<string, unknown>
        : {};
      const complete = Array.isArray(previous.completedTicketIds) ? previous.completedTicketIds : [];
      game = {
        ...previous,
        flags: {
          ...flags,
          privacyConsequenceApplied: flags.privacyConsequenceApplied === true || (flags.privacyDefaultedOn === true && complete.includes("quota-display")),
          runtimeConsequenceApplied: flags.runtimeConsequenceApplied === true || (flags.runtimeDriftAccepted === true && complete.includes("parallel-reports")),
          raceConsequenceApplied: flags.raceConsequenceApplied === true || (flags.raceAccepted === true && complete.includes("stale-customer-data")),
        },
      };
    }
    version = 5;
  }
  if (version === 5) {
    if (game && typeof game === "object") {
      const previous = game as Record<string, unknown>;
      if (Array.isArray(previous.sessions)) {
        game = {
          ...previous,
          sessions: previous.sessions.map((value) => value && typeof value === "object"
            ? { ...(value as Record<string, unknown>), reasoning: "medium" }
            : value),
        };
      }
    }
    version = 6;
  }
  if (version !== SAVE_VERSION || typeof candidate.savedAt !== "number" || !Number.isFinite(candidate.savedAt)) {
    throw new Error("Invalid save envelope.");
  }

  const parsedGame = GameStateSchema.parse(game) as GameState;
  validateReferences(parsedGame);
  return { version: SAVE_VERSION, savedAt: candidate.savedAt, game: parsedGame };
}

export function parseSave(serialised: string): SaveEnvelope {
  try {
    return migrateEnvelope(JSON.parse(serialised));
  } catch {
    throw new Error("Unsupported or invalid Context Switch save.");
  }
}

export function serialiseSave(game: GameState, savedAt: number): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt, game } satisfies SaveEnvelope, null, 2);
}

export function saveGame(game: GameState, savedAt = Date.now()) {
  const envelope: SaveRecord = { id: SAVE_ID, version: SAVE_VERSION, savedAt, game };
  try {
    // Keep the latest snapshot available even if the tab closes before IndexedDB finishes.
    localStorage.setItem(EMERGENCY_KEY, serialiseSave(game, savedAt));
  } catch {
    // IndexedDB remains the second persistence path.
  }
  const operation = saveQueue.then(async () => { await getDatabase().saves.put(envelope); });
  saveQueue = operation.catch(() => {});
  return operation;
}

export async function loadGame(): Promise<SaveEnvelope | null> {
  let databaseSave: SaveEnvelope | null = null;
  try {
    const record = await getDatabase().saves.get(SAVE_ID);
    if (record) databaseSave = migrateEnvelope(record);
  } catch {
    // The local-storage snapshot is intentionally the recovery path.
  }
  const emergency = localStorage.getItem(EMERGENCY_KEY);
  if (!emergency) return databaseSave;
  try {
    return newestSave(databaseSave, parseSave(emergency));
  } catch {
    return databaseSave;
  }
}

export function newestSave(first: SaveEnvelope | null, second: SaveEnvelope | null): SaveEnvelope | null {
  if (!first) return second;
  if (!second) return first;
  return second.savedAt > first.savedAt ? second : first;
}

export async function clearSave() {
  await saveQueue;
  try {
    await getDatabase().saves.delete(SAVE_ID);
  } finally {
    localStorage.removeItem(EMERGENCY_KEY);
  }
}
