// =============================================
// Automation Stats API
// src/app/api/automations/stats/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    // Get rules count - RLS filtra automaticamente
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('id, is_enabled, deals_created_count, deals_moved_count')

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
      // RLS filtra automaticamente
      const { count, error: logsError } = await supabase
        .from('automation_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'error')
        .gte('created_at', sevenDaysAgo.toISOString())

      if (!logsError) {
        errorsCount = count || 0
      }
    } catch (e) {
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
