import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Plano IA M5 passo 30 — os alertas da IA (public.alerts) na tela:
// ?status=open|acknowledged|resolved (padrão: open), mais recentes primeiro.
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const status = new URL(request.url).searchParams.get('status') || 'open'
  if (!['open', 'acknowledged', 'resolved'].includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }
  const { data, error } = await getSupabaseAdmin()
    .from('alerts')
    .select('id, type, severity, title, metadata, status, created_at, acknowledged_at')
    .eq('organization_id', auth.user.organization_id)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data ?? [] })
}
