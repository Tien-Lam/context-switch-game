export const BALANCE = {
  attentionMax: 100,
  attentionRegenPerSecond: 1.25,
  improvedBriefCost: 6,
  compactAttentionCost: 4,
  contextDecayPerWorkSecond: 5,
  rushedReviewDebtPerPoint: 0.8,
  rushedReviewRiskPerPoint: 0.02,
  offlineCapSeconds: 8 * 60 * 60,
  reviewCosts: {
    approve: 6,
    revise: 10,
    escalate: 14,
  },
  secondSessionAfter: 1,
  thirdSessionAfter: 3,
  maxEvents: 36,
} as const;
