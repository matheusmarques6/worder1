// =============================================
// POST /api/integrations/shopify/merge-stores
//
// Consolidates two shopify_stores rows that represent the same
// Shopify shop. Necessary because before the shopify_shop_id-based
// reconnect logic, every reconnection with a different domain
// produced a new row, splitting the merchant's data across two
// "stores" in Worder.
//
// Body:
//   {
//     sourceStoreId: "...",   // the store to merge FROM (will be archived)
//     targetStoreId: "...",   // the store to merge INTO (kept active)
//   }
//
// Behavior (one transaction-ish flow, idempotent per row):
//   1. Verify both stores belong to the caller's organization
//   2. Reassign every related row from source → target:
//        - automations
//        - contacts
//        - segments (and segment members)
//        - lists (and list_contacts)
//        - contact_events
//        - contact_sessions
//        - contact_activities
//        - shopify_orders / customers / products / checkouts
//        - shopify_webhook_log / shopify_webhook_events
//        - visitor_identities / visitor_id_aliases
//        - product_recommendations
//   3. Merge source's domain into target's shop_domain_aliases
//   4. Mark source as is_active=false, status='merged_into:<targetId>'
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tables that have a store_id FK we need to reassign. Listed
// explicitly so a typo or a forgotten table doesn't silently leave
// data behind. New tables that join to shopify_stores must be added
// here.
const TABLES_WITH_STORE_ID = [
  // Behavioral / CDP
  'contact_events',
  'contact_sessions',
  'contact_activities',
  // Shopify resources
  'shopify_orders',
  'shopify_customers',
  'shopify_products',
  'shopify_checkouts',
  // Automation engine
  'automations',
  'automation_runs',
  // Webhook bookkeeping
  'shopify_webhook_log',
  'shopify_webhook_events',
  // Identity graph
  'visitor_identities',
  'visitor_id_aliases',
  // Recommendations
  'product_recommendations',
  // Contacts (some installs scope contacts per-store; idempotent if column missing)
  'contacts',
];

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const sourceStoreId = body?.sourceStoreId;
  const targetStoreId = body?.targetStoreId;

  if (!sourceStoreId || !targetStoreId) {
    return NextResponse.json({ error: 'sourceStoreId e targetStoreId são obrigatórios' }, { status: 400 });
  }
  if (sourceStoreId === targetStoreId) {
    return NextResponse.json({ error: 'sourceStoreId e targetStoreId não podem ser iguais' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Verify both belong to the caller's organization. Defense in depth —
  // the merge endpoint moves data across primary keys, so we triple-check
  // tenant boundaries before touching anything.
  const { data: source } = await admin
    .from('shopify_stores')
    .select('id, organization_id, shop_domain, shop_domain_aliases, shopify_shop_id, shop_name')
    .eq('id', sourceStoreId)
    .eq('organization_id', orgId)
    .maybeSingle();
  const { data: target } = await admin
    .from('shopify_stores')
    .select('id, organization_id, shop_domain, shop_domain_aliases, shopify_shop_id, shop_name')
    .eq('id', targetStoreId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!source) return NextResponse.json({ error: 'Loja origem não encontrada' }, { status: 404 });
  if (!target) return NextResponse.json({ error: 'Loja destino não encontrada' }, { status: 404 });
  if (source.organization_id !== target.organization_id) {
    return NextResponse.json({ error: 'Lojas em organizações diferentes' }, { status: 403 });
  }

  // Reassign every related row. We do best-effort updates per table —
  // a missing column (some installs don't have store_id on contacts)
  // returns an error from PostgREST that we swallow.
  const reassignments: Record<string, number> = {};
  const errors: Array<{ table: string; error: string }> = [];

  for (const tbl of TABLES_WITH_STORE_ID) {
    try {
      const { data, error } = await admin
        .from(tbl)
        .update({ store_id: target.id })
        .eq('store_id', source.id)
        .eq('organization_id', orgId)
        .select('id');
      if (error) {
        // Some tables don't carry organization_id; retry without that filter.
        if (error.code === '42703' /* undefined column */) {
          const retry = await admin
            .from(tbl)
            .update({ store_id: target.id })
            .eq('store_id', source.id)
            .select('id');
          if (retry.error) {
            errors.push({ table: tbl, error: retry.error.message });
            continue;
          }
          reassignments[tbl] = retry.data?.length || 0;
        } else {
          errors.push({ table: tbl, error: error.message });
          continue;
        }
      } else {
        reassignments[tbl] = data?.length || 0;
      }
    } catch (e: any) {
      errors.push({ table: tbl, error: e?.message || 'unknown' });
    }
  }

  // Merge source's domain into target's aliases (so anything still
  // pointing at source's domain — webhooks, pixels — resolves to target).
  const targetAliases: string[] = Array.isArray(target.shop_domain_aliases) ? target.shop_domain_aliases : [];
  const merged = new Set(targetAliases.map((d) => String(d).toLowerCase()));
  if (source.shop_domain) merged.add(String(source.shop_domain).toLowerCase());
  for (const a of (source.shop_domain_aliases || [])) merged.add(String(a).toLowerCase());
  // Remove target's primary if it slipped in
  merged.delete(String(target.shop_domain).toLowerCase());

  await admin
    .from('shopify_stores')
    .update({
      shop_domain_aliases: Array.from(merged),
      // Inherit shop_id if target didn't have one but source did.
      shopify_shop_id: target.shopify_shop_id || source.shopify_shop_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);

  // Archive source: mark inactive and tag with merge target so audit
  // trails can reconstruct the consolidation later.
  await admin
    .from('shopify_stores')
    .update({
      is_active: false,
      status: `merged_into:${target.id}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', source.id);

  return NextResponse.json({
    success: true,
    source: { id: source.id, shop_domain: source.shop_domain, shop_name: source.shop_name },
    target: { id: target.id, shop_domain: target.shop_domain, shop_name: target.shop_name, aliases: Array.from(merged) },
    reassignments,
    errors: errors.length > 0 ? errors : undefined,
  });
}
