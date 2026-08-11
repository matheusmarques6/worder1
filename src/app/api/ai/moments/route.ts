import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { pickEditableMomentFields } from '@/lib/ai/moments'

export const dynamic = 'force-dynamic'

// GET /api/ai/moments — todos os momentos da org (o "ativo" é computado na UI
// pelo mesmo predicado do runtime: approved + janela + não morto).
export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from('commercial_moments')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .order('priority', { ascending: false })
    .order('starts_at', { ascending: false })

  if (error) {
    console.error('Error fetching moments:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ moments: data ?? [] })
}

// POST /api/ai/moments — nasce rascunho; aprovar é ato explícito.
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.name || !body?.starts_at || !body?.ends_at) {
    return NextResponse.json(
      { error: 'name, starts_at e ends_at são obrigatórios' },
      { status: 400 }
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('commercial_moments')
    .insert({
      organization_id: auth.user.organization_id,
      status: 'draft',
      ...pickEditableMomentFields(body),
      name: String(body.name),
    })
    .select('*')
    .single()

  if (error) {
    console.error('Error creating moment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ moment: data }, { status: 201 })
}
