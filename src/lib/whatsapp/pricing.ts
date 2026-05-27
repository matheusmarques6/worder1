// Meta WhatsApp Business Platform pricing
// Updated: May 2026 — https://developers.facebook.com/docs/whatsapp/pricing
//
// IMPORTANT: Meta migrated to Per-Message Pricing (PMP) on 2025-07-01.
// Each message is billed individually. The legacy Conversation-Based
// Pricing (CBP, billed per 24h window) is no longer used.

export type PricingCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export const BRAZIL_PRICING_USD: Record<PricingCategory, number> = {
  marketing:      0.0625,
  utility:        0.0080,
  authentication: 0.0315,
  service:        0.0000,
};

export const USD_TO_BRL_RATE = 5.0;

export const BRAZIL_PRICING_BRL: Record<PricingCategory, number> = {
  marketing:      BRAZIL_PRICING_USD.marketing * USD_TO_BRL_RATE,
  utility:        BRAZIL_PRICING_USD.utility * USD_TO_BRL_RATE,
  authentication: BRAZIL_PRICING_USD.authentication * USD_TO_BRL_RATE,
  service:        BRAZIL_PRICING_USD.service * USD_TO_BRL_RATE,
};

export const BRAZIL_PRICING = BRAZIL_PRICING_USD;

export function calculateMessageCost(
  category: PricingCategory,
  count: number,
  currency: 'USD' | 'BRL' = 'USD'
): number {
  const table = currency === 'BRL' ? BRAZIL_PRICING_BRL : BRAZIL_PRICING_USD;
  const unitPrice = table[category];
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
  currency: 'USD' | 'BRL';
  breakdown: Record<PricingCategory, { count: number; cost: number }>;
  billable_messages: number;
  free_messages: number;
}

export function estimateMonthlySpend(
  messages: MessageWithCategory[],
  currency: 'USD' | 'BRL' = 'USD'
): MonthlyEstimate {
  const breakdown: Record<PricingCategory, { count: number; cost: number }> = {
    marketing:      { count: 0, cost: 0 },
    utility:        { count: 0, cost: 0 },
    authentication: { count: 0, cost: 0 },
    service:        { count: 0, cost: 0 },
  };

  for (const msg of messages) {
    const cat = msg.pricing_category;
    const count = msg.count || 1;
    if (BRAZIL_PRICING_USD[cat] === undefined) continue;
    breakdown[cat].count += count;
    breakdown[cat].cost += calculateMessageCost(cat, count, currency);
  }

  const totalMessages = Object.values(breakdown).reduce((s, b) => s + b.count, 0);
  const freeMessages = breakdown.service.count;
  const total = Object.values(breakdown).reduce((s, b) => s + b.cost, 0);

  return {
    total: Math.round(total * 10000) / 10000,
    currency,
    breakdown,
    billable_messages: totalMessages - freeMessages,
    free_messages: freeMessages,
  };
}

export function formatCurrency(
  amount: number,
  currency: 'USD' | 'BRL' = 'USD'
): string {
  const locale = currency === 'BRL' ? 'pt-BR' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}
