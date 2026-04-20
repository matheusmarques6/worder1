// =============================================
// Shopify token refresh cron
// GET /api/cron/shopify-token-refresh
//
// Runs every ~23h (see vercel.json) and renews access_token for
// every manual-integration Shopify store whose token_expires_at
// is within the next 2 hours. Uses the Client Credentials grant,
// so it just needs the client_id + api_secret (Client Secret)
// we persisted at connect-time.
//
// Auth: Bearer CRON_SECRET if the env var is set (matches Vercel
// Cron auth header convention). When unset, the endpoint is open
// (only useful in dev).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { refreshStoreToken } from '@/lib/shopify/client-credentials';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();

  try {
    // 2h lookahead so we refresh a bit early and always have a fresh
    // token on hand even if the cron fires slightly off-schedule.
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, client_id, api_secret, token_expires_at')
      .eq('connection_type', 'manual')
      .eq('is_active', true)
      .not('client_id', 'is', null)
      .lte('token_expires_at', twoHoursFromNow);

    if (error) throw error;

    if (!stores || stores.length === 0) {
      return NextResponse.json({ message: 'No tokens to refresh', count: 0 });
    }

    const results: any[] = [];

    for (const store of stores) {
      if (!store.client_id || !store.api_secret) {
        results.push({
          id: store.id,
          domain: store.shop_domain,
          status: 'skipped',
          reason: 'missing credentials',
        });
        continue;
      }

      try {
        const newToken = await refreshStoreToken(
          store.shop_domain,
          store.client_id,
          store.api_secret
        );
        const newExpiresAt = new Date(Date.now() + 86399 * 1000).toISOString();

        await supabase
          .from('shopify_stores')
          .update({
            access_token: newToken,
            token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', store.id);

        results.push({
          id: store.id,
          domain: store.shop_domain,
          status: 'refreshed',
          expiresAt: newExpiresAt,
        });
        console.log(`[Token Refresh] Renewed ${store.shop_domain}`);
      } catch (err: any) {
        results.push({
          id: store.id,
          domain: store.shop_domain,
          status: 'failed',
          error: err.message,
        });
        console.error(`[Token Refresh] Failed for ${store.shop_domain}:`, err.message);
      }
    }

    return NextResponse.json({ count: stores.length, results });
  } catch (error: any) {
    console.error('[Token Refresh] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
