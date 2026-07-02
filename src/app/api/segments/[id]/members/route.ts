// GET /api/segments/[id]/members — returns contacts matching segment rules
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveSegment } from '@/lib/segments';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();
  const segmentId = params.id;

  // Multi-org: the orgs the caller actually belongs to.
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id);
  const orgIds = [...new Set([
    auth.user.organization_id,
    ...((memberships || []).map((m: any) => m.organization_id)),
  ])];

  // Get segment with rules
  const { data: segment, error: segErr } = await supabase
    .from('customer_segments')
    .select('*')
    .eq('id', segmentId)
    .single();

  if (segErr || !segment) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }

  // ⚠️ SEGURANÇA: o segmento deve pertencer a uma org do chamador.
  if (!orgIds.includes(segment.organization_id)) {
    return authError('Forbidden', 403);
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  // Resolve membership through the canonical entrypoint (index.ts): it
  // detects rule_version, runs the v1→v2 adapter, and evaluates the
  // full rule tree (nested groups, events, dates, etc.). This replaces
  // the old flat-array evaluation that ignored a v2 `rules` blob
  // ({version,root}) entirely — applying NO filter and returning the
  // whole org. Store scoping is handled inside the resolver from the
  // segment's own store_id.
  let allIds: string[] = [];
  try {
    const resolved = await resolveSegment(supabase, segmentId, segment.organization_id);
    allIds = resolved.contactIds;
  } catch (e: any) {
    console.error('[Segment Members] Resolve error:', e?.message || e);
    return NextResponse.json({ error: 'Failed to resolve segment members' }, { status: 500 });
  }

  const total = allIds.length;

  // Page the resolved id list, then fetch just this page's contacts.
  const pageIds = allIds.slice(offset, offset + limit);
  let contacts: any[] = [];
  if (pageIds.length > 0) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .in('id', pageIds);

    if (error) {
      console.error('[Segment Members] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Preserve the resolved order — an .in() fetch doesn't guarantee it.
    const byId = new Map((data || []).map((c: any) => [c.id, c]));
    contacts = pageIds.map((id) => byId.get(id)).filter(Boolean);
  }

  // Persist the CORRECT resolved count (not the org-wide count the old
  // code wrote when it failed to apply v2 rules).
  if (total !== segment.contact_count) {
    await supabase
      .from('customer_segments')
      .update({ contact_count: total, last_count_at: new Date().toISOString() })
      .eq('id', segmentId);
  }

  return NextResponse.json({
    contacts,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}
