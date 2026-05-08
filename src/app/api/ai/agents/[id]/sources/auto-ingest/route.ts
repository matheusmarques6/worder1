// =============================================
// POST /api/ai/agents/[id]/sources/auto-ingest
//
// Endpoint genérico de ingestão em batch — usado pelo Shopify connect
// callback (e potencialmente outras integrações) pra criar várias fontes
// de uma vez. Recebe:
//
// {
//   sources: [
//     { name, layer, source_type, text_content?, url?, integration_id? },
//     ...
//   ]
// }
//
// Cria cada source em ai_agent_sources e dispara indexação assíncrona
// (mesma rota usada pela criação manual). Idempotente: se já existir
// source com mesmo (agent_id, name, layer), ignora.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import type { KnowledgeLayer } from '@/lib/ai/types'

export const dynamic = 'force-dynamic'

interface IncomingSource {
  name: string
  layer: KnowledgeLayer
  source_type: 'text' | 'url' | 'integration'
  text_content?: string
  url?: string
  integration_id?: string
  integration_type?: string
}

const VALID_LAYERS: KnowledgeLayer[] = ['institutional', 'operational', 'catalog', 'faq', 'execution']
const VALID_TYPES = ['text', 'url', 'integration']

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const sources: IncomingSource[] = Array.isArray(body.sources) ? body.sources : []
  if (sources.length === 0) {
    return NextResponse.json({ error: 'sources vazio' }, { status: 400 })
  }
  if (sources.length > 50) {
    return NextResponse.json({ error: 'máximo 50 sources por chamada' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const orgId = auth.user.organization_id

  // Confirma que o agente existe e pertence à org
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!agent) {
    return NextResponse.json({ error: 'agente não encontrado' }, { status: 404 })
  }

  // Lista existentes para idempotência
  const { data: existing } = await supabase
    .from('ai_agent_sources')
    .select('name, layer')
    .eq('agent_id', params.id)
    .eq('organization_id', orgId)
  const existingKeys = new Set(
    (existing ?? []).map((r) => `${r.layer}::${(r.name as string).trim().toLowerCase()}`),
  )

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const created: string[] = []
  const skipped: string[] = []
  const errors: Array<{ name: string; error: string }> = []

  for (const s of sources) {
    if (!s.name || !s.name.trim()) {
      errors.push({ name: '?', error: 'name vazio' })
      continue
    }
    if (!VALID_LAYERS.includes(s.layer)) {
      errors.push({ name: s.name, error: 'layer inválida' })
      continue
    }
    if (!VALID_TYPES.includes(s.source_type)) {
      errors.push({ name: s.name, error: 'source_type inválido' })
      continue
    }
    const key = `${s.layer}::${s.name.trim().toLowerCase()}`
    if (existingKeys.has(key)) {
      skipped.push(s.name)
      continue
    }

    const insertData: Record<string, unknown> = {
      organization_id: orgId,
      agent_id: params.id,
      layer: s.layer,
      source_type: s.source_type,
      name: s.name.trim(),
      status: 'pending',
      chunks_count: 0,
    }
    if (s.source_type === 'text') insertData.text_content = s.text_content || ''
    if (s.source_type === 'url') insertData.url = s.url
    if (s.source_type === 'integration') {
      insertData.integration_id = s.integration_id
      insertData.integration_type = s.integration_type
    }

    const { data: source, error } = await supabase
      .from('ai_agent_sources')
      .insert(insertData)
      .select('id')
      .single()
    if (error) {
      errors.push({ name: s.name, error: error.message })
      continue
    }
    created.push(source.id as string)

    // Dispara processamento assíncrono (texto/url)
    if (s.source_type === 'text' || s.source_type === 'url') {
      fetch(`${baseUrl}/api/ai/process/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: source.id, organization_id: orgId }),
      }).catch((err) => console.warn('[auto-ingest] disparo de indexação falhou:', err))
    }
  }

  return NextResponse.json({
    created: created.length,
    skipped: skipped.length,
    errors,
    created_ids: created,
  })
}
