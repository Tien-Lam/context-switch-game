export type SessionStatus = "idle" | "working" | "quota-paused" | "awaiting-review";
export type ReviewDecision = "approve" | "revise" | "escalate";

export interface SessionState {
  id: number;
  status: SessionStatus;
  ticketId: string | null;
  modelId: string | null;
  progress: number;
  context: number;
  briefImproved: boolean;
  reviewRound: number;
}

export interface ReviewState {
  id: string;
  ticketId: string;
  sessionId: number;
  risk: number;
  createdAt: number;
}

export interface GameEvent {
  id: string;
  at: number;
  tone: "info" | "good" | "warning" | "bad";
  title: string;
  message: string;
}

export interface GameStats {
  shipped: number;
  revisions: number;
  escalations: number;
  defects: number;
  quotaSpent: number;
  reviewAttentionSpent: number;
}

export interface EndingState {
  title: string;
  message: string;
  scores: {
    throughput: number;
    reliability: number;
    trust: number;
    debt: number;
  };
}

export interface GameState {
  schemaVersion: 1;
  gameTime: number;
  attention: number;
  trust: number;
  peakTrust: number;
  repoHealth: number;
  debt: number;
  providerQuota: Record<string, number>;
  sessions: SessionState[];
  unlockedSessions: number;
  completedTicketIds: string[];
  purchasedUpgradeIds: string[];
  reviews: ReviewState[];
  flags: {
    cacheShortcut: boolean;
    privacyDefaultedOn: boolean;
    raceAccepted: boolean;
    incidentAnnounced: boolean;
  };
  stats: GameStats;
  events: GameEvent[];
  ending: EndingState | null;
}
