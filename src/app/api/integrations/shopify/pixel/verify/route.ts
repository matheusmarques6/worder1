// =============================================
// POST /api/integrations/shopify/pixel/verify
//
// Real-time check: did the Custom Pixel actually fire in the last
// few minutes? Used by the install wizard to confirm the merchant's
// paste worked.
//
// Returns:
//   - detected: true when at least one pixel event landed in our DB
//     in the last 10 min for this store
//   - lastEventAt: ISO timestamp of the most recent pixel event
//   - lastEventType: which event (page_view / viewed_product / etc)
//   - recentEventCount: how many events in the lookback window
//   - hint: human-readable next step when detection still pending
//
// Side effect: when detected and pixel_installed was false, we flip
// the flag on shopify_stores so future status checks short-circuit.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const LOOKBACK_MINUTES = 10;

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const storeId = body?.storeId;
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, shop_domain, shop_name, pixel_installed, connection_type')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();
  // Wider window for fetch logs / ping events — these are the smoke
  // tests, we want to know if they ever arrived even outside the
  // event detection window.
  const since30days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Pull the most recent pixel events for this store. Order by received_at
  // (when we got the request) rather than occurred_at (client clock can
  // be off) so the merchant's "I just pasted it" moment lines up.
  const { data: events, count } = await admin
    .from('contact_events')
    .select('id, event_type, event_source, received_at, properties', { count: 'exact' })
    .eq('store_id', store.id)
    .in('event_source', ['worder_pixel', 'shopify_pixel', 'pixel'])
    .gt('received_at', since)
    .order('received_at', { ascending: false })
    .limit(5);

  // === Diagnostic layer 1: did the sandbox even fetch the script? ===
  // Every GET to /api/pixel/worder-pixel.js writes to
  // shopify_webhook_audit with topic='pixel.fetched'. Match against
  // both the primary shop_domain AND any alias so we catch fetches
  // even when the pixel sends a non-primary domain.
  const allDomains = [store.shop_domain, ...(Array.isArray((store as any).shop_domain_aliases) ? (store as any).shop_domain_aliases : [])].filter(Boolean);
  const { data: fetches, count: fetchCount } = await admin
    .from('shopify_webhook_audit')
    .select('id, shop_domain, status, error_message, received_at', { count: 'exact' })
    .eq('topic', 'pixel.fetched')
    .in('shop_domain', allDomains)
    .gt('received_at', since30days)
    .order('received_at', { ascending: false })
    .limit(3);

  // === Diagnostic layer 2: did the loaded script ping us back? ===
  // pixel_loaded events fire synchronously after subscribers are wired.
  const { data: pings, count: pingCount } = await admin
    .from('contact_events')
    .select('id, occurred_at', { count: 'exact' })
    .eq('store_id', store.id)
    .eq('event_type', 'pixel_loaded')
    .gt('occurred_at', since30days)
    .order('occurred_at', { ascending: false })
    .limit(3);

  const detected = (count || 0) > 0;
  const last = events && events.length > 0 ? events[0] : null;

  // Persist flag so other dashboard pages stop nagging once detection
  // succeeds. Idempotent — safe to set even if it was already true.
  if (detected && !store.pixel_installed) {
    await admin
      .from('shopify_stores')
      .update({
        pixel_installed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id);
  }

  // Layered hint: tell the merchant which step is broken instead of a
  // generic "wait" when we can already pinpoint the failure.
  let hint: string | null = null;
  let stage: 'not-fetched' | 'fetched-no-ping' | 'pinging-no-events' | 'detected' = 'not-fetched';
  if (detected) {
    stage = 'detected';
  } else if ((fetchCount || 0) === 0) {
    stage = 'not-fetched';
    hint =
      '⛔ O sandbox da Shopify NÃO está nem buscando o script do pixel. Verifique: (1) o pixel está com status "Conectado" (não só salvo) em Shopify Admin → Customer Events; (2) "Privacidade do cliente" está como "Não obrigatório"; (3) você abriu o STOREFRONT (não o admin) em outra aba.';
  } else if ((pingCount || 0) === 0) {
    stage = 'fetched-no-ping';
    hint =
      '⚠️ O script foi baixado mas o ping inicial não chegou. O sandbox está executando o JS mas algo trava antes do primeiro POST. Geralmente é CSP bloqueando fetch ou um erro de execução. Aguarde mais 30s e tente "Verificar agora".';
  } else {
    stage = 'pinging-no-events';
    hint =
      '⚠️ O pixel carrega e executa (ping recebido), mas eventos comportamentais (page_view, viewed_product) não chegam. Isso geralmente é a Shopify não despachando os eventos pra esse pixel — confirme em Customer Events → "Testar".';
  }

  return NextResponse.json({
    detected,
    pixelInstalled: detected || !!store.pixel_installed,
    stage,
    lastEventAt: last?.received_at || null,
    lastEventType: last?.event_type || null,
    recentEventCount: count || 0,
    recentEvents: (events || []).map((e: any) => ({
      type: e.event_type,
      source: e.event_source,
      at: e.received_at,
      page_url: e.properties?.page_url || e.properties?.url || null,
    })),
    diagnostics: {
      fetchCount: fetchCount || 0,
      lastFetchAt: fetches && fetches.length > 0 ? fetches[0].received_at : null,
      lastFetchUserAgent: fetches && fetches.length > 0 ? (fetches[0].error_message || '').split(' | ref=')[0] : null,
      pingCount: pingCount || 0,
      lastPingAt: pings && pings.length > 0 ? pings[0].occurred_at : null,
    },
    hint,
    lookbackMinutes: LOOKBACK_MINUTES,
  });
}
