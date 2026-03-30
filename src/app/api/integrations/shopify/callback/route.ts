// =============================================
// API: Shopify OAuth Callback
// src/app/api/integrations/shopify/callback/route.ts
//
// Migrated to GraphQL for webhook registration
// and web pixel installation.
// =============================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { exchangeCodeForToken, ShopifyClient } from '@/lib/integrations/shopify';
import { shopifyGraphQL } from '@/lib/shopify/graphql-client';
import { SHOP_QUERY } from '@/lib/shopify/graphql-queries';
import {
  WEBHOOK_SUBSCRIPTION_CREATE,
  WEB_PIXEL_CREATE,
  WEBHOOK_TOPICS_TO_REGISTER,
} from '@/lib/shopify/graphql-mutations';

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

    const storeConfig = {
      id: '',
      organization_id: organizationId,
      shop_domain: shop,
      access_token: tokenData.access_token,
    };

    // Get shop info via GraphQL
    let shopData: any = {};
    try {
      const shopResult = await shopifyGraphQL(storeConfig, SHOP_QUERY);
      shopData = shopResult.data?.shop || {};
    } catch (gqlError) {
      // Fallback to REST
      console.warn('[Shopify Callback] GraphQL shop query failed, using REST fallback:', gqlError);
      const client = new ShopifyClient({ shopDomain: shop, accessToken: tokenData.access_token });
      const restShopInfo = await client.getShop();
      shopData = restShopInfo.shop || {};
    }

    // Parse scopes
    const grantedScopes = tokenData.scope ? tokenData.scope.split(',') : [];

    // Verificar se loja já existe
    const { data: existingStore } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('shop_domain', shop)
      .single();

    const storeRecord = {
      organization_id: organizationId,
      shop_name: shopData.name || shop,
      shop_email: shopData.email,
      access_token: tokenData.access_token,
      api_secret: SHOPIFY_CLIENT_SECRET,
      currency: shopData.currencyCode || shopData.currency,
      timezone: shopData.ianaTimezone || shopData.timezone,
      is_active: true,
      api_version: '2026-01',
      scopes: grantedScopes,
      plan_name: shopData.plan?.displayName || null,
      installed_at: new Date().toISOString(),
      status: 'active',
      last_sync_at: new Date().toISOString(),
    };

    let storeId: string;

    if (existingStore) {
      const { error: updateError } = await supabase
        .from('shopify_stores')
        .update(storeRecord)
        .eq('id', existingStore.id);

      if (updateError) {
        console.error('Update error:', updateError);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=save_failed`
        );
      }
      storeId = existingStore.id;
    } else {
      const { data: newStore, error: insertError } = await supabase
        .from('shopify_stores')
        .insert({ shop_domain: shop, ...storeRecord })
        .select('id')
        .single();

      if (insertError || !newStore) {
        console.error('Insert error:', insertError);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=save_failed`
        );
      }
      storeId = newStore.id;
    }

    // Update storeConfig with real ID
    storeConfig.id = storeId;

    // =============================================
    // REGISTER WEBHOOKS VIA GRAPHQL
    // =============================================
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`;
    const webhookUrl = `${appUrl}/api/webhooks/shopify`;

    console.log('========================================');
    console.log('[SHOPIFY CALLBACK] Registering webhooks via GraphQL...');
    console.log('[SHOPIFY CALLBACK] Webhook URL:', webhookUrl);
    console.log('[SHOPIFY CALLBACK] Shop:', shop);
    console.log('========================================');

    const webhookResults: { topic: string; success: boolean; error?: string }[] = [];

    for (const topic of WEBHOOK_TOPICS_TO_REGISTER) {
      try {
        const result = await shopifyGraphQL(storeConfig, WEBHOOK_SUBSCRIPTION_CREATE, {
          topic,
          webhookSubscription: {
            callbackUrl: webhookUrl,
            format: 'JSON',
          },
        });

        const userErrors = result.data?.webhookSubscriptionCreate?.userErrors || [];
        if (userErrors.length > 0) {
          const errorMsg = userErrors.map((e: any) => e.message).join('; ');
          // "already exists" is not an error
          if (errorMsg.toLowerCase().includes('already') || errorMsg.toLowerCase().includes('exists')) {
            console.log(`[SHOPIFY CALLBACK] Webhook already exists: ${topic}`);
            webhookResults.push({ topic, success: true, error: 'already_exists' });
          } else {
            console.error(`[SHOPIFY CALLBACK] Webhook error ${topic}:`, errorMsg);
            webhookResults.push({ topic, success: false, error: errorMsg });
          }
        } else {
          console.log(`[SHOPIFY CALLBACK] Webhook created: ${topic}`);
          webhookResults.push({ topic, success: true });
        }
      } catch (webhookError: any) {
        console.error(`[SHOPIFY CALLBACK] Webhook exception ${topic}:`, webhookError.message);
        webhookResults.push({ topic, success: false, error: webhookError.message });
      }
    }

    const successCount = webhookResults.filter((r) => r.success).length;
    const failCount = webhookResults.filter((r) => !r.success).length;
    console.log(`[SHOPIFY CALLBACK] Webhooks: ${successCount} OK, ${failCount} failed`);

    // =============================================
    // INSTALL WEB PIXEL VIA GRAPHQL
    // =============================================
    let pixelInstalled = false;
    try {
      const pixelResult = await shopifyGraphQL(storeConfig, WEB_PIXEL_CREATE, {
        webPixel: {
          settings: JSON.stringify({
            accountId: organizationId,
            storeId: storeId,
            trackingEndpoint: `${appUrl}/api/track/event`,
          }),
        },
      });

      const pixelErrors = pixelResult.data?.webPixelCreate?.userErrors || [];
      if (pixelErrors.length > 0) {
        const errorMsg = pixelErrors.map((e: any) => e.message).join('; ');
        if (errorMsg.toLowerCase().includes('already') || errorMsg.toLowerCase().includes('exists')) {
          console.log('[SHOPIFY CALLBACK] Web pixel already installed');
          pixelInstalled = true;
        } else {
          console.error('[SHOPIFY CALLBACK] Pixel creation error:', errorMsg);
        }
      } else {
        console.log('[SHOPIFY CALLBACK] Web pixel installed successfully');
        pixelInstalled = true;
      }
    } catch (pixelError: any) {
      console.error('[SHOPIFY CALLBACK] Pixel installation failed:', pixelError.message);
    }

    // Generate theme editor URL for App Embed activation
    const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;

    // Update store with pixel status and theme editor URL
    await supabase
      .from('shopify_stores')
      .update({
        pixel_installed: pixelInstalled,
        webhook_secret: SHOPIFY_CLIENT_SECRET,
        embed_installed: false, // Will be true when merchant activates App Embed
        settings: {
          theme_editor_url: themeEditorUrl,
          tracking_endpoint: `${appUrl}/api/track`,
        },
      })
      .eq('id', storeId);

    console.log('========================================');
    console.log(`[SHOPIFY CALLBACK] Complete: ${successCount} webhooks, pixel: ${pixelInstalled}`);
    console.log(`[SHOPIFY CALLBACK] Theme editor URL: ${themeEditorUrl}`);
    console.log('========================================');

    // Redirecionar para página de sucesso
    return NextResponse.redirect(
      `${appUrl}/integrations/shopify?success=true&webhooks=${successCount}&pixel=${pixelInstalled}`
    );
  } catch (error: any) {
    console.error('Shopify callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations/shopify?error=${encodeURIComponent(error.message)}`
    );
  }
}
