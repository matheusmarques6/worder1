/**
 * CRON: LGPD retention policies
 * /api/cron/lgpd-retention
 *
 * Aplica policies salvas em `lgpd_retention_policies`:
 *   - para cada resource + retention_days, anonimiza/deleta registros
 *     que ultrapassaram o tempo.
 *
 * Roda diariamente às 03:00.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  const { data: policies } = await supabaseAdmin
    .from('lgpd_retention_policies')
    .select('*')
    .eq('enabled', true)
    .limit(500)

  if (!policies || policies.length === 0) {
    return NextResponse.json({ applied: 0 })
  }

  const results: any[] = []

  for (const policy of policies) {
    try {
      const cutoff = new Date(Date.now() - policy.retention_days * 24 * 60 * 60 * 1000).toISOString()
      let affected = 0

      switch (policy.resource) {
        case 'contact_events': {
          const { count } = await supabaseAdmin
            .from('contact_events')
            .delete({ count: 'exact' })
            .eq('organization_id', policy.organization_id)
            .lt('occurred_at', cutoff)
          affected = count || 0
          break
        }
        case 'email_sends': {
          // CRITICAL: email_sends.organization_id IS NOT NULL on the
          // production schema — the original comment was wrong. The
          // delete used to fire across EVERY tenant: a single org's
          // retention policy (say 180 days) would wipe every other
          // org's email_sends older than that, across the entire
          // database. Always scope by the policy's organization_id.
          const { count } = await supabaseAdmin
            .from('email_sends')
            .delete({ count: 'exact' })
            .eq('organization_id', policy.organization_id)
            .lt('created_at', cutoff)
          affected = count || 0
          break
        }
        case 'contacts_inactive': {
          // Inativos: last_active_at < cutoff E sem compras
          if (policy.anonymize_only) {
            const { count } = await supabaseAdmin
              .from('contacts')
              .update({
                email: `retained_${policy.organization_id}_anon_${Date.now()}@deleted.lgpd`,
                phone: null,
                first_name: 'Anonimizado',
                last_name: 'Retenção',
                custom_fields: {},
                // `is_active` não existe em contacts: com ela no payload, o
                // PostgREST recusava a linha inteira e a ANONIMIZAÇÃO NÃO
                // ACONTECIA — uma política de retenção configurada não
                // fazia nada. `suppressed` é a coluna real e diz o que
                // importa aqui: não mandar mais nada para este endereço.
                suppressed: true,
              }, { count: 'exact' })
              .eq('organization_id', policy.organization_id)
              .lt('last_active_at', cutoff)
              .or('total_orders.is.null,total_orders.eq.0')
            affected = count || 0
          } else {
            const { count } = await supabaseAdmin
              .from('contacts')
              .delete({ count: 'exact' })
              .eq('organization_id', policy.organization_id)
              .lt('last_active_at', cutoff)
              .or('total_orders.is.null,total_orders.eq.0')
            affected = count || 0
          }
          break
        }
        case 'popup_events': {
          // A tabela que mais cresce: uma linha por exibição de popup, em
          // toda página da loja. Aqui é apagar mesmo — o número que a tela
          // mostra vem de agregados por dia, não do evento cru.
          const { count } = await supabaseAdmin
            .from('form_events')
            .delete({ count: 'exact' })
            .eq('organization_id', policy.organization_id)
            .lt('occurred_at', cutoff)
          affected = count || 0
          break
        }
        case 'popup_submissions': {
          // Por padrão anonimiza: as respostas digitadas somem, mas a
          // inscrição continua contando na série e na receita atribuída.
          if (policy.anonymize_only) {
            const { count } = await supabaseAdmin
              .from('crm_form_submissions')
              .update({
                answers: {},
                ip_address: null,
                user_agent: null,
                referrer: null,
                page_url: null,
                visitor_id: null,
                session_id: null,
              }, { count: 'exact' })
              .eq('organization_id', policy.organization_id)
              .lt('created_at', cutoff)
              .neq('answers', '{}')
            affected = count || 0
          } else {
            const { count } = await supabaseAdmin
              .from('crm_form_submissions')
              .delete({ count: 'exact' })
              .eq('organization_id', policy.organization_id)
              .lt('created_at', cutoff)
            affected = count || 0
          }
          break
        }
        default:
          break
      }

      await supabaseAdmin
        .from('lgpd_retention_policies')
        .update({
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', policy.id)

      results.push({ resource: policy.resource, affected })
    } catch (err: any) {
      results.push({ resource: policy.resource, error: err?.message })
    }
  }

  return NextResponse.json({
    policiesApplied: results.length,
    results,
    durationMs: Date.now() - start,
  })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
