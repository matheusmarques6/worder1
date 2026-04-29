// =====================================================
// SHOPIFY API SERVICE
// src/lib/shopify/api-service.ts
//
// Serviço para coletar dados de lojas Shopify
// =====================================================

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string;
  variants: {
    price: string;
    compare_at_price: string | null;
    inventory_quantity: number;
  }[];
  images: { id: number }[];
  created_at: string;
}

interface ShopifyCollection {
  id: number;
  title: string;
  products_count?: number;
}

interface ShopifyPolicy {
  title: string;
  body: string;
}

interface ShopInfo {
  name: string;
  domain: string;
  email: string;
  currency: string;
  country_name: string;
  shop_owner: string;
  description: string | null;
  created_at: string;
}

export class ShopifyAPIService {
  private baseUrl: string;
  private accessToken: string;
  private shopDomain: string;

  constructor(shopDomain: string, accessToken: string) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
    // Garantir que o domínio está correto
    const cleanDomain = shopDomain.replace('.myshopify.com', '').replace(/^https?:\/\//, '');
    this.baseUrl = `https://${cleanDomain}.myshopify.com/admin/api/2026-04`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Busca informações da loja
   */
  async getShopInfo(): Promise<ShopInfo> {
    const data = await this.request<{ shop: ShopInfo }>('/shop.json');
    return data.shop;
  }

  /**
   * Busca todos os produtos com paginação
   */
  async getAllProducts(limit: number = 250): Promise<ShopifyProduct[]> {
    const allProducts: ShopifyProduct[] = [];
    let pageInfo: string | null = null;
    let hasMore = true;
    const maxProducts = 1000; // Limitar para não sobrecarregar

    while (hasMore && allProducts.length < maxProducts) {
      let url = `/products.json?limit=${limit}`;
      if (pageInfo) {
        url = `/products.json?limit=${limit}&page_info=${pageInfo}`;
      }

      const response = await fetch(`${this.baseUrl}${url}`, {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.status}`);
      }

      const data = await response.json();
      allProducts.push(...data.products);

      // Check for next page
      const linkHeader = response.headers.get('Link');
      pageInfo = this.extractNextPageInfo(linkHeader);
      hasMore = pageInfo !== null;
    }

    return allProducts;
  }

  /**
   * Extrai page_info do header Link
   */
  private extractNextPageInfo(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    const links = linkHeader.split(',');
    for (const link of links) {
      if (link.includes('rel="next"')) {
        const match = link.match(/page_info=([^>&]*)/);
        if (match) {
          return match[1];
        }
      }
    }
    return null;
  }

  /**
   * Busca coleções (smart + custom)
   */
  async getCollections(): Promise<ShopifyCollection[]> {
    try {
      const [smart, custom] = await Promise.all([
        this.request<{ smart_collections: ShopifyCollection[] }>('/smart_collections.json')
          .catch(() => ({ smart_collections: [] })),
        this.request<{ custom_collections: ShopifyCollection[] }>('/custom_collections.json')
          .catch(() => ({ custom_collections: [] })),
      ]);

      return [...smart.smart_collections, ...custom.custom_collections];
    } catch {
      return [];
    }
  }

  /**
   * Busca políticas da loja
   */
  async getPolicies(): Promise<{
    refund: string | null;
    shipping: string | null;
    privacy: string | null;
    terms: string | null;
  }> {
    try {
      const data = await this.request<{ policies: ShopifyPolicy[] }>('/policies.json');
      
      const policies = {
        refund: null as string | null,
        shipping: null as string | null,
        privacy: null as string | null,
        terms: null as string | null,
      };

      for (const policy of data.policies) {
        const title = policy.title.toLowerCase();
        const body = policy.body ? this.stripHtml(policy.body) : null;
        
        if (title.includes('refund') || title.includes('devolução') || title.includes('troca')) {
          policies.refund = body;
        } else if (title.includes('shipping') || title.includes('entrega') || title.includes('frete')) {
          policies.shipping = body;
        } else if (title.includes('privacy') || title.includes('privacidade')) {
          policies.privacy = body;
        } else if (title.includes('terms') || title.includes('termos')) {
          policies.terms = body;
        }
      }

      return policies;
    } catch {
      return { refund: null, shipping: null, privacy: null, terms: null };
    }
  }

  /**
   * Busca contagem de produtos
   */
  async getProductCount(): Promise<number> {
    try {
      const data = await this.request<{ count: number }>('/products/count.json');
      return data.count;
    } catch {
      return 0;
    }
  }

  /**
   * Remove tags HTML de uma string
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Coleta todos os dados necessários para análise
   */
  async collectAllData(): Promise<{
    shop: ShopInfo;
    products: ShopifyProduct[];
    collections: ShopifyCollection[];
    policies: {
      refund: string | null;
      shipping: string | null;
      privacy: string | null;
      terms: string | null;
    };
  }> {
    const [shop, products, collections, policies] = await Promise.all([
      this.getShopInfo(),
      this.getAllProducts(),
      this.getCollections(),
      this.getPolicies(),
    ]);

    return { shop, products, collections, policies };
  }
}

export default ShopifyAPIService;
