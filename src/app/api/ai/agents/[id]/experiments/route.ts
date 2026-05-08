// =============================================
// GET   /api/ai/agents/[id]/experiments  → lista
// POST  /api/ai/agents/[id]/experiments  → cria draft
//   body: { name, description?, variants: [{id,name,agent_version_id?,traffic_pct}] }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import type { ExperimentVariant } from '@/lib/ai/experiments'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_experiments')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .eq('agent_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ experiments: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const name = String(body.name || '').trim()
  const description = body.description ? String(body.description) : null
  const variants: ExperimentVariant[] = Array.isArray(body.variants) ? body.variants : []

  if (!name) {
    return NextResponse.json({ error: 'name obrigatório' }, { status: 400 })
  }
  if (variants.length < 2) {
    return NextResponse.json({ error: 'mínimo 2 variantes' }, { status: 400 })
  }
  const totalPct = variants.reduce((acc, v) => acc + (v.traffic_pct || 0), 0)
  if (Math.abs(totalPct - 100) > 0.01) {
    return NextResponse.json({ error: 'soma de traffic_pct deve ser 100' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_experiments')
    .insert({
      organization_id: auth.user.organization_id,
      agent_id: params.id,
      name,
      description,
      variants,
      status: 'draft',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ experiment: data }, { status: 201 })
}
