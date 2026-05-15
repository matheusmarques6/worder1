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
//
// `query: "status:any"` is critical. Without it the bulk operation
// inherits the same default filter as the live API (status:open, which
// excludes archived/closed orders) and a healthy store with auto-archived
// fulfilled orders would have hundreds missing from the export. This
// matches the cursor sync's behavior.
const ORDERS_BULK_QUERY = `
  {
    orders(query: "status:any") {
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
          paymentGatewayNames
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalRefundedSet { shopMoney { amount currencyCode } }
          customer { id firstName lastName email phone }
          shippingAddress { firstName lastName address1 address2 city province country zip phone }
          billingAddress { firstName lastName address1 address2 city province country zip phone }
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
 *  Streams line-by-line via TextDecoder so a multi-GB file doesn't bloat
 *  memory. Resumable: passes deadlineMs to bail before Vercel kills,
 *  saves how many lines were processed, and the next invocation
 *  fast-forwards past them.
 *
 *  Shopify's bulk JSONL puts each parent's children right after the
 *  parent (lineItems for Order X arrive between the X line and the next
 *  Order line). Previous implementation flushed each order immediately
 *  on its parse and looked up children from a pre-built map — but the
 *  children hadn't been parsed yet, so every drained order ended up
 *  with line_items: []. Fixed by buffering the "current order" and
 *  flushing only when the next parent appears (or EOF).
 */
export async function processBulkOrdersJsonl(opts: {
  store: { id: string; organization_id: string };
  jobId: string;
  fileUrl: string;
  /** Fast-forward past this many lines before processing (resume). */
  linesAlreadyProcessed?: number;
  /** Time budget in ms. The drain bails at the next order boundary
   *  after this elapses, saves linesProcessed, returns complete=false.
   *  Caller fires a continuation. */
  deadlineMs?: number;
}): Promise<{
  processed: number;
  errors: string[];
  linesProcessed: number;
  complete: boolean;
}> {
  const {
    store,
    jobId,
    fileUrl,
    linesAlreadyProcessed = 0,
    deadlineMs = 240_000,
  } = opts;
  const supabase = supabaseAdmin;
  const errors: string[] = [];
  let processed = 0;
  let linesSeen = 0;
  const startedAt = Date.now();

  const res = await fetch(fileUrl);
  if (!res.ok || !res.body) {
    return {
      processed: 0,
      errors: [`jsonl fetch failed: ${res.status}`],
      linesProcessed: linesAlreadyProcessed,
      complete: false,
    };
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
    }
    pending = [];
  };

  // "Current order" buffer + its children. We hold the order in
  // memory until the NEXT order arrives in the stream — that's when
  // we know we've seen all the children for the current parent.
  let currentOrder: any = null;
  let currentChildren: any[] = [];

  const flushCurrentOrder = () => {
    if (!currentOrder) return;
    const tmp = new Map<string, any[]>();
    tmp.set(currentOrder.id, currentChildren);
    pending.push(mapOrderForUpsert(store, currentOrder, tmp));
    currentOrder = null;
    currentChildren = [];
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let carry = '';
  let reachedDeadline = false;
  let stopAtNextOrder = false;

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
      linesSeen++;

      // Resume fast-forward: skip lines we already processed in an
      // earlier invocation. Parse is cheaper than skipped, but
      // skipping the JSON.parse + map lookup saves real time on 1M+
      // line files.
      if (linesSeen <= linesAlreadyProcessed) continue;

      try {
        const row = JSON.parse(line);
        if (typeof row.id === 'string' && row.id.includes('/Order/')) {
          // Reached the boundary we promised the deadline at —
          // flush the just-completed order, save state, return.
          if (stopAtNextOrder) {
            flushCurrentOrder();
            await flush();
            // -1 because we want to re-read THIS order on resume
            // (we haven't started processing it yet).
            await supabase
              .from('shopify_import_jobs')
              .update({
                processed_count: processed,
                last_processed_at: new Date().toISOString(),
                config: {
                  bulk_jsonl_url: fileUrl,
                  lines_processed: linesSeen - 1,
                },
              })
              .eq('id', jobId);
            return {
              processed,
              errors,
              linesProcessed: linesSeen - 1,
              complete: false,
            };
          }
          // Normal flow: finalize previous order, start the new one.
          flushCurrentOrder();
          if (pending.length >= BATCH) await flush();
          currentOrder = row;
        } else if (
          typeof row.id === 'string' &&
          row.id.includes('/LineItem/') &&
          row.__parentId &&
          currentOrder &&
          row.__parentId === currentOrder.id
        ) {
          currentChildren.push(row);
        }
      } catch (e: any) {
        errors.push(`jsonl parse: ${e?.message}`);
      }
    }

    // Deadline check happens between chunks (after a full read). We
    // don't bail immediately — we set a flag and wait for the next
    // Order boundary so the current order's children are all in.
    if (!stopAtNextOrder && Date.now() - startedAt > deadlineMs) {
      stopAtNextOrder = true;
      reachedDeadline = true;
    }
  }

  // Tail line (no trailing newline) — could be the last order or one
  // of its children.
  if (carry.trim()) {
    linesSeen++;
    if (linesSeen > linesAlreadyProcessed) {
      try {
        const row = JSON.parse(carry.trim());
        if (typeof row.id === 'string' && row.id.includes('/Order/')) {
          flushCurrentOrder();
          currentOrder = row;
          currentChildren = [];
        } else if (
          typeof row.id === 'string' &&
          row.id.includes('/LineItem/') &&
          row.__parentId &&
          currentOrder &&
          row.__parentId === currentOrder.id
        ) {
          currentChildren.push(row);
        }
      } catch {
        /* ignore */
      }
    }
  }

  // EOF — finalize the last order and flush any remaining batch.
  flushCurrentOrder();
  await flush();

  await supabase
    .from('shopify_import_jobs')
    .update({
      processed_count: processed,
      last_processed_at: new Date().toISOString(),
      config: reachedDeadline
        ? {
            bulk_jsonl_url: fileUrl,
            lines_processed: linesSeen,
          }
        : {
            bulk_jsonl_url: fileUrl,
            lines_processed: linesSeen,
          },
    })
    .eq('id', jobId);

  return {
    processed,
    errors,
    linesProcessed: linesSeen,
    complete: !reachedDeadline,
  };
}

function mapOrderForUpsert(
  store: { id: string; organization_id: string },
  order: any,
  lineItemsByOrder: Map<string, any[]>
) {
  const idStr = String(order.id || '');
  const shopifyOrderId = idStr.split('/').pop() || idStr;
  const lineItems = (lineItemsByOrder.get(order.id) || []).map((li) => ({
    id: li.id ? String(li.id).split('/').pop() : null,
    title: li.title,
    quantity: li.quantity,
    sku: li.sku,
    variant_title: li.variantTitle,
    price: li.originalUnitPriceSet?.shopMoney?.amount || '0',
    product_id: li.product?.id ? String(li.product.id).split('/').pop() : null,
    variant_id: li.variant?.id ? String(li.variant.id).split('/').pop() : null,
  }));
  // Column names match exactly what the cursor sync writes
  // (syncOrdersGraphQL). Earlier shape used shopify_order_number /
  // shopify_created_at — neither column exists on shopify_orders, so
  // the upsert would have silently dropped those values onto the
  // table's defaults. Use order_number / created_at like the rest of
  // the codebase, and include every column the cursor sync writes so
  // the bulk path and the cursor path produce identical rows.
  return {
    store_id: store.id,
    organization_id: store.organization_id,
    shopify_order_id: shopifyOrderId,
    order_number: String(order.name || '').replace('#', '') || shopifyOrderId,
    name: order.name,
    email: order.email,
    phone: order.phone,
    total_price: parseFloat(order.totalPriceSet?.shopMoney?.amount || '0'),
    subtotal_price: parseFloat(order.subtotalPriceSet?.shopMoney?.amount || '0'),
    total_tax: parseFloat(order.totalTaxSet?.shopMoney?.amount || '0'),
    total_discounts: parseFloat(order.totalDiscountsSet?.shopMoney?.amount || '0'),
    currency: order.totalPriceSet?.shopMoney?.currencyCode || 'BRL',
    financial_status: (order.displayFinancialStatus || 'pending').toLowerCase(),
    fulfillment_status: order.displayFulfillmentStatus?.toLowerCase() || null,
    payment_gateway_names: order.paymentGatewayNames || [],
    customer_id: order.customer?.id ? String(order.customer.id).split('/').pop() : null,
    line_items: lineItems,
    shipping_address: order.shippingAddress || null,
    billing_address: order.billingAddress || null,
    created_at: order.createdAt,
    updated_at: new Date().toISOString(),
  };
}
