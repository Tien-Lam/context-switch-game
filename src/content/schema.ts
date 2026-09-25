import { z } from "zod";

export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  description: z.string(),
  color: z.string(),
  maxQuota: z.number().positive(),
  regenPerSecond: z.number().positive(),
  unlockAfter: z.number().int().nonnegative(),
});

export const ModelSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  tier: z.enum(["quick", "balanced", "deep"]),
  description: z.string(),
  speed: z.number().positive(),
  quotaRate: z.number().positive(),
  riskModifier: z.number(),
  contextDecay: z.number().nonnegative(),
  unlockTrust: z.number().nonnegative(),
});

export const TicketSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  summary: z.string(),
  brief: z.string(),
  kind: z.enum(["chore", "feature", "platform", "bug", "finale"]),
  duration: z.number().positive(),
  baseRisk: z.number().min(0).max(1),
  rewardTrust: z.number().positive(),
  prerequisites: z.array(z.string()),
  recommendedTier: z.enum(["quick", "balanced", "deep"]),
  files: z.array(z.string()),
  evidence: z.object({
    summary: z.string(),
    tests: z.string(),
    signal: z.string(),
    resolution: z.object({
      summary: z.string().optional(),
      tests: z.string(),
      signal: z.string(),
    }).optional(),
  }),
  riskFlag: z.enum(["cache-shortcut", "privacy-default", "merge-race", "runtime-drift", "test-integrity", "contract-mismatch", "request-loop", "none"]),
  incidentFor: z.enum(["cache-shortcut", "privacy-default", "merge-race", "runtime-drift", "test-integrity", "contract-mismatch", "request-loop"]).optional(),
  blockedByIncident: z.enum(["cache-shortcut", "privacy-default", "merge-race", "runtime-drift", "test-integrity", "contract-mismatch", "request-loop"]).optional(),
});

export const UpgradeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  cost: z.number().positive(),
  unlockAfter: z.number().int().nonnegative(),
  requiresTicketId: z.string().optional(),
  requiresResolvedIncident: z.enum(["cache-shortcut", "privacy-default", "merge-race", "runtime-drift", "test-integrity", "contract-mismatch", "request-loop"]).optional(),
  effect: z.enum(["briefing", "tests", "isolation", "observability", "handoff", "quota", "dashboard"]),
});

export type ProviderDefinition = z.infer<typeof ProviderSchema>;
export type ModelDefinition = z.infer<typeof ModelSchema>;
export type TicketDefinition = z.infer<typeof TicketSchema>;
export type UpgradeDefinition = z.infer<typeof UpgradeSchema>;

export function validateContent(
  providers: ProviderDefinition[],
  models: ModelDefinition[],
  tickets: TicketDefinition[],
  upgrades: UpgradeDefinition[],
) {
  const parsedProviders = z.array(ProviderSchema).parse(providers);
  const parsedModels = z.array(ModelSchema).parse(models);
  const parsedTickets = z.array(TicketSchema).parse(tickets);
  const parsedUpgrades = z.array(UpgradeSchema).parse(upgrades);
  const providerIds = new Set(parsedProviders.map((provider) => provider.id));
  const ticketIds = new Set(parsedTickets.map((ticket) => ticket.id));

  for (const model of parsedModels) {
    if (!providerIds.has(model.providerId)) throw new Error(`Unknown provider ${model.providerId} for ${model.id}`);
  }
  for (const ticket of parsedTickets) {
    for (const prerequisite of ticket.prerequisites) {
      if (!ticketIds.has(prerequisite)) throw new Error(`Unknown prerequisite ${prerequisite} for ${ticket.id}`);
    }
  }
  for (const upgrade of parsedUpgrades) {
    if (upgrade.requiresTicketId && !ticketIds.has(upgrade.requiresTicketId)) {
      throw new Error(`Unknown required ticket ${upgrade.requiresTicketId} for ${upgrade.id}`);
    }
  }

  return { providers: parsedProviders, models: parsedModels, tickets: parsedTickets, upgrades: parsedUpgrades };
}
