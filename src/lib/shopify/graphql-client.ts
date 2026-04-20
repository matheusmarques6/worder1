// =============================================
// Shopify GraphQL Admin API Client
// src/lib/shopify/graphql-client.ts
//
// GraphQL client with:
// - Automatic rate limiting (query cost tracking)
// - Retry with exponential backoff on 429/5xx
// - Error logging
// - Typed responses
// =============================================

const SHOPIFY_API_VERSION = '2026-01';

// =============================================
// TYPES
// =============================================

export interface ShopifyStoreConfig {
  id: string;
  organization_id: string;
  shop_domain: string;
  access_token: string;
}

export interface GraphQLResponse<T = any> {
  data: T;
  errors?: GraphQLError[];
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: string[];
  extensions?: Record<string, any>;
}

export interface GraphQLRequestOptions {
  retries?: number;
  timeout?: number;
}

// =============================================
// ERRORS
// =============================================

export class ShopifyGraphQLError extends Error {
  public readonly errors: GraphQLError[];
  public readonly statusCode?: number;

  constructor(message: string, errors: GraphQLError[] = [], statusCode?: number) {
    super(message);
    this.name = 'ShopifyGraphQLError';
    this.errors = errors;
    this.statusCode = statusCode;
  }
}

export class ShopifyThrottledError extends ShopifyGraphQLError {
  constructor(message: string = 'Shopify API rate limited') {
    super(message, [], 429);
    this.name = 'ShopifyThrottledError';
  }
}

// =============================================
// GRAPHQL CLIENT
// =============================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Execute a GraphQL query against the Shopify Admin API.
 *
 * Handles rate limiting (429), server errors (5xx), and GraphQL-level
 * THROTTLED errors with automatic exponential backoff retries.
 */
export async function shopifyGraphQL<T = any>(
  store: ShopifyStoreConfig,
  query: string,
  variables?: Record<string, any>,
  options?: GraphQLRequestOptions
): Promise<GraphQLResponse<T>> {
  const { retries = MAX_RETRIES, timeout = 30000 } = options || {};
  const url = `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP-level rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
        if (attempt < retries) {
          const delay = Math.max(retryAfter * 1000, BASE_DELAY_MS * Math.pow(2, attempt));
          console.warn(
            `[ShopifyGraphQL] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`
          );
          await sleep(delay);
          continue;
        }
        throw new ShopifyThrottledError();
      }

      // Handle server errors with retry
      if (response.status >= 500) {
        if (attempt < retries) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[ShopifyGraphQL] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`
          );
          await sleep(delay);
          continue;
        }
        const errorText = await response.text();
        throw new ShopifyGraphQLError(
          `Shopify server error: ${response.status}`,
          [],
          response.status
        );
      }

      // Handle other HTTP errors (4xx except 429)
      if (!response.ok) {
        const errorText = await response.text();
        throw new ShopifyGraphQLError(
          `Shopify API error: ${response.status} - ${errorText}`,
          [],
          response.status
        );
      }

      const result: GraphQLResponse<T> = await response.json();

      // Handle GraphQL-level throttling
      if (result.errors?.some((e) => e.extensions?.code === 'THROTTLED')) {
        if (attempt < retries) {
          // Use cost info to determine wait time
          const available = result.extensions?.cost?.throttleStatus?.currentlyAvailable ?? 0;
          const restoreRate = result.extensions?.cost?.throttleStatus?.restoreRate ?? 50;
          const requested = result.extensions?.cost?.requestedQueryCost ?? 100;
          const waitSeconds = Math.ceil((requested - available) / restoreRate);
          const delay = Math.max(waitSeconds * 1000, BASE_DELAY_MS * Math.pow(2, attempt));

          console.warn(
            `[ShopifyGraphQL] THROTTLED, waiting ${delay}ms (cost: ${requested}, available: ${available})`
          );
          await sleep(delay);
          continue;
        }
        throw new ShopifyThrottledError('GraphQL query throttled after max retries');
      }

      // Handle other GraphQL errors (non-retryable)
      if (result.errors && result.errors.length > 0) {
        const isRetryable = result.errors.some(
          (e) => e.extensions?.code === 'INTERNAL_SERVER_ERROR'
        );
        if (isRetryable && attempt < retries) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[ShopifyGraphQL] Internal server error in GraphQL, retrying in ${delay}ms`
          );
          await sleep(delay);
          continue;
        }

        // Log but don't throw for partial data responses (userErrors pattern)
        const hasData = result.data && Object.values(result.data).some((v) => v !== null);
        if (!hasData) {
          throw new ShopifyGraphQLError(
            `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`,
            result.errors
          );
        }
        // Partial data - log warning but return
        console.warn(
          `[ShopifyGraphQL] Partial errors: ${result.errors.map((e) => e.message).join('; ')}`
        );
      }

      // Log cost info for monitoring
      if (result.extensions?.cost) {
        const { actualQueryCost, throttleStatus } = result.extensions.cost;
        if (throttleStatus.currentlyAvailable < throttleStatus.maximumAvailable * 0.2) {
          console.warn(
            `[ShopifyGraphQL] Low budget: ${throttleStatus.currentlyAvailable}/${throttleStatus.maximumAvailable} (cost: ${actualQueryCost})`
          );
        }
      }

      return result;
    } catch (error: any) {
      lastError = error;

      // Don't retry on known non-retryable errors
      if (
        error instanceof ShopifyGraphQLError &&
        !(error instanceof ShopifyThrottledError) &&
        error.statusCode &&
        error.statusCode < 500
      ) {
        throw error;
      }

      // Abort errors (timeout)
      if (error.name === 'AbortError') {
        if (attempt < retries) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[ShopifyGraphQL] Request timed out, retrying in ${delay}ms`);
          await sleep(delay);
          continue;
        }
        throw new ShopifyGraphQLError('Request timed out after retries');
      }

      // Network errors
      if (attempt < retries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[ShopifyGraphQL] Network error: ${error.message}, retrying in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError || new ShopifyGraphQLError('Unknown error after retries');
}

// =============================================
// PAGINATION HELPER
// =============================================

export interface PaginationOptions {
  first?: number;
  maxPages?: number;
  onPage?: (pageNumber: number, itemsCount: number) => void;
}

/**
 * Fetch all pages of a paginated GraphQL connection.
 *
 * @param store - Store config
 * @param query - GraphQL query with $first and $after variables
 * @param variables - Additional variables (merged with pagination vars)
 * @param connectionPath - Dot-separated path to the connection in the response (e.g. "customers")
 * @param options - Pagination options
 * @returns All edges/nodes collected across pages
 */
export async function shopifyGraphQLPaginate<T = any>(
  store: ShopifyStoreConfig,
  query: string,
  variables: Record<string, any>,
  connectionPath: string,
  options?: PaginationOptions
): Promise<{ nodes: T[]; totalPages: number }> {
  const { first = 50, maxPages = 100, onPage } = options || {};
  const allNodes: T[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (page < maxPages) {
    const result = await shopifyGraphQL(store, query, {
      ...variables,
      first,
      after: cursor,
    });

    // Navigate to the connection in the response
    const connection = getNestedValue(result.data, connectionPath);
    if (!connection) {
      console.warn(`[ShopifyGraphQL] Connection not found at path: ${connectionPath}`);
      break;
    }

    // Extract nodes (support both edges[].node and nodes[] patterns)
    const nodes: T[] = connection.nodes || connection.edges?.map((e: any) => e.node) || [];
    allNodes.push(...nodes);
    page++;

    if (onPage) {
      onPage(page, allNodes.length);
    }

    // Check pagination
    const pageInfo = connection.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) {
      break;
    }

    cursor = pageInfo.endCursor;
  }

  return { nodes: allNodes, totalPages: page };
}

// =============================================
// HELPERS
// =============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Extract the numeric ID from a Shopify GID.
 * e.g. "gid://shopify/Order/123456" → "123456"
 */
export function extractShopifyId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

/**
 * Convert a numeric/string ID to a Shopify GID.
 * e.g. ("Order", "123456") → "gid://shopify/Order/123456"
 */
export function toShopifyGid(resource: string, id: string | number): string {
  return `gid://shopify/${resource}/${id}`;
}
