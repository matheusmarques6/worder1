// =============================================
// POST /api/shopify/sync-financials?store_id=X
//
// Sync customer-level lifetime financial metrics from Shopify into
// the contacts table (total_orders, total_spent, last_order_at, AOV).
// Also computes store-level totals into shopify_stores.
//
// Resumable across calls. The previous version did one SELECT-by-email
// + (sometimes) SELECT-by-phone + UPDATE/INSERT per customer, serial.
// On Dr. Melaxin's 22k-customer store that was 50k+ DB roundtrips in
// one request — Vercel killed it at 300s every single time and the
// next click started over from page 1 with nothing saved.
//
// Now:
//  - Pagination has a deadline (180s) so we always leave time for the
//    upsert phase.
//  - shopify_import_jobs row tracks last_cursor so a partial run picks
//    up on the next call. Same pattern runFullSyncGraphQL uses.
//  - One upsert-in-batch by (organization_id, email) replaces the
//    per-customer SELECT+UPDATE/INSERT pair. The unique constraint on
//    contacts (organization_id, email) is what makes this safe.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { shopifyGraphQLPaginate } from '@/lib/shopify/graphql-client';
import { ensureFreshToken } from '@/lib/shopify/ensure-fresh-token';
import { recomputeStoreTotals } from '@/lib/services/shopify/store-totals';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CUSTOMERS_FINANCIAL_QUERY = `
  query CustomersFinancial($first: Int!, $after: String, $sortKey: CustomerSortKeys) {
    customers(first: $first, after: $after, sortKey: $sortKey) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        legacyResourceId
        email
        phone
        firstName
        lastName
        createdAt
        updatedAt
        numberOfOrders
        amountSpent { amount currencyCode }
        lastOrder {
          id
          name
          createdAt
          totalPriceSet { shopMoney { amount } }
        }
        emailMarketingConsent { marketingState }
        smsMarketingConsent { marketingState }
        tags
        defaultAddress {
          city province country zip
        }
      }
    }
  }
`;

const SYNC_TYPE = 'customers_financial';
const PAGE_BUDGET_MS = 180_000;
const PROCESS_BATCH_SIZE = 100;

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = request.nextUrl;
  const storeIdParam = searchParams.get('store_id') || searchParams.get('storeId');

  const supabase = getSupabaseAdmin();

  // Find target store
  let store: any;
  if (storeIdParam) {
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeIdParam)
      .eq('organization_id', organizationId)
      .single();
    store = data;
  } else {
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('installed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    store = data;
  }

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }
  if (!store.access_token) {
    return NextResponse.json({ error: 'Store has no access token' }, { status: 400 });
  }

  const refreshed = await ensureFreshToken(store);
  if (!refreshed.ok) {
    return NextResponse.json({ error: refreshed.error }, { status: 401 });
  }
  store = refreshed.store;

  const storeConfig = {
    id: store.id,
    organization_id: store.organization_id,
    shop_domain: store.shop_domain,
    access_token: store.access_token,
  };

  // Resume an interrupted run if there's one. Match the pattern
  // runFullSyncGraphQL uses so the orders + financials syncs read the
  // same shopify_import_jobs table.
  const { data: existingJob } = await supabase
    .from('shopify_import_jobs')
    .select('id, last_cursor, processed_count')
    .eq('store_id', store.id)
    .eq('organization_id', store.organization_id)
    .contains('config', { sync_type: SYNC_TYPE })
    .in('status', ['running', 'pending', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let jobId: string | null = existingJob?.id || null;
  let startCursor: string | null = existingJob?.last_cursor || null;
  let runningCount = existingJob?.processed_count || 0;

  if (!jobId) {
    const { data: newJob } = await supabase
      .from('shopify_import_jobs')
      .insert({
        store_id: store.id,
        organization_id: store.organization_id,
        status: 'running',
        config: { sync_type: SYNC_TYPE },
        started_at: new Date().toISOString(),
        processed_count: 0,
      })
      .select('id')
      .single();
    jobId = newJob?.id || null;
  } else {
    await supabase
      .from('shopify_import_jobs')
      .update({ status: 'running', last_processed_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  if (startCursor) {
    console.log(`[SyncFinancials] Resuming from cursor=${startCursor.slice(0, 16)}... (${runningCount} processed)`);
  }

  const startedAt = Date.now();
  let customersProcessed = 0;
  let contactsUpserted = 0;
  let totalRevenue = 0;
  let totalOrders = 0;
  const errors: string[] = [];

  try {
    const { nodes, lastCursor, reachedDeadline } = await shopifyGraphQLPaginate(
      storeConfig,
      CUSTOMERS_FINANCIAL_QUERY,
      { sortKey: 'UPDATED_AT' },
      'customers',
      {
        first: 100,
        maxPages: 200,
        startCursor,
        deadlineMs: PAGE_BUDGET_MS,
        onPage: (page, total, cursor) => {
          // Persist the cursor every page so a hard kill mid-fetch
          // (network drop, Vercel timeout warning) doesn't lose ground.
          if (jobId) {
            supabase
              .from('shopify_import_jobs')
              .update({
                last_cursor: cursor,
                processed_count: runningCount + total,
                current_page: page,
                last_processed_at: new Date().toISOString(),
              })
              .eq('id', jobId)
              .then(() => {}, () => {});
          }
        },
      }
    );

    customersProcessed = nodes.length;

    // Batch upsert. Replaces the previous per-customer SELECT +
    // UPDATE/INSERT pair which did 2-3 DB roundtrips per row. On Dr.
    // Melaxin (22k customers) the old pattern was the single biggest
    // contributor to the 300s timeout — this collapses to one upsert
    // per 100 customers.
    for (let i = 0; i < nodes.length; i += PROCESS_BATCH_SIZE) {
      const batch = nodes.slice(i, i + PROCESS_BATCH_SIZE);

      const rows = batch
        .map((c: any) => {
          const email = (c.email || '').toLowerCase().trim();
          if (!email) return null; // contacts unique key is (org, email)

          const numberOfOrders = parseInt(c.numberOfOrders || '0', 10);
          const totalSpent = parseFloat(c.amountSpent?.amount || '0');
          const aov = numberOfOrders > 0 ? totalSpent / numberOfOrders : 0;
          const lastOrderAt = c.lastOrder?.createdAt || null;

          totalRevenue += totalSpent;
          totalOrders += numberOfOrders;

          return {
            organization_id: organizationId,
            store_id: store.id,
            email,
            phone: c.phone || null,
            first_name: c.firstName || null,
            last_name: c.lastName || null,
            total_orders: numberOfOrders,
            total_spent: totalSpent,
            average_order_value: aov,
            last_order_at: lastOrderAt,
            shopify_customer_id: c.legacyResourceId || null,
            is_subscribed_email: c.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
            is_subscribed_sms: c.smsMarketingConsent?.marketingState === 'SUBSCRIBED',
            city: c.defaultAddress?.city || null,
            state: c.defaultAddress?.province || null,
            country: c.defaultAddress?.country || null,
            source: 'shopify_sync_financials',
            updated_at: new Date().toISOString(),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length === 0) continue;

      const { error } = await supabase
        .from('contacts')
        .upsert(rows, { onConflict: 'organization_id,email' });

      if (error) {
        errors.push(`Batch ${i}: ${error.message}`);
      } else {
        contactsUpserted += rows.length;
      }
    }

    // Recompute store-level cache from real row counts. The Shopify
    // GraphQL-side totals (totalOrders / totalRevenue / customer
    // running count) are useful internally but they're sum-of-page
    // figures that can include duplicates if a page got retried.
    // count(*) on shopify_orders / shopify_customers / shopify_products
    // is the canonical source for the integrations card.
    await recomputeStoreTotals(supabase, store.id);

    // Flip the job state. If we hit the deadline mid-walk, leave it
    // 'pending' with the cursor so the next call resumes. If we made
    // it through, mark 'completed' so we don't accidentally restart
    // on a manual re-trigger.
    if (jobId) {
      const done = !reachedDeadline;
      await supabase
        .from('shopify_import_jobs')
        .update({
          status: done ? 'completed' : 'pending',
          last_cursor: lastCursor,
          processed_count: runningCount + customersProcessed,
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq('id', jobId);
    }

    return NextResponse.json({
      success: true,
      mode: reachedDeadline ? 'partial' : 'completed',
      jobId,
      resumeFromCursor: reachedDeadline ? lastCursor : null,
      durationMs: Date.now() - startedAt,
      stats: {
        customersProcessed,
        contactsUpserted,
        totalRevenue,
        totalOrders,
        currency: store.currency || 'BRL',
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (err: any) {
    // Leave the job in 'pending' on hard error so a manual re-trigger
    // resumes instead of starting from scratch.
    if (jobId) {
      await supabase
        .from('shopify_import_jobs')
        .update({ status: 'pending', last_processed_at: new Date().toISOString() })
        .eq('id', jobId);
    }
    return NextResponse.json({
      success: false,
      error: err?.message || 'Sync failed',
      durationMs: Date.now() - startedAt,
      partialStats: { customersProcessed, contactsUpserted },
    }, { status: 500 });
  }
}
