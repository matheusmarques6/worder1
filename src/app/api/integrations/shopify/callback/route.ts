import { sealIntegrationSecret } from '@/lib/integrations/credential-codec';
import { openIntegrationSecret } from '@/lib/integrations/credential-codec';
// =============================================
// Shopify OAuth Callback
// src/app/api/integrations/shopify/callback/route.ts
//
// Handles TWO scenarios:
// A) Merchant came from Worder OAuth (state in oauth_states)
// B) Merchant came from Partner Dashboard link (HMAC, no state in DB)
// =============================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isShopifyDomain, validShopifyOAuthHmac } from '@/lib/shopify/oauth-validation';

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const shop = searchParams.get('shop');
    const state = searchParams.get('state');
    const hmac = searchParams.get('hmac');
    const errorParam = searchParams.get('error');

    console.log('[Shopify Callback] Received:', { code: !!code, shop, state: !!state, hmac: !!hmac });

    if (errorParam) {
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=oauth_denied`);
    }

    if (!code || !shop) {
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=missing_params`);
    }

    if (!isShopifyDomain(shop)) {
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=invalid_shop`);
    }
    if (!validShopifyOAuthHmac(searchParams, SHOPIFY_CLIENT_SECRET)) {
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=hmac_invalid`);
    }

    let organizationId: string | null = null;
    if (state !== null) {
      if (!/^[a-f0-9]{64}$/.test(state)) {
        return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=invalid_state`);
      }
      // DELETE ... RETURNING is one atomic claim; a replay receives no row.
      const { data: stateRow, error: stateErr } = await supabase
        .from('oauth_states')
        .delete()
        .eq('state', state)
        .eq('provider', 'shopify')
        .eq('metadata->>shop', shop)
        .gte('expires_at', new Date().toISOString())
        .select('organization_id, metadata')
        .maybeSingle();
      if (stateErr || !stateRow?.organization_id ||
          stateRow.metadata?.organization_id !== stateRow.organization_id ||
          stateRow.metadata?.provider !== 'shopify' || stateRow.metadata?.shop !== shop) {
        return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=invalid_state`);
      }
      organizationId = stateRow.organization_id;
    }

    const { data: existingStore, error: mappingError } = await supabase
      .from('shopify_stores')
      .select('id, organization_id')
      .eq('shop_domain', shop)
      .maybeSingle();
    if (mappingError || (existingStore && organizationId && existingStore.organization_id !== organizationId)) {
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=store_conflict`);
    }
    // A signed reinstall can recover only its unambiguous existing tenant mapping.
    if (state === null) organizationId = existingStore?.organization_id || null;
    if (!organizationId) {
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=invalid_state`);
    }

    // =============================================
    // EXCHANGE CODE FOR ACCESS TOKEN
    // =============================================
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[Shopify Callback] Token exchange failed:', errText);
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=token_failed`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const grantedScopes = tokenData.scope || '';

    console.log('[Shopify Callback] Token obtained. Scopes:', grantedScopes);

    // =============================================
    // GET SHOP INFO VIA GRAPHQL
    // =============================================
    let shopName = shop;
    let shopEmail = '';
    let currency = 'BRL';
    let planName = '';

    try {
      const shopInfoRes = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': openIntegrationSecret(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `{ shop { name email currencyCode plan { displayName } } }`,
        }),
      });

      if (shopInfoRes.ok) {
        const shopInfo = await shopInfoRes.json();
        const s = shopInfo.data?.shop;
        if (s) {
          shopName = s.name || shop;
          shopEmail = s.email || '';
          currency = s.currencyCode || 'BRL';
          planName = s.plan?.displayName || '';
        }
      }
    } catch (err) {
      console.warn('[Shopify Callback] Failed to get shop info:', err);
    }

    // =============================================
    // UPSERT STORE IN DB
    // =============================================
    const storeRecord = {
      organization_id: organizationId,
      shop_domain: shop,
      shop_name: shopName,
      shop_email: shopEmail,
      access_token: sealIntegrationSecret(accessToken),
      api_secret: sealIntegrationSecret(SHOPIFY_CLIENT_SECRET),
      currency,
      plan_name: planName,
      api_version: '2026-04',
      scopes: grantedScopes ? grantedScopes.split(/[\s,]+/).filter(Boolean) : [],
      is_active: true,
      status: 'active',
      installed_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      // Enable all sync flags by default
      sync_orders: true,
      sync_customers: true,
      sync_checkouts: true,
      sync_products: true,
      sync_refunds: true,
    };

    let storeId: string;

    if (existingStore) {
      await supabase.from('shopify_stores').update(storeRecord).eq('id', existingStore.id).eq('organization_id', organizationId);
      storeId = existingStore.id;
    } else {
      const { data: newStore, error: insertError } = await supabase
        .from('shopify_stores')
        .insert(storeRecord)
        .select('id')
        .single();

      if (insertError || !newStore) {
        console.error('[Shopify Callback] Store insert error:', insertError);
        return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=save_failed`);
      }
      storeId = newStore.id;
      // A loja nasce com remetente próprio: <nome-da-loja>@worder.email.
      try {
        const { ensureStoreSharedSender } = await import('@/lib/email/shared-sender');
        await ensureStoreSharedSender(storeId);
      } catch (e) {
        console.warn('[Shopify Callback] remetente compartilhado não alocado:', (e as Error).message);
      }
    }

    // =============================================
    // REGISTER WEBHOOKS VIA GRAPHQL
    // =============================================
    const webhookUrl = `${APP_URL}/api/webhooks/shopify`;
    const webhookTopics = [
      'ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_FULFILLED',
      'ORDERS_CANCELLED', 'ORDERS_PAID',
      'CHECKOUTS_CREATE', 'CHECKOUTS_UPDATE',
      'CUSTOMERS_CREATE', 'CUSTOMERS_UPDATE', 'CUSTOMERS_DELETE',
      'PRODUCTS_CREATE', 'PRODUCTS_UPDATE', 'PRODUCTS_DELETE',
      'REFUNDS_CREATE',
      'FULFILLMENTS_CREATE', 'FULFILLMENTS_UPDATE',
      'APP_UNINSTALLED',
    ];

    const webhookMutation = `
      mutation webhookCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription { id topic }
          userErrors { field message }
        }
      }
    `;

    let webhookSuccess = 0;
    let webhookFail = 0;

    for (const topic of webhookTopics) {
      try {
        const res = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': openIntegrationSecret(accessToken),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: webhookMutation,
            variables: {
              topic,
              webhookSubscription: { callbackUrl: webhookUrl, format: 'JSON' },
            },
          }),
        });

        const data = await res.json();
        const errors = data.data?.webhookSubscriptionCreate?.userErrors;
        if (!errors || errors.length === 0) {
          webhookSuccess++;
        } else {
          const msg = errors[0]?.message || '';
          if (msg.includes('already') || msg.includes('taken')) {
            webhookSuccess++;
          } else {
            console.warn(`[Shopify Callback] Webhook ${topic}: ${msg}`);
            webhookFail++;
          }
        }
      } catch {
        webhookFail++;
      }
    }

    console.log(`[Shopify Callback] Webhooks: ${webhookSuccess} OK, ${webhookFail} failed`);

    // =============================================
    // INSTALL WEB PIXEL
    // =============================================
    let pixelInstalled = false;
    try {
      const pixelRes = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': openIntegrationSecret(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation webPixelCreate($webPixel: WebPixelInput!) {
              webPixelCreate(webPixel: $webPixel) {
                webPixel { id }
                userErrors { code field message }
              }
            }
          `,
          variables: {
            webPixel: {
              settings: JSON.stringify({
                accountId: organizationId,
                storeId,
                trackingEndpoint: `${APP_URL}/api/track/event`,
              }),
            },
          },
        }),
      });

      const pixelData = await pixelRes.json();
      const pixelErrors = pixelData.data?.webPixelCreate?.userErrors || [];
      if (pixelErrors.length === 0) {
        pixelInstalled = true;
      } else {
        const msg = pixelErrors[0]?.message || '';
        if (msg.includes('already') || msg.includes('exists')) {
          pixelInstalled = true;
        }
      }
    } catch (err) {
      console.warn('[Shopify Callback] Pixel install failed:', err);
    }

    // =============================================
    // UPDATE STORE WITH FINAL STATUS
    // =============================================
    const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;

    await supabase.from('shopify_stores').update({
      pixel_installed: pixelInstalled,
      webhook_secret: sealIntegrationSecret(SHOPIFY_CLIENT_SECRET),
      embed_installed: false,
      settings: {
        theme_editor_url: themeEditorUrl,
        tracking_endpoint: `${APP_URL}/api/track`,
      },
    }).eq('id', storeId);

    // =============================================
    // TRIGGER INITIAL SYNC (fire-and-forget)
    // =============================================
    try {
      fetch(`${APP_URL}/api/shopify/trigger-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || ''}`,
        },
        body: JSON.stringify({ storeId }),
      }).catch(() => {});
    } catch {}

    // =============================================
    // REDIRECT TO SUCCESS
    // =============================================
    console.log(`[Shopify Callback] Complete: store=${storeId}, webhooks=${webhookSuccess}, pixel=${pixelInstalled}`);

    return NextResponse.redirect(
      `${APP_URL}/integrations/shopify?success=true&store=${storeId}&webhooks=${webhookSuccess}&pixel=${pixelInstalled}`
    );
  } catch (error: any) {
    console.error('[Shopify Callback] Error:', error);
    return NextResponse.redirect(
      `${APP_URL}/integrations/shopify?error=${encodeURIComponent(error.message)}`
    );
  }
}
