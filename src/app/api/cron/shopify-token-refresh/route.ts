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
import { refreshPrimaryDomain } from '@/lib/shopify/store-url';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Accepts Vercel Cron (x-vercel-cron header) OR Authorization: Bearer
// CRON_SECRET. Fail-closed in production: when CRON_SECRET is unset we
// reject in prod (open only in dev). Previously a missing secret skipped
// the whole check, leaving the endpoint fully open in production.
function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // ── Domínio principal de cada loja (diário) ──
  // {{store_url}} sai de primary_domain, e o lojista pode trocar o
  // domínio na Shopify a qualquer hora. Este é o cron diário que já fala
  // com a Shopify, então a varredura mora aqui — ANTES do retorno cedo de
  // "nenhum token a renovar", senão ela nunca rodaria na maioria dos dias.
  // Só reconsulta quem não foi conferido nas últimas 24h; melhor esforço.
  let domainsChecked = 0;
  let domainsChanged = 0;
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: paraConferir } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, api_version, primary_domain, primary_domain_checked_at')
      .eq('is_active', true)
      .not('access_token', 'eq', 'manual')
      .not('shop_domain', 'like', '%.worder.local')
      .or(`primary_domain_checked_at.is.null,primary_domain_checked_at.lt.${cutoff}`)
      .limit(50);
    for (const st of paraConferir || []) {
      const antes = st.primary_domain;
      const depois = await refreshPrimaryDomain(supabase, st, { force: true });
      domainsChecked++;
      if (depois && depois !== antes) {
        domainsChanged++;
        console.log(`[Token Refresh] domínio principal de ${st.shop_domain}: ${antes || '—'} → ${depois}`);
      }
    }
  } catch (err: any) {
    console.warn('[Token Refresh] varredura de domínio principal falhou:', err?.message);
  }

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
      return NextResponse.json({ message: 'No tokens to refresh', count: 0, domainsChecked, domainsChanged });
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

    return NextResponse.json({ count: stores.length, results, domainsChecked, domainsChanged });
  } catch (error: any) {
    console.error('[Token Refresh] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
