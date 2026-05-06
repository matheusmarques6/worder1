// =============================================
// Recommendations populator
// src/lib/automation/recommendations-populator.ts
//
// Hooks into the action execution layer to inject product
// recommendations into the variable context so emails / WhatsApp
// templates can reference them with {{ recommendations.fbt[0].title }}.
//
// Called right before any action that renders a template (send_email,
// send_whatsapp, etc). Looks at the trigger data for product_id /
// items[] and queries product_recommendations for FBT, also_viewed,
// and bestsellers. Cheap (single batched query, ~5ms).
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface RecommendationItem {
  product_id: string;
  title: string | null;
  image_url: string | null;
  url: string | null;
  price: number | null;
  currency: string | null;
  score: number;
}

export interface RecommendationContext {
  fbt: RecommendationItem[];
  also_viewed: RecommendationItem[];
  bestsellers: RecommendationItem[];
}

interface PopulateInput {
  organizationId: string;
  /** Anchor product (most relevant rec source). Optional — when missing,
   *  only bestsellers are populated. */
  productId?: string | null;
  /** Override how many recs per type (default 4) */
  limit?: number;
}

const DEFAULT_LIMIT = 4;

/**
 * Fetches the 3 recommendation lists for a given anchor product.
 * Returns empty arrays when no recs exist yet (cron hasn't run, new
 * org, etc) — never throws so the calling action keeps rendering.
 */
export async function populateRecommendations(
  input: PopulateInput
): Promise<RecommendationContext> {
  const limit = Math.min(input.limit || DEFAULT_LIMIT, 20);
  const empty: RecommendationContext = { fbt: [], also_viewed: [], bestsellers: [] };

  if (!input.organizationId) return empty;

  const supabase = getSupabaseAdmin();

  try {
    // Three small queries (per-type top N). Can't do all in one statement
    // without a window function, but they're cheap and run concurrently.
    const cols = 'recommended_product_id, recommended_product_title, recommended_product_image, recommended_product_url, recommended_product_price, recommended_product_currency, score';

    const fbtQ = input.productId
      ? supabase.from('product_recommendations')
          .select(cols)
          .eq('organization_id', input.organizationId)
          .eq('source_product_id', input.productId)
          .eq('recommendation_type', 'frequently_bought_together')
          .order('score', { ascending: false })
          .limit(limit)
          .then((r: any) => r)
      : Promise.resolve({ data: [], error: null });

    const alsoQ = input.productId
      ? supabase.from('product_recommendations')
          .select(cols)
          .eq('organization_id', input.organizationId)
          .eq('source_product_id', input.productId)
          .eq('recommendation_type', 'also_viewed')
          .order('score', { ascending: false })
          .limit(limit)
          .then((r: any) => r)
      : Promise.resolve({ data: [], error: null });

    const bestQ = supabase.from('product_recommendations')
      .select(cols)
      .eq('organization_id', input.organizationId)
      .eq('recommendation_type', 'also_viewed')
      .order('score', { ascending: false })
      .limit(limit * 2)
      .then((r: any) => r);

    const [fbtRes, alsoRes, bestRes] = await Promise.all([fbtQ, alsoQ, bestQ]);

    function mapItems(rows: any[] | null): RecommendationItem[] {
      const seen = new Set<string>();
      const items: RecommendationItem[] = [];
      for (const r of rows || []) {
        if (seen.has(r.recommended_product_id)) continue;
        seen.add(r.recommended_product_id);
        items.push({
          product_id: r.recommended_product_id,
          title: r.recommended_product_title,
          image_url: r.recommended_product_image,
          url: r.recommended_product_url,
          price: r.recommended_product_price != null ? Number(r.recommended_product_price) : null,
          currency: r.recommended_product_currency,
          score: Number(r.score),
        });
      }
      return items.slice(0, limit);
    }

    return {
      fbt: mapItems(fbtRes.data),
      also_viewed: mapItems(alsoRes.data),
      bestsellers: mapItems(bestRes.data),
    };
  } catch (err: any) {
    console.error('[Recs Populator] failed:', err?.message);
    return empty;
  }
}

/**
 * Resolves the most-relevant anchor product from arbitrary trigger data.
 * Looks at common shapes: product_id, productId, ProductID (Klaviyo
 * casing), items[0].product_id, properties.product_id.
 */
export function extractAnchorProductId(triggerData: any): string | null {
  if (!triggerData || typeof triggerData !== 'object') return null;
  const candidates = [
    triggerData.product_id,
    triggerData.productId,
    triggerData.ProductID,
    triggerData.properties?.product_id,
    triggerData.properties?.productId,
    Array.isArray(triggerData.items) && triggerData.items[0]
      ? triggerData.items[0].product_id || triggerData.items[0].ProductID || triggerData.items[0].productId
      : null,
    Array.isArray(triggerData.Items) && triggerData.Items[0]
      ? triggerData.Items[0].ProductID || triggerData.Items[0].product_id
      : null,
  ];
  for (const c of candidates) {
    if (c) return String(c);
  }
  return null;
}
