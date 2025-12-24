// =============================================
// Shopify Service Types
// src/lib/services/shopify/types.ts
// =============================================

// =============================================
// Store Configuration
// =============================================

export interface ShopifyStoreConfig {
  id: string;
  organization_id: string;
  shop_domain: string;
  shop_name: string | null;
  access_token: string;
  api_secret: string | null;
  
  // Configurações de automação
  default_pipeline_id: string | null;
  default_stage_id: string | null;
  contact_type: 'lead' | 'customer' | 'auto';
  auto_tags: string[];
  
  // Eventos habilitados
  sync_orders: boolean;
  sync_customers: boolean;
  sync_checkouts: boolean;
  sync_refunds: boolean;
  
  // Mapeamento de estágios
  stage_mapping: StageMapping;
  
  // Status
  is_configured: boolean;
  is_active: boolean;
  connection_status: string;
}

export interface StageMapping {
  new_customer?: string | null;
  new_order?: string | null;
  abandoned_cart?: string | null;
  paid?: string | null;
  fulfilled?: string | null;
  refunded?: string | null;
}

// =============================================
// Shopify Webhook Payloads
// =============================================

export interface ShopifyCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  tags: string;
  total_spent: string;
  orders_count: number;
  accepts_marketing: boolean;
  default_address?: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
  };
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
  variant_title: string | null;
  product_id: number;
  variant_id: number;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string | null;
  phone: string | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  customer: ShopifyCustomer | null;
  line_items: ShopifyLineItem[];
  billing_address?: {
    first_name: string | null;
    last_name: string | null;
    address1: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
    phone: string | null;
  };
  checkout_id?: number;
  created_at: string;
  updated_at: string;
}

export interface ShopifyCheckout {
  id: number;
  token: string;
  email: string | null;
  phone: string | null;
  total_price: string;
  subtotal_price: string;
  currency: string;
  abandoned_checkout_url: string;
  completed_at: string | null;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer | null;
  billing_address?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  };
  created_at: string;
  updated_at: string;
}

// =============================================
// Processing Results
// =============================================

export interface ContactSyncResult {
  id: string;
  isNew: boolean;
  name: string;
  type: 'lead' | 'customer';
  wasConverted: boolean; // Se era lead e virou customer
}

export interface DealSyncResult {
  id: string;
  isNew: boolean;
  action: 'created' | 'updated' | 'moved' | 'skipped';
  stage_id?: string;
}

export interface WebhookProcessResult {
  success: boolean;
  action: string;
  contactId?: string;
  dealId?: string;
  orderId?: string;
  checkoutId?: string;
  error?: string;
}

// =============================================
// Event Types
// =============================================

export type ShopifyEventType = 
  | 'customer'    // customers/create, customers/update
  | 'order'       // orders/create
  | 'checkout'    // checkouts/create, checkouts/update
  | 'order_paid'  // orders/paid
  | 'order_fulfilled'; // orders/fulfilled

export type StageEventType = 
  | 'new_customer'
  | 'new_order'
  | 'abandoned_cart'
  | 'paid'
  | 'fulfilled'
  | 'refunded';

// =============================================
// Webhook Job
// =============================================

export interface ShopifyWebhookJob {
  eventId: string;
  topic: string;
  shopDomain: string;
  payload: any;
  storeId: string;
  organizationId: string;
}
