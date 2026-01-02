// =============================================
// API: Shopify OAuth Callback
// src/app/api/integrations/shopify/callback/route.ts
// Usa tabela 'shopify_stores' (padrão do projeto)
// =============================================

// Forçar rota dinâmica (não pode ser gerada estaticamente)
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { 
  exchangeCodeForToken, 
  ShopifyClient,
  SHOPIFY_WEBHOOK_TOPICS 
} from '@/lib/integrations/shopify';

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

    // Configurar webhooks - CRÍTICO: não ignorar erros
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`;
    const webhookUrl = `${appUrl}/api/webhooks/shopify`;
    
    console.log('========================================');
    console.log('[SHOPIFY CALLBACK] Registrando webhooks...');
    console.log('[SHOPIFY CALLBACK] URL base:', appUrl);
    console.log('[SHOPIFY CALLBACK] Webhook URL:', webhookUrl);
    console.log('[SHOPIFY CALLBACK] Shop:', shop);
    console.log('========================================');
    
    const webhookTopics = [
      'customers/create',
      'customers/update', 
      'orders/create',
      'orders/paid',
      'orders/fulfilled',
      'orders/cancelled',
      'checkouts/create',
      'checkouts/update',
    ];
    
    const webhookResults: { topic: string; success: boolean; error?: string }[] = [];
    
    for (const topic of webhookTopics) {
      try {
        console.log(`[SHOPIFY CALLBACK] Criando webhook: ${topic}`);
        
        const response = await fetch(
          `https://${shop}/admin/api/2024-01/webhooks.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': tokenData.access_token,
            },
            body: JSON.stringify({
              webhook: {
                topic,
                address: webhookUrl,
                format: 'json',
              },
            }),
          }
        );
        
        const result = await response.json();
        
        if (response.ok) {
          console.log(`[SHOPIFY CALLBACK] ✅ Webhook criado: ${topic}`);
          webhookResults.push({ topic, success: true });
        } else {
          // Se webhook já existe, tudo bem
          const errorMsg = JSON.stringify(result.errors || result);
          if (errorMsg.includes('already exists') || errorMsg.includes('for this topic has already been taken')) {
            console.log(`[SHOPIFY CALLBACK] ⚠️ Webhook já existe: ${topic}`);
            webhookResults.push({ topic, success: true, error: 'already_exists' });
          } else {
            console.error(`[SHOPIFY CALLBACK] ❌ Erro webhook ${topic}:`, errorMsg);
            webhookResults.push({ topic, success: false, error: errorMsg });
          }
        }
      } catch (webhookError: any) {
        console.error(`[SHOPIFY CALLBACK] ❌ Exceção webhook ${topic}:`, webhookError.message);
        webhookResults.push({ topic, success: false, error: webhookError.message });
      }
    }
    
    // Log resultado final
    const successCount = webhookResults.filter(r => r.success).length;
    const failCount = webhookResults.filter(r => !r.success).length;
    console.log('========================================');
    console.log(`[SHOPIFY CALLBACK] Webhooks: ${successCount} OK, ${failCount} falhas`);
    console.log('[SHOPIFY CALLBACK] Resultados:', JSON.stringify(webhookResults));
    console.log('========================================');

    // Redirecionar para página de sucesso
    return NextResponse.redirect(
      `${appUrl}/integrations/shopify?success=true&webhooks=${successCount}`
    );
  } catch (error: any) {
    console.error('Shopify callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=${encodeURIComponent(error.message)}`
    );
  }
}
