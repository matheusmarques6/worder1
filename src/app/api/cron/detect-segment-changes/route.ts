/**
 * CRON: Detect segment entry
 * /api/cron/detect-segment-changes
 *
 * Para cada segmento dinâmico em customer_segments, compara membros atuais
 * com o snapshot anterior e dispara a automação de entrada para cada NOVO
 * membro. Roda a cada 15 min.
 *
 * A rota é adaptador: a política (orçamento de parede, rotação por cursor,
 * concorrência, progresso parcial) vive em `@/lib/segments/change-detection`
 * e é provada em teste sem banco. Aqui só moram as portas de I/O.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchTrigger } from '@/lib/automation/trigger-dispatcher'
import { resolveSegment } from '@/lib/segments'
import {
  detectSegmentChanges,
  type SegmentRef,
} from '@/lib/segments/change-detection'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * O deploy da Vercel é automático no push; a migration `20260817000005` é
 * aplicada à mão. Entre uma coisa e outra o banco não tem
 * `last_change_check_at`, e sem esta guarda o cron responderia 500 a cada
 * 15 min — trocando um 504 conhecido por um 500 novo.
 *
 * Coluna ausente (42703) degrada para o comportamento ANTIGO (ordenar pelo
 * cursor do vizinho) em vez de falhar, e a rodada segue entregando o resto
 * do conserto: orçamento, concorrência e progresso parcial não dependem da
 * coluna. Some quando a migration estiver no vivo.
 */
let cursorColumnAvailable = true

function isUndefinedColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || /last_change_check_at/.test(error.message || '')
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await detectSegmentChanges({
      listStaleSegments: async (limit) => {
        // Cursor próprio do detector (migration 20260817000005). Antes
        // ordenava por last_evaluated_at, que só o cron recompute-segments
        // escreve — a rotação era do vizinho e a cauda podia nunca ser
        // detectada. nullsFirst drena o que nunca foi visto.
        const byCursor = (column: string) =>
          supabaseAdmin
            .from('customer_segments')
            .select('id, organization_id')
            .in('segment_type', ['dynamic', 'rfm'])
            .order(column, { ascending: true, nullsFirst: true })
            .limit(limit)

        if (cursorColumnAvailable) {
          const { data, error } = await byCursor('last_change_check_at')
          if (!error) return (data || []) as SegmentRef[]
          if (!isUndefinedColumn(error)) throw new Error(error.message)
          cursorColumnAvailable = false
          console.warn('[detect-segment] last_change_check_at ausente — migration 20260817000005 pendente')
        }

        const { data, error } = await byCursor('last_evaluated_at')
        if (error) throw new Error(error.message)
        return (data || []) as SegmentRef[]
      },

      resolveMembers: async (seg) => {
        // Dispatcher path: normaliza v1→v2. Sem ele o resolver v1 lia blobs
        // JSONB v2 como arrays de Rule, devolvia conjunto vazio e produzia
        // "saída" falsa para todo segmento v2.
        const resolved = await resolveSegment(supabaseAdmin, seg.id, seg.organization_id)
        return resolved.contactIds
      },

      loadSnapshot: async (seg) => {
        const { data, error } = await supabaseAdmin
          .from('segment_memberships_snapshot')
          .select('contact_ids')
          .eq('segment_id', seg.id)
          .maybeSingle()

        if (error) throw new Error(error.message)
        // `null` (nunca observado) e `[]` (observado vazio) são estados
        // diferentes para o detector — não colapsar num só.
        if (!data) return null
        return (data.contact_ids as string[]) || []
      },

      saveSnapshot: async (seg, contactIds) => {
        const { error } = await supabaseAdmin
          .from('segment_memberships_snapshot')
          .upsert({
            segment_id: seg.id,
            organization_id: seg.organization_id,
            contact_ids: contactIds,
            snapshotted_at: new Date().toISOString(),
          })
        if (error) throw new Error(error.message)
      },

      dispatchEntry: async (seg, contactId) => {
        await dispatchTrigger({
          organizationId: seg.organization_id,
          triggerType: 'trigger_segment',
          contactId,
          triggerData: { segment_id: seg.id, event: 'entered' },
          matchConfig: (cfg) => !cfg?.segment_id || cfg.segment_id === seg.id,
          idempotencyKey: `segment_entry:${seg.id}:${contactId}`,
        })
      },

      markChecked: async (seg) => {
        if (!cursorColumnAvailable) return
        const { error } = await supabaseAdmin
          .from('customer_segments')
          .update({ last_change_check_at: new Date().toISOString() })
          .eq('id', seg.id)
        if (!error) return
        if (!isUndefinedColumn(error)) throw new Error(error.message)
        cursorColumnAvailable = false
      },

      onError: (scope, seg, error) => {
        console.error(
          `[detect-segment] ${scope} ${seg?.id ?? '-'}:`,
          error instanceof Error ? error.message : error,
        )
      },
    })

    // Resposta honesta: uma rodada que cortou por orçamento diz isso e diz
    // quanto ficou para trás. Antes, um 504 era a única pista.
    return NextResponse.json({ success: true, ...report })
  } catch (err: any) {
    console.error('[detect-segment-changes] error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
