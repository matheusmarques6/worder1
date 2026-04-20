// =============================================
// RFM (Recency, Frequency, Monetary) Service
// Module F: Contact segmentation
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from './logger'
import type { ContactRFMScore, ServiceResult } from './types'

const LOG_PREFIX = 'RFMService'

// RFM Segments based on score combinations
export const RFM_SEGMENTS: Record<string, { label: string; color: string; minR: number; maxR: number; minF: number; maxF: number; minM: number; maxM: number }> = {
  champions: { label: 'Campeoes', color: '#22c55e', minR: 4, maxR: 5, minF: 4, maxF: 5, minM: 4, maxM: 5 },
  loyal: { label: 'Leais', color: '#3b82f6', minR: 2, maxR: 5, minF: 3, maxF: 5, minM: 3, maxM: 5 },
  potential_loyal: { label: 'Potencial Leal', color: '#8b5cf6', minR: 3, maxR: 5, minF: 1, maxF: 3, minM: 1, maxM: 5 },
  recent: { label: 'Recentes', color: '#06b6d4', minR: 4, maxR: 5, minF: 1, maxF: 1, minM: 1, maxM: 5 },
  promising: { label: 'Promissores', color: '#f59e0b', minR: 3, maxR: 4, minF: 1, maxF: 1, minM: 1, maxM: 5 },
  needs_attention: { label: 'Precisa Atencao', color: '#f97316', minR: 2, maxR: 3, minF: 2, maxF: 3, minM: 2, maxM: 3 },
  about_to_sleep: { label: 'Quase Dormindo', color: '#ef4444', minR: 2, maxR: 3, minF: 1, maxF: 2, minM: 1, maxM: 2 },
  at_risk: { label: 'Em Risco', color: '#dc2626', minR: 1, maxR: 2, minF: 2, maxF: 5, minM: 2, maxM: 5 },
  hibernating: { label: 'Hibernando', color: '#6b7280', minR: 1, maxR: 2, minF: 1, maxF: 2, minM: 1, maxM: 2 },
  lost: { label: 'Perdidos', color: '#374151', minR: 1, maxR: 1, minF: 1, maxF: 1, minM: 1, maxM: 5 },
}

export function classifyRFMSegment(r: number, f: number, m: number): string {
  // Check from most specific to least
  if (r >= 4 && f >= 4 && m >= 4) return 'champions'
  if (f >= 3 && m >= 3) return 'loyal'
  if (r >= 4 && f <= 1) return 'recent'
  if (r >= 3 && f <= 1) return 'promising'
  if (r >= 3 && r <= 4 && f >= 1 && f <= 3) return 'potential_loyal'
  if (r >= 2 && r <= 3 && f >= 2 && f <= 3) return 'needs_attention'
  if (r >= 2 && r <= 3 && f <= 2) return 'about_to_sleep'
  if (r <= 2 && f >= 2) return 'at_risk'
  if (r <= 2 && f <= 2 && m <= 2) return 'hibernating'
  return 'lost'
}

// =============================================
// CALCULATE RFM FOR ALL CONTACTS
// =============================================

export async function calculateRFM(
  organizationId: string,
  storeId?: string
): Promise<ServiceResult<{ processed: number }>> {
  try {
    // Get all contacts with order data
    let query = supabaseAdmin
      .from('contacts')
      .select('id, shopify_customer_id')
      .eq('organization_id', organizationId)

    if (storeId) query = query.eq('store_id', storeId)

    const { data: contacts } = await query

    if (!contacts || contacts.length === 0) {
      return { data: { processed: 0 } }
    }

    const now = new Date()
    let processed = 0

    // Get order stats for contacts (from shopify_orders or similar)
    for (const contact of contacts) {
      const { data: orders } = await supabaseAdmin
        .from('shopify_orders')
        .select('total_price, created_at')
        .eq('organization_id', organizationId)
        .eq('customer_id', contact.shopify_customer_id || contact.id)
        .order('created_at', { ascending: false })

      if (!orders || orders.length === 0) continue

      const totalOrders = orders.length
      const totalSpent = orders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0)
      const avgOrderValue = totalSpent / totalOrders
      const lastOrderDate = new Date(orders[0].created_at)
      const daysSinceLastOrder = Math.floor(
        (now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Calculate quintile scores (1-5)
      const recencyScore = daysSinceLastOrder <= 30 ? 5
        : daysSinceLastOrder <= 60 ? 4
        : daysSinceLastOrder <= 90 ? 3
        : daysSinceLastOrder <= 180 ? 2
        : 1

      const frequencyScore = totalOrders >= 10 ? 5
        : totalOrders >= 5 ? 4
        : totalOrders >= 3 ? 3
        : totalOrders >= 2 ? 2
        : 1

      const monetaryScore = totalSpent >= 1000 ? 5
        : totalSpent >= 500 ? 4
        : totalSpent >= 200 ? 3
        : totalSpent >= 100 ? 2
        : 1

      const segment = classifyRFMSegment(recencyScore, frequencyScore, monetaryScore)

      // Upsert RFM score
      await supabaseAdmin
        .from('contact_rfm_scores')
        .upsert(
          {
            organization_id: organizationId,
            store_id: storeId,
            contact_id: contact.id,
            recency_score: recencyScore,
            frequency_score: frequencyScore,
            monetary_score: monetaryScore,
            rfm_segment: segment,
            total_orders: totalOrders,
            total_spent: totalSpent,
            avg_order_value: avgOrderValue,
            last_order_at: orders[0].created_at,
            days_since_last_order: daysSinceLastOrder,
            calculated_at: now.toISOString(),
          },
          { onConflict: 'organization_id,contact_id' }
        )

      processed++
    }

    logger.info(LOG_PREFIX, `RFM calculated for ${processed} contacts`)
    return { data: { processed } }
  } catch (err) {
    logger.error(LOG_PREFIX, 'RFM calculation failed', err)
    return { error: 'RFM calculation failed' }
  }
}

// =============================================
// GET RFM DISTRIBUTION
// =============================================

export async function getRFMDistribution(
  organizationId: string,
  storeId?: string
): Promise<ServiceResult<Record<string, number>>> {
  let query = supabaseAdmin
    .from('contact_rfm_scores')
    .select('rfm_segment')
    .eq('organization_id', organizationId)

  if (storeId) query = query.eq('store_id', storeId)

  const { data, error } = await query

  if (error) {
    return { error: error.message }
  }

  const distribution: Record<string, number> = {}
  for (const row of data || []) {
    distribution[row.rfm_segment] = (distribution[row.rfm_segment] || 0) + 1
  }

  return { data: distribution }
}

// =============================================
// GET CONTACTS BY SEGMENT
// =============================================

export async function getContactsBySegment(
  organizationId: string,
  segment: string,
  storeId?: string,
  limit = 50,
  offset = 0
): Promise<ServiceResult<{ contacts: ContactRFMScore[]; total: number }>> {
  let query = supabaseAdmin
    .from('contact_rfm_scores')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .eq('rfm_segment', segment)
    .order('total_spent', { ascending: false })
    .range(offset, offset + limit - 1)

  if (storeId) query = query.eq('store_id', storeId)

  const { data, error, count } = await query

  if (error) {
    return { error: error.message }
  }

  return { data: { contacts: data || [], total: count || 0 } }
}
