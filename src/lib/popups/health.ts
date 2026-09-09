// =============================================
// Saúde dos popups — o que está prestes a falhar em silêncio.
//
// A regra de decisão fica aqui, pura, para ser testada sem banco. A rota
// só busca as linhas e chama `buildHealthIssues`.
//
// O critério de tudo o que entra: "um inscrito recebe algo pior do que o
// popup promete, e ninguém está olhando". Estoque de cupom acabando,
// popup publicado em todas as lojas por engano, teste que parou de
// decidir. Nada de métrica de vaidade.
// =============================================

import { readCouponBlock } from '@/lib/coupons/pool-service'

export type HealthLevel = 'error' | 'warn'

export interface HealthIssue {
  level: HealthLevel
  kind: string
  form_id: string | null
  form_name: string | null
  title: string
  detail: string
  action: string
}

export interface HealthInput {
  /** Popups publicados (sem variantes). */
  forms: Array<{ id: string; name?: string | null; store_id?: string | null; design_json?: any }>
  /** Pools de cupom da org, com o estoque pronto já contado. */
  pools: Array<{
    id: string
    form_id: string | null
    status: string
    last_error?: string | null
    min_stock?: number | null
    usable: number
  }>
  /** Experimentos em andamento. */
  experiments: Array<{ form_id: string; mode?: string | null; started_at?: string | null; max_days?: number | null }>
  /** Lojas ativas da org. */
  storeCount: number
  /** Confirmações de WhatsApp pendentes além da janela de 72 h. */
  staleWhatsappOptIns: number
  now?: Date
}

export function buildHealthIssues(input: HealthInput): HealthIssue[] {
  const now = input.now || new Date()
  const nameOf = new Map(input.forms.map((f) => [f.id, String(f.name || 'Popup')]))
  const issues: HealthIssue[] = []

  for (const p of input.pools) {
    // Pool de popup despublicado fica pausado de propósito.
    if (p.status === 'paused') continue
    const formName = p.form_id ? nameOf.get(p.form_id) || null : null
    const stock = Math.max(0, Number(p.usable) || 0)
    if (p.status === 'error') {
      issues.push({
        level: 'error',
        kind: 'pool_error',
        form_id: p.form_id,
        form_name: formName,
        title: 'A criação de cupons falhou',
        detail: `${p.last_error || 'erro desconhecido na Shopify'} · ${stock} ${stock === 1 ? 'código pronto' : 'códigos prontos'} no estoque.`,
        action: 'Confira a conexão com a Shopify e use "Repor agora" no bloco de cupom.',
      })
    } else if (stock < Number(p.min_stock || 0)) {
      issues.push({
        level: stock === 0 ? 'error' : 'warn',
        kind: 'pool_low',
        form_id: p.form_id,
        form_name: formName,
        title: stock === 0 ? 'Sem código único no estoque' : 'Estoque de cupons baixo',
        detail: `${stock} de ${p.min_stock} códigos prontos${stock === 0 ? ' — os inscritos estão recebendo o código reserva' : ''}.`,
        action: 'A reposição roda sozinha a cada hora; para agora, use "Repor agora".',
      })
    }
  }

  const livePoolsByForm = new Map<string, number>()
  for (const p of input.pools) {
    if (!p.form_id || p.status === 'paused') continue
    livePoolsByForm.set(p.form_id, (livePoolsByForm.get(p.form_id) || 0) + 1)
  }

  for (const f of input.forms) {
    const cp = readCouponBlock(f.design_json)
    if (cp && cp.mode === 'unique') {
      if (!f.store_id) {
        issues.push({
          level: 'error', kind: 'unique_without_store', form_id: f.id, form_name: nameOf.get(f.id) || null,
          title: 'Cupom único sem loja',
          detail: 'O popup promete um código único por inscrito, mas não está ligado a uma loja — os códigos são criados na Shopify da loja.',
          action: 'Escolha a loja no editor e salve; os pools são criados na sequência.',
        })
      } else if (!livePoolsByForm.get(f.id)) {
        issues.push({
          level: 'error', kind: 'unique_without_pool', form_id: f.id, form_name: nameOf.get(f.id) || null,
          title: 'Cupom único sem estoque configurado',
          detail: 'Nenhum pool de códigos existe para este popup: todo inscrito vai receber o código reserva.',
          action: 'Abra o bloco de cupom no editor e use "Repor agora".',
        })
      }
    }
    if (!f.store_id && input.storeCount > 1) {
      issues.push({
        level: 'warn', kind: 'no_store_fanout', form_id: f.id, form_name: nameOf.get(f.id) || null,
        title: 'Publicado em todas as lojas',
        detail: `Este popup não tem loja e a organização tem ${input.storeCount} lojas ativas — ele aparece em todas.`,
        action: 'Se era para uma loja só, escolha a loja no editor.',
      })
    }
  }

  for (const e of input.experiments) {
    // O bandit não tem prazo: ele redistribui para sempre, de propósito.
    if (e.mode === 'bandit' || !e.started_at) continue
    const days = (now.getTime() - new Date(e.started_at).getTime()) / 86400000
    const max = Number(e.max_days || 30)
    if (days > max + 1) {
      issues.push({
        level: 'warn', kind: 'experiment_overdue', form_id: e.form_id, form_name: nameOf.get(e.form_id) || null,
        title: 'Teste A/B passou do prazo',
        detail: `Roda há ${Math.round(days)} dias, com prazo de ${max}. Sem vencedora, a divisão do tráfego continua igual.`,
        action: 'Abra o teste A/B e encerre, ou aplique a variante que está liderando.',
      })
    }
  }

  const stale = Math.max(0, Number(input.staleWhatsappOptIns) || 0)
  if (stale > 0) {
    issues.push({
      level: 'warn', kind: 'whatsapp_pending', form_id: null, form_name: null,
      title: `${stale} ${stale === 1 ? 'confirmação' : 'confirmações'} de WhatsApp sem resposta`,
      detail: 'Passaram das 72 h da janela: esses contatos não recebem marketing no WhatsApp até confirmarem.',
      action: 'Reveja o texto do pedido de confirmação — se ninguém responde, o template não está claro.',
    })
  }

  const order: Record<HealthLevel, number> = { error: 0, warn: 1 }
  issues.sort((a, b) => order[a.level] - order[b.level] || a.kind.localeCompare(b.kind))
  return issues
}
