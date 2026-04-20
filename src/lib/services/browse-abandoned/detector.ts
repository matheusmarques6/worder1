import { supabaseAdmin } from '@/lib/supabase-admin';
import { EventBus, EventType } from '@/lib/events';

const MIN_MIN = parseInt(process.env.BROWSE_ABANDONED_MIN_MIN || '30', 10);
const MAX_HOURS = parseInt(process.env.BROWSE_ABANDONED_MAX_HOURS || '4', 10);

interface BrowseAbandonedCandidate {
  view_event_id: string;
  contact_id: string;
  store_id: string;
  product_id: string;
  viewed_at: string;
}

export interface BrowseAbandonedResult {
  totalEmitted: number;
  orgsProcessed: number;
}

/**
 * Roda detecção de browse.abandoned pra todas as orgs com subscriptions
 * ativas nesse evento. Emite EventType.BROWSE_ABANDONED pra cada candidato
 * novo — o hook no EventBus.emit dispara o dispatcher pros webhooks de
 * saída. Idempotência garantida via UNIQUE em browse_abandoned_emissions
 * (contact_id, product_id, view_event_id).
 */
export async function runBrowseAbandonedDetection(): Promise<BrowseAbandonedResult> {
  const { data: subs } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('organization_id, store_id')
    .eq('status', 'active')
    .contains('events', ['browse.abandoned']);

  const targets = new Set(
    (subs ?? []).map((r: any) => `${r.organization_id}:${r.store_id}`)
  );
  const orgs = new Set((subs ?? []).map((r: any) => r.organization_id as string));

  let totalEmitted = 0;
  for (const org of orgs) {
    totalEmitted += await processOrg(org, targets);
  }
  return { totalEmitted, orgsProcessed: orgs.size };
}

async function processOrg(orgId: string, targetStores: Set<string>): Promise<number> {
  const minTime = new Date(Date.now() - MAX_HOURS * 3600 * 1000).toISOString();
  const maxTime = new Date(Date.now() - MIN_MIN * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabaseAdmin.rpc('detect_browse_abandoned', {
    p_organization_id: orgId,
    p_min_time: minTime,
    p_max_time: maxTime,
  });

  if (error) {
    console.error(`[browse-abandoned] org ${orgId} detection failed:`, error);
    return 0;
  }

  let emitted = 0;
  for (const cand of (candidates ?? []) as BrowseAbandonedCandidate[]) {
    if (!cand.store_id || !targetStores.has(`${orgId}:${cand.store_id}`)) continue;

    // Atomic emit gate: insere em browse_abandoned_emissions; se UNIQUE
    // violation (23505), já emitiu antes.
    const { error: insertError } = await supabaseAdmin
      .from('browse_abandoned_emissions')
      .insert({
        organization_id: orgId,
        contact_id: cand.contact_id,
        product_id: cand.product_id,
        view_event_id: cand.view_event_id,
      });

    if (insertError) {
      if ((insertError as any).code === '23505') continue;
      console.warn('[browse-abandoned] insert failed:', insertError);
      continue;
    }

    const { data: store } = await supabaseAdmin
      .from('shopify_stores')
      .select('id, shop_domain, shop_name')
      .eq('id', cand.store_id)
      .single();

    await EventBus.emit(EventType.BROWSE_ABANDONED, {
      organization_id: orgId,
      contact_id: cand.contact_id,
      data: {
        _webhook_dispatch_meta: {
          store_id: cand.store_id,
          source: 'browse_detector',
          source_event_id: cand.view_event_id,
          store: {
            id: cand.store_id,
            shop_domain: (store as any)?.shop_domain ?? '',
            name: (store as any)?.shop_name ?? (store as any)?.shop_domain ?? '',
          },
        },
        contact_id: cand.contact_id,
        product_id: cand.product_id,
        view_event_id: cand.view_event_id,
        viewed_at: cand.viewed_at,
      },
    });

    emitted++;
  }

  return emitted;
}
