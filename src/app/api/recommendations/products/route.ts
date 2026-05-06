// =============================================
// GET /api/recommendations/products
//
// Returns product recommendations for a given source product.
// Public endpoint (CORS-enabled) — called by storefront pixel,
// email content blocks, popup builder, etc.
//
// Query params:
//   - storeDomain (required) — myshopify domain to scope recs
//   - productId (optional) — anchor product. Without it, returns
//     overall bestsellers (top scoring "rec" rows across all sources)
//   - type (optional) — 'frequently_bought_together' | 'also_viewed' |
//     'view_to_purchase'. Defaults to FBT, falls back to also_viewed
//     when FBT has no data for this product.
//   - limit (optional) — max results, default 4, cap 20
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const VALID_TYPES = ['frequently_bought_together', 'also_viewed', 'view_to_purchase'] as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const storeDomain = (searchParams.get('storeDomain') || searchParams.get('shop') || '').trim();
  const productId = (searchParams.get('productId') || searchParams.get('product_id') || '').trim();
  const requestedType = (searchParams.get('type') || 'frequently_bought_together') as typeof VALID_TYPES[number];
  const type = VALID_TYPES.includes(requestedType) ? requestedType : 'frequently_bought_together';
  const limit = Math.min(parseInt(searchParams.get('limit') || '4', 10) || 4, 20);

  if (!storeDomain) {
    return NextResponse.json(
      { error: 'storeDomain is required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const admin = getSupabaseAdmin();
  const { resolveStoreByDomain } = await import('@/lib/shopify/resolve-store-by-domain');
  const store = await resolveStoreByDomain<{ id: string; organization_id: string }>(
    admin,
    storeDomain,
    { select: 'id, organization_id', activeOnly: false }
  );

  if (!store) {
    return NextResponse.json(
      { error: 'Store not found', recommendations: [] },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  let query = admin
    .from('product_recommendations')
    .select('source_product_id, recommended_product_id, recommendation_type, score, co_occurrence_count, recommended_product_title, recommended_product_image, recommended_product_url, recommended_product_price, recommended_product_currency')
    .eq('organization_id', store.organization_id);

  if (productId) {
    query = query.eq('source_product_id', productId).eq('recommendation_type', type);
  } else {
    // Bestsellers fallback: top-scoring recs across all sources
    query = query.eq('recommendation_type', type);
  }

  const { data: recs } = await query
    .order('score', { ascending: false })
    .limit(limit * 2); // pull extra so we can dedupe

  let chosen = recs || [];

  // Fallback: if asked for FBT but no recs for this product, try also_viewed
  if (chosen.length === 0 && productId && type === 'frequently_bought_together') {
    const { data: alt } = await admin
      .from('product_recommendations')
      .select('source_product_id, recommended_product_id, recommendation_type, score, co_occurrence_count, recommended_product_title, recommended_product_image, recommended_product_url, recommended_product_price, recommended_product_currency')
      .eq('organization_id', store.organization_id)
      .eq('source_product_id', productId)
      .eq('recommendation_type', 'also_viewed')
      .order('score', { ascending: false })
      .limit(limit * 2);
    chosen = alt || [];
  }

  // Dedupe by recommended_product_id (in case bestsellers fallback has dups)
  const seen = new Set<string>();
  const unique = [];
  for (const r of chosen) {
    if (seen.has(r.recommended_product_id)) continue;
    seen.add(r.recommended_product_id);
    unique.push({
      product_id: r.recommended_product_id,
      title: r.recommended_product_title,
      image_url: r.recommended_product_image,
      url: r.recommended_product_url,
      price: r.recommended_product_price,
      currency: r.recommended_product_currency,
      score: Number(r.score),
      co_occurrence: r.co_occurrence_count,
      type: r.recommendation_type,
    });
    if (unique.length >= limit) break;
  }

  return NextResponse.json(
    {
      anchor_product_id: productId || null,
      type,
      count: unique.length,
      recommendations: unique,
    },
    { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300' } }
  );
}
