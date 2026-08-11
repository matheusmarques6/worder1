import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { EVENT_FAMILIES, pickEditableMissionFields } from '@/lib/ai/missions'

export const dynamic = 'force-dynamic'

// GET /api/ai/missions — o catálogo da org, agrupável por família na UI.
export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from('ai_missions')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .order('event_type', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching missions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ missions: data ?? [], families: EVENT_FAMILIES })
}

// POST /api/ai/missions — nova versão (sempre draft; ativar é ato explícito).
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.event_type || !body?.objective) {
    return NextResponse.json(
      { error: 'event_type e objective são obrigatórios' },
      { status: 400 }
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('ai_missions')
    .insert({
      organization_id: auth.user.organization_id,
      event_type: String(body.event_type),
      origin: 'lojista',
      status: 'draft',
      parent_version_id: body.parent_version_id ?? null,
      ...pickEditableMissionFields(body),
      objective: String(body.objective),
    })
    .select('*')
    .single()

  if (error) {
    console.error('Error creating mission:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ mission: data }, { status: 201 })
}
