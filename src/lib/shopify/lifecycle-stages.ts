// =============================================
// CDP Lifecycle Stages
// src/lib/shopify/lifecycle-stages.ts
//
// Automatic lifecycle stage calculation and
// churn risk scoring for contacts.
// =============================================

// =============================================
// LIFECYCLE STAGES
// =============================================

export type LifecycleStage =
  | 'subscriber'       // Has email, no order
  | 'lead'             // Interacted (viewed product, added to cart) but no order
  | 'customer'         // Made 1 order
  | 'repeat_customer'  // Made 2+ orders
  | 'vip'              // Top-tier: 5+ orders or high CLV
  | 'at_risk'          // Last order > 60 days (for monthly buyers)
  | 'churned';         // Last order > 120 days

export interface LifecycleInput {
  totalOrders: number;
  daysSinceLastOrder: number | null;
  orderFrequencyDays: number | null;
  totalSpent: number;
}

/**
 * Calculate the lifecycle stage for a contact based on their order behavior.
 */
export function calculateLifecycleStage(input: LifecycleInput): LifecycleStage {
  const { totalOrders, daysSinceLastOrder, orderFrequencyDays, totalSpent } = input;

  // No orders at all
  if (totalOrders === 0) {
    return 'subscriber';
  }

  // Check for churn/at-risk first (overrides other stages)
  if (daysSinceLastOrder !== null && totalOrders > 0) {
    // Churned: no order in 120+ days
    if (daysSinceLastOrder >= 120) {
      return 'churned';
    }

    // At risk: no order in 60+ days AND their frequency suggests they should have ordered
    if (daysSinceLastOrder >= 60) {
      // If they used to order frequently (< 45 days between orders), they're at risk
      if (orderFrequencyDays !== null && orderFrequencyDays < 45) {
        return 'at_risk';
      }
      // If they have 3+ orders and haven't ordered in 60 days, at risk
      if (totalOrders >= 3) {
        return 'at_risk';
      }
    }
  }

  // VIP: 5+ orders OR total spent > 3000
  if (totalOrders >= 5 || totalSpent >= 3000) {
    return 'vip';
  }

  // Repeat customer: 2+ orders
  if (totalOrders >= 2) {
    return 'repeat_customer';
  }

  // Customer: 1 order
  return 'customer';
}

// =============================================
// CHURN RISK
// =============================================

export interface ChurnRiskInput {
  daysSinceLastOrder: number | null;
  orderFrequencyDays: number | null;
  totalOrders: number;
}

/**
 * Calculate churn risk score (0.0 = no risk, 1.0 = certain churn).
 *
 * Based on how overdue a customer is relative to their purchase frequency.
 */
export function calculateChurnRisk(input: ChurnRiskInput): number {
  const { daysSinceLastOrder, orderFrequencyDays, totalOrders } = input;

  // No orders → no churn risk (they're a subscriber, not a customer)
  if (totalOrders === 0 || daysSinceLastOrder === null) {
    return 0;
  }

  // Single order: use a default expected frequency of 60 days
  const expectedFrequency = orderFrequencyDays && orderFrequencyDays > 0
    ? orderFrequencyDays
    : 60;

  // How many "expected cycles" have passed since last order
  const overdueFactor = daysSinceLastOrder / expectedFrequency;

  // Convert to 0-1 score using a sigmoid-like curve
  // At 1x expected frequency: ~0.25 risk
  // At 2x expected frequency: ~0.50 risk
  // At 3x expected frequency: ~0.75 risk
  // At 4x+ expected frequency: ~0.90+ risk
  const risk = 1 - 1 / (1 + Math.pow(overdueFactor / 2, 2));

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, Math.round(risk * 10000) / 10000));
}

// =============================================
// BATCH LIFECYCLE RECALCULATION
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Recalculate lifecycle stages for all contacts in an organization.
 * Useful for cron jobs or after bulk imports.
 */
export async function recalculateLifecycleStages(
  organizationId: string
): Promise<{ updated: number; errors: number }> {
  const supabase = getSupabaseAdmin();
  let updated = 0;
  let errors = 0;

  try {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, total_orders, total_spent, first_order_at, last_order_at, days_since_last_order')
      .eq('organization_id', organizationId)
      .not('shopify_customer_id', 'is', null);

    if (!contacts?.length) return { updated: 0, errors: 0 };

    for (const contact of contacts) {
      try {
        const totalOrders = contact.total_orders || 0;
        const totalSpent = parseFloat(contact.total_spent || '0');
        const daysSinceLastOrder = contact.days_since_last_order;

        // Estimate order frequency
        let orderFrequencyDays: number | null = null;
        if (totalOrders >= 2 && contact.first_order_at && contact.last_order_at) {
          const first = new Date(contact.first_order_at).getTime();
          const last = new Date(contact.last_order_at).getTime();
          const daysBetween = (last - first) / (24 * 60 * 60 * 1000);
          orderFrequencyDays = Math.round(daysBetween / (totalOrders - 1));
        }

        const stage = calculateLifecycleStage({
          totalOrders,
          daysSinceLastOrder,
          orderFrequencyDays,
          totalSpent,
        });

        const churnRisk = calculateChurnRisk({
          daysSinceLastOrder,
          orderFrequencyDays,
          totalOrders,
        });

        // Update if changed
        await supabase
          .from('contacts')
          .update({
            lifecycle_stage: stage,
            churn_risk: churnRisk,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contact.id);

        updated++;
      } catch {
        errors++;
      }
    }

    console.log(`[Lifecycle] Recalculated for org ${organizationId}: ${updated} updated, ${errors} errors`);
  } catch (error) {
    console.error('[Lifecycle] Batch recalculation failed:', error);
  }

  return { updated, errors };
}
