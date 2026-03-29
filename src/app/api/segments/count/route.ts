import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ count: 0 });

    const { conditions, segmentId } = await request.json();

    if (segmentId) {
      const { resolveSegment } = await import('@/lib/segments/resolver');
      const contactIds = await resolveSegment(supabase, segmentId, orgId);
      return NextResponse.json({ count: contactIds.length });
    }

    if (conditions) {
      // Direct conditions evaluation
      const rules = conditions.rules || conditions;
      if (!Array.isArray(rules)) return NextResponse.json({ count: 0 });

      let query: any = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId);

      for (const rule of rules) {
        if (!rule.field || !rule.operator) continue;
        switch (rule.operator) {
          case '=': case 'equals': query = query.eq(rule.field, rule.value); break;
          case '!=': query = query.neq(rule.field, rule.value); break;
          case '>': query = query.gt(rule.field, rule.value); break;
          case '<': query = query.lt(rule.field, rule.value); break;
          case 'contains': query = query.ilike(rule.field, `%${rule.value}%`); break;
          case 'is_set': query = query.not(rule.field, 'is', null); break;
          case 'is_null': query = query.is(rule.field, null); break;
        }
      }

      const { count } = await query;
      return NextResponse.json({ count: count || 0 });
    }

    return NextResponse.json({ count: 0 });
  } catch (e: any) {
    return NextResponse.json({ count: 0, error: e.message });
  }
}
