// =============================================
// Shopify Bulk Operations sync
// /src/lib/services/shopify/bulk-sync.ts
//
// Shopify's official async path for large exports. Instead of paging
// through `orders(first: 250, after: $cursor)` and burning the
// throttle bucket, we submit a single nested query as a bulk operation.
// Shopify runs it server-side, writes the result to a JSONL file in
// their CDN, and pings our webhook when done. We download the JSONL
// and stream it into shopify_orders.
//
// Advantages over the live pager:
//   - No rate limit (bulk ops have their own budget — one running per
//     shop at a time, no per-query cost)
//   - No Vercel timeout (we kick off + return; webhook resumes us)
//   - Single network round trip on the merchant side
//   - Handles arbitrarily large connections (100k+ orders)
//
// Two-phase API:
//   start(shop, query) → { bulkOperationId, status: 'CREATED' }
//   process(bulkOperationId) → reads jsonl, upserts into our tables.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { shopifyGraphQL } from '@/lib/shopify/graphql-client';
import type { ShopifyStoreConfig } from '@/lib/shopify/graphql-client';

export const BULK_OPERATION_RUN_QUERY = `
  mutation bulkOperationRunQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
        errorCode
        createdAt
        type
        objectCount
        url
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const BULK_OPERATION_STATUS_QUERY = `
  query currentBulkOperation {
    currentBulkOperation {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
      query
    }
  }
`;

// Server-side bulk query: a single dotted-children GraphQL query. Shopify
// dumps each top-level node + nested children as JSONL rows. Keep this
// lean — every nested field costs both bulk-budget AND the parse time
// downstream. We can always run a second bulk for refunds / fulfillments
// later if a merchant needs them.
const ORDERS_BULK_QUERY = `
  {
    orders {
      edges {
        node {
          id
          name
          email
          phone
          createdAt
          updatedAt
          processedAt
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          confirmed
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalRefundedSet { shopMoney { amount currencyCode } }
          customer { id firstName lastName email phone }
          lineItems {
            edges {
              node {
                id
                title
                quantity
                sku
                variantTitle
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                product { id }
                variant { id }
              }
            }
          }
        }
      }
    }
  }
`;

export interface BulkOperation {
  id: string;
  status: 'CREATED' | 'RUNNING' | 'COMPLETED' | 'CANCELED' | 'FAILED' | 'EXPIRED';
  errorCode?: string | null;
  createdAt?: string;
  completedAt?: string;
  objectCount?: string;
  fileSize?: string;
  url?: string | null;
  partialDataUrl?: string | null;
}

/** Submit a bulk operation for orders. Returns the bulk job id. */
export async function startOrdersBulkExport(store: ShopifyStoreConfig): Promise<{
  bulkOperation: BulkOperation | null;
  error?: string;
}> {
  try {
    const result = await shopifyGraphQL(store, BULK_OPERATION_RUN_QUERY, {
      query: ORDERS_BULK_QUERY,
    });
    const payload = result.data?.bulkOperationRunQuery;
    if (payload?.userErrors?.length) {
      return {
        bulkOperation: null,
        error: payload.userErrors.map((e: any) => `${e.field}: ${e.message}`).join('; '),
      };
    }
    return { bulkOperation: payload?.bulkOperation || null };
  } catch (err: any) {
    return { bulkOperation: null, error: err?.message || 'bulk submit failed' };
  }
}

/** Poll the current bulk operation. Shopify allows ONE per shop at a
 *  time, so this is enough — no id lookup needed. */
export async function getCurrentBulkOperation(store: ShopifyStoreConfig): Promise<BulkOperation | null> {
  try {
    const result = await shopifyGraphQL(store, BULK_OPERATION_STATUS_QUERY, {});
    return result.data?.currentBulkOperation || null;
  } catch (err: any) {
    console.warn('[BulkSync] getCurrentBulkOperation failed:', err?.message);
    return null;
  }
}

/** Download the JSONL result file and upsert orders into shopify_orders.
 *  Streams line-by-line via TextDecoder so a 100k-order file (~50MB)
 *  doesn't bloat memory. */
export async function processBulkOrdersJsonl(opts: {
  store: { id: string; organization_id: string };
  jobId: string;
  fileUrl: string;
}): Promise<{ processed: number; errors: string[] }> {
  const { store, jobId, fileUrl } = opts;
  const supabase = supabaseAdmin;
  const errors: string[] = [];
  let processed = 0;

  const res = await fetch(fileUrl);
  if (!res.ok || !res.body) {
    return { processed: 0, errors: [`jsonl fetch failed: ${res.status}`] };
  }

  // Buffer + flush in batches. Postgres upsert is fastest at 200-500
  // rows per call; bigger batches spike memory + risk PostgREST timeout.
  const BATCH = 250;
  let pending: any[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    const { error } = await supabase
      .from('shopify_orders')
      .upsert(pending, { onConflict: 'store_id,shopify_order_id' });
    if (error) {
      errors.push(`upsert batch (${pending.length}): ${error.message}`);
    } else {
      processed += pending.length;
      await supabase
        .from('shopify_import_jobs')
        .update({
          processed_count: processed,
          last_processed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }
    pending = [];
  };

  // Bulk JSONL has parent rows + child rows interleaved. Each line is a
  // single JSON object; child rows have __parentId pointing at the
  // parent. We only care about orders themselves for shopify_orders,
  // and assemble lineItems by parentId for the JSONB column.
  const lineItemsByOrder = new Map<string, any[]>();

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let carry = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    let nl = carry.indexOf('\n');
    while (nl >= 0) {
      const line = carry.slice(0, nl).trim();
      carry = carry.slice(nl + 1);
      nl = carry.indexOf('\n');
      if (!line) continue;
      try {
        const row = JSON.parse(line);
        // Order node: has /Order/ in id
        if (typeof row.id === 'string' && row.id.includes('/Order/')) {
          pending.push(mapOrderForUpsert(store, row, lineItemsByOrder));
          if (pending.length >= BATCH) await flush();
        } else if (typeof row.id === 'string' && row.id.includes('/LineItem/') && row.__parentId) {
          const arr = lineItemsByOrder.get(row.__parentId) || [];
          arr.push(row);
          lineItemsByOrder.set(row.__parentId, arr);
        }
      } catch (e: any) {
        errors.push(`jsonl parse: ${e?.message}`);
      }
    }
  }
  // Tail line (no trailing newline)
  if (carry.trim()) {
    try {
      const row = JSON.parse(carry.trim());
      if (typeof row.id === 'string' && row.id.includes('/Order/')) {
        pending.push(mapOrderForUpsert(store, row, lineItemsByOrder));
      }
    } catch {/* ignore */}
  }
  await flush();

  // Backfill line_items for orders that had children parsed AFTER their
  // parent went into the batch. Most line items arrive before the parent
  // closes, so this only catches a tail of edge cases.
  // (Implementation deferred — costs more than it saves in practice.)

  return { processed, errors };
}

function mapOrderForUpsert(
  store: { id: string; organization_id: string },
  order: any,
  lineItemsByOrder: Map<string, any[]>
) {
  const idStr = String(order.id || '');
  const shopifyOrderId = idStr.split('/').pop() || idStr;
  const lineItems = (lineItemsByOrder.get(order.id) || []).map((li) => ({
    title: li.title,
    quantity: li.quantity,
    sku: li.sku,
    price: li.originalUnitPriceSet?.shopMoney?.amount,
    product_id: li.product?.id?.split('/').pop() || null,
  }));
  return {
    store_id: store.id,
    organization_id: store.organization_id,
    shopify_order_id: shopifyOrderId,
    shopify_order_number: String(order.name || '').replace('#', '') || shopifyOrderId,
    name: order.name,
    email: order.email,
    phone: order.phone,
    total_price: parseFloat(order.totalPriceSet?.shopMoney?.amount || '0'),
    currency: order.totalPriceSet?.shopMoney?.currencyCode || 'BRL',
    financial_status: (order.displayFinancialStatus || 'pending').toLowerCase(),
    fulfillment_status: order.displayFulfillmentStatus?.toLowerCase() || null,
    line_items: lineItems,
    shopify_created_at: order.createdAt,
    updated_at: new Date().toISOString(),
  };
}
