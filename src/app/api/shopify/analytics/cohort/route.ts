// =============================================
// API: Shopify Cohort Analytics
// src/app/api/shopify/analytics/cohort/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, validateStoreAccess } from '@/lib/api-utils';
import { calculateCohortAnalysis, getCohortData, getCohortMatrix } from '@/lib/services/shopify/analytics/cohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// =============================================
// POST: Calcular Cohort Analysis
// =============================================

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    let storeId: string | null = null;
    let maxMonths = 12;
    try {
      const body = await request.json();
      storeId = body.storeId || null;
      maxMonths = body.maxMonths || 12;
    } catch {
      // Body vazio
    }

    if (!storeId) {
      const { data: stores } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('is_active', true)
        .limit(1);
      
      if (!stores || stores.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Nenhuma loja conectada' },
          { status: 404 }
        );
      }
      storeId = stores[0].id;
    }

    // TypeScript guard - garantir que storeId é string
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId não encontrado' },
        { status: 400 }
      );
    }

    const validation = await validateStoreAccess(supabase, organizationId, storeId);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status || 403 }
      );
    }

    const result = await calculateCohortAnalysis(storeId, organizationId, maxMonths);

    if (!result.success) {
      return NextResponse.json(
        { success: false, errors: result.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Cohort calculado: ${result.cohortsAnalyzed} cohorts, ${result.dataPoints} data points`,
      data: {
        storeId,
        cohortsAnalyzed: result.cohortsAnalyzed,
        dataPoints: result.dataPoints,
        calculatedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Cohort POST] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// =============================================
// GET: Obter Cohort Data/Matrix
// =============================================

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const cohortMonth = searchParams.get('cohortMonth');
    const view = searchParams.get('view') || 'matrix';
    const maxCohorts = parseInt(searchParams.get('maxCohorts') || '12', 10);

    let resolvedStoreId = storeId;
    if (!resolvedStoreId) {
      const { data: stores } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('is_active', true)
        .limit(1);
      
      if (!stores || stores.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Nenhuma loja conectada' },
          { status: 404 }
        );
      }
      resolvedStoreId = stores[0].id;
    }

    // TypeScript guard
    if (!resolvedStoreId) {
      return NextResponse.json(
        { success: false, error: 'storeId não encontrado' },
        { status: 400 }
      );
    }

    const validation = await validateStoreAccess(supabase, organizationId, resolvedStoreId);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status || 403 }
      );
    }

    if (view === 'matrix') {
      const matrix = await getCohortMatrix(resolvedStoreId, maxCohorts);
      return NextResponse.json({ success: true, data: matrix });
    }

    if (view === 'data') {
      const data = await getCohortData(resolvedStoreId, cohortMonth || undefined);
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      { success: false, error: 'view deve ser: matrix ou data' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[Cohort GET] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
