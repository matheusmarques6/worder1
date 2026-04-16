import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const orgId = auth.user.organization_id
  const { domain_id, enabled } = await req.json()

  if (!domain_id) {
    return NextResponse.json({ error: 'domain_id required' }, { status: 400 })
  }

  const update: Record<string, any> = {
    warmup_enabled: !!enabled,
  }

  if (enabled) {
    update.warmup_started_at = new Date().toISOString()
    update.warmup_day = 1
    update.warmup_daily_limit = 200
    update.total_sent_today = 0
    update.last_sent_date = new Date().toISOString().split('T')[0]
  } else {
    update.warmup_started_at = null
    update.warmup_day = 0
    update.warmup_daily_limit = 0
    update.total_sent_today = 0
  }

  const { error } = await supabaseAdmin
    .from('email_domains')
    .update(update)
    .eq('id', domain_id)
    .eq('organization_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, warmup_enabled: !!enabled })
}
