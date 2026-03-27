import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conditions } = await req.json()

    let query: any = supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', auth.user.organization_id)

    if (conditions && Array.isArray(conditions)) {
      for (const condition of conditions) {
        const { field, operator, value } = condition
        if (!field || !operator) continue
        switch (operator) {
          case 'equals': query = query.eq(field, value); break
          case 'not_equals': query = query.neq(field, value); break
          case 'contains': query = query.ilike(field, `%${value}%`); break
          case 'greater_than': query = query.gt(field, value); break
          case 'less_than': query = query.lt(field, value); break
          case 'is_set': query = query.not(field, 'is', null); break
          case 'is_not_set': query = query.is(field, null); break
          case 'is_true': query = query.eq(field, true); break
          case 'is_false': query = query.eq(field, false); break
        }
      }
    }

    const { count } = await query
    return NextResponse.json({ success: true, count: count || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
