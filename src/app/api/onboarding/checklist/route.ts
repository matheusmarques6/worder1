// =============================================
// GET /api/onboarding/checklist?storeId=…
//
// Os fatos do roteiro de primeiros passos: existe loja ativa, a vitrine
// carrega a Worder, existe popup publicado, existe domínio verificado,
// existe automação ligada, saiu campanha. Tudo contado no banco, sempre
// dentro da organização da sessão.
//
// Nada aqui guarda "o lojista já viu este passo": um roteiro que se
// marca sozinho ao ser visto esconde justo o passo que faltou.
//
// A regra (ordem, dependências, textos) mora em @/lib/onboarding/checklist.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildChecklist } from '@/lib/onboarding/checklist'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const storeId = request.nextUrl.searchParams.get('storeId')
  const admin = getSupabaseAdmin()

  const count = (table: string) =>
    admin.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId)

  const [stores, popups, subs, domains, automations, campaigns] = await Promise.all([
    admin
      .from('shopify_stores')
      .select('id, embed_installed')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(50),
    (() => {
      let q = count('crm_forms').eq('status', 'published').is('ab_parent_id', null)
      if (storeId) q = q.or(`store_id.eq.${storeId},store_id.is.null`)
      return q
    })(),
    count('crm_form_submissions'),
    admin
      .from('email_domains')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'verified')
      .neq('is_system', true)
      .limit(1),
    count('automations').eq('is_active', true),
    count('email_campaigns').eq('status', 'sent'),
  ])

  const lojas = (stores.data || []) as Array<{ id: string; embed_installed?: boolean | null }>
  // Com uma loja escolhida, é a vitrine DELA que precisa estar ativa —
  // a irmã já ativada não fecha este passo.
  const relevantes = storeId ? lojas.filter((s) => s.id === storeId) : lojas

  const checklist = buildChecklist({
    hasStore: lojas.length > 0,
    embedActive: relevantes.some((s) => s.embed_installed === true),
    publishedPopups: popups.count || 0,
    subscribers: subs.count || 0,
    domainVerified: (domains.data || []).length > 0,
    automationsActive: automations.count || 0,
    campaignsSent: campaigns.count || 0,
  })

  return NextResponse.json(checklist, { headers: { 'Cache-Control': 'no-store' } })
}
