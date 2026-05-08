// =============================================
// GET   /api/ai/agents/[id]/skills  → lista skills do agente
// POST  /api/ai/agents/[id]/skills  → cria
//   body: { name, description?, trigger_phrases: [], instructions, tools_used? }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_agent_skills')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .eq('agent_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ skills: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const name = String(body.name || '').trim()
  const instructions = String(body.instructions || '').trim()
  const triggerPhrases = Array.isArray(body.trigger_phrases) ? body.trigger_phrases : []
  const toolsUsed = Array.isArray(body.tools_used) ? body.tools_used : []
  const description = body.description ? String(body.description) : null

  if (!name || !instructions) {
    return NextResponse.json({ error: 'name e instructions obrigatórios' }, { status: 400 })
  }
  if (triggerPhrases.length === 0) {
    return NextResponse.json({ error: 'trigger_phrases vazio' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_agent_skills')
    .insert({
      organization_id: auth.user.organization_id,
      agent_id: params.id,
      name,
      description,
      trigger_phrases: triggerPhrases.map((s: any) => String(s)),
      instructions,
      tools_used: toolsUsed,
      enabled: body.enabled !== false,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ skill: data }, { status: 201 })
}
