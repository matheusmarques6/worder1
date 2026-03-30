import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json({ error: 'Shop domain required' }, { status: 400 });
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/callback`;
    const scopes = 'read_orders,read_checkouts,read_customers,read_products,read_inventory,read_shipping,read_fulfillments,write_customers,write_pixels,read_customer_events';
    const state = Buffer.from(JSON.stringify({ organizationId, userId: auth.user.id })).toString('base64');

    // Save state for validation in callback
    const supabase = getSupabaseAdmin();
    await supabase.from('oauth_states').upsert({
      state,
      provider: 'shopify',
      organization_id: organizationId,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
      created_at: new Date().toISOString(),
    }, { onConflict: 'state' });

    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('Shopify Auth GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
