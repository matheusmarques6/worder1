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
import crypto from 'crypto';

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

    console.log('[Shopify Callback] Received:', { code: !!code, shop, state: state?.substring(0, 10), hmac: !!hmac });

    if (errorParam) {
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=oauth_denied`);
    }

    if (!code || !shop) {
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=missing_params`);
    }

    // =============================================
    // VALIDATE HMAC (Shopify security)
    // =============================================
    if (hmac && SHOPIFY_CLIENT_SECRET) {
      const params = new URLSearchParams(searchParams);
      params.delete('hmac');
      params.sort();
      const message = params.toString();
      const generatedHmac = crypto
        .createHmac('sha256', SHOPIFY_CLIENT_SECRET)
        .update(message)
        .digest('hex');

      try {
        if (!crypto.timingSafeEqual(Buffer.from(generatedHmac, 'hex'), Buffer.from(hmac, 'hex'))) {
          console.error('[Shopify Callback] HMAC validation failed');
          return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=hmac_invalid`);
        }
      } catch {
        console.warn('[Shopify Callback] HMAC comparison error, continuing...');
      }
    }

    // =============================================
    // RESOLVE ORGANIZATION ID
    // =============================================
    let organizationId: string | null = null;

    // Try 1: State saved in oauth_states (Worder OAuth flow)
    if (state) {
      const { data: oauthState } = await supabase
        .from('oauth_states')
        .select('data')
        .eq('state_token', state)
        .gte('expires_at', new Date().toISOString())
        .maybeSingle();

      if (oauthState?.data?.organization_id) {
        organizationId = oauthState.data.organization_id;
        // Delete used state
        await supabase.from('oauth_states').delete().eq('state_token', state);
        console.log('[Shopify Callback] Resolved org via oauth_states:', organizationId);
      }
    }

    // Try 2: Existing store in DB (reinstall scenario)
    if (!organizationId) {
      const { data: existingStore } = await supabase
        .from('shopify_stores')
        .select('organization_id')
        .eq('shop_domain', shop)
        .maybeSingle();

      if (existingStore?.organization_id) {
        organizationId = existingStore.organization_id;
        console.log('[Shopify Callback] Resolved org via existing store:', organizationId);
      }
    }

    // Try 3: Fallback for Partner link install (single-org setup)
    if (!organizationId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (org?.id) {
        organizationId = org.id;
        console.log('[Shopify Callback] Resolved org via fallback:', organizationId);
      }
    }

    if (!organizationId) {
      console.error('[Shopify Callback] Could not resolve organization');
      return NextResponse.redirect(`${APP_URL}/integrations/shopify?error=no_organization`);
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
      const shopInfoRes = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
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
    const { data: existingStore } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('shop_domain', shop)
      .maybeSingle();

    const storeRecord = {
      organization_id: organizationId,
      shop_domain: shop,
      shop_name: shopName,
      shop_email: shopEmail,
      access_token: accessToken,
      api_secret: SHOPIFY_CLIENT_SECRET,
      currency,
      plan_name: planName,
      api_version: '2025-01',
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
      await supabase.from('shopify_stores').update(storeRecord).eq('id', existingStore.id);
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
        const res = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
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
      const pixelRes = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
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
      webhook_secret: SHOPIFY_CLIENT_SECRET,
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
          'X-Internal-Request': 'true',
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
