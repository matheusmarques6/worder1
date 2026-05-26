// Meta WhatsApp Business Platform pricing for Brazil (BRL)
// Updated: May 2026 — https://developers.facebook.com/docs/whatsapp/pricing
// Prices are per conversation (24h window), not per message.

export type PricingCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export const BRAZIL_PRICING: Record<PricingCategory, number> = {
  marketing: 0.0625,
  utility: 0.008,
  authentication: 0.0315,
  service: 0.0,
};

// For reference: USD equivalents (approximate)
export const BRAZIL_PRICING_USD: Record<PricingCategory, number> = {
  marketing: 0.0625,
  utility: 0.008,
  authentication: 0.0315,
  service: 0.0,
};

export function calculateMessageCost(category: PricingCategory, count: number): number {
  const unitPrice = BRAZIL_PRICING[category];
  if (unitPrice === undefined) {
    throw new Error(`Unknown pricing category: ${category}`);
  }
  return Math.round(unitPrice * count * 10000) / 10000;
}

export interface MessageWithCategory {
  pricing_category: PricingCategory;
  count?: number;
}

export interface MonthlyEstimate {
  total: number;
  breakdown: Record<PricingCategory, { count: number; cost: number }>;
  free_tier_conversations: number;
  billable_conversations: number;
}

// Meta gives 1,000 free service conversations per month per WABA
const FREE_SERVICE_CONVERSATIONS = 1000;

export function estimateMonthlySpend(messages: MessageWithCategory[]): MonthlyEstimate {
  const breakdown: Record<PricingCategory, { count: number; cost: number }> = {
    marketing: { count: 0, cost: 0 },
    utility: { count: 0, cost: 0 },
    authentication: { count: 0, cost: 0 },
    service: { count: 0, cost: 0 },
  };

  for (const msg of messages) {
    const cat = msg.pricing_category;
    const count = msg.count || 1;

    if (!BRAZIL_PRICING[cat] && BRAZIL_PRICING[cat] !== 0) {
      continue;
    }

    breakdown[cat].count += count;
    breakdown[cat].cost += calculateMessageCost(cat, count);
  }

  // Apply free tier to service conversations
  const serviceConversations = breakdown.service.count;
  const freeApplied = Math.min(serviceConversations, FREE_SERVICE_CONVERSATIONS);
  const billableService = Math.max(0, serviceConversations - FREE_SERVICE_CONVERSATIONS);
  breakdown.service.cost = calculateMessageCost('service', billableService);

  const totalConversations = Object.values(breakdown).reduce((sum, b) => sum + b.count, 0);
  const total = Object.values(breakdown).reduce((sum, b) => sum + b.cost, 0);

  return {
    total: Math.round(total * 10000) / 10000,
    breakdown,
    free_tier_conversations: freeApplied,
    billable_conversations: totalConversations - freeApplied,
  };
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}
