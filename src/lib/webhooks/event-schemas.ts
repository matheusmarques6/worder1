export type WebhookEventType =
  | 'order.created' | 'order.paid' | 'order.fulfilled' | 'order.cancelled'
  | 'checkout.abandoned' | 'customer.created' | 'shipment.tracking_created'
  | 'payment.pix.abandoned' | 'payment.boleto.abandoned' | 'browse.abandoned';

export interface WebhookEnvelope<T = any> {
  id: string;
  event: WebhookEventType;
  version: '1';
  created_at: string;
  organization_id: string;
  store_id: string;
  store: { id: string; shop_domain: string; name: string };
  data: T;
}
