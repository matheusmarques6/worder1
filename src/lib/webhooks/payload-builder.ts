import type { WebhookEnvelope, WebhookEventType } from './event-schemas';

export const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_ITEMS = 100;

export interface BuildEnvelopeInput {
  eventId: string;
  event: WebhookEventType;
  organizationId: string;
  store: { id: string; shop_domain: string; name: string };
  data: Record<string, any>;
}

export function buildEnvelope(input: BuildEnvelopeInput): WebhookEnvelope {
  let data: Record<string, any> = { ...input.data };

  if (Array.isArray(data.items) && data.items.length > MAX_ITEMS) {
    const original = data.items.length;
    data = {
      ...data,
      items: data.items.slice(0, MAX_ITEMS),
      _truncated: { items: true, original_count: original },
    };
  }

  let envelope: WebhookEnvelope = {
    id: input.eventId,
    event: input.event,
    version: '1',
    created_at: new Date().toISOString(),
    organization_id: input.organizationId,
    store_id: input.store.id,
    store: input.store,
    data,
  };

  if (Buffer.byteLength(JSON.stringify(envelope), 'utf8') > MAX_PAYLOAD_BYTES) {
    const slimData: Record<string, any> = { _truncated: true };
    for (const k of [
      'order_id', 'customer_id', 'product_id', 'checkout_id',
      'fulfillment_id', 'tracking_number',
    ]) {
      if (data[k] !== undefined) slimData[k] = data[k];
    }
    envelope = { ...envelope, data: slimData };
    console.warn(
      `[webhooks] payload-builder: slim payload emitted for ${input.event} (event_id=${input.eventId})`
    );
  }

  return envelope;
}
