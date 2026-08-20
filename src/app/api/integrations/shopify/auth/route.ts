import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

// Scopes declared here must be allowed in the Partner Dashboard for this app.
// 'read_all_orders' allows fetching orders older than 60 days. For Plus/dev
// stores it's auto-approved; for production stores it requires Shopify approval.
// We request it — if denied, the granted scopes string will exclude it but
// installation will still succeed.
const SCOPES = [
  'read_orders', 'read_all_orders', 'read_draft_orders',
  'read_customers', 'write_customers',
  'read_products', 'read_inventory',
  'read_discounts', 'write_discounts',
  'read_price_rules', 'write_price_rules',
  'write_pixels', 'read_customer_events',
  'read_shipping', 'read_fulfillments',
  'read_marketing_events',
].join(',');

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  try {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json({ error: 'Shop domain required' }, { status: 400 });
    }

    // Normalize domain
    const normalizedShop = shop.includes('.myshopify.com')
      ? shop
      : `${shop}.myshopify.com`;

    // Generate secure random state
    const state = crypto.randomBytes(32).toString('hex');

    // Save state in oauth_states. O schema VIVO é (state, provider,
    // organization_id, metadata, expires_at); o formato antigo era
    // (state_token, data). O insert antigo falhava silencioso em 42703 e
    // o callback caía nos fallbacks de resolução de org — gravar no vivo
    // primeiro, formato antigo como fallback (CI/dev).
    const supabase = getSupabaseAdmin();
    const statePayload = {
      organization_id: auth.user.organization_id,
      user_id: auth.user.id,
      provider: 'shopify',
      shop: normalizedShop,
    };
    const stateExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: stateErr } = await supabase.from('oauth_states').insert({
      state,
      provider: 'shopify',
      organization_id: auth.user.organization_id,
      metadata: statePayload,
      expires_at: stateExpiresAt,
    });
    if (stateErr) {
      await supabase.from('oauth_states').insert({
        state_token: state,
        data: statePayload,
        expires_at: stateExpiresAt,
      });
    }

    // Build OAuth authorization URL
    const redirectUri = `${APP_URL}/api/integrations/shopify/callback`;
    const authUrl = `https://${normalizedShop}/admin/oauth/authorize?` +
      new URLSearchParams({
        client_id: SHOPIFY_CLIENT_ID,
        scope: SCOPES,
        redirect_uri: redirectUri,
        state,
      }).toString();

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('[Shopify Auth] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
