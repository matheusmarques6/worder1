import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

const SCOPES = [
  'read_orders', 'read_all_orders', 'read_checkouts',
  'read_customers', 'write_customers', 'read_products',
  'read_inventory', 'read_shipping', 'read_fulfillments',
  'write_pixels', 'read_customer_events', 'read_marketing_events',
  'read_price_rules',
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

    // Save state in oauth_states table (correct column: state_token)
    const supabase = getSupabaseAdmin();
    await supabase.from('oauth_states').insert({
      state_token: state,
      data: {
        organization_id: auth.user.organization_id,
        user_id: auth.user.id,
        provider: 'shopify',
        shop: normalizedShop,
      },
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

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
