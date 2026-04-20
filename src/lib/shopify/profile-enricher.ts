// =============================================
// CDP Profile Enricher
// src/lib/shopify/profile-enricher.ts
//
// Recalculates contact metrics after order events:
// - total_orders, total_spent, average_order_value
// - first_order_at, last_order_at, days_since_last_order
// - RFM scores
// - Lifecycle stage transitions
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { calculateLifecycleStage, calculateChurnRisk } from './lifecycle-stages';

// =============================================
// MAIN ENRICHMENT FUNCTION
// =============================================

/**
 * Recalculate all metrics for a contact after an order event.
 * Call this after placed_order, fulfilled_order, cancelled_order, refunded_order.
 */
export async function enrichContactAfterOrder(
  contactId: string,
  storeId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  try {
    // Get all orders for this contact's store
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, email, organization_id')
      .eq('id', contactId)
      .single();

    if (!contact?.email) return;

    // Fetch all paid orders
    const { data: orders } = await supabase
      .from('shopify_orders')
      .select('total_price, created_at, financial_status')
      .eq('store_id', storeId)
      .ilike('email', contact.email)
      .order('created_at', { ascending: true });

    if (!orders?.length) return;

    // Filter to paid orders
    const paidStatuses = ['paid', 'partially_paid', 'refunded', 'partially_refunded'];
    const paidOrders = orders.filter((o) => paidStatuses.includes(o.financial_status || ''));

    const totalOrders = paidOrders.length;
    const totalSpent = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

    const firstOrderAt = orders[0]?.created_at || null;
    const lastOrderAt = orders[orders.length - 1]?.created_at || null;
    const daysSinceLastOrder = lastOrderAt
      ? Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;

    // Calculate order frequency (average days between orders)
    let orderFrequencyDays: number | null = null;
    if (orders.length >= 2) {
      const first = new Date(orders[0].created_at).getTime();
      const last = new Date(orders[orders.length - 1].created_at).getTime();
      const daysBetween = (last - first) / (24 * 60 * 60 * 1000);
      orderFrequencyDays = Math.round(daysBetween / (orders.length - 1));
    }

    // Calculate RFM scores
    const rfm = calculateRFMScores(daysSinceLastOrder, totalOrders, totalSpent);

    // Calculate lifecycle stage
    const lifecycleStage = calculateLifecycleStage({
      totalOrders,
      daysSinceLastOrder,
      orderFrequencyDays,
      totalSpent,
    });

    // Calculate churn risk
    const churnRisk = calculateChurnRisk({
      daysSinceLastOrder,
      orderFrequencyDays,
      totalOrders,
    });

    // Update contact
    await supabase
      .from('contacts')
      .update({
        total_orders: totalOrders,
        total_spent: totalSpent,
        average_order_value: avgOrderValue,
        first_order_at: firstOrderAt,
        last_order_at: lastOrderAt,
        days_since_last_order: daysSinceLastOrder,
        rfm_recency: rfm.recency,
        rfm_frequency: rfm.frequency,
        rfm_monetary: rfm.monetary,
        lifecycle_stage: lifecycleStage,
        churn_risk: churnRisk,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    console.log(
      `[ProfileEnricher] Contact ${contactId}: orders=${totalOrders}, spent=${totalSpent.toFixed(2)}, stage=${lifecycleStage}, churn=${churnRisk.toFixed(2)}`
    );
  } catch (error) {
    console.error(`[ProfileEnricher] Failed to enrich contact ${contactId}:`, error);
  }
}

// =============================================
// RFM SCORING
// =============================================

interface RFMScores {
  recency: number;    // 1-5 (5 = recent)
  frequency: number;  // 1-5 (5 = frequent)
  monetary: number;   // 1-5 (5 = high value)
}

function calculateRFMScores(
  daysSinceLastOrder: number | null,
  totalOrders: number,
  totalSpent: number
): RFMScores {
  // Recency: days since last order → 1-5 score
  let recency = 1;
  if (daysSinceLastOrder === null) {
    recency = 1;
  } else if (daysSinceLastOrder <= 7) {
    recency = 5;
  } else if (daysSinceLastOrder <= 30) {
    recency = 4;
  } else if (daysSinceLastOrder <= 60) {
    recency = 3;
  } else if (daysSinceLastOrder <= 120) {
    recency = 2;
  }

  // Frequency: number of orders → 1-5 score
  let frequency = 1;
  if (totalOrders >= 10) {
    frequency = 5;
  } else if (totalOrders >= 5) {
    frequency = 4;
  } else if (totalOrders >= 3) {
    frequency = 3;
  } else if (totalOrders >= 2) {
    frequency = 2;
  }

  // Monetary: total spent → 1-5 score
  let monetary = 1;
  if (totalSpent >= 5000) {
    monetary = 5;
  } else if (totalSpent >= 2000) {
    monetary = 4;
  } else if (totalSpent >= 500) {
    monetary = 3;
  } else if (totalSpent >= 100) {
    monetary = 2;
  }

  return { recency, frequency, monetary };
}
