// =============================================
// GET /api/forms/health
//
// O que está prestes a falhar em silêncio nos popups desta organização.
// Cada item traz o popup, o que está errado e o que fazer — nada de
// número solto. Sempre da org da sessão.
//
// A regra de decisão mora em @/lib/popups/health (pura, testada); aqui só
// buscamos as linhas.
// =============================================
import { NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildHealthIssues } from '@/lib/popups/health'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const admin = getSupabaseAdmin()

  const nowIso = new Date().toISOString()
  const cutoff = new Date(Date.now() - 72 * 3600000).toISOString()

  const [{ data: forms }, { data: pools }, { data: stores }, { data: exps }, { count: staleOptIns }] = await Promise.all([
    admin
      .from('crm_forms')
      .select('id, name, store_id, design_json')
      .eq('organization_id', orgId)
      .eq('status', 'published')
      .is('ab_parent_id', null)
      .limit(500),
    admin
      .from('coupon_pools')
      .select('id, form_id, status, last_error, min_stock')
      .eq('organization_id', orgId)
      .neq('status', 'paused')
      .limit(500),
    admin.from('shopify_stores').select('id').eq('organization_id', orgId).eq('is_active', true).limit(50),
    admin
      .from('popup_experiments')
      .select('form_id, mode, started_at, max_days')
      .eq('organization_id', orgId)
      .eq('status', 'running')
      .limit(200),
    admin
      .from('whatsapp_opt_status')
      .select('contact_id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .lt('updated_at', cutoff),
  ])

  // Estoque pronto por pool: um código só conta se ainda cobre a validade.
  const poolRows = (pools || []) as any[]
  const usable = new Map<string, number>()
  const poolIds = poolRows.map((p) => p.id as string)
  if (poolIds.length) {
    const { data: codes } = await admin
      .from('coupon_codes')
      .select('pool_id')
      .in('pool_id', poolIds)
      .eq('status', 'free')
      .gt('expires_at', nowIso)
      .limit(20000)
    for (const c of (codes || []) as any[]) usable.set(c.pool_id, (usable.get(c.pool_id) || 0) + 1)
  }

  const issues = buildHealthIssues({
    forms: (forms || []) as any[],
    pools: poolRows.map((p) => ({ ...p, usable: usable.get(p.id) || 0 })),
    experiments: (exps || []) as any[],
    storeCount: (stores || []).length,
    staleWhatsappOptIns: staleOptIns || 0,
  })

  return NextResponse.json({
    checked_at: nowIso,
    counts: {
      error: issues.filter((i) => i.level === 'error').length,
      warn: issues.filter((i) => i.level === 'warn').length,
    },
    issues: issues.slice(0, 50),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
