/**
 * CRON: Check contact inactivity
 * /api/cron/check-inactivity
 *
 * Dispara automações com trigger_type='trigger_inactivity' quando um contato
 * fica inativo por X dias (definido no trigger_config.days).
 *
 * Roda diariamente às 01:00.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchTrigger } from '@/lib/automation/trigger-dispatcher'

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

  try {
    // Busca automações ativas com trigger_inactivity
    const { data: automations } = await supabaseAdmin
      .from('automations')
      .select('id, organization_id, store_id, trigger_config')
      .eq('status', 'active')
      .eq('trigger_type', 'trigger_inactivity')

    if (!automations || automations.length === 0) {
      return NextResponse.json({ automations: 0, dispatched: 0 })
    }

    let dispatched = 0
    const dayKey = new Date().toISOString().slice(0, 10)

    for (const auto of automations) {
      const days = Number(auto.trigger_config?.days ?? 30)
      if (!days || days < 1) continue

      const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      // Busca contatos ativos cujo last_active_at <= threshold.
      // Quando a automation tem store_id (multi-store org), escope
      // por loja — sem isso o flow do Dr. Melaxin disparava re-
      // engagement em contatos do Based também. Inclui contatos com
      // store_id IS NULL (legacy backfill pending).
      let contactsQuery = supabaseAdmin
        .from('contacts')
        .select('id, last_active_at, store_id')
        .eq('organization_id', auto.organization_id)
        .lte('last_active_at', threshold)
        .eq('is_active', true)
        .limit(500)
      if (auto.store_id) {
        contactsQuery = contactsQuery.or(`store_id.eq.${auto.store_id},store_id.is.null`)
      }
      const { data: contacts } = await contactsQuery

      for (const c of contacts || []) {
        await dispatchTrigger({
          organizationId: auto.organization_id,
          // Propaga store da automation (com fallback pro do contato)
          // pra que runs criados aqui sejam visíveis em views
          // store-scoped.
          storeId: auto.store_id || c.store_id || null,
          triggerType: 'trigger_inactivity',
          contactId: c.id,
          triggerData: {
            inactive_days: days,
            last_active_at: c.last_active_at,
          },
          matchConfig: () => true,
          idempotencyKey: `inactivity:${auto.id}:${c.id}:${dayKey}`,
        })
        dispatched++
      }
    }

    return NextResponse.json({
      success: true,
      automations: automations.length,
      dispatched,
      durationMs: Date.now() - start,
    })
  } catch (err: any) {
    console.error('[check-inactivity] error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
