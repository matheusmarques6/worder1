import { supabaseAdmin } from '@/lib/supabase-admin';
import { enqueueWebhookDelivery } from '@/lib/queue';
import { deriveEventId } from './event-id';
import { buildEnvelope } from './payload-builder';
import type { WebhookEventType } from './event-schemas';

export interface DispatchInput {
  eventType: WebhookEventType;
  organizationId: string;
  storeId: string;
  sourceEventId: string;
  source: string;
  store: { id: string; shop_domain: string; name: string };
  data: Record<string, any>;
}

export async function dispatchToOutbound(input: DispatchInput): Promise<void> {
  const { data: subs, error: subsError } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('id, organization_id, store_id, url, events, status')
    .eq('store_id', input.storeId)
    .eq('status', 'active')
    .contains('events', [input.eventType]);

  if (subsError) {
    console.error('[outbound-dispatcher] failed to fetch subscriptions:', subsError);
    return;
  }

  if (!subs || subs.length === 0) return;

  const eventId = deriveEventId(input.source, input.sourceEventId, input.eventType);

  const { _webhook_dispatch_meta: _discard, ...cleanData } = input.data;

  const envelope = buildEnvelope({
    eventId,
    event: input.eventType,
    organizationId: input.organizationId,
    store: input.store,
    data: cleanData,
  });

  const rows = subs.map((s: any) => ({
    subscription_id: s.id,
    organization_id: s.organization_id,
    store_id: s.store_id,
    event_type: input.eventType,
    event_id: eventId,
    payload: envelope,
    url: s.url,
    status: 'pending',
  }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .rpc('dispatch_insert_deliveries', { p_rows: rows });

  if (insertError) {
    console.error('[outbound-dispatcher] failed to insert deliveries:', insertError);
    return;
  }

  if (!inserted || inserted.length === 0) return;

  for (const row of inserted as Array<{ id: string }>) {
    try {
      await enqueueWebhookDelivery(row.id);
    } catch (err) {
      console.warn(
        `[outbound-dispatcher] enqueue failed for delivery ${row.id} (sweeper will retry):`,
        err
      );
    }
  }
}
