import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { sanitizeSearchTerm } from '@/lib/db/search-term'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — busca textual (Ctrl K): título e corpo da nota.
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })
  // Vírgula, parênteses e curingas quebram a sintaxe do .or() do PostgREST.
  const term = sanitizeSearchTerm(q, 100)
  if (term.length < 2) return NextResponse.json({ results: [] })
  const { data, error } = await getSupabaseAdmin()
    .from('ai_sources')
    .select('id, name, folder, kind, body_markdown')
    .eq('organization_id', auth.user.organization_id)
    .or(`name.ilike.%${term}%,body_markdown.ilike.%${term}%`)
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const lower = term.toLowerCase()
  const results = (data ?? []).map((n: any) => {
    const body: string = n.body_markdown ?? ''
    const at = body.toLowerCase().indexOf(lower)
    const snippet = at >= 0 ? body.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, ' ').trim() : null
    return { id: n.id, name: n.name, folder: n.folder, kind: n.kind, snippet, in_title: n.name.toLowerCase().includes(lower) }
  })
  results.sort((a, b) => Number(b.in_title) - Number(a.in_title))
  return NextResponse.json({ results })
}
