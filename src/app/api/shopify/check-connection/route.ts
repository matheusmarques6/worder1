// =============================================
// Shopify Check Connection API
// src/app/api/shopify/check-connection/route.ts
//
// Verifica se a conexão com a loja Shopify está OK
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return getSupabaseAdmin();
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const storeId = request.nextUrl.searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'Store ID required' }, { status: 400 });
  }

  try {
    // 1. Buscar dados da loja
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Store not found' 
      }, { status: 404 });
    }

    // 2. Verificar se tem access_token
    if (!store.access_token) {
      return NextResponse.json({ 
        ok: false, 
        error: 'No access token',
        details: 'A loja não tem token de acesso configurado'
      }, { status: 400 });
    }

    // 3. Fazer uma chamada simples à API do Shopify para testar
    const shopifyUrl = `https://${store.shop_domain}/admin/api/2024-01/shop.json`;
    
    const response = await fetch(shopifyUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Shopify Check] API error:', response.status, errorText);
      
      // Atualizar status da loja
      await supabase
        .from('shopify_stores')
        .update({ 
          is_active: false,
          last_error: `API error: ${response.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', storeId);

      return NextResponse.json({ 
        ok: false, 
        error: 'Shopify API error',
        status: response.status,
        details: errorText.slice(0, 200),
      }, { status: 400 });
    }

    const shopData = await response.json();

    // 4. Atualizar status da loja como ativa
    await supabase
      .from('shopify_stores')
      .update({ 
        is_active: true,
        shop_name: shopData.shop?.name || store.shop_name,
        shop_email: shopData.shop?.email || store.shop_email,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', storeId);

    return NextResponse.json({ 
      ok: true, 
      shop: {
        name: shopData.shop?.name,
        email: shopData.shop?.email,
        domain: shopData.shop?.domain,
        plan: shopData.shop?.plan_name,
      }
    });

  } catch (error: any) {
    console.error('[Shopify Check] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
}
