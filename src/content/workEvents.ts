export const WORK_EVENTS = {
  thirdSession: "Three workstreams and split panes are ready. Use `pane split quota` to watch a pool beside your agent, or `watch agents` for live work. Workspace Isolation protects concurrent branches.",
  legacyLow: "Legacy low reasoning adds review risk with the same work and drain as medium. Choose medium for future assignments.",
  high: "High reasoning spent 4 extra quota for a lower review risk.",
} as const;

export function revisionCostReceipt(quote: {
  finding: string; seconds: number; setupQuota: number; providerId: string; quotaRate: number; contextGain: number;
}) {
  return `${quote.finding}. ${Math.round(quote.seconds * 100) / 100} work-seconds, ${quote.setupQuota} upfront quota from ${quote.providerId}; ongoing model drain ${quote.quotaRate} quota/work-second, +${quote.contextGain} context before work decay.`;
}

export function cacheScopeScoreDetail(scope: { total: number; freshness: number; speedup: number; delivered: number }) {
  return `Cache commitment within its existing ${scope.total} points: ${scope.freshness} freshness + ${scope.speedup} speedup = ${scope.delivered}/${scope.total}; optional PERF-205 restores only deferred speedup credit once, independently of capped trust.`;
}
