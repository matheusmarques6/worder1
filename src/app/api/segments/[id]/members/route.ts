// GET /api/segments/[id]/members — returns contacts matching segment rules
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

  const supabase = getSupabaseAdmin();
  const segmentId = params.id;

  // Get segment with rules
  const { data: segment, error: segErr } = await supabase
    .from('customer_segments')
    .select('*')
    .eq('id', segmentId)
    .single();

  if (segErr || !segment) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  // Build query based on segment rules
  let query: any = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .eq('organization_id', segment.organization_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply dynamic rules
  if (segment.segment_type === 'dynamic' && segment.rules?.length) {
    for (const rule of segment.rules) {
      const { field, operator, value } = rule;
      switch (operator) {
        case 'equals': query = query.eq(field, value); break;
        case 'not_equals': query = query.neq(field, value); break;
        case 'contains': query = query.ilike(field, `%${value}%`); break;
        case 'greater_than': query = query.gt(field, value); break;
        case 'less_than': query = query.lt(field, value); break;
        case 'is_null': query = query.is(field, null); break;
        case 'is_not_null': query = query.not(field, 'is', null); break;
      }
    }
  }

  const { data: contacts, error, count } = await query;

  if (error) {
    console.error('[Segment Members] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update segment contact_count
  if (count !== null && count !== segment.contact_count) {
    await supabase
      .from('customer_segments')
      .update({ contact_count: count, last_count_at: new Date().toISOString() })
      .eq('id', segmentId);
  }

  return NextResponse.json({
    contacts: contacts || [],
    pagination: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
}
