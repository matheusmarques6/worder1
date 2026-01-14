// =============================================
// API: Métricas Avançadas Unificadas (RFM + Cohort)
// src/app/api/shopify/analytics/advanced/route.ts
//
// Calcula on-the-fly se dados não existirem
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// =============================================
// TYPES
// =============================================

interface CustomerMetrics {
  customer_id: string;
  email: string | null;
  first_order_date: Date;
  last_order_date: Date;
  total_orders: number;
  total_spent: number;
}

interface RFMScore {
  customer_id: string;
  email: string | null;
  recency_score: number;
  frequency_score: number;
  monetary_score: number;
  days_since_last_order: number;
  total_orders: number;
  total_spent: number;
  segment: string;
  segment_label: string;
}

interface CohortData {
  cohort_month: string;
  period: number;
  customers_count: number;
  active_customers: number;
  retention_rate: number;
}

// =============================================
// RFM SEGMENTS
// =============================================

const RFM_SEGMENTS: Record<string, { label: string; color: string }> = {
  champion: { label: 'Campeões', color: '#f97316' },
  loyal: { label: 'Leais', color: '#ea580c' },
  potential_loyalist: { label: 'Potenciais Leais', color: '#eab308' },
  recent: { label: 'Recentes', color: '#facc15' },
  promising: { label: 'Promissores', color: '#fbbf24' },
  need_attention: { label: 'Precisam Atenção', color: '#f59e0b' },
  about_to_sleep: { label: 'Quase Dormindo', color: '#d97706' },
  at_risk: { label: 'Em Risco', color: '#ef4444' },
  cant_lose: { label: 'Não Pode Perder', color: '#dc2626' },
  hibernating: { label: 'Hibernando', color: '#6b7280' },
  lost: { label: 'Perdidos', color: '#4b5563' },
};

// =============================================
// HELPER FUNCTIONS
// =============================================

function calculateQuartiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;
  if (len === 0) return [0, 0, 0, 0, 0];
  
  return [
    sorted[0],
    sorted[Math.floor(len * 0.25)],
    sorted[Math.floor(len * 0.5)],
    sorted[Math.floor(len * 0.75)],
    sorted[len - 1],
  ];
}

function getScoreFromQuartiles(value: number, quartiles: number[], inverse: boolean = false): number {
  if (quartiles[4] === quartiles[0]) return 3;
  
  let score = 1;
  if (value >= quartiles[3]) score = 5;
  else if (value >= quartiles[2]) score = 4;
  else if (value >= quartiles[1]) score = 3;
  else if (value > quartiles[0]) score = 2;
  
  return inverse ? 6 - score : score;
}

function determineSegment(r: number, f: number, m: number): { segment: string; label: string } {
  // Campeões: R=5, F>=4, M>=4
  if (r >= 5 && f >= 4 && m >= 4) return { segment: 'champion', label: 'Campeões' };
  
  // Leais: F>=4, M>=3
  if (f >= 4 && m >= 3) return { segment: 'loyal', label: 'Leais' };
  
  // Potenciais Leais: R>=4, F>=2
  if (r >= 4 && f >= 2 && f < 4) return { segment: 'potential_loyalist', label: 'Potenciais Leais' };
  
  // Recentes: R>=4, F=1
  if (r >= 4 && f === 1) return { segment: 'recent', label: 'Recentes' };
  
  // Promissores: R>=3, F>=2, M>=2
  if (r >= 3 && f >= 2 && m >= 2 && r < 4) return { segment: 'promising', label: 'Promissores' };
  
  // Precisam Atenção: R=3, F>=3
  if (r === 3 && f >= 3) return { segment: 'need_attention', label: 'Precisam Atenção' };
  
  // Em Risco: R<=2, F>=3, M>=3
  if (r <= 2 && f >= 3 && m >= 3) return { segment: 'at_risk', label: 'Em Risco' };
  
  // Não Pode Perder: R<=2, F>=4, M>=4
  if (r <= 2 && f >= 4 && m >= 4) return { segment: 'cant_lose', label: 'Não Pode Perder' };
  
  // Quase Dormindo: R=2, F<=2
  if (r === 2 && f <= 2) return { segment: 'about_to_sleep', label: 'Quase Dormindo' };
  
  // Hibernando: R=1, F<=2
  if (r === 1 && f <= 2 && m <= 2) return { segment: 'hibernating', label: 'Hibernando' };
  
  // Perdidos: resto
  return { segment: 'lost', label: 'Perdidos' };
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// =============================================
// CALCULATE RFM ON-THE-FLY
// =============================================

async function calculateRFMFromOrders(storeId: string, organizationId: string): Promise<{
  scores: RFMScore[];
  summary: Record<string, { count: number; totalRevenue: number; avgOrders: number }>;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Database not configured');

  // Buscar pedidos
  const { data: orders, error } = await supabase
    .from('shopify_orders')
    .select('customer_id, customer_email, total_price, created_at, financial_status')
    .eq('store_id', storeId)
    .eq('organization_id', organizationId)
    .not('customer_id', 'is', null)
    .in('financial_status', ['paid', 'partially_paid', 'refunded', 'partially_refunded']);

  if (error) throw error;
  if (!orders || orders.length === 0) {
    return { scores: [], summary: {} };
  }

  // Agrupar por cliente
  const customerMap = new Map<string, CustomerMetrics>();
  const now = new Date();

  for (const order of orders) {
    const customerId = order.customer_id;
    if (!customerId) continue;

    const orderDate = new Date(order.created_at);
    const price = parseFloat(order.total_price || '0');

    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customer_id: customerId,
        email: order.customer_email,
        first_order_date: orderDate,
        last_order_date: orderDate,
        total_orders: 0,
        total_spent: 0,
      });
    }

    const customer = customerMap.get(customerId)!;
    customer.total_orders++;
    customer.total_spent += price;
    
    if (orderDate > customer.last_order_date) {
      customer.last_order_date = orderDate;
    }
    if (orderDate < customer.first_order_date) {
      customer.first_order_date = orderDate;
    }
  }

  // Calcular métricas para quartis
  const customers = Array.from(customerMap.values());
  const recencyValues = customers.map(c => Math.floor((now.getTime() - c.last_order_date.getTime()) / (1000 * 60 * 60 * 24)));
  const frequencyValues = customers.map(c => c.total_orders);
  const monetaryValues = customers.map(c => c.total_spent);

  const recencyQuartiles = calculateQuartiles(recencyValues);
  const frequencyQuartiles = calculateQuartiles(frequencyValues);
  const monetaryQuartiles = calculateQuartiles(monetaryValues);

  // Calcular scores
  const scores: RFMScore[] = [];
  const summary: Record<string, { count: number; totalRevenue: number; avgOrders: number }> = {};

  for (const customer of customers) {
    const daysSinceLast = Math.floor((now.getTime() - customer.last_order_date.getTime()) / (1000 * 60 * 60 * 24));
    
    const rScore = getScoreFromQuartiles(daysSinceLast, recencyQuartiles, true); // Inverso: menos dias = melhor
    const fScore = getScoreFromQuartiles(customer.total_orders, frequencyQuartiles);
    const mScore = getScoreFromQuartiles(customer.total_spent, monetaryQuartiles);
    
    const { segment, label } = determineSegment(rScore, fScore, mScore);

    scores.push({
      customer_id: customer.customer_id,
      email: customer.email,
      recency_score: rScore,
      frequency_score: fScore,
      monetary_score: mScore,
      days_since_last_order: daysSinceLast,
      total_orders: customer.total_orders,
      total_spent: customer.total_spent,
      segment,
      segment_label: label,
    });

    // Summary
    if (!summary[segment]) {
      summary[segment] = { count: 0, totalRevenue: 0, avgOrders: 0 };
    }
    summary[segment].count++;
    summary[segment].totalRevenue += customer.total_spent;
    summary[segment].avgOrders += customer.total_orders;
  }

  // Calcular médias
  for (const seg of Object.keys(summary)) {
    if (summary[seg].count > 0) {
      summary[seg].avgOrders = summary[seg].avgOrders / summary[seg].count;
    }
  }

  return { scores, summary };
}

// =============================================
// CALCULATE COHORT ON-THE-FLY
// =============================================

async function calculateCohortFromOrders(storeId: string, organizationId: string, maxMonths: number = 12): Promise<{
  matrix: CohortData[];
  summary: { avgRetentionMonth1: number; avgRetentionMonth3: number; bestCohort: string; worstCohort: string };
}> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Database not configured');

  // Buscar pedidos
  const { data: orders, error } = await supabase
    .from('shopify_orders')
    .select('customer_id, created_at, financial_status')
    .eq('store_id', storeId)
    .eq('organization_id', organizationId)
    .not('customer_id', 'is', null)
    .in('financial_status', ['paid', 'partially_paid', 'refunded', 'partially_refunded'])
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!orders || orders.length === 0) {
    return {
      matrix: [],
      summary: { avgRetentionMonth1: 0, avgRetentionMonth3: 0, bestCohort: '', worstCohort: '' },
    };
  }

  // Identificar primeira compra de cada cliente
  const customerFirstPurchase = new Map<string, Date>();
  const customerPurchaseMonths = new Map<string, Set<string>>();

  for (const order of orders) {
    const customerId = order.customer_id;
    if (!customerId) continue;

    const orderDate = new Date(order.created_at);
    const orderMonth = formatMonth(orderDate);

    if (!customerFirstPurchase.has(customerId)) {
      customerFirstPurchase.set(customerId, orderDate);
      customerPurchaseMonths.set(customerId, new Set());
    }
    
    customerPurchaseMonths.get(customerId)!.add(orderMonth);
  }

  // Agrupar clientes por cohort (mês da primeira compra)
  const cohorts = new Map<string, Set<string>>();
  
  for (const [customerId, firstDate] of customerFirstPurchase.entries()) {
    const cohortMonth = formatMonth(firstDate);
    
    if (!cohorts.has(cohortMonth)) {
      cohorts.set(cohortMonth, new Set());
    }
    cohorts.get(cohortMonth)!.add(customerId);
  }

  // Ordenar cohorts e pegar os últimos N meses
  const sortedCohorts = Array.from(cohorts.keys()).sort().slice(-maxMonths);
  
  // Calcular matriz de retenção
  const matrix: CohortData[] = [];
  const retentionByPeriod: Record<number, number[]> = {};
  const cohortRetention: Record<string, number> = {};

  for (const cohortMonth of sortedCohorts) {
    const cohortCustomers = cohorts.get(cohortMonth)!;
    const cohortDate = new Date(cohortMonth + '-01');
    const customersInCohort = cohortCustomers.size;

    // Período 0 = mês da primeira compra (100%)
    matrix.push({
      cohort_month: cohortMonth,
      period: 0,
      customers_count: customersInCohort,
      active_customers: customersInCohort,
      retention_rate: 100,
    });

    // Períodos seguintes
    for (let period = 1; period <= 12; period++) {
      const targetDate = new Date(cohortDate);
      targetDate.setMonth(targetDate.getMonth() + period);
      const targetMonth = formatMonth(targetDate);

      // Contar quantos clientes do cohort compraram neste mês
      let activeCustomers = 0;
      for (const customerId of cohortCustomers) {
        const purchaseMonths = customerPurchaseMonths.get(customerId);
        if (purchaseMonths && purchaseMonths.has(targetMonth)) {
          activeCustomers++;
        }
      }

      const retentionRate = customersInCohort > 0 ? (activeCustomers / customersInCohort) * 100 : 0;

      matrix.push({
        cohort_month: cohortMonth,
        period,
        customers_count: customersInCohort,
        active_customers: activeCustomers,
        retention_rate: parseFloat(retentionRate.toFixed(1)),
      });

      // Agregar para médias
      if (!retentionByPeriod[period]) retentionByPeriod[period] = [];
      retentionByPeriod[period].push(retentionRate);
    }

    // Retenção do cohort (mês 1)
    const month1Data = matrix.find(m => m.cohort_month === cohortMonth && m.period === 1);
    if (month1Data) {
      cohortRetention[cohortMonth] = month1Data.retention_rate;
    }
  }

  // Calcular summary
  const avgRetentionMonth1 = retentionByPeriod[1]?.length > 0 
    ? retentionByPeriod[1].reduce((a, b) => a + b, 0) / retentionByPeriod[1].length 
    : 0;
  const avgRetentionMonth3 = retentionByPeriod[3]?.length > 0 
    ? retentionByPeriod[3].reduce((a, b) => a + b, 0) / retentionByPeriod[3].length 
    : 0;

  const cohortEntries = Object.entries(cohortRetention);
  const bestCohort = cohortEntries.length > 0 
    ? cohortEntries.reduce((a, b) => a[1] > b[1] ? a : b)[0] 
    : '';
  const worstCohort = cohortEntries.length > 0 
    ? cohortEntries.reduce((a, b) => a[1] < b[1] ? a : b)[0] 
    : '';

  return {
    matrix,
    summary: {
      avgRetentionMonth1: parseFloat(avgRetentionMonth1.toFixed(1)),
      avgRetentionMonth3: parseFloat(avgRetentionMonth3.toFixed(1)),
      bestCohort,
      worstCohort,
    },
  };
}

// =============================================
// GET: Retornar métricas avançadas
// =============================================

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const organizationId = user.organization_id;

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId é obrigatório' },
        { status: 400 }
      );
    }

    // Calcular RFM
    const rfmResult = await calculateRFMFromOrders(storeId, organizationId);
    
    // Calcular Cohort
    const cohortResult = await calculateCohortFromOrders(storeId, organizationId, 12);

    // Formatar dados para o frontend
    const rfmSegments = Object.entries(rfmResult.summary).map(([segment, data]) => ({
      segment,
      label: RFM_SEGMENTS[segment]?.label || segment,
      color: RFM_SEGMENTS[segment]?.color || '#6b7280',
      count: data.count,
      totalRevenue: data.totalRevenue,
      avgOrders: data.avgOrders,
      percentage: rfmResult.scores.length > 0 
        ? parseFloat(((data.count / rfmResult.scores.length) * 100).toFixed(1))
        : 0,
    })).sort((a, b) => b.count - a.count);

    // Formatar cohort matrix para frontend
    const cohortMonths = [...new Set(cohortResult.matrix.map(m => m.cohort_month))].sort();
    const cohortMatrix: Record<string, Record<number, { retention: number; active: number; total: number }>> = {};
    
    for (const data of cohortResult.matrix) {
      if (!cohortMatrix[data.cohort_month]) {
        cohortMatrix[data.cohort_month] = {};
      }
      cohortMatrix[data.cohort_month][data.period] = {
        retention: data.retention_rate,
        active: data.active_customers,
        total: data.customers_count,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        rfm: {
          totalCustomers: rfmResult.scores.length,
          segments: rfmSegments,
          topCustomers: rfmResult.scores
            .sort((a, b) => b.total_spent - a.total_spent)
            .slice(0, 10)
            .map(s => ({
              email: s.email || 'Sem email',
              segment: s.segment_label,
              totalSpent: s.total_spent,
              totalOrders: s.total_orders,
              daysSinceLast: s.days_since_last_order,
              rfmScore: `${s.recency_score}${s.frequency_score}${s.monetary_score}`,
            })),
        },
        cohort: {
          months: cohortMonths,
          matrix: cohortMatrix,
          summary: cohortResult.summary,
        },
        calculatedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Advanced Analytics] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// =============================================
// POST: Forçar recálculo
// =============================================

export async function POST(request: NextRequest) {
  // POST usa a mesma lógica do GET (sempre calcula on-the-fly)
  return GET(request);
}
