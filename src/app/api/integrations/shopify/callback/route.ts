// =============================================
// API: Shopify OAuth Callback
// src/app/api/integrations/shopify/callback/route.ts
// Usa tabela 'shopify_stores' (padrão do projeto)
// =============================================

// Forçar rota dinâmica (não pode ser gerada estaticamente)
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  exchangeCodeForToken, 
  ShopifyClient,
  SHOPIFY_WEBHOOK_TOPICS 
} from '@/lib/integrations/shopify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';

// =============================================
// GET - Callback do OAuth
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const shop = searchParams.get('shop');
    const errorParam = searchParams.get('error');

    // Verificar erro
    if (errorParam) {
      console.error('Shopify OAuth error:', errorParam);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=oauth_denied`
      );
    }

    // Validar parâmetros
    if (!code || !state || !shop) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=missing_params`
      );
    }

    // Verificar state
    const { data: oauthState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .eq('provider', 'shopify')
      .single();

    if (stateError || !oauthState) {
      console.error('Invalid state:', stateError);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=invalid_state`
      );
    }

    // Verificar expiração
    if (new Date(oauthState.expires_at) < new Date()) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=state_expired`
      );
    }

    const organizationId = oauthState.organization_id;

    // Deletar state usado
    await supabase.from('oauth_states').delete().eq('state', state);

    // Verificar se tem credenciais OAuth configuradas
    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
      console.error('Missing Shopify OAuth credentials');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=oauth_not_configured`
      );
    }

    // Trocar código por access token
    const tokenData = await exchangeCodeForToken({
      shopDomain: shop,
      clientId: SHOPIFY_CLIENT_ID,
      clientSecret: SHOPIFY_CLIENT_SECRET,
      code,
    });

    // Criar cliente e obter info da loja
    const client = new ShopifyClient({
      shopDomain: shop,
      accessToken: tokenData.access_token,
    });

    const shopInfo = await client.getShop();
    const shopData = shopInfo.shop || {};

    // Verificar se loja já existe
    const { data: existingStore } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('shop_domain', shop)
      .single();

    if (existingStore) {
      // Atualizar existente
      const { error: updateError } = await supabase
        .from('shopify_stores')
        .update({
          organization_id: organizationId,
          shop_name: shopData.name || shop,
          shop_email: shopData.email,
          access_token: tokenData.access_token,
          api_secret: SHOPIFY_CLIENT_SECRET,
          currency: shopData.currency,
          timezone: shopData.timezone,
          is_active: true,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', existingStore.id);

      if (updateError) {
        console.error('Update error:', updateError);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=save_failed`
        );
      }
    } else {
      // Criar nova
      const { error: insertError } = await supabase
        .from('shopify_stores')
        .insert({
          organization_id: organizationId,
          shop_domain: shop,
          shop_name: shopData.name || shop,
          shop_email: shopData.email,
          access_token: tokenData.access_token,
          api_secret: SHOPIFY_CLIENT_SECRET,
          currency: shopData.currency,
          timezone: shopData.timezone,
          is_active: true,
          last_sync_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=save_failed`
        );
      }
    }

    // Configurar webhooks
    const webhookBaseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/shopify`;
    const webhookTopics = [
      SHOPIFY_WEBHOOK_TOPICS.CUSTOMERS_CREATE,
      SHOPIFY_WEBHOOK_TOPICS.ORDERS_CREATE,
      SHOPIFY_WEBHOOK_TOPICS.ORDERS_PAID,
      SHOPIFY_WEBHOOK_TOPICS.CHECKOUTS_CREATE,
    ];

    for (const topic of webhookTopics) {
      try {
        await client.createWebhook({
          topic,
          address: webhookBaseUrl,
          format: 'json',
        });
      } catch (webhookError: any) {
        // Webhook pode já existir, ignorar
        console.warn(`Webhook ${topic} error:`, webhookError.message);
      }
    }

    // Redirecionar para página de sucesso
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?success=true`
    );
  } catch (error: any) {
    console.error('Shopify callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=${encodeURIComponent(error.message)}`
    );
  }
}
