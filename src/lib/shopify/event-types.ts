// =============================================
// Worder Shopify Event Types (CDP)
// src/lib/shopify/event-types.ts
//
// Defines all event types that flow into the
// contact_events timeline for the CDP.
// =============================================

export const WORDER_SHOPIFY_EVENTS = {
  // === ORDERS (via Webhooks) ===
  PLACED_ORDER: 'placed_order',
  ORDERED_PRODUCT: 'ordered_product',
  FULFILLED_ORDER: 'fulfilled_order',
  CANCELLED_ORDER: 'cancelled_order',
  REFUNDED_ORDER: 'refunded_order',

  // === CHECKOUT (via Webhooks + Pixel) ===
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  CHECKOUT_ABANDONED: 'checkout_abandoned',

  // === DELIVERY (via Webhooks) ===
  SHIPMENT_CONFIRMED: 'shipment_confirmed',
  SHIPMENT_DELIVERED: 'shipment_delivered',

  // === ON-SITE BEHAVIOR (via Pixel) ===
  ACTIVE_ON_SITE: 'active_on_site',
  VIEWED_PRODUCT: 'viewed_product',
  ADDED_TO_CART: 'added_to_cart',
  VIEWED_COLLECTION: 'viewed_collection',
  SUBMITTED_SEARCH: 'submitted_search',
  PAGE_VIEWED: 'page_viewed',
  CART_VIEWED: 'cart_viewed',

  // === PROFILE ===
  SUBSCRIBED_EMAIL: 'subscribed_email',
  SUBSCRIBED_SMS: 'subscribed_sms',
  PROFILE_CREATED: 'profile_created',
  PROFILE_UPDATED: 'profile_updated',
} as const;

export type WorderShopifyEventType =
  (typeof WORDER_SHOPIFY_EVENTS)[keyof typeof WORDER_SHOPIFY_EVENTS];

// =============================================
// EVENT SOURCES
// =============================================

export const EVENT_SOURCES = {
  SHOPIFY_WEBHOOK: 'shopify_webhook',
  WORDER_PIXEL: 'worder_pixel',
  WORDER_FORM: 'worder_form',
  GRAPHQL_SYNC: 'graphql_sync',
  CRON_JOB: 'cron_job',
  API: 'api',
} as const;

export type EventSource = (typeof EVENT_SOURCES)[keyof typeof EVENT_SOURCES];

// =============================================
// EVENT PROPERTY INTERFACES
// =============================================

export interface PlacedOrderProperties {
  order_id: string;
  order_number: string | number;
  total_price: number;
  subtotal_price?: number;
  total_shipping?: number;
  total_tax?: number;
  total_discounts?: number;
  currency: string;
  financial_status: string;
  fulfillment_status?: string | null;
  discount_codes?: string[];
  item_count: number;
  items: Array<{
    product_id?: string;
    variant_id?: string;
    title: string;
    quantity: number;
    price: number;
    sku?: string | null;
    variant_title?: string | null;
  }>;
  shipping_address?: {
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
  };
  billing_address?: {
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
  };
  tags?: string[];
  note?: string | null;
}

export interface OrderedProductProperties {
  order_id: string;
  order_number: string | number;
  product_id?: string;
  variant_id?: string;
  title: string;
  quantity: number;
  price: number;
  sku?: string | null;
  variant_title?: string | null;
  currency: string;
}

export interface CheckoutProperties {
  checkout_id: string;
  checkout_url?: string;
  total_price: number;
  subtotal_price?: number;
  currency: string;
  item_count: number;
  items: Array<{
    product_id?: string;
    title: string;
    quantity: number;
    price?: number;
    sku?: string | null;
    variant_title?: string | null;
    image_url?: string | null;
  }>;
}

export interface FulfilledOrderProperties {
  order_id: string;
  order_number: string | number;
  total_price: number;
  currency: string;
  tracking_number?: string | null;
  tracking_url?: string | null;
  tracking_company?: string | null;
  fulfillment_id?: string;
}

export interface CancelledOrderProperties {
  order_id: string;
  order_number: string | number;
  total_price: number;
  currency: string;
  cancel_reason?: string | null;
}

export interface RefundedOrderProperties {
  order_id: string;
  order_number: string | number;
  refund_amount: number;
  currency: string;
  refund_id?: string;
  refunded_items?: Array<{
    title: string;
    quantity: number;
  }>;
}

export interface ViewedProductProperties {
  product_id?: string;
  product_title: string;
  product_url?: string;
  price?: number;
  currency?: string;
  image_url?: string | null;
  variant_id?: string;
  variant_title?: string;
  collection?: string;
}

export interface AddedToCartProperties {
  product_id?: string;
  product_title: string;
  variant_id?: string;
  variant_title?: string;
  price?: number;
  currency?: string;
  quantity: number;
  image_url?: string | null;
}

export interface ViewedCollectionProperties {
  collection_id?: string;
  collection_title: string;
  collection_url?: string;
}

export interface SearchSubmittedProperties {
  query: string;
  results_count?: number;
}

export interface PageViewedProperties {
  url: string;
  title?: string;
  referrer?: string;
}
