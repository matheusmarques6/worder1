import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { buildGraph } from '@/lib/ai/knowledge/notes'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — o grafo: notas, links, quem lê o quê e lacunas abertas.
export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const org = auth.user.organization_id
  const [notes, readers, agents, gaps] = await Promise.all([
    supabase.from('ai_sources').select('id, name, folder, links').eq('organization_id', org),
    supabase.from('ai_source_agents').select('source_id, agent_id').eq('organization_id', org),
    supabase.from('ai_agents').select('id, name').eq('organization_id', org),
    supabase.from('ai_knowledge_gaps').select('id, question, agent_ids').eq('organization_id', org).eq('status', 'open').limit(50),
  ])
  const failed = [notes, readers, agents, gaps].find((r) => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })
  return NextResponse.json(buildGraph({
    notes: (notes.data ?? []) as any,
    readers: (readers.data ?? []) as any,
    agents: (agents.data ?? []) as any,
    gaps: (gaps.data ?? []) as any,
  }))
}
