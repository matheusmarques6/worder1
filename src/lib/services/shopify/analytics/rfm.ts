// =============================================
// RFM Calculator
// src/lib/services/shopify/analytics/rfm.ts
//
// Calcula scores RFM para segmentação de clientes:
// - Recency: Dias desde última compra
// - Frequency: Número de pedidos
// - Monetary: Valor total gasto
//
// Scores de 1-5 baseados em quartis
// 11 segmentos pré-definidos
// =============================================

import { createClient } from '@supabase/supabase-js';

// =============================================
// TYPES
// =============================================

export interface RFMScore {
  shopify_customer_id: string;
  customer_email: string | null;
  recency_score: number;
  frequency_score: number;
  monetary_score: number;
  days_since_last_order: number;
  total_orders: number;
  total_spent: number;
  average_order_value: number;
  segment: string;
  segment_label: string;
  first_order_date: string | null;
  last_order_date: string | null;
}

export interface RFMResult {
  success: boolean;
  storeId: string;
  organizationId: string;
  customersAnalyzed: number;
  segmentCounts: Record<string, number>;
  calculatedAt: string;
  errors: string[];
}

// =============================================
// SEGMENT DEFINITIONS
// =============================================

export const RFM_SEGMENTS = {
  champion: {
    label: 'Campeões',
    description: 'Compraram recentemente, compram frequentemente e gastam muito',
    color: '#22c55e', // green
    scores: [[5, 5, 5], [5, 5, 4], [5, 4, 5], [4, 5, 5]],
  },
  loyal: {
    label: 'Clientes Leais',
    description: 'Gastam bem e compram com frequência',
    color: '#3b82f6', // blue
    scores: [[5, 4, 4], [4, 4, 5], [4, 5, 4], [4, 4, 4], [3, 5, 5], [3, 4, 5], [3, 5, 4]],
  },
  potential_loyalist: {
    label: 'Potenciais Leais',
    description: 'Clientes recentes com boa frequência',
    color: '#8b5cf6', // purple
    scores: [[5, 3, 3], [5, 3, 4], [5, 4, 3], [4, 3, 4], [4, 3, 3], [4, 4, 3]],
  },
  recent: {
    label: 'Clientes Recentes',
    description: 'Compraram recentemente mas sem histórico',
    color: '#06b6d4', // cyan
    scores: [[5, 1, 1], [5, 1, 2], [5, 2, 1], [5, 2, 2], [4, 1, 1], [4, 1, 2], [4, 2, 1]],
  },
  promising: {
    label: 'Promissores',
    description: 'Compradores recentes com potencial',
    color: '#eab308', // yellow
    scores: [[4, 2, 2], [4, 2, 3], [4, 3, 2], [3, 3, 3]],
  },
  need_attention: {
    label: 'Precisam de Atenção',
    description: 'Clientes acima da média que estão esfriando',
    color: '#f97316', // orange
    scores: [[3, 3, 4], [3, 4, 3], [3, 4, 4], [3, 3, 2], [3, 2, 3], [2, 3, 4], [2, 4, 3]],
  },
  about_to_sleep: {
    label: 'Prestes a Dormir',
    description: 'Abaixo da média em recência e frequência',
    color: '#a855f7', // violet
    scores: [[3, 2, 2], [3, 2, 1], [3, 1, 2], [3, 1, 3], [2, 2, 2], [2, 2, 3]],
  },
  at_risk: {
    label: 'Em Risco',
    description: 'Gastaram muito mas há tempo não compram',
    color: '#ef4444', // red
    scores: [[2, 4, 4], [2, 4, 5], [2, 5, 4], [2, 5, 5], [1, 4, 4], [1, 4, 5], [1, 5, 4], [1, 5, 5]],
  },
  cant_lose: {
    label: 'Não Pode Perder',
    description: 'Grandes compradores inativos',
    color: '#dc2626', // red-600
    scores: [[1, 3, 5], [1, 3, 4], [2, 3, 5], [2, 3, 4], [1, 4, 3], [2, 4, 3]],
  },
  hibernating: {
    label: 'Hibernando',
    description: 'Última compra há muito tempo, baixa frequência',
    color: '#6b7280', // gray
    scores: [[2, 1, 1], [2, 1, 2], [2, 2, 1], [1, 2, 2], [1, 2, 1], [1, 1, 2]],
  },
  lost: {
    label: 'Perdidos',
    description: 'Menor recência, frequência e valor',
    color: '#374151', // gray-700
    scores: [[1, 1, 1], [1, 1, 3], [1, 1, 4], [1, 1, 5], [1, 2, 3], [1, 2, 4], [1, 2, 5], [1, 3, 1], [1, 3, 2], [1, 3, 3]],
  },
} as const;

// =============================================
// SUPABASE CLIENT
// =============================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

// =============================================
// HELPER FUNCTIONS
// =============================================

function calculateQuartiles(values: number[]): [number, number, number, number] {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  if (n === 0) return [0, 0, 0, 0];
  
  const q1 = sorted[Math.floor(n * 0.2)] || 0;
  const q2 = sorted[Math.floor(n * 0.4)] || 0;
  const q3 = sorted[Math.floor(n * 0.6)] || 0;
  const q4 = sorted[Math.floor(n * 0.8)] || 0;
  
  return [q1, q2, q3, q4];
}

function getScore(value: number, quartiles: [number, number, number, number], invert: boolean = false): number {
  const [q1, q2, q3, q4] = quartiles;
  
  let score: number;
  if (value <= q1) score = 1;
  else if (value <= q2) score = 2;
  else if (value <= q3) score = 3;
  else if (value <= q4) score = 4;
  else score = 5;
  
  // For recency, lower is better (invert)
  return invert ? 6 - score : score;
}

function determineSegment(r: number, f: number, m: number): { segment: string; label: string } {
  // Check each segment's score patterns
  for (const [segmentKey, segmentData] of Object.entries(RFM_SEGMENTS)) {
    for (const [scoreR, scoreF, scoreM] of segmentData.scores) {
      if (r === scoreR && f === scoreF && m === scoreM) {
        return {
          segment: segmentKey,
          label: segmentData.label,
        };
      }
    }
  }
  
  // Default fallback based on average score
  const avgScore = (r + f + m) / 3;
  if (avgScore >= 4) return { segment: 'loyal', label: 'Clientes Leais' };
  if (avgScore >= 3) return { segment: 'need_attention', label: 'Precisam de Atenção' };
  if (avgScore >= 2) return { segment: 'hibernating', label: 'Hibernando' };
  return { segment: 'lost', label: 'Perdidos' };
}

// =============================================
// MAIN CALCULATION FUNCTION
// =============================================

export async function calculateRFMScores(
  storeId: string,
  organizationId: string
): Promise<RFMResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  const segmentCounts: Record<string, number> = {};
  
  try {
    // 1. Fetch all paid orders with customer data
    // Campos corretos da tabela shopify_orders
    const { data: orders, error: ordersError } = await supabase
      .from('shopify_orders')
      .select('customer_shopify_id, email, total_price, shopify_created_at, financial_status')
      .eq('store_id', storeId)
      .in('financial_status', ['paid', 'partially_paid', 'refunded', 'partially_refunded'])
      .not('customer_shopify_id', 'is', null);

    if (ordersError) {
      throw new Error(`Error fetching orders: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      return {
        success: true,
        storeId,
        organizationId,
        customersAnalyzed: 0,
        segmentCounts: {},
        calculatedAt: new Date().toISOString(),
        errors: ['No paid orders found'],
      };
    }

    // 2. Aggregate by customer
    const customerData: Record<string, {
      email: string | null;
      orders: number;
      totalSpent: number;
      firstOrder: Date;
      lastOrder: Date;
    }> = {};

    const now = new Date();

    orders.forEach(order => {
      // Campos corretos da tabela shopify_orders
      const customerId = order.customer_shopify_id;
      const orderDate = new Date(order.shopify_created_at);
      const orderValue = parseFloat(order.total_price || '0');

      if (!customerData[customerId]) {
        customerData[customerId] = {
          email: order.email,
          orders: 0,
          totalSpent: 0,
          firstOrder: orderDate,
          lastOrder: orderDate,
        };
      }

      customerData[customerId].orders++;
      customerData[customerId].totalSpent += orderValue;
      
      if (orderDate < customerData[customerId].firstOrder) {
        customerData[customerId].firstOrder = orderDate;
      }
      if (orderDate > customerData[customerId].lastOrder) {
        customerData[customerId].lastOrder = orderDate;
      }
    });

    const customerIds = Object.keys(customerData);
    
    if (customerIds.length === 0) {
      return {
        success: true,
        storeId,
        organizationId,
        customersAnalyzed: 0,
        segmentCounts: {},
        calculatedAt: new Date().toISOString(),
        errors: ['No customers with orders'],
      };
    }

    // 3. Calculate raw values for quartiles
    const recencyValues: number[] = [];
    const frequencyValues: number[] = [];
    const monetaryValues: number[] = [];

    customerIds.forEach(customerId => {
      const data = customerData[customerId];
      const daysSinceLast = Math.floor((now.getTime() - data.lastOrder.getTime()) / (1000 * 60 * 60 * 24));
      
      recencyValues.push(daysSinceLast);
      frequencyValues.push(data.orders);
      monetaryValues.push(data.totalSpent);
    });

    // 4. Calculate quartiles
    const recencyQuartiles = calculateQuartiles(recencyValues);
    const frequencyQuartiles = calculateQuartiles(frequencyValues);
    const monetaryQuartiles = calculateQuartiles(monetaryValues);

    // 5. Calculate scores and segments
    const rfmScores: RFMScore[] = customerIds.map(customerId => {
      const data = customerData[customerId];
      const daysSinceLast = Math.floor((now.getTime() - data.lastOrder.getTime()) / (1000 * 60 * 60 * 24));
      
      const recencyScore = getScore(daysSinceLast, recencyQuartiles, true); // Invert: lower days = higher score
      const frequencyScore = getScore(data.orders, frequencyQuartiles);
      const monetaryScore = getScore(data.totalSpent, monetaryQuartiles);
      
      const { segment, label } = determineSegment(recencyScore, frequencyScore, monetaryScore);
      
      // Track segment counts
      segmentCounts[segment] = (segmentCounts[segment] || 0) + 1;

      return {
        shopify_customer_id: customerId,
        customer_email: data.email,
        recency_score: recencyScore,
        frequency_score: frequencyScore,
        monetary_score: monetaryScore,
        days_since_last_order: daysSinceLast,
        total_orders: data.orders,
        total_spent: data.totalSpent,
        average_order_value: data.orders > 0 ? data.totalSpent / data.orders : 0,
        segment,
        segment_label: label,
        first_order_date: data.firstOrder.toISOString(),
        last_order_date: data.lastOrder.toISOString(),
      };
    });

    // 6. Upsert to database
    const rfmToInsert = rfmScores.map(score => ({
      store_id: storeId,
      organization_id: organizationId,
      ...score,
      calculated_at: new Date().toISOString(),
    }));

    // Delete existing scores for this store
    await supabase
      .from('shopify_rfm_scores')
      .delete()
      .eq('store_id', storeId);

    // Insert new scores in batches
    const batchSize = 100;
    for (let i = 0; i < rfmToInsert.length; i += batchSize) {
      const batch = rfmToInsert.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('shopify_rfm_scores')
        .insert(batch);

      if (insertError) {
        errors.push(`Batch ${Math.floor(i / batchSize)}: ${insertError.message}`);
      }
    }

    // 7. Create sync log
    await supabase
      .from('shopify_sync_logs')
      .insert({
        store_id: storeId,
        organization_id: organizationId,
        sync_type: 'rfm',
        entity_type: 'customers',
        status: errors.length === 0 ? 'completed' : 'completed_with_errors',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        items_processed: rfmScores.length,
        items_created: rfmScores.length,
        error_message: errors.length > 0 ? errors.join('; ') : null,
        metadata: { segmentCounts },
      });

    return {
      success: errors.length === 0,
      storeId,
      organizationId,
      customersAnalyzed: rfmScores.length,
      segmentCounts,
      calculatedAt: new Date().toISOString(),
      errors,
    };

  } catch (error: any) {
    console.error('[RFM] Error:', error);
    return {
      success: false,
      storeId,
      organizationId,
      customersAnalyzed: 0,
      segmentCounts: {},
      calculatedAt: new Date().toISOString(),
      errors: [error.message],
    };
  }
}

// =============================================
// GET RFM SCORES
// =============================================

export async function getRFMScores(
  storeId: string,
  segment?: string
): Promise<RFMScore[]> {
  const supabase = getSupabaseAdmin();
  
  let query = supabase
    .from('shopify_rfm_scores')
    .select('*')
    .eq('store_id', storeId)
    .order('total_spent', { ascending: false });

  if (segment) {
    query = query.eq('segment', segment);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching RFM scores: ${error.message}`);
  }

  return data || [];
}

// =============================================
// GET RFM SUMMARY
// =============================================

export async function getRFMSummary(storeId: string): Promise<{
  totalCustomers: number;
  segments: Array<{
    segment: string;
    label: string;
    count: number;
    percentage: number;
    avgSpent: number;
    color: string;
  }>;
}> {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('shopify_rfm_summary')
    .select('*')
    .eq('store_id', storeId);

  if (error) {
    throw new Error(`Error fetching RFM summary: ${error.message}`);
  }

  const totalCustomers = data?.reduce((sum, row) => sum + (row.customer_count || 0), 0) || 0;

  const segments = (data || []).map(row => ({
    segment: row.segment,
    label: row.segment_label || RFM_SEGMENTS[row.segment as keyof typeof RFM_SEGMENTS]?.label || row.segment,
    count: row.customer_count || 0,
    percentage: totalCustomers > 0 ? ((row.customer_count || 0) / totalCustomers) * 100 : 0,
    avgSpent: row.avg_spent || 0,
    color: RFM_SEGMENTS[row.segment as keyof typeof RFM_SEGMENTS]?.color || '#6b7280',
  }));

  return {
    totalCustomers,
    segments: segments.sort((a, b) => b.count - a.count),
  };
}
