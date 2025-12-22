// =============================================
// API: Shopify OAuth Authentication
// src/app/api/integrations/shopify/auth/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getShopifyAuthUrl } from '@/lib/integrations/shopify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_SCOPES = [
  'read_customers',
  'read_orders',
  'read_checkouts',
  'read_products',
  'write_webhooks',
];

// =============================================
// GET - Iniciar OAuth
// =============================================
export async function GET(request: NextRequest) {
  try {
    // Verificar se OAuth está configurado
    if (!SHOPIFY_CLIENT_ID) {
      return NextResponse.json(
        { error: 'OAuth não configurado. SHOPIFY_CLIENT_ID não definido.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const shopDomain = searchParams.get('shop');

    if (!organizationId || !shopDomain) {
      return NextResponse.json(
        { error: 'organizationId and shop domain required' },
        { status: 400 }
      );
    }

    // Validar formato do domínio
    let normalizedDomain = shopDomain.trim().toLowerCase();
    if (!normalizedDomain.includes('.myshopify.com')) {
      normalizedDomain = `${normalizedDomain}.myshopify.com`;
    }
    normalizedDomain = normalizedDomain.replace(/^https?:\/\//, '');

    // Gerar state único para segurança
    const state = crypto.randomBytes(16).toString('hex');

    // Salvar state temporariamente
    await supabase.from('oauth_states').insert({
      state,
      organization_id: organizationId,
      provider: 'shopify',
      metadata: { shop_domain: normalizedDomain },
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    });

    // Construir URL de autorização
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/callback`;
    
    const authUrl = getShopifyAuthUrl({
      shopDomain: normalizedDomain,
      clientId: SHOPIFY_CLIENT_ID,
      redirectUri,
      scopes: SHOPIFY_SCOPES,
      state,
    });

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('Shopify auth error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================
// POST - Verificar conexão existente
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }

    // Buscar lojas conectadas (usa shopify_stores existente)
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!stores || stores.length === 0) {
      return NextResponse.json({ connected: false, stores: [] });
    }

    return NextResponse.json({
      connected: true,
      stores: stores.map(s => ({
        id: s.id,
        shop_domain: s.shop_domain,
        shop_name: s.shop_name,
        is_active: s.is_active,
        created_at: s.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Shopify status error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE - Desconectar Shopify
// =============================================
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const storeId = searchParams.get('storeId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }

    // Desativar loja(s)
    const query = supabase
      .from('shopify_stores')
      .update({ is_active: false })
      .eq('organization_id', organizationId);

    // Se tiver storeId específico, desativa só essa
    if (storeId) {
      query.eq('id', storeId);
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Shopify disconnect error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
