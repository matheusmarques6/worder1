// =============================================
// POST /api/cron/compute-recommendations
//
// Runs nightly. Materializes 3 collaborative-filtering matrices into
// product_recommendations:
//
//   1. frequently_bought_together (FBT) — items co-purchased in the
//      same order. Highest signal, used for upsell/cross-sell blocks.
//
//   2. also_viewed — items viewed in the same browser session by the
//      same visitor. Lower signal but available for products that
//      haven't been bought yet (long-tail catalog).
//
//   3. view_to_purchase — for visitors who viewed product X, count
//      every product Y they later purchased. Predicts the "next-best-
//      product" for someone currently browsing X.
//
// Scoring: Jaccard similarity normalized to 0..1. Top 20 recs per
// source product are kept, the rest are discarded to bound table size.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — heavy aggregation

const TOP_N_PER_PRODUCT = 20;
const LOOKBACK_DAYS = 90;
const MIN_CO_OCCURRENCE = 2; // need at least 2 to be a meaningful pair

function isCronAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  // Vercel cron requests carry a special header
  if (request.headers.get('x-vercel-cron') === '1') return true;
  // Allow internal calls from our own admin UI for manual rebuilds
  if (request.headers.get('x-worder-internal') === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

interface ProductSummary {
  shopify_product_id: string;
  title: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Process per-organization so each tenant's recommendations stay
  // isolated and one failure doesn't block the others.
  const { data: orgs } = await admin.from('organizations').select('id');
  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ success: true, message: 'No organizations to process' });
  }

  const summary: any[] = [];
  for (const org of orgs) {
    try {
      const orgSummary = await computeForOrg(admin, org.id, since);
      summary.push({ organization_id: org.id, ...orgSummary });
    } catch (err: any) {
      console.error(`[Recs cron] org ${org.id} failed:`, err?.message);
      summary.push({ organization_id: org.id, error: err?.message });
    }
  }

  return NextResponse.json({ success: true, organizations: summary });
}

// Allow GET so Vercel cron (which uses GET by default) can hit the
// same handler.
export async function GET(request: NextRequest) {
  return POST(request);
}

async function computeForOrg(admin: any, organizationId: string, since: string) {
  // ============================================
  // 1. Product catalog (for cached title/image on recs)
  //    shopify_products has: title, handle, vendor, price, images[].
  //    First image is the "featured" one (matches Shopify's convention).
  // ============================================
  const { data: products } = await admin
    .from('shopify_products')
    .select('shopify_product_id, title, handle, price, images, store_id')
    .eq('organization_id', organizationId);

  // Need shop_domain to build product URLs for the recs payload
  const { data: stores } = await admin
    .from('shopify_stores')
    .select('id, shop_domain')
    .eq('organization_id', organizationId);
  const shopDomainByStore = new Map<string, string>();
  for (const s of stores || []) {
    if (s.id) shopDomainByStore.set(s.id, s.shop_domain || '');
  }

  const productMap = new Map<string, ProductSummary & { store_id: string | null }>();
  for (const p of products || []) {
    if (!p.shopify_product_id) continue;
    const firstImage = Array.isArray(p.images) && p.images.length > 0
      ? (p.images[0]?.url || p.images[0]?.src || null)
      : null;
    const shop = p.store_id ? shopDomainByStore.get(p.store_id) : null;
    const url = (shop && p.handle) ? `https://${shop}/products/${p.handle}` : null;
    productMap.set(String(p.shopify_product_id), {
      shopify_product_id: String(p.shopify_product_id),
      title: p.title || null,
      image: firstImage,
      price: p.price != null ? Number(p.price) : null,
      currency: null, // shopify_products has no currency column; fall back to event currency at lookup
      url,
      store_id: p.store_id || null,
    });
  }

  // ============================================
  // 2. Pull placed_order events (with line items in properties.items)
  //    — basis for frequently_bought_together
  // ============================================
  const { data: orders } = await admin
    .from('contact_events')
    .select('contact_id, properties, store_id, occurred_at')
    .eq('organization_id', organizationId)
    .eq('event_type', 'placed_order')
    .gt('occurred_at', since)
    .limit(50000);

  const fbtPairs = new Map<string, number>(); // "A|B" → count, A < B
  const productOrderCount = new Map<string, number>(); // |orders containing P|

  for (const ord of orders || []) {
    const items: any[] = ord.properties?.items || [];
    if (!Array.isArray(items) || items.length < 2) {
      // Still count single-product orders for normalization base
      for (const it of items) {
        const pid = String(it.product_id || it.productId || '').trim();
        if (pid) productOrderCount.set(pid, (productOrderCount.get(pid) || 0) + 1);
      }
      continue;
    }
    const pids = Array.from(new Set(
      items.map(it => String(it.product_id || it.productId || '').trim()).filter(Boolean)
    ));
    for (const pid of pids) {
      productOrderCount.set(pid, (productOrderCount.get(pid) || 0) + 1);
    }
    for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) {
        const [a, b] = [pids[i], pids[j]].sort();
        const key = `${a}|${b}`;
        fbtPairs.set(key, (fbtPairs.get(key) || 0) + 1);
      }
    }
  }

  // ============================================
  // 3. Pull viewed_product events grouped by anonymous_id/contact_id
  //    — basis for also_viewed (within same session window) and
  //    view_to_purchase (across sessions ending in purchase)
  // ============================================
  const { data: views } = await admin
    .from('contact_events')
    .select('contact_id, anonymous_id, properties, occurred_at')
    .eq('organization_id', organizationId)
    .eq('event_type', 'viewed_product')
    .gt('occurred_at', since)
    .limit(200000);

  const viewsByVisitor = new Map<string, Set<string>>();
  for (const v of views || []) {
    const visitorKey = v.contact_id || v.anonymous_id;
    if (!visitorKey) continue;
    const pid = String(
      v.properties?.product_id || v.properties?.productId || ''
    ).trim();
    if (!pid) continue;
    if (!viewsByVisitor.has(visitorKey)) viewsByVisitor.set(visitorKey, new Set());
    viewsByVisitor.get(visitorKey)!.add(pid);
  }

  const alsoViewedPairs = new Map<string, number>();
  const productViewCount = new Map<string, number>();
  for (const set of viewsByVisitor.values()) {
    const pids = Array.from(set);
    for (const pid of pids) {
      productViewCount.set(pid, (productViewCount.get(pid) || 0) + 1);
    }
    for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) {
        const [a, b] = [pids[i], pids[j]].sort();
        const key = `${a}|${b}`;
        alsoViewedPairs.set(key, (alsoViewedPairs.get(key) || 0) + 1);
      }
    }
  }

  // ============================================
  // 4. view_to_purchase: same visitor viewed P then later purchased Q
  // ============================================
  const visitorViews = new Map<string, Set<string>>(); // visitor → viewed products
  const visitorPurchases = new Map<string, Set<string>>();
  for (const v of views || []) {
    const k = v.contact_id || v.anonymous_id;
    if (!k) continue;
    const pid = String(v.properties?.product_id || v.properties?.productId || '').trim();
    if (!pid) continue;
    if (!visitorViews.has(k)) visitorViews.set(k, new Set());
    visitorViews.get(k)!.add(pid);
  }
  for (const ord of orders || []) {
    const k = ord.contact_id;
    if (!k) continue;
    const items: any[] = ord.properties?.items || [];
    for (const it of items) {
      const pid = String(it.product_id || it.productId || '').trim();
      if (!pid) continue;
      if (!visitorPurchases.has(k)) visitorPurchases.set(k, new Set());
      visitorPurchases.get(k)!.add(pid);
    }
  }
  const viewToPurchasePairs = new Map<string, number>();
  for (const [visitor, viewed] of visitorViews.entries()) {
    const purchased = visitorPurchases.get(visitor);
    if (!purchased) continue;
    for (const v of viewed) {
      for (const p of purchased) {
        if (v === p) continue;
        const key = `${v}|${p}`; // direction matters: v → p
        viewToPurchasePairs.set(key, (viewToPurchasePairs.get(key) || 0) + 1);
      }
    }
  }

  // ============================================
  // 5. Build recommendation rows — per source product, top N by score
  // ============================================
  const allRecs: Array<{
    type: string;
    source: string;
    rec: string;
    co: number;
    score: number;
  }> = [];

  // FBT — symmetric, so each pair generates 2 directional rows
  for (const [key, co] of fbtPairs.entries()) {
    if (co < MIN_CO_OCCURRENCE) continue;
    const [a, b] = key.split('|');
    const ca = productOrderCount.get(a) || 1;
    const cb = productOrderCount.get(b) || 1;
    const score = co / (ca + cb - co); // Jaccard
    allRecs.push({ type: 'frequently_bought_together', source: a, rec: b, co, score });
    allRecs.push({ type: 'frequently_bought_together', source: b, rec: a, co, score });
  }

  // also_viewed — symmetric
  for (const [key, co] of alsoViewedPairs.entries()) {
    if (co < MIN_CO_OCCURRENCE) continue;
    const [a, b] = key.split('|');
    const ca = productViewCount.get(a) || 1;
    const cb = productViewCount.get(b) || 1;
    const score = co / (ca + cb - co);
    allRecs.push({ type: 'also_viewed', source: a, rec: b, co, score });
    allRecs.push({ type: 'also_viewed', source: b, rec: a, co, score });
  }

  // view_to_purchase — directional
  for (const [key, co] of viewToPurchasePairs.entries()) {
    if (co < MIN_CO_OCCURRENCE) continue;
    const [v, p] = key.split('|');
    const cv = productViewCount.get(v) || 1;
    const score = co / cv; // P(purchase p | viewed v)
    allRecs.push({ type: 'view_to_purchase', source: v, rec: p, co, score });
  }

  // Group by (type, source), keep top N
  const grouped = new Map<string, typeof allRecs>();
  for (const r of allRecs) {
    const k = `${r.type}|${r.source}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(r);
  }

  const finalRows: any[] = [];
  for (const arr of grouped.values()) {
    arr.sort((x, y) => y.score - x.score);
    const top = arr.slice(0, TOP_N_PER_PRODUCT);
    for (const r of top) {
      const sourceProduct = productMap.get(r.source);
      const recProduct = productMap.get(r.rec);
      finalRows.push({
        organization_id: organizationId,
        store_id: recProduct?.store_id || sourceProduct?.store_id || null,
        source_product_id: r.source,
        recommended_product_id: r.rec,
        recommendation_type: r.type,
        co_occurrence_count: r.co,
        score: Math.round(r.score * 10000) / 10000,
        source_product_title: sourceProduct?.title || null,
        recommended_product_title: recProduct?.title || null,
        recommended_product_image: recProduct?.image || null,
        recommended_product_url: recProduct?.url || null,
        recommended_product_price: recProduct?.price ?? null,
        recommended_product_currency: recProduct?.currency || null,
        computed_at: new Date().toISOString(),
      });
    }
  }

  // Replace this org's recs in one transaction-ish flow:
  // 1. delete the old set
  // 2. insert the new set in chunks
  await admin
    .from('product_recommendations')
    .delete()
    .eq('organization_id', organizationId);

  if (finalRows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < finalRows.length; i += CHUNK) {
      const chunk = finalRows.slice(i, i + CHUNK);
      const { error } = await admin.from('product_recommendations').upsert(chunk, {
        onConflict: 'organization_id,source_product_id,recommended_product_id,recommendation_type',
      });
      if (error) throw error;
    }
  }

  return {
    orders_analyzed: (orders || []).length,
    views_analyzed: (views || []).length,
    fbt_pairs: fbtPairs.size,
    also_viewed_pairs: alsoViewedPairs.size,
    view_to_purchase_pairs: viewToPurchasePairs.size,
    recommendations_inserted: finalRows.length,
  };
}
