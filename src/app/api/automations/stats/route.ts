// =============================================
// Automation Stats API
// src/app/api/automations/stats/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return getSupabaseAdmin();
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
  }

  try {
    // Get rules count
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('id, is_enabled, deals_created_count, deals_moved_count')
      .eq('organization_id', organizationId)

    if (rulesError) throw rulesError

    const totalRules = rules?.length || 0
    const activeRules = rules?.filter(r => r.is_enabled).length || 0

    // Get deals created this month from rules
    const dealsCreatedMonth = rules?.reduce((sum, r) => sum + (r.deals_created_count || 0), 0) || 0
    const dealsMovedMonth = rules?.reduce((sum, r) => sum + (r.deals_moved_count || 0), 0) || 0

    // Get errors from last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    let errorsCount = 0
    try {
      const { count, error: logsError } = await supabase
        .from('automation_logs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'error')
        .gte('created_at', sevenDaysAgo.toISOString())

      if (!logsError) {
        errorsCount = count || 0
      }
    } catch (e) {
      // Table might not exist yet
      console.log('automation_logs table may not exist yet')
    }

    return NextResponse.json({
      totalRules,
      activeRules,
      dealsCreatedMonth,
      dealsMovedMonth,
      errorsWeek: errorsCount,
    })
  } catch (error: any) {
    console.error('Error fetching automation stats:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
