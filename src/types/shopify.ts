export interface ShopifyStore {
  id: string;
  user_id: string;
  shop_domain: string;
  access_token: string;
  shop_name: string;
  currency: string;
  created_at: string;
}

export interface ShopifyOrder {
  id: string;
  order_number: number;
  email: string;
  total_price: string;
  subtotal_price: string;
  currency: string;
  financial_status: 'pending' | 'paid' | 'refunded' | 'voided';
  fulfillment_status: 'fulfilled' | 'partial' | 'unfulfilled' | null;
  customer: ShopifyCustomer;
  line_items: ShopifyLineItem[];
  created_at: string;
  source_name?: string;
  tags?: string;
  note?: string;
}

export interface ShopifyCustomer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  orders_count: number;
  total_spent: string;
  tags?: string;
  created_at: string;
}

export interface ShopifyLineItem {
  id: string;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
  variant_title?: string;
  product_id: string;
}
