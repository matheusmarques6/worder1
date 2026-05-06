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

  let hint: string | null = null;
  if (!detected) {
    hint =
      'Aguardando o primeiro evento. Abra a sua loja em outra aba e navegue por algumas páginas — o pixel dispara em segundos. Se nada chegar em 2 minutos, confirme que o pixel está com status "Conectado" no Shopify Admin → Customer Events.';
  }

  return NextResponse.json({
    detected,
    pixelInstalled: detected || !!store.pixel_installed,
    lastEventAt: last?.received_at || null,
    lastEventType: last?.event_type || null,
    recentEventCount: count || 0,
    recentEvents: (events || []).map((e: any) => ({
      type: e.event_type,
      source: e.event_source,
      at: e.received_at,
      page_url: e.properties?.page_url || e.properties?.url || null,
    })),
    hint,
    lookbackMinutes: LOOKBACK_MINUTES,
  });
}
