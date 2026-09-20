export const BALANCE = {
  attentionMax: 100,
  attentionRegenPerSecond: 0.035,
  improvedBriefCost: 8,
  compactAttentionCost: 5,
  offlineCapSeconds: 8 * 60 * 60,
  reviewCosts: {
    approve: 7,
    revise: 12,
    escalate: 18,
  },
  secondSessionAfter: 2,
  thirdSessionAfter: 5,
  maxEvents: 36,
} as const;
