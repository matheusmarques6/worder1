// =====================================================
// API: ANALYZE STORE
// src/app/api/ai/analyze-store/route.ts
//
// Analisa uma loja Shopify conectada e gera configurações
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ShopifyAPIService } from '@/lib/shopify/api-service';
import { runFullAnalysis } from '@/lib/ai/store-analyzer';
import type { CollectedStoreData } from '@/types/store-analysis';

// =====================================================
// AUTH CLIENT
// =====================================================

async function getAuthClient() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  const refreshToken = cookieStore.get('sb-refresh-token')?.value;

  if (!accessToken) {
    throw new Error('Não autenticado');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );

  // Verificar sessão
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('Sessão inválida');
  }

  // Buscar organization_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  return {
    supabase,
    user,
    organizationId: profile?.organization_id,
  };
}

// =====================================================
// POST - ANALISAR LOJA
// =====================================================

export async function POST(request: NextRequest) {
  try {
    // Autenticação
    const { supabase, organizationId } = await getAuthClient();

    if (!organizationId) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 400 });
    }

    // Validar body
    const body = await request.json();
    const { storeId } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId é obrigatório' }, { status: 400 });
    }

    // Buscar credenciais da loja
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    if (!store.access_token) {
      return NextResponse.json({ error: 'Loja não está conectada' }, { status: 400 });
    }

    // Criar serviço Shopify
    const shopifyService = new ShopifyAPIService(store.shop_domain, store.access_token);

    // Coletar dados da loja
    console.log('Coletando dados do Shopify...');
    const rawData = await shopifyService.collectAllData();

    // Estruturar dados coletados
    const collectedData: CollectedStoreData = {
      shop: {
        name: rawData.shop.name,
        domain: rawData.shop.domain,
        email: rawData.shop.email,
        currency: rawData.shop.currency,
        country: rawData.shop.country_name,
        description: rawData.shop.description,
        createdAt: rawData.shop.created_at,
      },
      products: {
        total: rawData.products.length,
        items: rawData.products.map(p => ({
          id: String(p.id),
          title: p.title,
          description: p.body_html,
          vendor: p.vendor,
          productType: p.product_type,
          tags: p.tags,
          price: parseFloat(p.variants[0]?.price || '0'),
          compareAtPrice: parseFloat(p.variants[0]?.compare_at_price || '0'),
          inventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
          images: p.images.length,
          variants: p.variants.length,
          createdAt: p.created_at,
        })),
      },
      collections: rawData.collections.map(c => ({
        id: String(c.id),
        title: c.title,
        productsCount: c.products_count || 0,
      })),
      policies: rawData.policies,
      shipping: [],
      payments: null,
    };

    // Executar análise com IA
    console.log('Executando análise com IA...');
    const analysis = await runFullAnalysis(collectedData, (step, total, message) => {
      console.log(`[${step}/${total}] ${message}`);
    });

    // Salvar análise no banco
    const { error: saveError } = await supabase
      .from('store_analyses')
      .upsert({
        organization_id: organizationId,
        shopify_store_id: storeId,
        analysis_data: analysis,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'shopify_store_id',
      });

    if (saveError) {
      console.error('Error saving analysis:', saveError);
      // Não falhar, ainda retornar a análise
    }

    return NextResponse.json({
      success: true,
      analysis,
    });

  } catch (error: any) {
    console.error('Error in POST /api/ai/analyze-store:', error);
    return NextResponse.json({
      error: error.message || 'Erro ao analisar loja',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}

// =====================================================
// GET - BUSCAR ANÁLISE EXISTENTE
// =====================================================

export async function GET(request: NextRequest) {
  try {
    // Autenticação
    const { supabase, organizationId } = await getAuthClient();

    if (!organizationId) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 400 });
    }

    // Pegar storeId da query
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId é obrigatório' }, { status: 400 });
    }

    // Verificar acesso à loja
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    // Buscar análise
    const { data: analysisRow, error } = await supabase
      .from('store_analyses')
      .select('*')
      .eq('shopify_store_id', storeId)
      .single();

    if (error || !analysisRow) {
      return NextResponse.json({
        success: true,
        analysis: null,
      });
    }

    return NextResponse.json({
      success: true,
      analysis: analysisRow.analysis_data,
      analyzedAt: analysisRow.created_at,
    });

  } catch (error: any) {
    console.error('Error in GET /api/ai/analyze-store:', error);
    return NextResponse.json({
      error: error.message || 'Erro ao buscar análise',
    }, { status: 500 });
  }
}
