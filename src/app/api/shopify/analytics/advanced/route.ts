// =============================================
// API: Métricas Avançadas Unificadas (RFM + Cohort)
// src/app/api/shopify/analytics/advanced/route.ts
//
// Usa funções existentes de analytics
// Calcula on-the-fly se dados não existirem
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { 
  calculateRFMScores, 
  getRFMScores, 
  getRFMSummary,
  RFM_SEGMENTS 
} from '@/lib/services/shopify/analytics/rfm';
import { 
  calculateCohortAnalysis, 
  getCohortMatrix 
} from '@/lib/services/shopify/analytics/cohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
    const forceRecalculate = searchParams.get('recalculate') === 'true';

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId é obrigatório' },
        { status: 400 }
      );
    }

    // =============================================
    // 1. RFM: Verificar dados existentes ou calcular
    // =============================================
    
    let rfmScores = await getRFMScores(storeId).catch(() => []);
    let rfmSummary = await getRFMSummary(storeId).catch(() => ({ totalCustomers: 0, segments: [] }));
    
    // Se não tem dados ou forçar recálculo, calcular
    if (rfmScores.length === 0 || forceRecalculate) {
      console.log('[Advanced Analytics] Calculando RFM para store:', storeId);
      await calculateRFMScores(storeId, organizationId);
      
      // Buscar dados recém-calculados
      rfmScores = await getRFMScores(storeId).catch(() => []);
      rfmSummary = await getRFMSummary(storeId).catch(() => ({ totalCustomers: 0, segments: [] }));
    }

    // =============================================
    // 2. COHORT: Verificar dados existentes ou calcular
    // =============================================
    
    let cohortMatrix = await getCohortMatrix(storeId, 12).catch(() => ({
      cohorts: [],
      periods: [],
      data: {},
      summary: {
        avgRetentionMonth1: 0,
        avgRetentionMonth3: 0,
        avgRetentionMonth6: 0,
        avgRetentionMonth12: 0,
        bestCohort: '',
        worstCohort: '',
      },
    }));
    
    // Se não tem dados ou forçar recálculo, calcular
    if (cohortMatrix.cohorts.length === 0 || forceRecalculate) {
      console.log('[Advanced Analytics] Calculando Cohort para store:', storeId);
      await calculateCohortAnalysis(storeId, organizationId, 12);
      
      // Buscar dados recém-calculados
      cohortMatrix = await getCohortMatrix(storeId, 12).catch(() => ({
        cohorts: [],
        periods: [],
        data: {},
        summary: {
          avgRetentionMonth1: 0,
          avgRetentionMonth3: 0,
          avgRetentionMonth6: 0,
          avgRetentionMonth12: 0,
          bestCohort: '',
          worstCohort: '',
        },
      }));
    }

    // =============================================
    // 3. Formatar dados para o frontend
    // =============================================
    
    // RFM: Formatar segmentos com cores da paleta Worder
    const WORDER_COLORS: Record<string, string> = {
      champion: '#f97316',      // orange-500 - Worder primary
      loyal: '#ea580c',         // orange-600
      potential_loyalist: '#eab308', // yellow-500 - Worder accent
      recent: '#facc15',        // yellow-400
      promising: '#fbbf24',     // amber-400
      need_attention: '#f59e0b', // amber-500
      about_to_sleep: '#d97706', // amber-600
      at_risk: '#ef4444',       // red-500
      cant_lose: '#dc2626',     // red-600
      hibernating: '#6b7280',   // gray-500
      lost: '#4b5563',          // gray-600
    };

    const rfmSegments = rfmSummary.segments.map(seg => ({
      ...seg,
      color: WORDER_COLORS[seg.segment] || seg.color || '#6b7280',
      totalRevenue: seg.avgSpent * seg.count,
      avgOrders: 0, // Será calculado abaixo se houver scores
    }));

    // Calcular avgOrders para cada segmento
    const segmentOrders: Record<string, { total: number; count: number }> = {};
    rfmScores.forEach(score => {
      if (!segmentOrders[score.segment]) {
        segmentOrders[score.segment] = { total: 0, count: 0 };
      }
      segmentOrders[score.segment].total += score.total_orders;
      segmentOrders[score.segment].count++;
    });

    rfmSegments.forEach(seg => {
      const orders = segmentOrders[seg.segment];
      if (orders && orders.count > 0) {
        seg.avgOrders = parseFloat((orders.total / orders.count).toFixed(1));
      }
    });

    // Top customers
    const topCustomers = rfmScores
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10)
      .map(score => ({
        email: score.customer_email || 'Sem email',
        segment: score.segment_label,
        totalSpent: score.total_spent,
        totalOrders: score.total_orders,
        daysSinceLast: score.days_since_last_order,
        rfmScore: `${score.recency_score}${score.frequency_score}${score.monetary_score}`,
      }));

    // =============================================
    // 4. Retornar resposta
    // =============================================

    return NextResponse.json({
      success: true,
      data: {
        rfm: {
          totalCustomers: rfmSummary.totalCustomers,
          segments: rfmSegments,
          topCustomers,
        },
        cohort: {
          months: cohortMatrix.cohorts,
          matrix: cohortMatrix.data,
          summary: {
            avgRetentionMonth1: cohortMatrix.summary.avgRetentionMonth1,
            avgRetentionMonth3: cohortMatrix.summary.avgRetentionMonth3,
            bestCohort: cohortMatrix.summary.bestCohort,
            worstCohort: cohortMatrix.summary.worstCohort,
          },
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
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const organizationId = user.organization_id;

    let storeId: string | null = null;
    try {
      const body = await request.json();
      storeId = body.storeId || null;
    } catch {
      // Body vazio
    }

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId é obrigatório' },
        { status: 400 }
      );
    }

    // Forçar recálculo de ambos
    console.log('[Advanced Analytics] Forçando recálculo para store:', storeId);
    
    const rfmResult = await calculateRFMScores(storeId, organizationId);
    const cohortResult = await calculateCohortAnalysis(storeId, organizationId, 12);

    return NextResponse.json({
      success: true,
      message: 'Métricas recalculadas com sucesso',
      data: {
        rfm: {
          customersAnalyzed: rfmResult.customersAnalyzed,
          segmentCounts: rfmResult.segmentCounts,
        },
        cohort: {
          cohortsAnalyzed: cohortResult.cohortsAnalyzed,
          dataPoints: cohortResult.dataPoints,
        },
        calculatedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Advanced Analytics POST] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
