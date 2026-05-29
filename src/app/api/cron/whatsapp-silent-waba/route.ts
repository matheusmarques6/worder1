// =============================================
// Cron: detectar WABAs silenciosas (G.3 Onda 4).
//
// Heurística: para cada whatsapp_business_accounts.status='active' criada
// há mais de 24h, conta whatsapp_cloud_messages das últimas 24h. Se 0,
// emite warning structured log (consumível por Datadog/Grafana).
//
// Diário às 12h UTC (entrada do vercel.json fica como follow-up; ver
// nota em report — quota Hobby de 31 crons está no limite).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Cron auth: confirma via CRON_SECRET (query ou header).
  const secret =
    request.nextUrl.searchParams.get('secret') ||
    request.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: accounts } = await supabaseAdmin
    .from('whatsapp_business_accounts')
    .select('id, organization_id, phone_number_id, created_at')
    .eq('status', 'active')
    .lt('created_at', dayAgo)

  const silent: Array<{
    id: string
    organization_id: string
    phone_number_id: string
  }> = []

  for (const acc of accounts || []) {
    const { count } = await supabaseAdmin
      .from('whatsapp_cloud_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', acc.organization_id)
      .gte('created_at', dayAgo)

    if (!count || count === 0) {
      silent.push({
        id: acc.id,
        organization_id: acc.organization_id,
        phone_number_id: acc.phone_number_id,
      })
      wlog.warn('whatsapp.silent_waba', {
        organization_id: acc.organization_id,
        phone_number_id: acc.phone_number_id,
        account_id: acc.id,
      })
    }
  }

  return NextResponse.json({
    checked: accounts?.length || 0,
    silent: silent.length,
    accounts: silent,
  })
}
