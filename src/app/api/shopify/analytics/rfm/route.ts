// =============================================
// API: Shopify RFM Analytics
// src/app/api/shopify/analytics/rfm/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, validateStoreAccess } from '@/lib/api-utils';
import { calculateRFMScores, getRFMScores, getRFMSummary } from '@/lib/services/shopify/analytics/rfm';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// =============================================
// POST: Calcular RFM Scores
// =============================================

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    let storeId: string | null = null;
    try {
      const body = await request.json();
      storeId = body.storeId || null;
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

    // TypeScript guard
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

    const result = await calculateRFMScores(storeId, organizationId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, errors: result.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `RFM calculado para ${result.customersAnalyzed} clientes`,
      data: {
        storeId,
        customersAnalyzed: result.customersAnalyzed,
        segmentCounts: result.segmentCounts,
        calculatedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[RFM POST] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// =============================================
// GET: Obter RFM Scores/Summary
// =============================================

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const segment = searchParams.get('segment');
    const view = searchParams.get('view') || 'summary';

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

    if (view === 'summary') {
      const summary = await getRFMSummary(resolvedStoreId);
      return NextResponse.json({ success: true, data: summary });
    }

    if (view === 'scores' || view === 'segments') {
      const scores = await getRFMScores(resolvedStoreId, segment || undefined);
      return NextResponse.json({ success: true, data: scores });
    }

    return NextResponse.json(
      { success: false, error: 'view deve ser: summary, scores, ou segments' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[RFM GET] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
