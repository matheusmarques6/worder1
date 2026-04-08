// GET /api/contacts/[id]/shopify-events — CDP timeline for a contact
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const { user } = auth;
  const contactId = params.id;
  const supabase = getSupabaseAdmin();

  // Multi-org lookup
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id);

  const orgIds = [...new Set([
    user.organization_id,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');
  const eventType = searchParams.get('event_type');

  let query = supabase
    .from('contact_events')
    .select('*')
    .eq('contact_id', contactId)
    .in('organization_id', orgIds)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventType) {
    query = query.eq('event_type', eventType);
  }

  const { data: events, error } = await query;

  if (error) {
    console.error('[Contact Shopify Events] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    events: (events || []).map((e: any) => ({
      id: e.id,
      eventType: e.event_type,
      eventSource: e.event_source,
      properties: e.properties || {},
      monetaryValue: e.monetary_value,
      currency: e.currency,
      occurredAt: e.occurred_at,
      shopifyResourceId: e.shopify_resource_id,
      shopifyResourceType: e.shopify_resource_type,
    })),
    total: events?.length || 0,
  });
}
