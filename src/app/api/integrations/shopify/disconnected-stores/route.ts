// =============================================
// GET /api/integrations/shopify/disconnected-stores
//
// Lists shopify_stores rows in the caller's organization that were
// previously connected but are now is_active=false. Used by the
// connect form to surface "Reativar com nova Shopify" options —
// instead of creating a brand-new row (which orphans contacts,
// automations, financials), the merchant can reuse the existing
// row and just point it at a different Shopify backend.
//
// For each disconnected store we also return a quick summary of
// the data that would be preserved on reactivation, so the merchant
// sees what they'd keep at a glance.
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const supabase = getSupabaseAdmin();

  // Multi-org users see all orgs they belong to. Same pattern as
  // the rest of the integrations endpoints.
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id);
  const orgIds = [...new Set([
    orgId,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];

  const { data: stores } = await supabase
    .from('shopify_stores')
    .select('id, organization_id, shop_domain, shop_name, currency, plan_name, connection_type, status, uninstalled_at, installed_at, last_sync_at, total_orders, total_customers')
    .in('organization_id', orgIds)
    .eq('is_active', false)
    .order('uninstalled_at', { ascending: false, nullsFirst: false })
    .limit(20);

  if (!stores || stores.length === 0) {
    return NextResponse.json({ stores: [] });
  }

  // Enrich each row with quick counts so the merchant sees what
  // they'd keep on reactivation. Best-effort — failed counts return 0.
  async function safeCount(table: string, filterCol: string, filterVal: string): Promise<number> {
    try {
      const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq(filterCol, filterVal);
      return count || 0;
    } catch { return 0; }
  }
  const enriched = await Promise.all(stores.map(async (s) => {
    const [contactCount, automationCount, eventCount] = await Promise.all([
      safeCount('contacts', 'organization_id', s.organization_id),
      safeCount('automations', 'store_id', s.id),
      safeCount('contact_events', 'store_id', s.id),
    ]);
    return {
      id: s.id,
      shop_domain: s.shop_domain,
      shop_name: s.shop_name,
      currency: s.currency,
      plan_name: s.plan_name,
      connection_type: s.connection_type,
      status: s.status,
      uninstalled_at: s.uninstalled_at,
      installed_at: s.installed_at,
      last_sync_at: s.last_sync_at,
      preserved_data: {
        contacts: contactCount,
        automations: automationCount,
        events: eventCount,
        orders: s.total_orders || 0,
      },
    };
  }));

  return NextResponse.json({ stores: enriched });
}
