// Meta WhatsApp Business Platform pricing for Brazil (USD per message)
// Updated: May 2026 — https://developers.facebook.com/docs/whatsapp/pricing
// PMP (Per-Message Pricing) model — effective since 2025.

export type PricingCategory = 'marketing' | 'utility' | 'authentication' | 'service';

/** Per-message prices in USD for the Brazil market. */
export const BRAZIL_PRICING: Record<PricingCategory, number> = {
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
  billable_messages: number;
}

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

  // PMP: no free tier — all messages are charged per-message
  const billableMessages = Object.values(breakdown).reduce((sum, b) => sum + b.count, 0);
  const total = Object.values(breakdown).reduce((sum, b) => sum + b.cost, 0);

  return {
    total: Math.round(total * 10000) / 10000,
    breakdown,
    billable_messages: billableMessages,
  };
}

export function formatCurrency(amount: number, currency: string = 'BRL'): string {
  if (currency === 'BRL') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}
