import { models, providers } from "./providers";
import { validateContent } from "./schema";
import { tickets } from "./tickets";
import { upgrades } from "./upgrades";

export const content = validateContent(providers, models, tickets, upgrades);

export const providerById = new Map(content.providers.map((provider) => [provider.id, provider]));
export const modelById = new Map(content.models.map((model) => [model.id, model]));
export const ticketById = new Map(content.tickets.map((ticket) => [ticket.id, ticket]));
export const upgradeById = new Map(content.upgrades.map((upgrade) => [upgrade.id, upgrade]));

export type { ModelDefinition, ProviderDefinition, TicketDefinition, UpgradeDefinition } from "./schema";
