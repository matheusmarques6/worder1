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
import { authorizeCronRequest } from '@/lib/cron-auth'
import { LgpdStepError } from '@/lib/lgpd/operations'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  const { data: policies, error: policiesError } = await supabaseAdmin
    .from('lgpd_retention_policies')
    .select('*')
    .eq('enabled', true)
    .limit(500)

  if (policiesError) return NextResponse.json({ error: 'Retention policy lookup failed' }, { status: 500 })

  if (!policies || policies.length === 0) {
    return NextResponse.json({ applied: 0 })
  }

  const results: any[] = []

  for (const policy of policies) {
    try {
      if (!policy.organization_id || !Number.isFinite(policy.retention_days) || policy.retention_days <= 0) throw new LgpdStepError('invalid_policy')
      const cutoff = new Date(Date.now() - policy.retention_days * 24 * 60 * 60 * 1000).toISOString()
      let affected = 0

      switch (policy.resource) {
        case 'contact_events': {
          const { count, error } = await supabaseAdmin
            .from('contact_events')
            .delete({ count: 'exact' })
            .eq('organization_id', policy.organization_id)
            .lt('occurred_at', cutoff)
          if (error) throw new LgpdStepError('retention_mutation')
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
          const { count, error } = await supabaseAdmin
            .from('email_sends')
            .delete({ count: 'exact' })
            .eq('organization_id', policy.organization_id)
            .lt('created_at', cutoff)
          if (error) throw new LgpdStepError('retention_mutation')
          affected = count || 0
          break
        }
        case 'contacts_inactive':
          // A contact-only purge loses the links needed to locate derived copies.
          // Keep the policy visibly failed until the subject graph can be erased.
          throw new LgpdStepError('contacts_inactive_requires_review')
        case 'popup_events': {
          // A tabela que mais cresce: uma linha por exibição de popup, em
          // toda página da loja. Aqui é apagar mesmo — o número que a tela
          // mostra vem de agregados por dia, não do evento cru.
          const { count, error } = await supabaseAdmin
            .from('form_events')
            .delete({ count: 'exact' })
            .eq('organization_id', policy.organization_id)
            .lt('occurred_at', cutoff)
          if (error) throw new LgpdStepError('retention_mutation')
          affected = count || 0
          break
        }
        case 'popup_submissions': {
          // Por padrão anonimiza: as respostas digitadas somem, mas a
          // inscrição continua contando na série e na receita atribuída.
          if (policy.anonymize_only) {
            const { count, error } = await supabaseAdmin
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
            if (error) throw new LgpdStepError('retention_mutation')
            affected = count || 0
          } else {
            const { count, error } = await supabaseAdmin
              .from('crm_form_submissions')
              .delete({ count: 'exact' })
              .eq('organization_id', policy.organization_id)
              .lt('created_at', cutoff)
            if (error) throw new LgpdStepError('retention_mutation')
            affected = count || 0
          }
          break
        }
        default:
          throw new LgpdStepError('unsupported_resource')
      }

      const { error: checkpointError, data: checkpoint } = await supabaseAdmin
        .from('lgpd_retention_policies')
        .update({
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', policy.id)
        .eq('organization_id', policy.organization_id)
        .select('id')
      if (checkpointError || checkpoint?.length !== 1) throw new LgpdStepError('retention_checkpoint')

      results.push({ resource: policy.resource, affected })
    } catch (err: any) {
      results.push({ resource: policy.resource, error: err instanceof LgpdStepError ? err.stage : 'retention_failed' })
    }
  }

  return NextResponse.json({
    policiesApplied: results.filter(r => !r.error).length,
    results,
    durationMs: Date.now() - start,
  }, { status: results.some(r => r.error) ? 500 : 200 })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
