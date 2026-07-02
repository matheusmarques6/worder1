// =============================================
// Shopify API Client
// src/lib/services/shopify/api-client.ts
//
// Cliente robusto com:
// - Rate limiting automático (40 req/min)
// - Paginação cursor-based (Link header)
// - Retry automático em 429
// - Logs de debug
// =============================================

const SHOPIFY_API_VERSION = '2026-04';

// =============================================
// TYPES
// =============================================

export interface ShopifyStore {
  id: string;
  organization_id: string;
  shop_domain: string;
  access_token: string;
  shop_name?: string;
}

export interface RateLimitInfo {
  current: number;
  max: number;
  remaining: number;
}

export interface FetchOptions {
  maxPages?: number;
  onProgress?: (page: number, itemsCount: number) => void;
}

export interface FetchResult<T> {
  data: T[];
  totalFetched: number;
  pagesProcessed: number;
  rateLimitHits: number;
}

// =============================================
// SHOPIFY API CLIENT CLASS
// =============================================

export class ShopifyAPIClient {
  private shopDomain: string;
  private accessToken: string;
  private storeId: string;
  private organizationId: string;
  private rateLimitHits: number = 0;

  constructor(store: ShopifyStore) {
    this.shopDomain = store.shop_domain;
    this.accessToken = store.access_token;
    this.storeId = store.id;
    this.organizationId = store.organization_id;
  }

  // =============================================
  // HELPERS
  // =============================================

  private parseRateLimitHeader(header: string | null): RateLimitInfo {
    if (!header) return { current: 0, max: 40, remaining: 40 };
    const [current, max] = header.split('/').map(Number);
    return {
      current: isNaN(current) ? 0 : current,
      max: isNaN(max) ? 40 : max,
      remaining: (isNaN(max) ? 40 : max) - (isNaN(current) ? 0 : current),
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    
    // Shopify usa: <url>; rel="next", <url>; rel="previous"
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return nextMatch ? nextMatch[1] : null;
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number>): string {
    const baseUrl = `https://${this.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`;
    
    if (!params) return baseUrl;
    
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    
    const queryString = searchParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  // =============================================
  // CORE FETCH WITH RATE LIMITING
  // =============================================

  private async fetchWithRateLimit<T>(
    url: string,
    retryCount: number = 0
  ): Promise<{ data: T; nextPageUrl: string | null; rateLimit: RateLimitInfo }> {
    const maxRetries = 3;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    // Parse rate limit
    const rateLimitHeader = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    const rateLimit = this.parseRateLimitHeader(rateLimitHeader);

    // Handle rate limiting (429)
    if (response.status === 429) {
      this.rateLimitHits++;
      
      if (retryCount >= maxRetries) {
        throw new Error(`Rate limit exceeded after ${maxRetries} retries`);
      }

      const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
      console.warn(`[Shopify] Rate limited, waiting ${retryAfter}s (attempt ${retryCount + 1})`);
      
      await this.sleep(retryAfter * 1000);
      return this.fetchWithRateLimit(url, retryCount + 1);
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${errorText}`);
    }

    // Slow down if approaching limit
    if (rateLimit.remaining <= 5) {
      console.log(`[Shopify] Approaching rate limit (${rateLimit.current}/${rateLimit.max}), slowing down...`);
      await this.sleep(500);
    }

    const data = await response.json();
    
    // Parse Link header for pagination (check both "Link" and "link")
    const linkHeader = response.headers.get('Link') || response.headers.get('link');
    const nextPageUrl = this.getNextPageUrl(linkHeader);

    return { data, nextPageUrl, rateLimit };
  }

  // =============================================
  // PAGINATED FETCH
  // =============================================

  async fetchAll<T>(
    endpoint: string,
    dataKey: string,
    params?: Record<string, string | number>,
    options: FetchOptions = {}
  ): Promise<FetchResult<T>> {
    const { maxPages = 100, onProgress } = options;
    const allItems: T[] = [];
    let nextUrl: string | null = this.buildUrl(endpoint, { ...params, limit: 250 });
    let pageCount = 0;

    while (nextUrl && pageCount < maxPages) {
      const currentUrl: string = nextUrl;
      const result = await this.fetchWithRateLimit<Record<string, T[]>>(currentUrl);
      
      const items = result.data[dataKey] || [];
      allItems.push(...items);
      
      pageCount++;
      
      if (onProgress) {
        onProgress(pageCount, allItems.length);
      }

      nextUrl = result.nextPageUrl;
    }

    return {
      data: allItems,
      totalFetched: allItems.length,
      pagesProcessed: pageCount,
      rateLimitHits: this.rateLimitHits,
    };
  }

  // =============================================
  // CONVENIENCE METHODS
  // =============================================

  async fetchOrders(
    params?: { status?: string; created_at_min?: string; created_at_max?: string },
    options?: FetchOptions
  ): Promise<FetchResult<any>> {
    return this.fetchAll(
      'orders.json',
      'orders',
      { status: 'any', ...params },
      options
    );
  }

  async fetchCustomers(
    params?: { created_at_min?: string; created_at_max?: string },
    options?: FetchOptions
  ): Promise<FetchResult<any>> {
    return this.fetchAll(
      'customers.json',
      'customers',
      params,
      options
    );
  }

  async fetchProducts(
    params?: { status?: string },
    options?: FetchOptions
  ): Promise<FetchResult<any>> {
    return this.fetchAll(
      'products.json',
      'products',
      params,
      options
    );
  }

  async fetchAbandonedCheckouts(
    params?: { created_at_min?: string },
    options?: FetchOptions
  ): Promise<FetchResult<any>> {
    return this.fetchAll(
      'checkouts.json',
      'checkouts',
      params,
      options
    );
  }

  async fetchLocations(): Promise<FetchResult<any>> {
    return this.fetchAll(
      'locations.json',
      'locations',
      undefined,
      { maxPages: 1 } // Locations usually fit in one page
    );
  }

  async fetchInventoryLevels(
    locationIds: string[],
    options?: FetchOptions
  ): Promise<FetchResult<any>> {
    return this.fetchAll(
      'inventory_levels.json',
      'inventory_levels',
      { location_ids: locationIds.join(',') },
      options
    );
  }

  // =============================================
  // SINGLE RESOURCE FETCH
  // =============================================

  async fetchOrder(orderId: string): Promise<any> {
    const url = this.buildUrl(`orders/${orderId}.json`);
    const { data } = await this.fetchWithRateLimit<{ order: any }>(url);
    return data.order;
  }

  async fetchCustomer(customerId: string): Promise<any> {
    const url = this.buildUrl(`customers/${customerId}.json`);
    const { data } = await this.fetchWithRateLimit<{ customer: any }>(url);
    return data.customer;
  }

  async fetchProduct(productId: string): Promise<any> {
    const url = this.buildUrl(`products/${productId}.json`);
    const { data } = await this.fetchWithRateLimit<{ product: any }>(url);
    return data.product;
  }

  // =============================================
  // STATS
  // =============================================

  getRateLimitHits(): number {
    return this.rateLimitHits;
  }

  getStoreInfo(): { storeId: string; organizationId: string; shopDomain: string } {
    return {
      storeId: this.storeId,
      organizationId: this.organizationId,
      shopDomain: this.shopDomain,
    };
  }
}

// =============================================
// FACTORY FUNCTION
// =============================================

export function createShopifyClient(store: ShopifyStore): ShopifyAPIClient {
  if (!store.shop_domain || !store.access_token) {
    throw new Error('Store must have shop_domain and access_token');
  }
  return new ShopifyAPIClient(store);
}
