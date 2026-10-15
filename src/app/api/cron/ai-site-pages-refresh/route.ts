import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { triggerSourceProcessing } from '@/lib/ai/knowledge/process-trigger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Plano IA M3 passo 19 — páginas do site são conhecimento que muda: fontes
// kind='site_page' (e as de URL marcadas como recorrentes) são reprocessadas
// toda semana (vercel.json). Uma por vez, pulando as que estão processando.
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const { data: sources, error } = await supabase
    .from('ai_sources')
    .select('id, organization_id, url, status')
    .eq('kind', 'site_page')
    .not('url', 'is', null)
    .neq('status', 'processing')
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const source of sources ?? []) {
    try {
      await triggerSourceProcessing(source.id, source.organization_id)
      results.push({ id: source.id, ok: true })
    } catch (e: any) {
      results.push({ id: source.id, ok: false, error: e.message })
    }
  }
  return NextResponse.json({ refreshed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), total: results.length })
}
