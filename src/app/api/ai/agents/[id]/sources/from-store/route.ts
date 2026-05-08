// =============================================
// POST /api/ai/agents/[id]/sources/from-store
//
// Wrapper de F2.8: dado um store_id já conectado/onboarded, converte
// store_briefings + store_onboarding_data em ai_agent_sources estruturadas
// nos layers institutional/operational/catalog/faq.
//
// Body: { store_id: string }
//
// Idempotente — usa o mesmo dedup do auto-ingest. Pode ser chamado
// repetidamente quando o briefing for atualizado: novas seções viram
// novas sources, existentes são puladas.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import type { KnowledgeLayer } from '@/lib/ai/types'

export const dynamic = 'force-dynamic'

interface IncomingSource {
  name: string
  layer: KnowledgeLayer
  source_type: 'text'
  text_content: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const storeId = String(body.store_id || '').trim()
  if (!storeId) {
    return NextResponse.json({ error: 'store_id requerido' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const [{ data: briefing }, { data: onboarding }] = await Promise.all([
    supabase
      .from('store_briefings')
      .select('briefing_data, version, generated_at')
      .eq('store_id', storeId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('store_onboarding_data')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle(),
  ])

  const sources: IncomingSource[] = []

  // 1. Onboarding → institutional/operational
  if (onboarding) {
    if (onboarding.additional_notes) {
      sources.push({
        name: 'Notas da Marca',
        layer: 'institutional',
        source_type: 'text',
        text_content: onboarding.additional_notes as string,
      })
    }
    if (onboarding.design_direction_text) {
      sources.push({
        name: 'Direção de Design',
        layer: 'institutional',
        source_type: 'text',
        text_content: onboarding.design_direction_text as string,
      })
    }
    if (onboarding.price_sensitivity) {
      sources.push({
        name: 'Sensibilidade de Preço',
        layer: 'operational',
        source_type: 'text',
        text_content: `Sensibilidade de preço: ${onboarding.price_sensitivity}`,
      })
    }
  }

  // 2. Briefing JSON → operational/catalog/faq por seção
  if (briefing?.briefing_data && typeof briefing.briefing_data === 'object') {
    const data = briefing.briefing_data as Record<string, unknown>
    const sectionMap: Array<{ key: string; layer: KnowledgeLayer; label: string }> = [
      { key: 'product_info', layer: 'catalog', label: 'Catálogo de Produtos' },
      { key: 'shipping_policy', layer: 'operational', label: 'Política de Envio' },
      { key: 'return_policy', layer: 'operational', label: 'Política de Troca/Devolução' },
      { key: 'payment_methods', layer: 'operational', label: 'Formas de Pagamento' },
      { key: 'faq', layer: 'faq', label: 'FAQ' },
      { key: 'brand_voice', layer: 'institutional', label: 'Voz da Marca' },
      { key: 'mission', layer: 'institutional', label: 'Missão' },
      { key: 'about', layer: 'institutional', label: 'Sobre a Loja' },
    ]
    for (const m of sectionMap) {
      const v = data[m.key]
      if (!v) continue
      const content = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
      if (content.trim().length > 20) {
        sources.push({
          name: m.label,
          layer: m.layer,
          source_type: 'text',
          text_content: content,
        })
      }
    }
  }

  if (sources.length === 0) {
    return NextResponse.json({
      created: 0,
      message: 'Nenhuma seção do briefing/onboarding com conteúdo suficiente.',
    })
  }

  // Reusa o endpoint genérico via fetch interno (mantém uma única lógica de dedup/index)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const cookieHeader = req.headers.get('cookie') ?? ''
  const ingestRes = await fetch(`${baseUrl}/api/ai/agents/${params.id}/sources/auto-ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ sources }),
  })
  const ingestJson = await ingestRes.json()
  return NextResponse.json(ingestJson, { status: ingestRes.status })
}
