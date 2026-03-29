// =============================================
// WORDER: Segment Count API
// /src/app/api/segments/count/route.ts
//
// POST: count contacts matching conditions.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface SegmentCondition {
  field: string;
  operator: string;
  value: any;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { conditions, store_id } = await request.json();

    if (!conditions || !Array.isArray(conditions)) {
      return NextResponse.json({ error: 'conditions array is required' }, { status: 400 });
    }

    // Use `any` to avoid TS deep instantiation errors with Supabase query builder
    let query: any = supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', user.organization_id);

    if (store_id) {
      query = query.eq('store_id', store_id);
    }

    // Apply conditions
    for (const condition of conditions as SegmentCondition[]) {
      const { field, operator, value } = condition;

      switch (operator) {
        case 'eq':
          query = query.eq(field, value);
          break;
        case 'neq':
          query = query.neq(field, value);
          break;
        case 'gt':
          query = query.gt(field, value);
          break;
        case 'gte':
          query = query.gte(field, value);
          break;
        case 'lt':
          query = query.lt(field, value);
          break;
        case 'lte':
          query = query.lte(field, value);
          break;
        case 'contains':
        case 'ilike':
          query = query.ilike(field, `%${value}%`);
          break;
        case 'not_contains':
          query = query.not(field, 'ilike', `%${value}%`);
          break;
        case 'is_null':
          query = query.is(field, null);
          break;
        case 'is_not_null':
          query = query.not(field, 'is', null);
          break;
        case 'in':
          query = query.in(field, Array.isArray(value) ? value : [value]);
          break;
        default:
          console.warn(`[SegmentCount] Unknown operator: ${operator}`);
      }
    }

    const { count, error } = await query;

    if (error) {
      console.error('[SegmentCount] Error:', error);
      return NextResponse.json({ error: 'Failed to count contacts' }, { status: 500 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error('[SegmentCount] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
