// Webhooks → entregas nas últimas 24 h por endpoint (ok × falhas) para a lista.
import { NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ stats: {} })
  const since = new Date(Date.now() - 86400_000).toISOString()
  const { data: subs } = await supabaseAdmin.from('webhook_subscriptions').select('id').eq('organization_id', auth.user.organization_id)
  const ids = (subs || []).map((s: any) => s.id)
  if (!ids.length) return NextResponse.json({ stats: {} })
  const { data, error } = await supabaseAdmin.from('webhook_deliveries').select('subscription_id, status').in('subscription_id', ids).gte('created_at', since).limit(20000)
  if (error) return NextResponse.json({ stats: {} })
  const stats: Record<string, { ok: number; failed: number }> = {}
  for (const d of data || []) {
    const s = (stats[d.subscription_id] ||= { ok: 0, failed: 0 })
    if (d.status === 'delivered') s.ok++
    else if (d.status === 'failed') s.failed++
  }
  return NextResponse.json({ stats })
}
