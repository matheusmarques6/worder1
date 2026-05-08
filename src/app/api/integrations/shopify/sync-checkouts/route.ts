// =============================================
// POST /api/integrations/shopify/sync-checkouts
//
// Closes the gap between abandoned checkouts visible in Shopify Admin
// and what shopify_checkouts holds. Webhooks miss checkouts when:
//   - HMAC mismatch (early in onboarding, before alias fix)
//   - Network drops / Vercel cold starts during the burst
//   - The webhook handler returned 410 because the canonical
//     myshopifyDomain wasn't yet in shop_domain_aliases
//   - The merchant connected AFTER some checkouts were already abandoned
//
// This endpoint pulls every abandoned checkout from Shopify GraphQL
// (last 250) for the active store and upserts them into
// shopify_checkouts on (store_id, shopify_checkout_id). Then it kicks
// the existing backfill-checkouts to link contacts. Idempotent.
//
// Body: { storeId: "..." } (defaults to active store)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SHOPIFY_API_VERSION = '2026-04';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const storeId = body?.storeId;

  const admin = getSupabaseAdmin();
  let store: any;
  if (storeId) {
    const { data } = await admin
      .from('shopify_stores')
      .select('id, organization_id, shop_domain, access_token, api_version, currency')
      .eq('id', storeId)
      .eq('organization_id', orgId)
      .maybeSingle();
    store = data;
  } else {
    const { data } = await admin
      .from('shopify_stores')
      .select('id, organization_id, shop_domain, access_token, api_version, currency')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('installed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    store = data;
  }
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  if (!store.access_token) {
    return NextResponse.json({ error: 'Store has no access token' }, { status: 400 });
  }

  const apiVersion = store.api_version || SHOPIFY_API_VERSION;

  // Page through Shopify's abandoned checkouts via GraphQL. 250 per
  // page is the max — typically enough to catch the gap; we paginate
  // up to 4 pages = 1000 checkouts to bound execution time.
  let cursor: string | null = null;
  let totalFetched = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorMsgs: string[] = [];
  const seenIds: string[] = [];

  for (let page = 0; page < 4; page++) {
    const query = `
      query AbandonedCheckouts($cursor: String) {
        abandonedCheckouts(first: 250, after: $cursor, sortKey: CREATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              abandonedCheckoutUrl
              createdAt
              updatedAt
              completedAt
              totalPriceSet { shopMoney { amount currencyCode } }
              subtotalPriceSet { shopMoney { amount currencyCode } }
              totalTaxSet { shopMoney { amount currencyCode } }
              totalDiscountSet { shopMoney { amount currencyCode } }
              customer { id email phone firstName lastName }
              billingAddress { firstName lastName phone }
              lineItems(first: 50) {
                edges {
                  node {
                    quantity
                    sku
                    title
                    variantTitle
                    originalUnitPriceSet { shopMoney { amount currencyCode } }
                    image { url }
                    product { id title handle vendor }
                    variant { id title sku }
                  }
                }
              }
            }
          }
        }
      }
    `;
    let data: any;
    try {
      const res = await fetch(
        `https://${store.shop_domain}/admin/api/${apiVersion}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': store.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables: { cursor } }),
        }
      );
      if (!res.ok) {
        errors++;
        errorMsgs.push(`page ${page}: HTTP ${res.status}`);
        break;
      }
      data = await res.json();
      if (data.errors) {
        errors++;
        errorMsgs.push(`page ${page}: ${JSON.stringify(data.errors).slice(0, 200)}`);
        break;
      }
    } catch (e: any) {
      errors++;
      errorMsgs.push(`page ${page}: ${e?.message}`);
      break;
    }

    const edges = data?.data?.abandonedCheckouts?.edges || [];
    if (edges.length === 0) break;

    // Build the list of upsert rows for this page
    const rows: any[] = [];
    for (const edge of edges) {
      const node = edge.node;
      // GID: gid://shopify/AbandonedCheckout/12345
      const idMatch = String(node.id || '').match(/AbandonedCheckout\/(\d+)/);
      const checkoutId = idMatch ? idMatch[1] : null;
      if (!checkoutId) continue;
      seenIds.push(checkoutId);
      totalFetched++;

      const customerIdMatch = String(node.customer?.id || '').match(/Customer\/(\d+)/);
      const customerId = customerIdMatch ? customerIdMatch[1] : null;

      const lineItems = (node.lineItems?.edges || []).map((le: any) => {
        const ln = le.node;
        const productMatch = String(ln.product?.id || '').match(/Product\/(\d+)/);
        const variantMatch = String(ln.variant?.id || '').match(/ProductVariant\/(\d+)/);
        return {
          title: ln.title,
          quantity: ln.quantity,
          sku: ln.sku,
          variant_title: ln.variantTitle,
          price: ln.originalUnitPriceSet?.shopMoney?.amount || '0',
          product_id: productMatch ? Number(productMatch[1]) : null,
          variant_id: variantMatch ? Number(variantMatch[1]) : null,
          vendor: ln.product?.vendor || null,
          product: {
            id: productMatch ? productMatch[1] : null,
            title: ln.product?.title || null,
            handle: ln.product?.handle || null,
            product_image_urls: ln.image?.url ? [ln.image.url] : [],
          },
        };
      });

      rows.push({
        store_id: store.id,
        organization_id: store.organization_id,
        shopify_checkout_id: checkoutId,
        email:
          node.customer?.email ||
          null,
        phone:
          node.customer?.phone ||
          node.billingAddress?.phone ||
          null,
        total_price: node.totalPriceSet?.shopMoney?.amount || '0',
        subtotal_price: node.subtotalPriceSet?.shopMoney?.amount || '0',
        total_tax: node.totalTaxSet?.shopMoney?.amount || '0',
        total_discounts: node.totalDiscountSet?.shopMoney?.amount || '0',
        currency: node.totalPriceSet?.shopMoney?.currencyCode || store.currency || 'USD',
        line_items: lineItems,
        recovery_url: node.abandonedCheckoutUrl,
        abandoned_checkout_url: node.abandonedCheckoutUrl,
        status: node.completedAt ? 'converted' : 'pending',
        shopify_created_at: node.createdAt,
        updated_at: new Date().toISOString(),
      });
    }

    // Upsert this batch
    if (rows.length > 0) {
      // Find which checkouts already exist to count inserted vs updated
      const existingRes = await admin
        .from('shopify_checkouts')
        .select('shopify_checkout_id')
        .eq('store_id', store.id)
        .in('shopify_checkout_id', rows.map(r => r.shopify_checkout_id));
      const existingSet = new Set((existingRes.data || []).map(r => r.shopify_checkout_id));

      const { error: upsertErr } = await admin
        .from('shopify_checkouts')
        .upsert(rows, { onConflict: 'store_id,shopify_checkout_id' });
      if (upsertErr) {
        errors++;
        errorMsgs.push(`upsert: ${upsertErr.message}`);
      } else {
        for (const r of rows) {
          if (existingSet.has(r.shopify_checkout_id)) updated++;
          else inserted++;
        }
      }
    }

    cursor = data?.data?.abandonedCheckouts?.pageInfo?.endCursor || null;
    const hasMore = data?.data?.abandonedCheckouts?.pageInfo?.hasNextPage;
    if (!hasMore || !cursor) break;
  }

  // Trigger the existing backfill to link contacts on the newly synced
  // rows. Same logic the merchant ran manually before — now happens
  // automatically right after the sync.
  let linked = 0;
  try {
    const { POST: backfillRoute } = await import('../backfill-checkouts/route');
    const backfillReq = new Request(`${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/backfill-checkouts`, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ storeId: store.id }),
    });
    const backfillRes = await backfillRoute(backfillReq as any);
    const backfillJson = await backfillRes.json();
    linked = backfillJson.linked || 0;
  } catch (e: any) {
    errorMsgs.push(`backfill: ${e?.message}`);
  }

  return NextResponse.json({
    success: true,
    fetched: totalFetched,
    inserted,
    updated,
    contacts_linked: linked,
    errors: errors > 0 ? errorMsgs.slice(0, 5) : undefined,
    store: { id: store.id, shop_domain: store.shop_domain, currency: store.currency },
  });
}
