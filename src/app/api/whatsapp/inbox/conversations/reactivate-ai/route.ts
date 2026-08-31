// src/app/api/whatsapp/inbox/conversations/reactivate-ai/route.ts
//
// Onda 13 / P0-2 — religar IA em massa apos causa-raiz resolvida.
//
// Religa SOMENTE conversas desligadas por causa AUTOMATICA do sistema
// (chave ausente, budget, erro permanente do provider). Desativacao
// MANUAL do atendente e transferencia pra humano ficam estruturalmente
// fora da whitelist — essas so religam pelo botao da propria conversa.
//
// GET  -> { count }        conversas elegiveis (pro banner do Inbox)
// POST -> { reactivated }  executa o UPDATE em massa

import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { wlog } from '@/lib/observability/whatsapp-logger'
import { AUTO_DISABLED_REASONS } from '@/lib/ai/disabled-reasons'

export const dynamic = 'force-dynamic'

// Whitelist: o que o sistema desligou sozinho, o user pode religar em massa.
// Vem de src/lib/ai/disabled-reasons.ts — fonte UNICA (o mesmo vocabulario
// que o badge/label do inbox usa). Antes esta rota tinha sua propria copia
// hard-coded do mesmo array: motivo novo escrito la e esquecido aqui e o
// banner mente por omissao. NUNCA incluir 'manual' (escolha do atendente)
// nem 'transferred_to_human' (handoff intencional) — o modulo canonico já
// os deixa de fora de AUTO_DISABLED_REASONS, não precisa reimplementar aqui.

export async function GET(request: NextRequest) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const { count, error } = await supabase
    .from('whatsapp_cloud_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('ai_enabled', false)
    .in('ai_disabled_reason', AUTO_DISABLED_REASONS as unknown as string[])

  if (error) {
    wlog.error('whatsapp.ai.reactivate_count_error', { error: error.message })
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ count: count ?? 0, reasons: AUTO_DISABLED_REASONS })
}

export async function POST(request: NextRequest) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  // Body opcional pode restringir reasons, mas nunca ampliar alem da whitelist.
  let requested: string[] | undefined
  try {
    const body = await request.json()
    if (Array.isArray(body?.reasons)) requested = body.reasons
  } catch {
    // sem body — usa whitelist completa
  }

  const reasons = requested
    ? requested.filter((r) => (AUTO_DISABLED_REASONS as readonly string[]).includes(r))
    : [...AUTO_DISABLED_REASONS]

  if (reasons.length === 0) {
    return NextResponse.json(
      {
        error: 'reasons invalidos — permitidos: ' + AUTO_DISABLED_REASONS.join(', '),
        code: 'INVALID_REASONS',
      },
      { status: 400 },
    )
  }

  const { data: updated, error } = await supabase
    .from('whatsapp_cloud_conversations')
    .update({
      ai_enabled: true,
      ai_disabled_at: null,
      ai_disabled_reason: null,
      ai_retry_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)
    .eq('ai_enabled', false)
    .in('ai_disabled_reason', reasons)
    .select('id')

  if (error) {
    wlog.error('whatsapp.ai.bulk_reactivate_error', {
      organization_id: orgId,
      error: error.message,
    })
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const reactivated = updated?.length ?? 0
  wlog.info('whatsapp.ai.bulk_reactivated', {
    organization_id: orgId,
    reactivated,
    reasons,
  })

  return NextResponse.json({ success: true, reactivated })
}
