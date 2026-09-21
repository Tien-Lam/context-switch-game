import { content } from "../content";
import type { GameState, SessionState } from "./types";

function createSession(id: number): SessionState {
  return {
    id,
    status: "idle",
    ticketId: null,
    modelId: null,
    progress: 0,
    context: 100,
    briefImproved: false,
    reviewRound: 0,
    workedInParallel: false,
  };
}

export function createInitialState(): GameState {
  return {
    schemaVersion: 1,
    gameTime: 0,
    trust: 30,
    peakTrust: 30,
    repoHealth: 82,
    debt: 4,
    providerQuota: Object.fromEntries(content.providers.map((provider) => [provider.id, provider.maxQuota])),
    sessions: [createSession(0), createSession(1), createSession(2)],
    unlockedSessions: 1,
    completedTicketIds: [],
    purchasedUpgradeIds: [],
    reviews: [],
    flags: {
      cacheShortcut: false,
      privacyDefaultedOn: false,
      runtimeDriftAccepted: false,
      raceAccepted: false,
      incidentAnnounced: false,
    },
    stats: {
      shipped: 0,
      revisions: 0,
      escalations: 0,
      defects: 0,
      quotaSpent: 0,
      activeSeconds: 0,
    },
    events: [
      {
        id: "welcome",
        at: 0,
        tone: "info",
        title: "09:03 · Monday",
        message: "Anthill Code and OpenMind Forge are installed. You have two CLIs, two quota pools, and one orchestration slot.",
      },
    ],
    ending: null,
  };
}
