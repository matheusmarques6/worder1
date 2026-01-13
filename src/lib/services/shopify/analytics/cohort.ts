// =============================================
// Cohort Analysis Calculator
// src/lib/services/shopify/analytics/cohort.ts
//
// Análise de retenção por cohort:
// - Agrupa clientes por mês da primeira compra
// - Calcula retenção mês a mês
// - Gera matriz de cohort para visualização
// =============================================

import { createClient } from '@supabase/supabase-js';

// =============================================
// TYPES
// =============================================

export interface CohortData {
  cohort_month: string; // YYYY-MM
  months_since_first: number;
  customers_count: number;
  active_customers: number;
  orders_count: number;
  revenue: number;
  retention_rate: number;
}

export interface CohortResult {
  success: boolean;
  storeId: string;
  organizationId: string;
  cohortsAnalyzed: number;
  dataPoints: number;
  calculatedAt: string;
  errors: string[];
}

export interface CohortMatrix {
  cohorts: string[]; // List of cohort months
  periods: number[]; // [0, 1, 2, 3, ...] months since first purchase
  data: Record<string, Record<number, {
    customers: number;
    active: number;
    retention: number;
    revenue: number;
  }>>;
  summary: {
    avgRetentionMonth1: number;
    avgRetentionMonth3: number;
    avgRetentionMonth6: number;
    avgRetentionMonth12: number;
    bestCohort: string;
    worstCohort: string;
  };
}

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

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthDiff(date1: Date, date2: Date): number {
  return (date1.getFullYear() - date2.getFullYear()) * 12 + (date1.getMonth() - date2.getMonth());
}

// =============================================
// MAIN CALCULATION FUNCTION
// =============================================

export async function calculateCohortAnalysis(
  storeId: string,
  organizationId: string,
  maxMonths: number = 12
): Promise<CohortResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  
  try {
    // 1. Fetch all paid orders
    const { data: orders, error: ordersError } = await supabase
      .from('shopify_orders')
      .select('customer_id, customer_email, total_price, created_at, financial_status')
      .eq('store_id', storeId)
      .in('financial_status', ['paid', 'partially_paid', 'refunded', 'partially_refunded'])
      .not('customer_id', 'is', null)
      .order('created_at', { ascending: true });

    if (ordersError) {
      throw new Error(`Error fetching orders: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      return {
        success: true,
        storeId,
        organizationId,
        cohortsAnalyzed: 0,
        dataPoints: 0,
        calculatedAt: new Date().toISOString(),
        errors: ['No paid orders found'],
      };
    }

    // 2. Find first purchase date for each customer
    const customerFirstPurchase: Record<string, Date> = {};
    
    orders.forEach(order => {
      const customerId = order.customer_id;
      const orderDate = new Date(order.created_at);
      
      if (!customerFirstPurchase[customerId] || orderDate < customerFirstPurchase[customerId]) {
        customerFirstPurchase[customerId] = orderDate;
      }
    });

    // 3. Assign cohort to each customer (month of first purchase)
    const customerCohort: Record<string, string> = {};
    
    Object.entries(customerFirstPurchase).forEach(([customerId, firstDate]) => {
      customerCohort[customerId] = formatMonth(firstDate);
    });

    // 4. Build cohort data
    // Structure: cohort_month -> months_since_first -> { customers, orders, revenue }
    const cohortData: Record<string, Record<number, {
      customers: Set<string>;
      orders: number;
      revenue: number;
    }>> = {};

    // Initialize cohorts
    const cohortMonths = new Set<string>();
    Object.values(customerCohort).forEach(month => cohortMonths.add(month));

    cohortMonths.forEach(cohortMonth => {
      cohortData[cohortMonth] = {};
      for (let i = 0; i <= maxMonths; i++) {
        cohortData[cohortMonth][i] = {
          customers: new Set(),
          orders: 0,
          revenue: 0,
        };
      }
    });

    // Count customers in each cohort at month 0 (their first purchase month)
    Object.entries(customerCohort).forEach(([customerId, cohortMonth]) => {
      if (cohortData[cohortMonth]) {
        cohortData[cohortMonth][0].customers.add(customerId);
      }
    });

    // Process all orders and assign to cohort periods
    orders.forEach(order => {
      const customerId = order.customer_id;
      const cohortMonth = customerCohort[customerId];
      
      if (!cohortMonth || !cohortData[cohortMonth]) return;

      const orderDate = new Date(order.created_at);
      const firstPurchaseDate = customerFirstPurchase[customerId];
      const monthsSinceFirst = getMonthDiff(orderDate, firstPurchaseDate);
      
      if (monthsSinceFirst >= 0 && monthsSinceFirst <= maxMonths) {
        cohortData[cohortMonth][monthsSinceFirst].customers.add(customerId);
        cohortData[cohortMonth][monthsSinceFirst].orders++;
        cohortData[cohortMonth][monthsSinceFirst].revenue += parseFloat(order.total_price || '0');
      }
    });

    // 5. Transform to database format
    const cohortAnalysis: CohortData[] = [];

    Object.entries(cohortData).forEach(([cohortMonth, periods]) => {
      const totalCustomersInCohort = periods[0].customers.size;
      
      Object.entries(periods).forEach(([monthStr, data]) => {
        const monthsSinceFirst = parseInt(monthStr);
        const activeCustomers = data.customers.size;
        const retentionRate = totalCustomersInCohort > 0 
          ? (activeCustomers / totalCustomersInCohort) * 100 
          : 0;

        cohortAnalysis.push({
          cohort_month: cohortMonth,
          months_since_first: monthsSinceFirst,
          customers_count: totalCustomersInCohort,
          active_customers: activeCustomers,
          orders_count: data.orders,
          revenue: data.revenue,
          retention_rate: Math.round(retentionRate * 100) / 100,
        });
      });
    });

    // 6. Delete existing data for this store
    await supabase
      .from('shopify_cohort_analysis')
      .delete()
      .eq('store_id', storeId);

    // 7. Insert new data in batches
    const toInsert = cohortAnalysis.map(row => ({
      store_id: storeId,
      organization_id: organizationId,
      cohort_month: `${row.cohort_month}-01`, // Convert to DATE format
      months_since_first: row.months_since_first,
      customers_count: row.customers_count,
      active_customers: row.active_customers,
      orders_count: row.orders_count,
      revenue: row.revenue,
      retention_rate: row.retention_rate,
      calculated_at: new Date().toISOString(),
    }));

    const batchSize = 100;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('shopify_cohort_analysis')
        .insert(batch);

      if (insertError) {
        errors.push(`Batch ${Math.floor(i / batchSize)}: ${insertError.message}`);
      }
    }

    // 8. Create sync log
    await supabase
      .from('shopify_sync_logs')
      .insert({
        store_id: storeId,
        organization_id: organizationId,
        sync_type: 'cohort',
        entity_type: 'customers',
        status: errors.length === 0 ? 'completed' : 'completed_with_errors',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        items_processed: cohortAnalysis.length,
        items_created: cohortAnalysis.length,
        error_message: errors.length > 0 ? errors.join('; ') : null,
        metadata: { 
          cohortsCount: cohortMonths.size,
          maxMonths,
        },
      });

    return {
      success: errors.length === 0,
      storeId,
      organizationId,
      cohortsAnalyzed: cohortMonths.size,
      dataPoints: cohortAnalysis.length,
      calculatedAt: new Date().toISOString(),
      errors,
    };

  } catch (error: any) {
    console.error('[Cohort] Error:', error);
    return {
      success: false,
      storeId,
      organizationId,
      cohortsAnalyzed: 0,
      dataPoints: 0,
      calculatedAt: new Date().toISOString(),
      errors: [error.message],
    };
  }
}

// =============================================
// GET COHORT DATA
// =============================================

export async function getCohortData(
  storeId: string,
  cohortMonth?: string
): Promise<CohortData[]> {
  const supabase = getSupabaseAdmin();
  
  let query = supabase
    .from('shopify_cohort_analysis')
    .select('*')
    .eq('store_id', storeId)
    .order('cohort_month', { ascending: false })
    .order('months_since_first', { ascending: true });

  if (cohortMonth) {
    query = query.eq('cohort_month', `${cohortMonth}-01`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching cohort data: ${error.message}`);
  }

  return (data || []).map(row => ({
    cohort_month: row.cohort_month?.substring(0, 7) || '',
    months_since_first: row.months_since_first,
    customers_count: row.customers_count,
    active_customers: row.active_customers,
    orders_count: row.orders_count,
    revenue: row.revenue,
    retention_rate: row.retention_rate,
  }));
}

// =============================================
// GET COHORT MATRIX (for visualization)
// =============================================

export async function getCohortMatrix(
  storeId: string,
  maxCohorts: number = 12
): Promise<CohortMatrix> {
  const data = await getCohortData(storeId);
  
  // Get unique cohorts (most recent first)
  const cohorts = [...new Set(data.map(d => d.cohort_month))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, maxCohorts);

  // Get max period
  const maxPeriod = Math.max(...data.map(d => d.months_since_first), 0);
  const periods = Array.from({ length: maxPeriod + 1 }, (_, i) => i);

  // Build matrix
  const matrix: CohortMatrix['data'] = {};
  
  cohorts.forEach(cohort => {
    matrix[cohort] = {};
    periods.forEach(period => {
      const row = data.find(d => d.cohort_month === cohort && d.months_since_first === period);
      matrix[cohort][period] = {
        customers: row?.customers_count || 0,
        active: row?.active_customers || 0,
        retention: row?.retention_rate || 0,
        revenue: row?.revenue || 0,
      };
    });
  });

  // Calculate summary stats
  const retentionByMonth: Record<number, number[]> = {};
  data.forEach(row => {
    if (!retentionByMonth[row.months_since_first]) {
      retentionByMonth[row.months_since_first] = [];
    }
    if (row.retention_rate > 0) {
      retentionByMonth[row.months_since_first].push(row.retention_rate);
    }
  });

  const avgRetention = (month: number): number => {
    const values = retentionByMonth[month] || [];
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  // Find best/worst cohorts by 3-month retention
  let bestCohort = cohorts[0] || '';
  let worstCohort = cohorts[0] || '';
  let bestRetention = 0;
  let worstRetention = 100;

  cohorts.forEach(cohort => {
    const retention3 = matrix[cohort]?.[3]?.retention || 0;
    if (retention3 > bestRetention) {
      bestRetention = retention3;
      bestCohort = cohort;
    }
    if (retention3 < worstRetention && retention3 > 0) {
      worstRetention = retention3;
      worstCohort = cohort;
    }
  });

  return {
    cohorts,
    periods,
    data: matrix,
    summary: {
      avgRetentionMonth1: Math.round(avgRetention(1) * 100) / 100,
      avgRetentionMonth3: Math.round(avgRetention(3) * 100) / 100,
      avgRetentionMonth6: Math.round(avgRetention(6) * 100) / 100,
      avgRetentionMonth12: Math.round(avgRetention(12) * 100) / 100,
      bestCohort,
      worstCohort,
    },
  };
}
