// =============================================
// Shopify API Client
// src/lib/integrations/shopify.ts
// =============================================

import crypto from 'crypto';

export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
  tags: string;
  total_spent: string;
  orders_count: number;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  phone: string | null;
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  customer: ShopifyCustomer;
  line_items: ShopifyLineItem[];
  created_at: string;
  updated_at: string;
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
  variant_title: string | null;
  product_id: number;
}

export interface ShopifyCheckout {
  id: number;
  token: string;
  email: string;
  phone: string | null;
  total_price: string;
  currency: string;
  abandoned_checkout_url: string;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer | null;
  created_at: string;
  updated_at: string;
}

// =============================================
// OAuth URLs
// =============================================

export function getShopifyAuthUrl(params: {
  shopDomain: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string {
  const { shopDomain, clientId, redirectUri, scopes, state } = params;
  
  const baseUrl = `https://${shopDomain}/admin/oauth/authorize`;
  const queryParams = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state: state,
  });
  
  return `${baseUrl}?${queryParams.toString()}`;
}

export async function exchangeCodeForToken(params: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<{ access_token: string; scope: string }> {
  const { shopDomain, clientId, clientSecret, code } = params;
  
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }
  
  return response.json();
}

// =============================================
// API Client
// =============================================

export class ShopifyClient {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string = '2024-10';

  constructor(config: ShopifyConfig) {
    this.shopDomain = config.shopDomain;
    this.accessToken = config.accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `https://${this.shopDomain}/admin/api/${this.apiVersion}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // =============================================
  // Shop Info
  // =============================================
  
  async getShop(): Promise<any> {
    return this.request('/shop.json');
  }

  // =============================================
  // Customers
  // =============================================

  async getCustomers(params?: { limit?: number; since_id?: number }): Promise<{ customers: ShopifyCustomer[] }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.since_id) queryParams.set('since_id', params.since_id.toString());
    
    const query = queryParams.toString();
    return this.request(`/customers.json${query ? `?${query}` : ''}`);
  }

  async getCustomer(customerId: number): Promise<{ customer: ShopifyCustomer }> {
    return this.request(`/customers/${customerId}.json`);
  }

  // =============================================
  // Orders
  // =============================================

  async getOrders(params?: { 
    limit?: number; 
    status?: string;
    financial_status?: string;
  }): Promise<{ orders: ShopifyOrder[] }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.status) queryParams.set('status', params.status);
    if (params?.financial_status) queryParams.set('financial_status', params.financial_status);
    
    const query = queryParams.toString();
    return this.request(`/orders.json${query ? `?${query}` : ''}`);
  }

  async getOrder(orderId: number): Promise<{ order: ShopifyOrder }> {
    return this.request(`/orders/${orderId}.json`);
  }

  // =============================================
  // Abandoned Checkouts
  // =============================================

  async getAbandonedCheckouts(params?: { 
    limit?: number;
    status?: 'open' | 'closed';
  }): Promise<{ checkouts: ShopifyCheckout[] }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.status) queryParams.set('status', params.status);
    
    const query = queryParams.toString();
    return this.request(`/checkouts.json${query ? `?${query}` : ''}`);
  }

  // =============================================
  // Webhooks
  // =============================================

  async createWebhook(params: {
    topic: string;
    address: string;
    format?: 'json' | 'xml';
  }): Promise<any> {
    return this.request('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          topic: params.topic,
          address: params.address,
          format: params.format || 'json',
        },
      }),
    });
  }

  async getWebhooks(): Promise<{ webhooks: any[] }> {
    return this.request('/webhooks.json');
  }

  async deleteWebhook(webhookId: number): Promise<void> {
    await this.request(`/webhooks/${webhookId}.json`, { method: 'DELETE' });
  }
}

// =============================================
// Webhook Verification
// =============================================

export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string,
  secret: string
): boolean {
  try {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    
    // Comparar de forma segura
    if (hash.length !== hmacHeader.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  } catch (error) {
    console.error('HMAC verification error:', error);
    return false;
  }
}

// =============================================
// Webhook Topics
// =============================================

export const SHOPIFY_WEBHOOK_TOPICS = {
  // Customers
  CUSTOMERS_CREATE: 'customers/create',
  CUSTOMERS_UPDATE: 'customers/update',
  CUSTOMERS_DELETE: 'customers/delete',
  
  // Orders
  ORDERS_CREATE: 'orders/create',
  ORDERS_UPDATED: 'orders/updated',
  ORDERS_PAID: 'orders/paid',
  ORDERS_FULFILLED: 'orders/fulfilled',
  ORDERS_CANCELLED: 'orders/cancelled',
  
  // Checkouts (Abandoned Carts)
  CHECKOUTS_CREATE: 'checkouts/create',
  CHECKOUTS_UPDATE: 'checkouts/update',
  
  // Products
  PRODUCTS_CREATE: 'products/create',
  PRODUCTS_UPDATE: 'products/update',
  
  // App
  APP_UNINSTALLED: 'app/uninstalled',
};

// =============================================
// Helper: Transform to Lead
// =============================================

export function transformShopifyCustomerToLead(customer: ShopifyCustomer, source: string = 'shopify') {
  return {
    name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Cliente Shopify',
    email: customer.email,
    phone: customer.phone,
    source,
    metadata: {
      shopify_id: customer.id,
      total_spent: customer.total_spent,
      orders_count: customer.orders_count,
      tags: customer.tags,
    },
  };
}

export function transformShopifyOrderToLead(order: ShopifyOrder, source: string = 'shopify') {
  const customer = order.customer;
  return {
    name: customer 
      ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Cliente Shopify'
      : 'Cliente Shopify',
    email: order.email || customer?.email,
    phone: order.phone || customer?.phone,
    source,
    value: parseFloat(order.total_price),
    metadata: {
      shopify_order_id: order.id,
      order_number: order.order_number,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      currency: order.currency,
      items: order.line_items.map(item => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
    },
  };
}

export function transformShopifyCheckoutToLead(checkout: ShopifyCheckout, source: string = 'shopify_abandoned') {
  const customer = checkout.customer;
  return {
    name: customer 
      ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Cliente Shopify'
      : 'Cliente Shopify',
    email: checkout.email || customer?.email,
    phone: checkout.phone || customer?.phone,
    source,
    value: parseFloat(checkout.total_price),
    metadata: {
      shopify_checkout_id: checkout.id,
      checkout_token: checkout.token,
      abandoned_url: checkout.abandoned_checkout_url,
      currency: checkout.currency,
      items: checkout.line_items.map(item => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
    },
  };
}
