/**
 * CRON: Send scheduled email campaigns
 * /api/cron/send-scheduled-campaigns
 *
 * A cada minuto, busca campanhas com status='scheduled' e scheduled_at <= now
 * e dispara o fluxo de envio (chama /api/email/campaigns/send internamente).
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

  const now = new Date()
  const nowIso = now.toISOString()

  // A campanha no fuso do destinatário precisa acordar ANTES da hora
  // marcada: quem está em UTC+14 chega às 09:00 locais 17 horas antes
  // de um lojista em São Paulo. Se só olhássemos scheduled_at <= now,
  // esses contatos perderiam a hora e receberiam todos de uma vez,
  // atrasados. Buscamos a janela adiantada e descartamos, em memória,
  // as campanhas de horário fixo que ainda não venceram.
  const { recipientModeLeadTimeMs } = await import('@/lib/scheduling/campaign-plan')
  const leadIso = new Date(now.getTime() + recipientModeLeadTimeMs()).toISOString()

  const { data: candidates, error } = await supabaseAdmin
    .from('email_campaigns')
    .select('id, organization_id, scheduled_at, timezone_mode')
    .eq('status', 'scheduled')
    .lte('scheduled_at', leadIso)
    // Mais vencidas primeiro: sem ordenar, uma campanha futura em modo
    // 'recipient' podia ocupar o limite e adiar as que já venceram.
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (candidates || []).filter((c: any) =>
    c.timezone_mode === 'recipient' || !c.scheduled_at || c.scheduled_at <= nowIso
  )
  if (due.length === 0) return NextResponse.json({ dispatched: 0 })

  // NÃO marcamos a campanha como 'sending' aqui.
  //
  // Este cron marcava, e /send recusa campanha que já está em 'sending'
  // com 400 ("Campaign is already sending"). Ou seja: TODA campanha
  // agendada morria neste ponto — a resposta 400 não é exceção, então nem
  // a volta para 'scheduled' acontecia, e ela ficava presa em 'sending'
  // para sempre. Sem erro na tela, sem e-mail enviado.
  //
  // A proteção contra despacho duplo não precisa disto: /send faz o
  // claim atômico dele (UPDATE ... WHERE status IN ('draft','scheduled')),
  // e o segundo processo recebe 409 em vez de enviar de novo.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const cronSecret = process.env.CRON_SECRET || ''

  /** Tira a campanha da fila e devolve para rascunho, com o motivo. */
  const parkAsDraft = async (camp: any, motivo: string) => {
    const { error } = await supabaseAdmin
      .from('email_campaigns')
      .update({ status: 'draft', sent_at: null, error_message: motivo })
      .eq('id', camp.id)
      .eq('organization_id', camp.organization_id)
      .in('status', ['scheduled', 'sending'])
    if (error) console.error(`[SendScheduled] campanha ${camp.id} não voltou para rascunho:`, error.message)
  }

  const results: any[] = []
  for (const camp of due) {
    // Chama /send (sem auth de usuário — passa internal header)
    try {
      const res = await fetch(`${baseUrl}/api/email/campaigns/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal': 'true',
          'X-Org-Id': camp.organization_id,
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ campaign_id: camp.id }),
      })
      const body: any = res.ok ? null : await res.json().catch(() => ({}))
      results.push({ id: camp.id, ok: res.ok, status: res.status, error: body?.error })

      // 422 é problema de configuração — domínio sem verificar, franquia
      // do endereço temporário, reprovação no preflight. Tentar de novo a
      // cada minuto não resolve nada e mantém a campanha numa fila que
      // nunca anda: ela volta para rascunho com o motivo, aparece na tela
      // e o painel de saúde do envio já avisa o que fazer.
      if (res.status === 422) {
        await parkAsDraft(camp, body?.error || 'Configuração de envio pendente')
      } else if (!res.ok) {
        console.error(`[SendScheduled] campanha ${camp.id} respondeu ${res.status}:`, body?.error || '(sem detalhe)')
      }
    } catch (err: any) {
      results.push({ id: camp.id, ok: false, error: err?.message })
      // A requisição não chegou (ou caiu no meio). Se /send já tinha feito
      // o claim, a campanha ficaria presa em 'sending' — devolver para
      // 'scheduled' faz o próximo minuto tentar de novo.
      const { error: revertError } = await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'scheduled', sent_at: null })
        .eq('id', camp.id)
        .eq('organization_id', camp.organization_id)
        .eq('status', 'sending')
      if (revertError) console.error(`[SendScheduled] campanha ${camp.id} presa em "sending":`, revertError.message)
    }
  }

  return NextResponse.json({ dispatched: results.length, results })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
